/**
 * Authentication for a static GitHub Pages client.
 *
 * The browser sends JSON through a text/plain POST, so the request remains a
 * CORS simple request and does not require a custom Authorization header.
 * Access-code plaintext is never stored. Script Properties contain only a
 * per-user digest plus server-only HMAC secrets.
 */

function mhLogin_(request) {
  var email = mhNormalizeLoginAccount_(request.account || request.email);
  var accessCode = String(request.accessCode || request.access_code || '');
  if (!email || !mhValidAccessCode_(email, accessCode)) {
    mhRecordLoginFailure_(email);
    throw mhApiError_('unauthorized', 'invalid_credentials', 401);
  }
  mhAssertLoginRateLimit_(email);
  mhAssertAllowedDomain_(email);
  var expected = mhAccessCodeDigests_()[email];
  var actual = mhAccessCodeDigest_(email, accessCode);
  if (!expected || !mhConstantTimeEquals_(String(expected), actual)) {
    mhRecordLoginFailure_(email);
    throw mhApiError_('unauthorized', 'invalid_credentials', 401);
  }
  var actor = mhActorByEmail_(email);
  mhClearLoginFailures_(email);
  return {
    token: mhIssueSessionToken_(actor),
    expiresIn: mhSessionTtlSeconds_(),
    user: {
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role,
      organization: actor.organization
    }
  };
}

/**
 * Internal operators sign in with a short account id. It is normalized to the
 * existing server-only hub.local identity so no email address or credential
 * needs to be embedded in the static frontend.
 */
function mhNormalizeLoginAccount_(value) {
  var account = mhAsText_(value).toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)) return account;
  if (/^[a-z0-9][a-z0-9._-]{1,63}$/.test(account)) return account + '@hub.local';
  return '';
}

function mhValidAccessCode_(email, accessCode) {
  var minimum = /@hub\.local$/.test(mhAsText_(email).toLowerCase()) ? 8 : 24;
  return new RegExp('^\\S{' + minimum + ',128}$').test(String(accessCode || ''));
}

function mhPreviewSession_() {
  return mhCreatePreviewContext_().session;
}

function mhNormalizePreviewActorIdentity_(actor) {
  if (!mhNonEmpty_(actor.userId)) {
    actor.userId = 'PUBLIC-PREVIEW-' + mhHashToken_(actor.email).slice(0, 24);
  }
  return actor;
}

/**
 * Resolves and validates a public-preview actor once per request.
 * The validated access objects are kept on the in-memory actor so a combined
 * preview/bootstrap request does not read or re-check the same permissions.
 */
function mhCreatePreviewContext_() {
  var enabled = String(mhSetting_(MH_PROPERTY_KEYS.PUBLIC_PREVIEW_ENABLED, 'false')).toLowerCase() === 'true';
  if (!enabled) throw mhApiError_('forbidden', 'public_preview_disabled', 403);

  var email = mhAsText_(mhSetting_(MH_PROPERTY_KEYS.PUBLIC_PREVIEW_EMAIL, '')).toLowerCase();
  if (!email) throw mhApiError_('configuration_error', 'public_preview_email_missing', 500);
  var actor = mhNormalizePreviewActorIdentity_(mhActorByEmail_(email));
  var accesses = mhValidatedPreviewProjectAccesses_(actor);
  var previewProjectIds = accesses.map(function (access) {
    return mhAsText_(access.project.project_id);
  });
  actor.previewProjectIds = previewProjectIds;
  actor.validatedProjectAccesses = accesses;

  var session = {
    token: mhIssueSessionToken_(actor, 3600, {
      sessionType: 'PUBLIC_PREVIEW',
      previewProjectIds: previewProjectIds
    }),
    expiresIn: Math.min(mhSessionTtlSeconds_(), 3600),
    user: {
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role,
      organization: actor.organization
    }
  };
  return { actor: actor, session: session };
}

function mhConfiguredPreviewProjectIds_() {
  var raw = mhAsText_(mhSetting_(MH_PROPERTY_KEYS.PUBLIC_PREVIEW_PROJECT_IDS, ''));
  var parsed = mhParseJson_(raw, null);
  var values = Array.isArray(parsed) ? parsed : raw.split(',');
  var unique = {};
  values.forEach(function (value) {
    var projectId = mhAsText_(value);
    if (projectId) unique[projectId] = true;
  });
  var projectIds = Object.keys(unique).sort();
  if (!projectIds.length) {
    throw mhApiError_('configuration_error', 'public_preview_project_ids_missing', 500);
  }
  return projectIds;
}

