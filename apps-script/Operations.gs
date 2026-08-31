var MH_MUTATION_REGISTRY_HEADERS = [
  'mutation_id', 'request_hash', 'event_status_code', 'entity_type', 'entity_id',
  'project_id', 'action_code', 'before_json', 'after_json', 'actor_user_id',
  'actor_role_code', 'created_at', 'updated_at'
];

var MH_BACKUP_LOG_HEADERS = [
  'backup_id', 'file_id', 'file_name', 'size_bytes', 'status_code', 'message', 'created_at'
];

function mhEnsureSheetWithHeaders_(sheetName, headers) {
  var spreadsheet = mhSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  var width = Math.max(sheet.getLastColumn(), headers.length);
  var current = sheet.getRange(1, 1, 1, width).getValues()[0].map(mhAsText_);
  headers.forEach(function (header, index) {
    if (!current[index]) sheet.getRange(1, index + 1).setValue(header);
    else if (current[index] !== header) throw mhApiError_('schema_mismatch', 'operations_header_mismatch', 500);
  });
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
  mhInvalidateTableCache_(sheetName);
  return sheet;
}

function mhSetupEnsureOperationsSheets() {
  mhEnsureSheetWithHeaders_(MH_SHEETS.MUTATIONS, MH_MUTATION_REGISTRY_HEADERS);
  mhEnsureSheetWithHeaders_(MH_SHEETS.BACKUP_LOG, MH_BACKUP_LOG_HEADERS);
  return { ok: true, sheets: [MH_SHEETS.MUTATIONS, MH_SHEETS.BACKUP_LOG] };
}

function mhAssertOperationsManager_(actor) {
  var allowed = actor && (actor.role === 'MASTER'
    || (actor.role === 'POCKET_MANAGER' && actor.organization === 'POCKET'));
  if (!allowed) throw mhApiError_('forbidden', 'operations_manager_required', 403);
}

function mhRunOperationsMaintenance_(request, actor) {
  mhAssertOperationsManager_(actor);
  var operation = mhAsText_(request && request.operation).toLowerCase();
  if (operation === 'status') {
    return {
      operationsSheetsReady: mhOperationsSheetExists_(MH_SHEETS.MUTATIONS)
        && mhOperationsSheetExists_(MH_SHEETS.BACKUP_LOG),
      backupConfigured: !!mhSetting_(MH_PROPERTY_KEYS.BACKUP_RUNNER_DIGEST, ''),
      lastBackupAt: mhSetting_(MH_PROPERTY_KEYS.BACKUP_LAST_SUCCESS_AT, '') || null
    };
  }
  if (operation === 'schema_audit') {
    try {
      mhUseFreshTables_();
      mhSchemaCheck_();
      return { ok: true, schemaValid: true, reason: null };
    } catch (error) {
      var reason = error && error.message ? String(error.message) : 'unknown_schema_error';
      var parts = reason.split(':');
      var brokenSheet = parts[0] === 'missing_required_headers' ? parts[1] : '';
      var currentHeaders = [];
      if (brokenSheet) {
        try { currentHeaders = mhReadTable_(brokenSheet).headers; } catch (ignored) {}
      }
      return {
        ok: false,
        schemaValid: false,
        code: error && error.apiCode ? error.apiCode : 'internal_error',
        reason: reason,
        sheet: brokenSheet || null,
        currentHeaders: currentHeaders
      };
    }
  }
  if (operation === 'ensure_operations') return mhSetupEnsureOperationsSheets();
  if (operation === 'backfill_mutations') return mhSetupBackfillMutationRegistry();
  if (operation === 'repair_dependency_schema') return mhSetupRepairTaskDependencySchema();
  if (operation === 'repair_sync_status_schema') return mhSetupRepairSyncStatusSchema();
  if (operation === 'split_internal_roles') return mhSetupSplitInternalRoles();
  if (operation === 'configure_backup_runner') return mhConfigureBackupRunner_(request);
  if (operation === 'install_backup') return mhSetupInstallDailyBackup();
  if (operation === 'run_backup') return mhRunDailyBackup();
  if (operation === 'verify_backup') return mhVerifyLatestBackup();
  throw mhApiError_('invalid_request', 'unsupported_operations_maintenance', 400);
}

function mhOperationsSheetExists_(sheetName) {
  try { return !!mhSpreadsheet_().getSheetByName(sheetName); } catch (ignored) { return false; }
}

