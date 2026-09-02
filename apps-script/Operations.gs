var MH_MUTATION_REGISTRY_HEADERS = [
  'mutation_id', 'request_hash', 'event_status_code', 'entity_type', 'entity_id',
  'project_id', 'action_code', 'before_json', 'after_json', 'actor_user_id',
  'actor_role_code', 'created_at', 'updated_at'
];

var MH_BACKUP_LOG_HEADERS = [
  'backup_id', 'file_id', 'file_name', 'size_bytes', 'status_code', 'message', 'created_at',
  'manifest_json', 'verified_at', 'verification_status'
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
  if (operation === 'audit_mutations') return mhAuditMutationRegistry_();
  if (operation === 'sync_und_task_structure') return mhSyncUndTaskStructureV34();
  if (operation === 'audit_und_task_structure') return mhAuditUndTaskStructureV34();
  if (operation === 'repair_dependency_schema') return mhSetupRepairTaskDependencySchema();
  if (operation === 'repair_sync_status_schema') return mhSetupRepairSyncStatusSchema();
  if (operation === 'split_internal_roles') return mhSetupSplitInternalRoles();
  if (operation === 'configure_backup_runner') return mhConfigureBackupRunner_(request);
  if (operation === 'install_backup') return mhSetupInstallDailyBackup();
  if (operation === 'run_backup') return mhRunDailyBackup();
  if (operation === 'verify_backup') return mhVerifyLatestBackup();
  if (operation === 'migrate_campaign_schedule_v1') return mhMigrateCampaignScheduleV1_(request, actor);
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

function mhRememberMutationRegistries_(entries) {
  if (!entries || !entries.length || !mhOperationsSheetExists_(MH_SHEETS.MUTATIONS)) return false;
  var table = mhReadTable_(MH_SHEETS.MUTATIONS);
  var existingIds = {};
  table.rows.forEach(function (row) { existingIds[mhAsText_(row.mutation_id)] = true; });
  var records = entries.map(function (entry) {
    var activity = entry.activity;
    if (existingIds[mhAsText_(activity.mutation_id)]) {
      throw mhApiError_('conflict', 'duplicate_mutation_registry_key', 409);
    }
    return {
      mutation_id: activity.mutation_id,
      request_hash: entry.requestHash,
      event_status_code: activity.event_status_code,
      entity_type: activity.entity_type,
      entity_id: activity.entity_id,
      project_id: activity.project_id,
      action_code: activity.action_code,
      before_json: activity.before_json,
      after_json: activity.after_json,
      actor_user_id: activity.actor_user_id,
      actor_role_code: activity.actor_role_code,
      created_at: activity.created_at,
      updated_at: activity.created_at
    };
  });
  mhAppendRecordsToTable_(table, records, true);
  records.forEach(mhCacheMutationRegistryRow_);
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

function mhAuditMutationRegistry_() {
  var rows = mhReadTable_(MH_SHEETS.MUTATIONS).rows;
  var cutoff = Date.now() - 15 * 60 * 1000;
  var counts = { total: rows.length, commit: 0, prepare: 0, failed: 0, unknown: 0 };
  var stalePrepareIds = [];
  rows.forEach(function (row) {
    var status = mhAsText_(row.event_status_code).toUpperCase();
    if (status === 'COMMIT') counts.commit += 1;
    else if (status === 'PREPARE') {
      counts.prepare += 1;
      var createdAt = Date.parse(mhAsText_(row.updated_at || row.created_at));
      if (!isFinite(createdAt) || createdAt < cutoff) stalePrepareIds.push(mhAsText_(row.mutation_id));
    } else if (status === 'FAILED') counts.failed += 1;
    else counts.unknown += 1;
  });
  return {
    ok: stalePrepareIds.length === 0 && counts.unknown === 0,
    counts: counts,
    stalePrepareCount: stalePrepareIds.length,
    stalePrepareIds: stalePrepareIds.slice(0, 20),
    checkedAt: mhNowIso_()
  };
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
  mhAssertBackupRunner_(request);
  var result = mhRunDailyBackup(false);
  result.verification = mhVerifyLatestBackup();
  return result;
}

function mhAssertBackupRunner_(request) {
  var supplied = mhAsText_(request && request.runnerSecret);
  var expected = mhAsText_(mhSetting_(MH_PROPERTY_KEYS.BACKUP_RUNNER_DIGEST, ''));
  if (!supplied || !expected || !mhConstantTimeEquals_(mhHashToken_(supplied), expected)) {
    throw mhApiError_('unauthorized', 'invalid_backup_runner', 401);
  }
}

function mhWriteSupabaseTaskBackup_(request) {
  mhAssertBackupRunner_(request);
  var snapshot = request && request.snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw mhApiError_('invalid_request', 'supabase_snapshot_required', 400);
  }
  var rows = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  if (rows.length > 5000 || Number(snapshot.taskCount) !== rows.length) {
    throw mhApiError_('invalid_request', 'supabase_snapshot_count_mismatch', 400);
  }
  var headers = [
    'snapshot_id', 'exported_at', 'task_id', 'legacy_id', 'project_id', 'project_name',
    'client_name', 'title', 'description', 'phase_code', 'workstream_code',
    'category_code', 'responsible_org_code', 'status_code', 'priority_code',
    'planned_start_date', 'due_date', 'schedule_dates_json', 'progress_percent',
    'completion_url', 'remarks', 'visibility_code', 'row_version', 'created_at',
    'updated_at', 'archived_at'
  ];
  var snapshotId = mhAsText_(snapshot.snapshotId);
  var exportedAt = mhAsText_(snapshot.exportedAt);
  if (!snapshotId || !exportedAt || mhAsText_(snapshot.source) !== 'SUPABASE') {
    throw mhApiError_('invalid_request', 'invalid_supabase_snapshot_metadata', 400);
  }
  var values = rows.map(function (row) {
    return headers.map(function (header) {
      if (header === 'snapshot_id') return snapshotId;
      if (header === 'exported_at') return exportedAt;
      if (header === 'schedule_dates_json') return JSON.stringify(row.schedule_dates || []);
      var value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
    });
  });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) throw mhApiError_('lock_timeout', 'backup_lock_timeout', 409);
  try {
    var spreadsheet = mhSpreadsheet_();
    var sheet = spreadsheet.getSheetByName(MH_SHEETS.SUPABASE_TASK_BACKUP);
    if (!sheet) sheet = spreadsheet.insertSheet(MH_SHEETS.SUPABASE_TASK_BACKUP);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    sheet.setFrozenRows(1);
    sheet.hideSheet();
    var protectedSheet = false;
    try {
      var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      var protection = protections.length ? protections[0] : sheet.protect();
      protection.setDescription('Supabase 자동 백업 - 직접 편집 금지');
      protection.setWarningOnly(false);
      var ownerEmail = Session.getEffectiveUser().getEmail();
      var editors = protection.getEditors();
      if (editors.length) protection.removeEditors(editors.filter(function (editor) {
        return editor.getEmail() !== ownerEmail;
      }));
      if (ownerEmail && !protection.canEdit()) protection.addEditor(ownerEmail);
      protectedSheet = true;
    } catch (protectionError) {
      console.warn('[marketing-hub] supabase backup protection fallback: ' + protectionError);
    }
    SpreadsheetApp.flush();
    mhInvalidateTableCache_(MH_SHEETS.SUPABASE_TASK_BACKUP);
    return {
      ok: true,
      snapshotId: snapshotId,
      exportedAt: exportedAt,
      taskCount: rows.length,
      hidden: sheet.isSheetHidden(),
      protected: protectedSheet
    };
  } finally {
    lock.releaseLock();
  }
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
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) throw mhApiError_('lock_timeout', 'backup_lock_timeout', 409);
  try {
    var timestamp = Utilities.formatDate(now, 'Asia/Seoul', 'yyyyMMdd_HHmmss');
    var source = mhSpreadsheet_();
    var sourceManifest = mhSpreadsheetManifest_(source);
    var copy = source.copy('PocketMarketingHub_' + timestamp);
    var backupManifest = mhSpreadsheetManifest_(copy);
    var comparison = mhCompareBackupManifests_(sourceManifest, backupManifest);
    var createdAt = mhNowIso_();
    var verifiedAt = comparison.ok ? createdAt : '';
    mhAppendRecord_(MH_SHEETS.BACKUP_LOG, {
      backup_id: mhNewId_('BKP'), file_id: copy.getId(), file_name: copy.getName(),
      size_bytes: 0, status_code: comparison.ok ? 'SUCCESS' : 'FAILED',
      message: comparison.ok ? '별도 스프레드시트 복제 및 셀 해시 검증' : '백업 검증 불일치: ' + comparison.mismatchedSheets.join(','),
      created_at: createdAt, manifest_json: JSON.stringify(sourceManifest),
      verified_at: verifiedAt, verification_status: comparison.ok ? 'VERIFIED' : 'MISMATCH'
    });
    if (!comparison.ok) throw mhApiError_('internal_error', 'backup_manifest_mismatch', 500);
    properties.setProperty(MH_PROPERTY_KEYS.BACKUP_LAST_SUCCESS_AT, createdAt);
    MH_SETTINGS_MEMORY_CACHE = null;
    return {
      ok: true, skipped: false, fileId: copy.getId(), fileName: copy.getName(),
      createdAt: createdAt, verification: comparison
    };
  } finally {
    lock.releaseLock();
  }
}