function mhValidatedPreviewProjectIds_(actor) {
  return mhValidatedPreviewProjectAccesses_(actor).map(function (access) {
    return mhAsText_(access.project.project_id);
  });
}

function mhValidatedPreviewProjectAccesses_(actor) {
  if (actor.role !== 'CLIENT_VIEWER') {
    throw mhApiError_('configuration_error', 'public_preview_must_be_client_viewer', 500);
  }
  if (!mhAccessCodeDigests_()[actor.email]) {
    throw mhApiError_('configuration_error', 'public_preview_account_disabled', 500);
  }
  var projectIds = mhConfiguredPreviewProjectIds_();
  return projectIds.map(function (projectId) {
    var project = mhFindRecord_(MH_SHEETS.PROJECTS, 'project_id', projectId).row;
    if (!project || mhNonEmpty_(project.archived_at) || !mhAsBoolean_(project.client_view_enabled)) {
      throw mhApiError_('configuration_error', 'public_preview_project_unavailable', 500);
    }
    var permission = mhPermissionForProject_(actor, project);
    // A public-preview token is always represented by CLIENT_VIEWER, and the
    // configured project IDs are an explicit server-side allowlist. The write
    // path rejects CLIENT_VIEWER regardless of a membership row, so preview
    // availability must not depend on an editable membership record. Always
    // expose a synthetic read-only permission and never advertise EDIT.
    return {
      project: project,
      permission: {
        permissionCode: 'READ_ONLY',
        source: permission ? permission.source : 'PUBLIC_PREVIEW'
      }
    };
  });
}

function mhSameTextSet_(left, right) {
  var a = (left || []).map(mhAsText_).filter(Boolean).sort();
  var b = (right || []).map(mhAsText_).filter(Boolean).sort();
  return a.length === b.length && a.every(function (value, index) { return value === b[index]; });
}

function mhResolveActor_(request) {
  var sessionToken = request && request.auth
    ? mhAsText_(request.auth.sessionToken || request.auth.session_token)
    : mhAsText_(request.sessionToken || request.session_token);
  if (!sessionToken) throw mhApiError_('unauthorized', 'missing_session', 401);
  var claims = mhVerifySessionToken_(sessionToken);
  var actor = mhActorByEmail_(mhAsText_(claims.email).toLowerCase());
  if (mhAsText_(claims.sessionType) === 'PUBLIC_PREVIEW') {
    actor = mhNormalizePreviewActorIdentity_(actor);
  }
  if (!mhAccessCodeDigests_()[actor.email]) {
    throw mhApiError_('unauthorized', 'account_disabled', 401);
  }
  if (actor.userId !== mhAsText_(claims.userId) ||
      Number(actor.userRowVersion || 0) !== Number(claims.userRowVersion || 0)) {
    throw mhApiError_('unauthorized', 'session_user_changed', 401);
  }
  if (mhAsText_(claims.sessionType) === 'PUBLIC_PREVIEW') {
    var enabled = String(mhSetting_(MH_PROPERTY_KEYS.PUBLIC_PREVIEW_ENABLED, 'false')).toLowerCase() === 'true';
    if (!enabled) throw mhApiError_('unauthorized', 'public_preview_disabled', 401);
    var currentAccesses = mhValidatedPreviewProjectAccesses_(actor);
    var currentProjectIds = currentAccesses.map(function (access) {
      return mhAsText_(access.project.project_id);
    });
    if (!mhSameTextSet_(claims.previewProjectIds, currentProjectIds)) {
      throw mhApiError_('unauthorized', 'public_preview_scope_changed', 401);
    }
    actor.previewProjectIds = currentProjectIds;
    actor.validatedProjectAccesses = currentAccesses;
  }
  return actor;
}

function mhActorByEmail_(email) {
  var matches = mhActiveRows_(MH_SHEETS.USERS).filter(function (row) {
    return mhAsText_(row.email).toLowerCase() === email &&
      mhAsText_(row.status_code).toUpperCase() === 'ACTIVE';
  });
  if (matches.length !== 1) {
    throw mhApiError_('unauthorized', matches.length ? 'duplicate_user' : 'user_not_registered', 401);
  }
  var user = matches[0];
  var role = mhAsText_(user.role_code).toUpperCase();
  if (!MH_INTERACTIVE_ROLES[role]) throw mhApiError_('unauthorized', 'invalid_user_role', 401);
  if (!mhNonEmpty_(user.user_id)) throw mhApiError_('unauthorized', 'user_id_not_registered', 401);
  var actor = {
    userId: mhAsText_(user.user_id),
    userRowVersion: Number(user.row_version || 0),
    displayName: mhAsText_(user.display_name),
    email: email,
    organization: mhAsText_(user.organization_code).toUpperCase(),
    role: role,
    memberships: []
  };
  actor.memberships = mhActiveRows_(MH_SHEETS.MEMBERSHIPS).filter(function (row) {
    return mhAsText_(row.user_id) === actor.userId &&
      mhAsText_(row.status_code).toUpperCase() === 'ACTIVE' &&
      MH_READ_PERMISSIONS[mhAsText_(row.permission_code).toUpperCase()];
  });
  return actor;
}

