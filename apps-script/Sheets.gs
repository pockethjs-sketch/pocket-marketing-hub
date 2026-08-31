var MH_SPREADSHEET_CACHE = null;
var MH_TABLE_MEMORY_CACHE = {};
var MH_FORCE_FRESH_TABLES = false;
var MH_TABLE_CACHE_TTL_SECONDS = 180;
var MH_TABLE_CACHE_MAX_BYTES = 90000;

function mhTableCacheKey_(sheetName) {
  var spreadsheetId = mhSetting_(MH_PROPERTY_KEYS.SHEET_ID, '');
  return 'mh_table_v3_' + mhHashToken_(
    spreadsheetId + '|' + MH_SCHEMA_VERSION + '|' + MH_BACKEND_VERSION + '|' + sheetName
  ).slice(0, 48);
}

function mhCachedTablePayload_(sheetName) {
  if (MH_FORCE_FRESH_TABLES) return null;
  try {
    var raw = CacheService.getScriptCache().get(mhTableCacheKey_(sheetName));
    if (!raw) return null;
    var json = raw;
    if (raw.indexOf('z:') === 0) {
      json = Utilities.ungzip(
        Utilities.newBlob(Utilities.base64Decode(raw.slice(2)))
      ).getDataAsString('UTF-8');
    } else if (raw.indexOf('j:') === 0) {
      json = raw.slice(2);
    }
    var parsed = mhParseJson_(json, null);
    if (!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) return null;
    return {
      sheetName: sheetName,
      sheet: null,
      headers: parsed.headers,
      rows: parsed.rows
    };
  } catch (ignored) {
    return null;
  }
}

function mhRememberTablePayload_(sheetName, table) {
  if (MH_FORCE_FRESH_TABLES) return;
  try {
    var serialized = JSON.stringify({ headers: table.headers, rows: table.rows });
    var payload = 'j:' + serialized;
    if (Utilities.newBlob(payload).getBytes().length > MH_TABLE_CACHE_MAX_BYTES) {
      payload = 'z:' + Utilities.base64Encode(
        Utilities.gzip(Utilities.newBlob(serialized, 'application/json')).getBytes()
      );
    }
    if (Utilities.newBlob(payload).getBytes().length > MH_TABLE_CACHE_MAX_BYTES) return;
    CacheService.getScriptCache().put(
      mhTableCacheKey_(sheetName),
      payload,
      MH_TABLE_CACHE_TTL_SECONDS
    );
  } catch (ignored) {}
}

function mhInvalidateTableCache_(sheetName) {
  delete MH_TABLE_MEMORY_CACHE[sheetName];
  try {
    CacheService.getScriptCache().remove(mhTableCacheKey_(sheetName));
  } catch (ignored) {}
}

function mhUseFreshTables_() {
  MH_FORCE_FRESH_TABLES = true;
  MH_TABLE_MEMORY_CACHE = {};
}

function mhBeginMutationTables_(sheetNames) {
  MH_FORCE_FRESH_TABLES = false;
  MH_TABLE_MEMORY_CACHE = {};
  var names = Array.isArray(sheetNames) && sheetNames.length
    ? sheetNames : Object.keys(MH_SHEETS).map(function (key) { return MH_SHEETS[key]; });
  var seen = {};
  names.forEach(function (sheetName) {
    if (!sheetName || seen[sheetName]) return;
    seen[sheetName] = true;
    mhInvalidateTableCache_(sheetName);
  });
}

function mhSpreadsheet_() {
  if (MH_SPREADSHEET_CACHE) return MH_SPREADSHEET_CACHE;
  var spreadsheetId = mhSetting_(MH_PROPERTY_KEYS.SHEET_ID, '');
  if (!spreadsheetId) {
    throw mhApiError_('configuration_error', 'missing_spreadsheet_id', 500);
  }
  try {
    MH_SPREADSHEET_CACHE = SpreadsheetApp.openById(spreadsheetId);
    return MH_SPREADSHEET_CACHE;
  } catch (error) {
    throw mhApiError_('configuration_error', 'spreadsheet_unavailable', 500);
  }
}

function mhSheet_(sheetName) {
  var sheet = mhSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw mhApiError_('schema_mismatch', 'missing_sheet', 500);
  return sheet;
}

