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

function mhSetupRegisterStagedAccount() {
  var properties = PropertiesService.getScriptProperties();
  var email = mhAsText_(properties.getProperty('SETUP_ACCOUNT_EMAIL')).toLowerCase();
  var accessCode = String(properties.getProperty('SETUP_ACCOUNT_CODE') || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^\S{24,128}$/.test(accessCode)) {
    throw new Error('SETUP_ACCOUNT_EMAIL과 24자 이상의 랜덤 SETUP_ACCOUNT_CODE를 임시 Script Properties에 먼저 입력하세요.');
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
    MH_SHEETS.FILES, MH_SHEETS.ACTIVITY, MH_SHEETS.PLANS, MH_SHEETS.PLAN_SECTIONS
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