function mhAccessCodeDigests_() {
  var raw = mhSetting_(MH_PROPERTY_KEYS.ACCESS_ACCOUNTS_JSON, '{}');
  var parsed = mhParseJson_(raw, null);
  if (!parsed || typeof parsed !== 'object') {
    throw mhApiError_('configuration_error', 'invalid_access_code_hashes', 500);
  }
  var normalized = {};
  Object.keys(parsed).forEach(function (email) {
    var account = parsed[email];
    if (typeof account === 'string') {
      normalized[mhAsText_(email).toLowerCase()] = mhAsText_(account);
      return;
    }
    if (account && account.enabled !== false) {
      normalized[mhAsText_(email).toLowerCase()] = mhAsText_(account.access_code_hash || account.accessCodeHash);
    }
  });
  var properties = mhSettings_();
  Object.keys(properties).forEach(function (key) {
    if (key.indexOf(MH_PROPERTY_KEYS.ACCESS_ACCOUNT_PREFIX) !== 0) return;
    var account = mhParseJson_(properties[key], null);
    if (!account || !account.email) return;
    var email = mhAsText_(account.email).toLowerCase();
    if (account.enabled === false) {
      delete normalized[email];
      return;
    }
    normalized[email] = mhAsText_(account.access_code_hash || account.accessCodeHash);
  });
  return normalized;
}

function mhAccessAccountPropertyKey_(email) {
  return MH_PROPERTY_KEYS.ACCESS_ACCOUNT_PREFIX + mhHashToken_(mhAsText_(email).toLowerCase()).slice(0, 36);
}

function mhAccessCodeDigest_(email, accessCode) {
  var secret = mhSetting_(MH_PROPERTY_KEYS.ACCESS_CODE_PEPPER, '');
  if (!secret || secret.length < 32) throw mhApiError_('configuration_error', 'missing_access_code_pepper', 500);
  var signature = Utilities.computeHmacSha256Signature(
    'access-code-v1\n' + mhAsText_(email).toLowerCase() + '\n' + String(accessCode),
    secret,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '');
}

function mhIssueSessionToken_(actor, ttlOverrideSeconds, tokenOptions) {
  var now = Math.floor(Date.now() / 1000);
  var ttl = Number(ttlOverrideSeconds || mhSessionTtlSeconds_());
  if (!isFinite(ttl) || ttl < 900) ttl = mhSessionTtlSeconds_();
  ttl = Math.min(Math.floor(ttl), MH_SESSION_TTL_MAX_SECONDS);
  var payload = {
    version: 1,
    sessionVersion: mhSessionVersion_(),
    userId: actor.userId,
    userRowVersion: actor.userRowVersion,
    email: actor.email,
    issuedAt: now,
    expiresAt: now + ttl,
    nonce: Utilities.getUuid()
  };
  if (tokenOptions && tokenOptions.sessionType) {
    payload.sessionType = mhAsText_(tokenOptions.sessionType);
    payload.previewProjectIds = (tokenOptions.previewProjectIds || []).map(mhAsText_).filter(Boolean).sort();
  }
  var encoded = mhBase64UrlEncodeText_(JSON.stringify(payload));
  return encoded + '.' + mhSignSessionPayload_(encoded);
}

