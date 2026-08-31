/**
 * Run these helpers manually from the Apps Script editor.
 * They do not write to the business data sheets.
 */

function mhSetupInitialize() {
  var properties = PropertiesService.getScriptProperties();
  var current = properties.getProperties();
  if (!current[MH_PROPERTY_KEYS.SESSION_SIGNING_SECRET]) {
    var localSecret = mhSetting_(MH_PROPERTY_KEYS.SESSION_SIGNING_SECRET, '');
    properties.setProperty(
      MH_PROPERTY_KEYS.SESSION_SIGNING_SECRET,
      localSecret && localSecret.length >= 32 ? localSecret : mhRandomSecret_()
    );
  }
  if (!current[MH_PROPERTY_KEYS.ACCESS_CODE_PEPPER]) {
    var localPepper = mhSetting_(MH_PROPERTY_KEYS.ACCESS_CODE_PEPPER, '');
    var existingAccounts = mhParseJson_(mhSetting_(MH_PROPERTY_KEYS.ACCESS_ACCOUNTS_JSON, '{}'), {});
    var compatibilityPepper = Object.keys(existingAccounts).length
      ? mhSetting_(MH_PROPERTY_KEYS.SESSION_SIGNING_SECRET, '')
      : '';
    properties.setProperty(
      MH_PROPERTY_KEYS.ACCESS_CODE_PEPPER,
      localPepper && localPepper.length >= 32
        ? localPepper
        : compatibilityPepper && compatibilityPepper.length >= 32
          ? compatibilityPepper
          : mhRandomSecret_()
    );
  }
  if (!current[MH_PROPERTY_KEYS.ENABLE_WRITES]) {
    properties.setProperty(MH_PROPERTY_KEYS.ENABLE_WRITES, 'false');
  }
  if (!current[MH_PROPERTY_KEYS.SESSION_VERSION]) {
    properties.setProperty(MH_PROPERTY_KEYS.SESSION_VERSION, '1');
  }
  if (!current[MH_PROPERTY_KEYS.SESSION_TTL_SECONDS]) {
    properties.setProperty(MH_PROPERTY_KEYS.SESSION_TTL_SECONDS, String(MH_SESSION_TTL_DEFAULT_SECONDS));
  }
  if (!current[MH_PROPERTY_KEYS.ACCESS_ACCOUNTS_JSON]) {
    properties.setProperty(MH_PROPERTY_KEYS.ACCESS_ACCOUNTS_JSON, mhSetting_(MH_PROPERTY_KEYS.ACCESS_ACCOUNTS_JSON, '{}'));
  }
  return mhSetupValidate();
}

function mhSetupEnsurePermissionAccessColumn() {
  var added = mhEnsureMembershipAccessHeader_();
  mhUseFreshTables_();
  mhAssertHeaders_(MH_SHEETS.MEMBERSHIPS, ['allowed_pages_json']);
  return { ok: true, added: added, sheet: MH_SHEETS.MEMBERSHIPS, field: 'allowed_pages_json' };
}

function mhSetupEnsureDailyMeetingsSheet() {
  var headers = [
    'meeting_id', 'client_id', 'project_id', 'meeting_date', 'title',
    'attendees_text', 'discussion_text', 'decisions_text', 'action_items_text',
    'created_by_user_id', 'visibility_code', 'created_at', 'updated_at',
    'row_version', 'archived_at'
  ];
  var sheet = mhPlanEnsureSheet_(mhSpreadsheet_(), MH_SHEETS.DAILY_MEETINGS, headers);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  mhInvalidateTableCache_(MH_SHEETS.DAILY_MEETINGS);
  mhAssertHeaders_(MH_SHEETS.DAILY_MEETINGS, headers);
  return { ok: true, sheet: MH_SHEETS.DAILY_MEETINGS, headers: headers.length };
}

function mhSetupEnsureTaskTableFields() {
  var fields = ['progress_percent', 'completion_url', 'remarks'];
  var sheet = mhPlanEnsureSheet_(mhSpreadsheet_(), MH_SHEETS.TASKS, fields);
  mhInvalidateTableCache_(MH_SHEETS.TASKS);
  var table = mhReadTable_(MH_SHEETS.TASKS);
  var progressIndex = table.headers.indexOf('progress_percent');
  var updated = 0;
  if (progressIndex >= 0 && sheet.getLastRow() > 1) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    values.forEach(function (row, index) {
      if (mhNonEmpty_(row[progressIndex])) return;
      sheet.getRange(index + 2, progressIndex + 1).setValue(0).setNumberFormat('0');
      updated += 1;
    });
  }
  SpreadsheetApp.flush();
  mhInvalidateTableCache_(MH_SHEETS.TASKS);
  mhAssertHeaders_(MH_SHEETS.TASKS, fields);
  return { ok: true, sheet: MH_SHEETS.TASKS, addedFields: fields, initializedProgressRows: updated };
}