function mhVerifyLatestBackup() {
  var logs = mhReadTable_(MH_SHEETS.BACKUP_LOG).rows.filter(function (row) {
    return mhAsText_(row.status_code).toUpperCase() === 'SUCCESS' && mhAsText_(row.file_id);
  });
  logs.sort(function (a, b) { return mhAsText_(b.created_at).localeCompare(mhAsText_(a.created_at)); });
  if (!logs[0]) throw new Error('검증할 백업 파일이 없습니다.');
  var spreadsheet = SpreadsheetApp.openById(mhAsText_(logs[0].file_id));
  var actual = mhSpreadsheetManifest_(spreadsheet);
  var expected = mhParseJson_(mhAsText_(logs[0].manifest_json), null);
  var comparison = expected ? mhCompareBackupManifests_(expected, actual) : mhCompareBackupManifests_({ sheets: {} }, actual);
  if (!expected) {
    var required = [MH_SHEETS.CLIENTS, MH_SHEETS.PROJECTS, MH_SHEETS.USERS, MH_SHEETS.MEMBERSHIPS, MH_SHEETS.TASKS, MH_SHEETS.ACTIVITY];
    comparison.missingSheets = required.filter(function (name) { return !spreadsheet.getSheetByName(name); });
    comparison.ok = comparison.missingSheets.length === 0;
    comparison.legacyManifest = true;
  }
  return {
    ok: comparison.ok, fileId: spreadsheet.getId(), fileName: spreadsheet.getName(),
    missingSheets: comparison.missingSheets || [], mismatchedSheets: comparison.mismatchedSheets || [],
    verifiedSheets: comparison.verifiedSheets || 0, legacyManifest: !!comparison.legacyManifest
  };
}