function mhVerifySessionToken_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw mhApiError_('unauthorized', 'invalid_session', 401);
  var expected = mhSignSessionPayload_(parts[0]);
  if (!mhConstantTimeEquals_(expected, parts[1])) throw mhApiError_('unauthorized', 'invalid_session_signature', 401);
  var payload;
  try {
    payload = JSON.parse(mhBase64UrlDecodeText_(parts[0]));
  } catch (error) {
    throw mhApiError_('unauthorized', 'invalid_session_payload', 401);
  }
  var now = Math.floor(Date.now() / 1000);
  if (Number(payload.version) !== 1 ||
      mhAsText_(payload.sessionVersion) !== mhSessionVersion_() ||
      !mhNonEmpty_(payload.email) || !mhNonEmpty_(payload.userId) ||
      Number(payload.issuedAt || 0) > now + 60 ||
      Number(payload.expiresAt || 0) <= now ||
      Number(payload.expiresAt || 0) - Number(payload.issuedAt || 0) > MH_SESSION_TTL_MAX_SECONDS) {
    throw mhApiError_('unauthorized', 'expired_or_invalid_session', 401);
  }
  return payload;
}

function mhSignSessionPayload_(encodedPayload) {
  var secret = mhSetting_(MH_PROPERTY_KEYS.SESSION_SIGNING_SECRET, '');
  if (!secret || secret.length < 32) throw mhApiError_('configuration_error', 'missing_session_secret', 500);
  var signature = Utilities.computeHmacSha256Signature(
    encodedPayload,
    secret,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '');
}

function mhBase64UrlEncodeText_(text) {
  return Utilities.base64EncodeWebSafe(String(text), Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function mhBase64UrlDecodeText_(encoded) {
  var bytes = Utilities.base64DecodeWebSafe(String(encoded));
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}

function mhConstantTimeEquals_(left, right) {
  var a = String(left || '');
  var b = String(right || '');
  var mismatch = a.length ^ b.length;
  var length = Math.max(a.length, b.length);
  for (var i = 0; i < length; i += 1) {
    mismatch |= (a.charCodeAt(i % Math.max(1, a.length)) || 0) ^
      (b.charCodeAt(i % Math.max(1, b.length)) || 0);
  }
  return mismatch === 0;
}

function mhSessionTtlSeconds_() {
  var configured = Number(mhSetting_(MH_PROPERTY_KEYS.SESSION_TTL_SECONDS, ''));
  if (!isFinite(configured) || configured < 900) configured = MH_SESSION_TTL_DEFAULT_SECONDS;
  return Math.min(Math.floor(configured), MH_SESSION_TTL_MAX_SECONDS);
}

function mhSessionVersion_() {
  return mhAsText_(mhSetting_(MH_PROPERTY_KEYS.SESSION_VERSION, '1'));
}

function mhAssertAllowedDomain_(email) {
  var raw = mhSetting_(MH_PROPERTY_KEYS.ALLOWED_EMAIL_DOMAINS, '');
  var allowed = raw.split(',').map(function (item) {
    return mhAsText_(item).toLowerCase().replace(/^@/, '');
  }).filter(Boolean);
  if (!allowed.length) return;
  var domain = mhAsText_(email).toLowerCase().split('@')[1] || '';
  if (allowed.indexOf(domain) < 0) throw mhApiError_('unauthorized', 'domain_not_allowed', 401);
}

function mhLoginRateKey_(email) {
  return 'login_fail_' + mhHashToken_(mhAsText_(email).toLowerCase()).slice(0, 40);
}

function mhAssertLoginRateLimit_(email) {
  var count = Number(CacheService.getScriptCache().get(mhLoginRateKey_(email)) || 0);
  var guard = mhParseJson_(PropertiesService.getScriptProperties().getProperty(mhLoginGuardKey_(email)), {});
  if (count >= 8 || Number(guard.locked_until || 0) > Date.now()) {
    throw mhApiError_('unauthorized', 'login_temporarily_blocked', 401);
  }
}

function mhRecordLoginFailure_(email) {
  if (!email) return;
  var cache = CacheService.getScriptCache();
  var key = mhLoginRateKey_(email);
  var count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 900);
  // Persist lockout only for configured accounts; unknown emails must not be
  // able to fill Script Properties.
  if (!mhAccessCodeDigests_()[mhAsText_(email).toLowerCase()]) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var properties = PropertiesService.getScriptProperties();
    var guardKey = mhLoginGuardKey_(email);
    var guard = mhParseJson_(properties.getProperty(guardKey), {});
    guard.failures = Number(guard.failures || 0) + 1;
    if (guard.failures >= 8) guard.locked_until = Date.now() + 900000;
    properties.setProperty(guardKey, JSON.stringify(guard));
  } finally {
    lock.releaseLock();
  }
}

function mhClearLoginFailures_(email) {
  CacheService.getScriptCache().remove(mhLoginRateKey_(email));
  PropertiesService.getScriptProperties().deleteProperty(mhLoginGuardKey_(email));
}