/** One-time cleanup for progress values that were previously derived from
 * schedule elapsed time or task status. Progress is now manual-only. */
function mhSetupResetDerivedTaskProgress() {
  var table = mhReadTable_(MH_SHEETS.TASKS);
  var progressIndex = table.headers.indexOf('progress_percent');
  if (progressIndex < 0) throw new Error('progress_percent 열이 없습니다.');
  var sheet = table.sheet;
  var rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount) return { ok: true, sheet: MH_SHEETS.TASKS, resetRows: 0 };
  var values = Array.from({ length: rowCount }, function () { return [0]; });
  sheet.getRange(2, progressIndex + 1, values.length, 1).setValues(values).setNumberFormat('0');
  SpreadsheetApp.flush();
  mhInvalidateTableCache_(MH_SHEETS.TASKS);
  return { ok: true, sheet: MH_SHEETS.TASKS, resetRows: values.length };
}

function mhSetupRegisterStagedAccount() {
  var properties = PropertiesService.getScriptProperties();
  var email = mhNormalizeLoginAccount_(properties.getProperty('SETUP_ACCOUNT_EMAIL'));
  var accessCode = String(properties.getProperty('SETUP_ACCOUNT_CODE') || '');
  if (!email || !mhValidAccessCode_(email, accessCode)) {
    throw new Error('유효한 SETUP_ACCOUNT_EMAIL(또는 내부 아이디)과 정책에 맞는 SETUP_ACCOUNT_CODE를 임시 Script Properties에 먼저 입력하세요.');
  }
  mhActorByEmail_(email);
  var account = {
    email: email,
    access_code_hash: mhAccessCodeDigest_(email, accessCode),
    enabled: true,
    updated_at: mhNowIso_()
  };
  properties.setProperty(mhAccessAccountPropertyKey_(email), JSON.stringify(account));
  properties.deleteProperty('SETUP_ACCOUNT_EMAIL');
  properties.deleteProperty('SETUP_ACCOUNT_CODE');
  return { ok: true, email: email, plaintextRemoved: true };
}

/**
 * One-time cutover for the two shared internal operator accounts.
 * Call only through the Apps Script execution API. Plaintext passwords are
 * accepted as parameters, converted to HMAC digests, and never written to a
 * sheet, Script Property, response, or repository.
 */