function mhSpreadsheetManifest_(spreadsheet) {
  var names = Object.keys(MH_SHEETS).map(function (key) { return MH_SHEETS[key]; });
  var sheets = {};
  names.forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return;
    var rows = Math.max(sheet.getLastRow(), 1);
    var columns = Math.max(sheet.getLastColumn(), 1);
    var values = sheet.getRange(1, 1, rows, columns).getDisplayValues();
    sheets[name] = {
      rows: rows,
      columns: columns,
      digest: mhHashToken_(mhStableJson_(values))
    };
  });
  return { schemaVersion: MH_SCHEMA_VERSION, sheets: sheets };
}

function mhCompareBackupManifests_(expected, actual) {
  var expectedSheets = expected && expected.sheets ? expected.sheets : {};
  var actualSheets = actual && actual.sheets ? actual.sheets : {};
  var missing = [];
  var mismatched = [];
  Object.keys(expectedSheets).forEach(function (name) {
    if (!actualSheets[name]) {
      missing.push(name);
      return;
    }
    if (mhStableJson_(expectedSheets[name]) !== mhStableJson_(actualSheets[name])) mismatched.push(name);
  });
  return {
    ok: missing.length === 0 && mismatched.length === 0,
    missingSheets: missing,
    mismatchedSheets: mismatched,
    verifiedSheets: Object.keys(expectedSheets).length - missing.length - mismatched.length
  };
}