function mhReadTable_(sheetName) {
  if (!MH_FORCE_FRESH_TABLES && MH_TABLE_MEMORY_CACHE[sheetName]) {
    return MH_TABLE_MEMORY_CACHE[sheetName];
  }
  var cached = mhCachedTablePayload_(sheetName);
  if (cached) {
    MH_TABLE_MEMORY_CACHE[sheetName] = cached;
    return cached;
  }
  var sheet = mhSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw mhApiError_('schema_mismatch', 'missing_headers', 500);
  var values = sheet.getRange(1, 1, Math.max(lastRow, 1), lastColumn).getValues();
  var headers = values[0].map(function (value) { return mhAsText_(value); });
  if (!headers[0]) throw mhApiError_('schema_mismatch', 'missing_primary_header', 500);
  var headerSeen = {};
  headers.forEach(function (header) {
    if (!header) return;
    if (headerSeen[header]) throw mhApiError_('schema_mismatch', 'duplicate_header', 500);
    headerSeen[header] = true;
  });
  var rows = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (!mhNonEmpty_(values[rowIndex][0])) continue;
    var row = {};
    headers.forEach(function (header, columnIndex) {
      if (header) row[header] = values[rowIndex][columnIndex];
    });
    row.__rowNumber = rowIndex + 1;
    rows.push(row);
  }
  var table = { sheetName: sheetName, sheet: sheet, headers: headers, rows: rows };
  MH_TABLE_MEMORY_CACHE[sheetName] = table;
  mhRememberTablePayload_(sheetName, table);
  return table;
}

function mhActiveRows_(sheetName) {
  return mhReadTable_(sheetName).rows.filter(function (row) {
    return !mhNonEmpty_(row.archived_at);
  });
}

function mhFindRecord_(sheetName, idField, id) {
  var table = mhReadTable_(sheetName);
  var target = mhAsText_(id);
  var found = null;
  for (var i = 0; i < table.rows.length; i += 1) {
    if (mhAsText_(table.rows[i][idField]) === target) {
      if (found) throw mhApiError_('schema_mismatch', 'duplicate_primary_key', 500);
      found = table.rows[i];
    }
  }
  return { table: table, row: found };
}

function mhHeaderIndex_(headers, field) {
  var index = headers.indexOf(field);
  if (index < 0) throw mhApiError_('schema_mismatch', 'missing_field', 500);
  return index;
}

function mhAppendRecord_(sheetName, record) {
  var table = mhReadTable_(sheetName);
  var values = table.headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
  });
  var sheet = table.sheet || mhSheet_(sheetName);
  sheet.appendRow(values);
  SpreadsheetApp.flush();
  mhInvalidateTableCache_(sheetName);
  return record;
}

function mhUpdateRecord_(table, rowNumber, record) {
  var sheet = table.sheet || mhSheet_(table.sheetName);
  var range = sheet.getRange(rowNumber, 1, 1, table.headers.length);
  var current = range.getValues()[0];
  var formulas = range.getFormulas()[0];
  var nextValues = current.slice();
  var changed = false;
  table.headers.forEach(function (header, index) {
    if (!Object.prototype.hasOwnProperty.call(record, header)) return;
    var next = record[header];
    var same = mhStableJson_(mhToIsoValue_(current[index])) === mhStableJson_(mhToIsoValue_(next));
    if (same) return;
    if (formulas[index]) throw mhApiError_('schema_mismatch', 'formula_field_is_server_read_only', 500);
    nextValues[index] = next;
    changed = true;
  });
  if (!changed) return record;
  formulas.forEach(function (formula, index) {
    if (formula) nextValues[index] = formula;
  });
  range.setValues([nextValues]);
  SpreadsheetApp.flush();
  mhInvalidateTableCache_(table.sheetName);
  return record;
}

function mhAssertHeaders_(sheetName, requiredHeaders) {
  var headers = mhReadTable_(sheetName).headers;
  var missing = requiredHeaders.filter(function (header) {
    return headers.indexOf(header) < 0;
  });
  if (missing.length) {
    throw mhApiError_(
      'schema_mismatch',
      'missing_required_headers:' + sheetName + ':' + missing.join(','),
      500
    );
  }
}