function mhSetupProvisionSharedAccounts(pocketAccessCode, nsAccessCode) {
  var specs = [
    {
      account: 'pocket',
      email: 'pocket@hub.local',
      accessCode: String(pocketAccessCode || ''),
      fallbackUserId: 'USR-POCKET-001',
      fallbackMembershipId: 'MEM-UND-POCKET-001',
      displayName: '포켓컴퍼니',
      organizationCode: 'POCKET'
    },
    {
      account: 'ns',
      email: 'ns@hub.local',
      accessCode: String(nsAccessCode || ''),
      fallbackUserId: 'USR-NS-001',
      fallbackMembershipId: 'MEM-UND-NS-001',
      displayName: 'NS마케팅',
      organizationCode: 'NS'
    }
  ];
  specs.forEach(function (spec) {
    if (!mhValidAccessCode_(spec.email, spec.accessCode)) {
      throw new Error(spec.account + ' 계정 비밀번호는 공백 없이 8자 이상이어야 합니다.');
    }
  });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) throw new Error('계정 원장을 잠그지 못했습니다. 잠시 후 다시 실행하세요.');
  try {
    mhSetupRepairAuthHeaders_();
    mhUseFreshTables_();
    var project = mhFindRecord_(MH_SHEETS.PROJECTS, 'project_id', 'PRJ-UND-90D-001').row;
    if (!project || mhNonEmpty_(project.archived_at)) throw new Error('UND 운영 프로젝트를 찾지 못했습니다.');

    var properties = PropertiesService.getScriptProperties();
    var now = mhNowIso_();
    var result = specs.map(function (spec) {
      var user = mhSetupUpsertSharedUser_(spec, now);
      var membership = mhSetupUpsertSharedMembership_(spec, user.user_id, project, now);
      var account = {
        email: spec.email,
        access_code_hash: mhAccessCodeDigest_(spec.email, spec.accessCode),
        enabled: true,
        updated_at: now
      };
      properties.setProperty(mhAccessAccountPropertyKey_(spec.email), JSON.stringify(account));
      mhClearLoginFailures_(spec.email);
      return {
        account: spec.account,
        userId: user.user_id,
        role: 'POCKET_MANAGER',
        projectId: mhAsText_(project.project_id),
        permission: mhAsText_(membership.permission_code)
      };
    });

    properties.setProperty(MH_PROPERTY_KEYS.PUBLIC_PREVIEW_ENABLED, 'false');
    properties.setProperty(MH_PROPERTY_KEYS.ENABLE_WRITES, 'true');
    var nextSessionVersion = String(Number(mhSessionVersion_() || 0) + 1);
    properties.setProperty(MH_PROPERTY_KEYS.SESSION_VERSION, nextSessionVersion);
    MH_SETTINGS_MEMORY_CACHE = null;
    mhUseFreshTables_();
    mhAssertHeaders_(MH_SHEETS.USERS, ['user_id', 'email', 'role_code', 'status_code', 'archived_at']);
    mhAssertHeaders_(MH_SHEETS.MEMBERSHIPS, ['membership_id', 'user_id', 'client_id', 'project_id', 'permission_code', 'status_code', 'allowed_pages_json', 'archived_at']);
    mhAssertUniqueKey_(MH_SHEETS.USERS, 'user_id');
    mhAssertUniqueKey_(MH_SHEETS.MEMBERSHIPS, 'membership_id');
    mhAssertUniqueMemberships_();
    return {
      ok: true,
      accounts: result,
      publicPreviewEnabled: false,
      writesEnabled: true,
      sessionVersion: nextSessionVersion,
      plaintextStored: false
    };
  } finally {
    lock.releaseLock();
  }
}

function mhSetupRepairAuthHeaders_() {
  var sheet = mhSheet_(MH_SHEETS.USERS);
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) {
    return mhAsText_(value);
  });
  if (headers.indexOf('user_id') >= 0) return false;
  if (headers[0] !== '1열') {
    throw new Error('03_사용자 시트의 기본키 열을 자동 판별할 수 없습니다.');
  }
  sheet.getRange(1, 1).setValue('user_id');
  SpreadsheetApp.flush();
  mhInvalidateTableCache_(MH_SHEETS.USERS);
  return true;
}

function mhSetupUpsertSharedUser_(spec, now) {
  var table = mhReadTable_(MH_SHEETS.USERS);
  var matches = table.rows.filter(function (row) {
    return mhAsText_(row.email).toLowerCase() === spec.email && !mhNonEmpty_(row.archived_at);
  });
  if (matches.length > 1) throw new Error(spec.account + ' 계정의 활성 사용자 행이 중복되어 있습니다.');
  var existing = matches[0] || null;
  var userId = existing && mhNonEmpty_(existing.user_id)
    ? mhAsText_(existing.user_id)
    : spec.fallbackUserId;
  // The legacy user rows used a blank formula in user_id. Setup is the one
  // controlled migration allowed to replace that formula with a stable key;
  // ordinary API writes still retain the formula-field protection.
  if (existing && !mhNonEmpty_(existing.user_id)) {
    var userIdColumn = table.headers.indexOf('user_id');
    if (userIdColumn < 0) throw new Error('03_사용자 시트에 user_id 열이 없습니다.');
    var userSheet = table.sheet || mhSheet_(MH_SHEETS.USERS);
    userSheet.getRange(existing.__rowNumber, userIdColumn + 1).setValue(userId);
    SpreadsheetApp.flush();
    mhInvalidateTableCache_(MH_SHEETS.USERS);
    mhUseFreshTables_();
    table = mhReadTable_(MH_SHEETS.USERS);
    existing = table.rows.filter(function (row) {
      return mhAsText_(row.email).toLowerCase() === spec.email && !mhNonEmpty_(row.archived_at);
    })[0] || null;
  }
  var record = {
    user_id: userId,
    display_name: spec.displayName,
    email: spec.email,
    organization_code: spec.organizationCode,
    role_code: 'POCKET_MANAGER',
    status_code: 'ACTIVE',
    created_at: existing && mhNonEmpty_(existing.created_at) ? existing.created_at : now,
    updated_at: now,
    row_version: existing ? Math.max(1, Number(existing.row_version || 0) + 1) : 1,
    archived_at: ''
  };
  if (existing) mhUpdateRecord_(table, existing.__rowNumber, record);
  else mhAppendRecord_(MH_SHEETS.USERS, record);
  mhUseFreshTables_();
  return record;
}