function mhMutationRegistryCacheKey_(mutationId) {
  return 'mh_mutation_v1_' + mhHashToken_(mhAsText_(mutationId)).slice(0, 48);
}

function mhCachedMutationRegistryRow_(mutationId) {
  try {
    var raw = CacheService.getScriptCache().get(mhMutationRegistryCacheKey_(mutationId));
    return raw ? mhParseJson_(raw, null) : null;
  } catch (ignored) {
    return null;
  }
}

function mhCacheMutationRegistryRow_(row) {
  try {
    CacheService.getScriptCache().put(
      mhMutationRegistryCacheKey_(row.mutation_id),
      JSON.stringify(row),
      21600
    );
  } catch (ignored) {}
}

function mhFindMutationRegistryLogs_(mutationId) {
  if (!mhOperationsSheetExists_(MH_SHEETS.MUTATIONS)) return null;
  var row = mhCachedMutationRegistryRow_(mutationId);
  if (!row) row = mhFindRecord_(MH_SHEETS.MUTATIONS, 'mutation_id', mutationId).row;
  if (!row) return { commit: null, prepare: null };
  mhCacheMutationRegistryRow_(row);
  var status = mhAsText_(row.event_status_code).toUpperCase();
  return {
    commit: status === 'COMMIT' ? row : null,
    prepare: status === 'PREPARE' ? row : null
  };
}

function mhRememberMutationRegistry_(activity, requestHash) {
  if (!mhOperationsSheetExists_(MH_SHEETS.MUTATIONS)) return false;
  var table = mhReadTable_(MH_SHEETS.MUTATIONS);
  var existing = table.rows.filter(function (row) {
    return mhAsText_(row.mutation_id) === mhAsText_(activity.mutation_id);
  });
  if (existing.length > 1) throw mhApiError_('schema_mismatch', 'duplicate_mutation_registry_key', 500);
  var createdAt = existing[0] ? existing[0].created_at : activity.created_at;
  var record = {
    mutation_id: activity.mutation_id,
    request_hash: requestHash,
    event_status_code: activity.event_status_code,
    entity_type: activity.entity_type,
    entity_id: activity.entity_id,
    project_id: activity.project_id,
    action_code: activity.action_code,
    before_json: activity.before_json,
    after_json: activity.after_json,
    actor_user_id: activity.actor_user_id,
    actor_role_code: activity.actor_role_code,
    created_at: createdAt,
    updated_at: activity.created_at
  };
  if (existing[0]) mhUpdateRecord_(table, existing[0].__rowNumber, record);
  else mhAppendRecord_(MH_SHEETS.MUTATIONS, record);
  mhCacheMutationRegistryRow_(record);
  return true;
}