function mhSchemaCheck_() {
  Object.keys(MH_SHEETS).forEach(function (key) { mhReadTable_(MH_SHEETS[key]); });
  mhAssertHeaders_(MH_SHEETS.CLIENTS, ['client_id', 'display_name', 'status_code', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.USERS, ['user_id', 'email', 'role_code', 'status_code', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.MEMBERSHIPS, ['membership_id', 'user_id', 'client_id', 'project_id', 'permission_code', 'status_code', 'allowed_pages_json', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.PROJECTS, ['project_id', 'client_id', 'project_name', 'client_view_enabled', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.CHANNELS, ['project_channel_id', 'client_id', 'project_id', 'channel_code', 'customer_visible', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.CONTENT_VERSIONS, ['content_version_id', 'content_id', 'client_id', 'project_id', 'version_no', 'file_url', 'copy_text', 'change_summary', 'status_code', 'created_at', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.TASK_DEPENDENCIES, ['dependency_id', 'client_id', 'project_id', 'predecessor_task_id', 'successor_task_id', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.KPI_DEFINITIONS, ['kpi_id', 'client_id', 'project_id', 'metric_code', 'metric_name', 'customer_visible', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.DAILY_PERFORMANCE, ['performance_id', 'client_id', 'project_id', 'performance_date', 'channel_code', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.KPI_ACTUALS, ['kpi_actual_id', 'kpi_id', 'client_id', 'project_id', 'period_start', 'period_end', 'actual_value', 'archived_at']);
  Object.keys(MH_ENTITY_SPECS).forEach(function (entityType) {
    var spec = MH_ENTITY_SPECS[entityType];
    var required = [
      spec.idField, 'client_id', 'project_id', 'created_at', 'updated_at',
      'row_version', 'archived_at'
    ].concat(spec.fields);
    if (entityType === 'task') required.push('source_code');
    if (entityType === 'approval') required.push('requested_by_user_id');
    if (entityType === 'file') required.push('uploaded_by_user_id');
    if (entityType === 'daily_meeting') required.push('created_by_user_id');
    mhAssertHeaders_(spec.sheet, required);
  });
  mhAssertHeaders_(MH_SHEETS.ACTIVITY, [
    'event_id', 'mutation_id', 'client_id', 'project_id', 'entity_type', 'entity_id', 'action_code',
    'before_json', 'after_json', 'actor_user_id', 'actor_role_code',
    'event_status_code', 'created_at'
  ]);
  mhAssertHeaders_(MH_SHEETS.MUTATIONS, [
    'mutation_id', 'request_hash', 'event_status_code', 'entity_type', 'entity_id',
    'project_id', 'action_code', 'before_json', 'after_json', 'actor_user_id',
    'actor_role_code', 'created_at', 'updated_at'
  ]);
  mhAssertHeaders_(MH_SHEETS.BACKUP_LOG, [
    'backup_id', 'file_id', 'file_name', 'size_bytes', 'status_code', 'message', 'created_at'
  ]);
  mhAssertHeaders_(MH_SHEETS.SYNC_STATUS, ['sync_status_id', 'client_id', 'project_id', 'status_code', 'updated_at', 'archived_at']);
  mhAssertHeaders_(MH_SHEETS.PLANS, [
    'plan_id', 'client_id', 'project_id', 'version_label', 'title', 'summary',
    'build_weeks', 'operation_months', 'monthly_output_target', 'initial_output_target',
    'primary_goal', 'status_code', 'effective_at', 'visibility_code', 'source_code',
    'created_at', 'updated_at', 'row_version', 'archived_at'
  ]);
  mhAssertHeaders_(MH_SHEETS.PLAN_SECTIONS, [
    'plan_section_id', 'plan_id', 'client_id', 'project_id', 'section_code',
    'nav_label', 'title', 'body_html', 'sort_order', 'status_code',
    'visibility_code', 'source_code', 'created_at', 'updated_at', 'row_version', 'archived_at'
  ]);
  [
    [MH_SHEETS.CLIENTS, 'client_id'], [MH_SHEETS.PROJECTS, 'project_id'],
    [MH_SHEETS.USERS, 'user_id'], [MH_SHEETS.MEMBERSHIPS, 'membership_id'],
    [MH_SHEETS.CHANNELS, 'project_channel_id'], [MH_SHEETS.TASKS, 'task_id'],
    [MH_SHEETS.TASK_DEPENDENCIES, 'dependency_id'],
    [MH_SHEETS.CONTENTS, 'content_id'], [MH_SHEETS.CONTENT_VERSIONS, 'content_version_id'],
    [MH_SHEETS.APPROVALS, 'approval_id'], [MH_SHEETS.KPI_DEFINITIONS, 'kpi_id'],
    [MH_SHEETS.DAILY_PERFORMANCE, 'performance_id'], [MH_SHEETS.KPI_ACTUALS, 'kpi_actual_id'],
    [MH_SHEETS.FILES, 'file_id'], [MH_SHEETS.ACTIVITY, 'event_id'],
    [MH_SHEETS.SYNC_STATUS, 'sync_status_id'], [MH_SHEETS.PLANS, 'plan_id'],
    [MH_SHEETS.PLAN_SECTIONS, 'plan_section_id'], [MH_SHEETS.DAILY_MEETINGS, 'meeting_id'],
    [MH_SHEETS.MUTATIONS, 'mutation_id'], [MH_SHEETS.BACKUP_LOG, 'backup_id']
  ].forEach(function (entry) { mhAssertUniqueKey_(entry[0], entry[1]); });
  mhAssertUniqueMemberships_();
  mhAssertTenantScopes_();
  return true;
}

function mhAssertUniqueKey_(sheetName, idField) {
  var seen = {};
  mhReadTable_(sheetName).rows.forEach(function (row) {
    var id = mhAsText_(row[idField]);
    if (!id || seen[id]) throw mhApiError_('schema_mismatch', 'duplicate_or_empty_primary_key', 500);
    seen[id] = true;
  });
}

function mhAssertUniqueMemberships_() {
  var seen = {};
  mhActiveRows_(MH_SHEETS.MEMBERSHIPS).forEach(function (row) {
    if (mhAsText_(row.status_code).toUpperCase() !== 'ACTIVE') return;
    var key = [mhAsText_(row.user_id), mhAsText_(row.client_id), mhAsText_(row.project_id)].join('|');
    if (seen[key]) throw mhApiError_('schema_mismatch', 'duplicate_active_membership', 500);
    seen[key] = true;
  });
}

function mhAssertTenantScopes_() {
  var projects = {};
  mhActiveRows_(MH_SHEETS.PROJECTS).forEach(function (row) {
    projects[mhAsText_(row.client_id) + '|' + mhAsText_(row.project_id)] = true;
  });
  [
    MH_SHEETS.CHANNELS, MH_SHEETS.TASKS, MH_SHEETS.TASK_DEPENDENCIES,
    MH_SHEETS.CONTENTS, MH_SHEETS.CONTENT_VERSIONS, MH_SHEETS.APPROVALS, MH_SHEETS.KPI_DEFINITIONS,
    MH_SHEETS.DAILY_PERFORMANCE, MH_SHEETS.KPI_ACTUALS, MH_SHEETS.FILES,
    MH_SHEETS.ACTIVITY, MH_SHEETS.SYNC_STATUS, MH_SHEETS.PLANS, MH_SHEETS.PLAN_SECTIONS,
    MH_SHEETS.DAILY_MEETINGS
  ].forEach(function (sheetName) {
    mhActiveRows_(sheetName).forEach(function (row) {
      var clientId = mhAsText_(row.client_id);
      var projectId = mhAsText_(row.project_id);
      if (sheetName === MH_SHEETS.ACTIVITY && !clientId && !projectId) return;
      var key = clientId + '|' + projectId;
      if (!projects[key]) {
        var firstId = mhAsText_(row[Object.keys(row).filter(function (field) {
          return field.slice(-3) === '_id' && field !== 'client_id' && field !== 'project_id';
        })[0]]);
        throw mhApiError_(
          'schema_mismatch',
          'invalid_tenant_scope:' + sheetName + ':' + firstId + ':' + key,
          500
        );
      }
    });
  });
}