function mhSetupUpsertSharedMembership_(spec, userId, project, now) {
  var table = mhReadTable_(MH_SHEETS.MEMBERSHIPS);
  var projectId = mhAsText_(project.project_id);
  var clientId = mhAsText_(project.client_id);
  var matches = table.rows.filter(function (row) {
    return !mhNonEmpty_(row.archived_at) &&
      mhAsText_(row.user_id) === userId &&
      mhAsText_(row.client_id) === clientId &&
      mhAsText_(row.project_id) === projectId;
  });
  if (matches.length > 1) throw new Error(spec.account + ' 계정의 활성 프로젝트 권한이 중복되어 있습니다.');
  var existing = matches[0] || null;
  var record = {
    membership_id: existing && mhNonEmpty_(existing.membership_id)
      ? mhAsText_(existing.membership_id)
      : spec.fallbackMembershipId,
    user_id: userId,
    client_id: clientId,
    project_id: projectId,
    permission_code: 'ADMIN',
    status_code: 'ACTIVE',
    created_at: existing && mhNonEmpty_(existing.created_at) ? existing.created_at : now,
    updated_at: now,
    row_version: existing ? Math.max(1, Number(existing.row_version || 0) + 1) : 1,
    archived_at: ''
  };
  if (existing) mhUpdateRecord_(table, existing.__rowNumber, record);
  else mhAppendRecord_(MH_SHEETS.MEMBERSHIPS, record);
  mhUseFreshTables_();
  return record;
}

function mhSetupDisableAccount(email) {
  var normalized = mhAsText_(email).toLowerCase();
  var properties = PropertiesService.getScriptProperties();
  var accountKey = mhAccessAccountPropertyKey_(normalized);
  var propertyAccount = mhParseJson_(properties.getProperty(accountKey), null);
  if (propertyAccount) {
    propertyAccount.enabled = false;
    propertyAccount.updated_at = mhNowIso_();
    properties.setProperty(accountKey, JSON.stringify(propertyAccount));
    return { ok: true, changed: true };
  }
  var accounts = mhParseJson_(mhSetting_(MH_PROPERTY_KEYS.ACCESS_ACCOUNTS_JSON, '{}'), {});
  if (!accounts[normalized]) return { ok: true, changed: false };
  if (typeof accounts[normalized] === 'string') {
    accounts[normalized] = { access_code_hash: accounts[normalized], enabled: false };
  } else {
    accounts[normalized].enabled = false;
  }
  properties.setProperty(MH_PROPERTY_KEYS.ACCESS_ACCOUNTS_JSON, JSON.stringify(accounts));
  return { ok: true, changed: true };
}

function mhSetupRotateAllSessions() {
  var properties = PropertiesService.getScriptProperties();
  var next = String(Number(mhSessionVersion_() || 0) + 1);
  properties.setProperty(MH_PROPERTY_KEYS.SESSION_VERSION, next);
  return { ok: true, sessionVersion: next };
}

function mhSetupSetWritesEnabled(enabled) {
  PropertiesService.getScriptProperties().setProperty(
    MH_PROPERTY_KEYS.ENABLE_WRITES,
    enabled === true ? 'true' : 'false'
  );
  return { ok: true, writesEnabled: enabled === true };
}

function mhSetupEnableWrites() {
  return mhSetupSetWritesEnabled(true);
}

function mhSetupDisableWrites() {
  return mhSetupSetWritesEnabled(false);
}

function mhSetupEnablePublicPreview() {
  var email = mhAsText_(mhSetting_(MH_PROPERTY_KEYS.PUBLIC_PREVIEW_EMAIL, '')).toLowerCase();
  if (!email) throw new Error('PUBLIC_PREVIEW_EMAIL을 먼저 설정하세요.');
  var actor = mhActorByEmail_(email);
  var projectIds = mhValidatedPreviewProjectIds_(actor);
  PropertiesService.getScriptProperties().setProperties({
    PUBLIC_PREVIEW_ENABLED: 'true',
    PUBLIC_PREVIEW_EMAIL: email,
    PUBLIC_PREVIEW_PROJECT_IDS: projectIds.join(',')
  });
  return { ok: true, enabled: true, email: email, projectIds: projectIds };
}