function mhLoginGuardKey_(email) {
  return 'LOGIN_GUARD_' + mhHashToken_(mhAsText_(email).toLowerCase()).slice(0, 36);
}

function mhPermissionForProject_(actor, project) {
  var projectId = mhAsText_(project.project_id);
  var clientId = mhAsText_(project.client_id);
  var exact = [];
  var clientWide = [];
  actor.memberships.forEach(function (membership) {
    if (mhAsText_(membership.client_id) !== clientId) return;
    if (mhAsText_(membership.project_id) === projectId) exact.push(membership);
    if (!mhAsText_(membership.project_id)) clientWide.push(membership);
  });
  if (exact.length > 1 || clientWide.length > 1) {
    throw mhApiError_('schema_mismatch', 'duplicate_active_membership', 500);
  }
  var selected = exact[0] || clientWide[0];
  if (!selected) return null;
  return {
    permissionCode: mhAsText_(selected.permission_code).toUpperCase(),
    source: exact.length ? 'PROJECT' : 'CLIENT',
    membershipId: mhAsText_(selected.membership_id),
    allowedPages: mhAllowedPagesForMembership_(selected)
  };
}

function mhRequireProjectAccess_(actor, projectId, requireWrite) {
  if (actor.previewProjectIds && actor.previewProjectIds.indexOf(mhAsText_(projectId)) < 0) {
    throw mhApiError_('forbidden', 'preview_project_access_denied', 403);
  }
  var validatedAccess = null;
  if (actor.validatedProjectAccesses) {
    validatedAccess = actor.validatedProjectAccesses.filter(function (access) {
      return mhAsText_(access.project.project_id) === mhAsText_(projectId);
    })[0] || null;
  }
  var found = validatedAccess
    ? validatedAccess.project
    : mhFindRecord_(MH_SHEETS.PROJECTS, 'project_id', projectId).row;
  if (!found || mhNonEmpty_(found.archived_at)) throw mhApiError_('not_found', 'project_not_found', 404);
  if (actor.role === 'CLIENT_VIEWER' && !mhAsBoolean_(found.client_view_enabled)) {
    throw mhApiError_('forbidden', 'client_view_disabled', 403);
  }
  var permission = validatedAccess
    ? validatedAccess.permission
    : mhPermissionForProject_(actor, found);
  if (!permission || !MH_READ_PERMISSIONS[permission.permissionCode]) {
    throw mhApiError_('forbidden', 'project_access_denied', 403);
  }
  if (requireWrite) {
    var writesEnabled = String(
      mhSetting_(MH_PROPERTY_KEYS.ENABLE_WRITES, 'false')
    ).toLowerCase() === 'true';
    if (!writesEnabled) throw mhApiError_('forbidden', 'writes_disabled', 403);
    var previewTaskWrite = actor.role === 'CLIENT_VIEWER' && actor.allowPreviewTaskWrite === true &&
      MH_PUBLIC_TASK_WRITES_ENABLED;
    if ((!previewTaskWrite && actor.role === 'CLIENT_VIEWER') ||
        (!previewTaskWrite && !MH_WRITE_PERMISSIONS[permission.permissionCode])) {
      throw mhApiError_('forbidden', 'write_access_denied', 403);
    }
  }
  return { project: found, permission: permission };
}

function mhAccessibleProjects_(actor) {
  return mhAccessibleProjectAccesses_(actor).map(function (access) {
    return access.project;
  });
}

function mhAccessibleProjectAccesses_(actor) {
  if (actor.validatedProjectAccesses) return actor.validatedProjectAccesses.slice();
  var accesses = [];
  mhActiveRows_(MH_SHEETS.PROJECTS).forEach(function (project) {
    if (actor.previewProjectIds && actor.previewProjectIds.indexOf(mhAsText_(project.project_id)) < 0) return false;
    if (actor.role === 'CLIENT_VIEWER' && !mhAsBoolean_(project.client_view_enabled)) return false;
    var permission = mhPermissionForProject_(actor, project);
    if (permission && MH_READ_PERMISSIONS[permission.permissionCode]) {
      accesses.push({ project: project, permission: permission });
    }
  });
  return accesses;
}

function mhScopeForProject_(actor, project) {
  return {
    clientId: mhAsText_(project.client_id),
    projectId: mhAsText_(project.project_id),
    visibility: actor.role === 'CLIENT_VIEWER'
      ? 'CLIENT'
      : actor.role === 'EXECUTOR_EDITOR' ? 'PROJECT_TEAM' : 'POCKET_ONLY'
  };
}