function mhSetupBackfillMutationRegistry() {
  mhSetupEnsureOperationsSheets();
  var rows = mhReadTable_(MH_SHEETS.ACTIVITY).rows;
  var latest = {};
  rows.forEach(function (row) {
    var mutationId = mhAsText_(row.mutation_id);
    if (!mutationId) return;
    var current = latest[mutationId];
    var status = mhAsText_(row.event_status_code).toUpperCase();
    if (!current || status === 'COMMIT' || (status === 'FAILED' && mhAsText_(current.event_status_code) === 'PREPARE')) {
      latest[mutationId] = row;
    }
  });
  var registry = mhReadTable_(MH_SHEETS.MUTATIONS);
  var existingById = {};
  registry.rows.forEach(function (row) { existingById[mhAsText_(row.mutation_id)] = row; });
  var inserts = [];
  var updated = 0;
  Object.keys(latest).forEach(function (mutationId) {
    var row = latest[mutationId];
    var after = mhParseJson_(mhAsText_(row.after_json), {});
    var requestHash = mhAsText_(after.__mutation_request_hash);
    var existing = existingById[mutationId];
    var record = {
      mutation_id: row.mutation_id,
      request_hash: requestHash,
      event_status_code: row.event_status_code,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      project_id: row.project_id,
      action_code: row.action_code,
      before_json: row.before_json,
      after_json: row.after_json,
      actor_user_id: row.actor_user_id,
      actor_role_code: row.actor_role_code,
      created_at: existing ? existing.created_at : row.created_at,
      updated_at: row.created_at
    };
    if (!existing) inserts.push(record);
    else if (mhAsText_(existing.event_status_code) !== mhAsText_(record.event_status_code)
      || mhAsText_(existing.request_hash) !== mhAsText_(record.request_hash)) {
      mhUpdateRecord_(registry, existing.__rowNumber, record);
      updated += 1;
    }
    mhCacheMutationRegistryRow_(record);
  });
  if (inserts.length) {
    var sheet = registry.sheet || mhSheet_(MH_SHEETS.MUTATIONS);
    var values = inserts.map(function (record) {
      return registry.headers.map(function (header) {
        return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
      });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, registry.headers.length).setValues(values);
    SpreadsheetApp.flush();
    mhInvalidateTableCache_(MH_SHEETS.MUTATIONS);
  }
  return { ok: true, indexedMutations: Object.keys(latest).length, inserted: inserts.length, updated: updated };
}

function mhSetupInstallDailyBackup() {
  mhSetupEnsureOperationsSheets();
  return {
    ok: true,
    storage: 'GOOGLE_DRIVE_ROOT',
    schedule: 'GITHUB_ACTIONS_DAILY_03_KST',
    runnerConfigured: !!mhSetting_(MH_PROPERTY_KEYS.BACKUP_RUNNER_DIGEST, '')
  };
}

function mhConfigureBackupRunner_(request) {
  var secret = mhAsText_(request && request.runnerSecret);
  if (secret.length < 32) throw mhApiError_('invalid_request', 'backup_runner_secret_too_short', 400);
  PropertiesService.getScriptProperties().setProperty(
    MH_PROPERTY_KEYS.BACKUP_RUNNER_DIGEST,
    mhHashToken_(secret)
  );
  MH_SETTINGS_MEMORY_CACHE = null;
  return { ok: true, runnerConfigured: true };
}

function mhRunScheduledBackup_(request) {
  var supplied = mhAsText_(request && request.runnerSecret);
  var expected = mhAsText_(mhSetting_(MH_PROPERTY_KEYS.BACKUP_RUNNER_DIGEST, ''));
  if (!supplied || !expected || !mhConstantTimeEquals_(mhHashToken_(supplied), expected)) {
    throw mhApiError_('unauthorized', 'invalid_backup_runner', 401);
  }
  return mhRunDailyBackup(false);
}

function mhRunDailyBackup(force) {
  mhSetupEnsureOperationsSheets();
  var properties = PropertiesService.getScriptProperties();
  var now = new Date();
  var today = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd');
  var lastSuccessAt = mhAsText_(properties.getProperty(MH_PROPERTY_KEYS.BACKUP_LAST_SUCCESS_AT));
  if (!force && lastSuccessAt.slice(0, 10) === today) {
    return { ok: true, skipped: true, reason: 'already_backed_up_today', lastBackupAt: lastSuccessAt };
  }
  var timestamp = Utilities.formatDate(now, 'Asia/Seoul', 'yyyyMMdd_HHmmss');
  var copy = mhSpreadsheet_().copy('PocketMarketingHub_' + timestamp);
  var createdAt = mhNowIso_();
  mhAppendRecord_(MH_SHEETS.BACKUP_LOG, {
    backup_id: mhNewId_('BKP'), file_id: copy.getId(), file_name: copy.getName(),
    size_bytes: 0, status_code: 'SUCCESS', message: 'Google Drive 내 별도 스프레드시트 복제', created_at: createdAt
  });
  properties.setProperty(MH_PROPERTY_KEYS.BACKUP_LAST_SUCCESS_AT, createdAt);
  MH_SETTINGS_MEMORY_CACHE = null;
  return { ok: true, skipped: false, fileId: copy.getId(), fileName: copy.getName(), createdAt: createdAt };
}

function mhVerifyLatestBackup() {
  var logs = mhReadTable_(MH_SHEETS.BACKUP_LOG).rows.filter(function (row) {
    return mhAsText_(row.status_code).toUpperCase() === 'SUCCESS' && mhAsText_(row.file_id);
  });
  logs.sort(function (a, b) { return mhAsText_(b.created_at).localeCompare(mhAsText_(a.created_at)); });
  if (!logs[0]) throw new Error('검증할 백업 파일이 없습니다.');
  var spreadsheet = SpreadsheetApp.openById(mhAsText_(logs[0].file_id));
  var required = [MH_SHEETS.CLIENTS, MH_SHEETS.PROJECTS, MH_SHEETS.USERS, MH_SHEETS.MEMBERSHIPS, MH_SHEETS.TASKS, MH_SHEETS.ACTIVITY];
  var missing = required.filter(function (name) { return !spreadsheet.getSheetByName(name); });
  return { ok: missing.length === 0, fileId: spreadsheet.getId(), fileName: spreadsheet.getName(), missingSheets: missing };
}