function mhSetupDisablePublicPreview() {
  PropertiesService.getScriptProperties().setProperty('PUBLIC_PREVIEW_ENABLED', 'false');
  return { ok: true, enabled: false };
}

function mhSetupDisableStagedAccount() {
  var properties = PropertiesService.getScriptProperties();
  var email = mhAsText_(properties.getProperty('SETUP_ACCOUNT_EMAIL')).toLowerCase();
  if (!email) throw new Error('SETUP_ACCOUNT_EMAIL을 Script Properties에 먼저 입력하세요.');
  var result = mhSetupDisableAccount(email);
  properties.deleteProperty('SETUP_ACCOUNT_EMAIL');
  properties.deleteProperty('SETUP_ACCOUNT_CODE');
  return result;
}

/**
 * Run once before enabling writes. Legacy INTERNAL rows become POCKET_ONLY,
 * and the writable sheets receive the API contract's visibility dropdown.
 */
function mhSetupMigrateVisibilityCodes() {
  var allowed = ['POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT'];
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(allowed, true)
    .setAllowInvalid(false)
    .build();
  var changed = 0;
  Object.keys(MH_ENTITY_SPECS).forEach(function (entityType) {
    var table = mhReadTable_(MH_ENTITY_SPECS[entityType].sheet);
    var columnIndex = table.headers.indexOf('visibility_code');
    if (columnIndex < 0) throw mhApiError_('schema_mismatch', 'missing_visibility_code', 500);
    table.rows.forEach(function (row) {
      if (mhAsText_(row.visibility_code).toUpperCase() !== 'INTERNAL') return;
      table.sheet.getRange(row.__rowNumber, columnIndex + 1).setValue('POCKET_ONLY');
      changed += 1;
    });
    var rowCount = Math.max(1, table.sheet.getMaxRows() - 1);
    table.sheet.getRange(2, columnIndex + 1, rowCount, 1).setDataValidation(rule);
  });
  SpreadsheetApp.flush();
  return { ok: true, migratedRows: changed, allowedValues: allowed };
}

/** Protect API-managed ledgers from ordinary Sheet edits. The deploying owner
 * remains able to administer them and the web app (execute-as owner) can write.
 */
function mhSetupProtectApiManagedSheets() {
  var names = [
    MH_SHEETS.TASKS, MH_SHEETS.CONTENTS, MH_SHEETS.APPROVALS,
    MH_SHEETS.FILES, MH_SHEETS.ACTIVITY, MH_SHEETS.PLANS, MH_SHEETS.PLAN_SECTIONS,
    MH_SHEETS.DAILY_MEETINGS
  ];
  names.forEach(function (name) {
    var sheet = mhSheet_(name);
    var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).filter(function (protection) {
      return protection.getDescription() === 'MH_API_MANAGED';
    });
    var protection = existing[0] || sheet.protect().setDescription('MH_API_MANAGED');
    protection.setWarningOnly(false);
    var editors = protection.getEditors();
    if (editors.length) protection.removeEditors(editors);
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  });
  return { ok: true, protectedSheets: names };
}

function mhSetupValidate() {
  var result = {
    backendVersion: MH_BACKEND_VERSION,
    sheetConfigured: !!mhSetting_(MH_PROPERTY_KEYS.SHEET_ID, ''),
    sessionSecretConfigured: mhAsText_(mhSetting_(MH_PROPERTY_KEYS.SESSION_SIGNING_SECRET, '')).length >= 32,
    accessCodePepperConfigured: mhAsText_(mhSetting_(MH_PROPERTY_KEYS.ACCESS_CODE_PEPPER, '')).length >= 32,
    accountsConfigured: Object.keys(mhAccessCodeDigests_()).length,
    writesEnabled: String(mhSetting_(MH_PROPERTY_KEYS.ENABLE_WRITES, 'false')).toLowerCase() === 'true',
    publicPreviewEnabled: String(mhSetting_(MH_PROPERTY_KEYS.PUBLIC_PREVIEW_ENABLED, 'false')).toLowerCase() === 'true',
    schemaValid: false
  };
  if (result.sheetConfigured) {
    mhSchemaCheck_();
    result.schemaValid = true;
  }
  return result;
}

function mhRandomSecret_() {
  var material = [
    Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(),
    String(Date.now()), Session.getTemporaryActiveUserKey()
  ].join('|');
  return mhHashToken_(material) + mhHashToken_(material + '|second');
}
