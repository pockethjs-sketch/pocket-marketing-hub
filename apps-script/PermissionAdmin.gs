var MH_ACCESS_PAGES = ['overview', 'plan', 'tasks', 'content', 'tracking', 'performance', 'files'];

function mhAssertPermissionManager_(actor) {
  if (!actor || (actor.role !== 'MASTER' && actor.role !== 'POCKET_MANAGER')) {
    throw mhApiError_('forbidden', 'permission_admin_requires_manager', 403);
  }
}

function mhNormalizeAllowedPages_(value) {
  var source = Array.isArray(value) ? value : mhParseJson_(mhAsText_(value), []);
  source = Array.isArray(source) ? source.map(function (item) {
    return mhAsText_(item).toLowerCase();
  }) : [];
  return MH_ACCESS_PAGES.filter(function (page) { return source.indexOf(page) >= 0; });
}

function mhAllowedPagesForMembership_(membership) {
  var raw = membership && membership.allowed_pages_json;
  if (!mhNonEmpty_(raw)) return MH_ACCESS_PAGES.slice();
  return mhNormalizeAllowedPages_(raw);
}

function mhPageForReadAction_(action, request) {
  if (action === 'project_overview') return 'overview';
  if (action === 'project_plan') return 'plan';
  if (action === 'tasks') return 'tasks';
  if (action === 'daily_meetings') return 'tasks';
  if (action === 'contents' || action === 'approvals') return 'content';
  if (action === 'performance_tracking') return 'tracking';
  if (action === 'performance') return 'performance';
  if (action === 'files' || action === 'activity') return 'files';
  return '';
}

function mhRequirePageAccess_(actor, permission, action, request) {
  if (!actor || actor.role !== 'CLIENT_VIEWER') return;
  var page = mhPageForReadAction_(action, request || {});
  if (!page) return;
  var allowed = permission && Array.isArray(permission.allowedPages)
    ? permission.allowedPages : MH_ACCESS_PAGES.slice();
  if (allowed.indexOf(page) < 0) throw mhApiError_('forbidden', 'page_access_denied', 403);
}

function mhEnsureMembershipAccessHeader_() {
  var sheet = mhSheet_(MH_SHEETS.MEMBERSHIPS);
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(mhAsText_);
  if (headers.indexOf('allowed_pages_json') >= 0) return false;
  sheet.getRange(1, lastColumn + 1).setValue('allowed_pages_json');
  SpreadsheetApp.flush();
  mhInvalidateTableCache_(MH_SHEETS.MEMBERSHIPS);
  mhUseFreshTables_();
  return true;
}

function mhReadPermissionAdmin_(actor) {
  mhAssertPermissionManager_(actor);
  mhEnsureMembershipAccessHeader_();
  var clients = mhActiveRows_(MH_SHEETS.CLIENTS).map(function (row) {
    return mhNormalizeRow_(mhPick_(row, ['client_id', 'display_name', 'status_code']));
  });
  var projects = mhActiveRows_(MH_SHEETS.PROJECTS).map(function (row) {
    return mhNormalizeRow_(mhPick_(row, ['project_id', 'client_id', 'project_name', 'status_code']));
  });
  var projectById = {};
  projects.forEach(function (row) { projectById[mhAsText_(row.project_id)] = row; });
  var memberships = mhActiveRows_(MH_SHEETS.MEMBERSHIPS);
  var users = mhActiveRows_(MH_SHEETS.USERS).filter(function (row) {
    return mhAsText_(row.role_code).toUpperCase() === 'CLIENT_VIEWER';
  }).map(function (row) {
    var access = memberships.filter(function (membership) {
      return mhAsText_(membership.user_id) === mhAsText_(row.user_id) &&
        mhAsText_(membership.status_code).toUpperCase() === 'ACTIVE';
    }).map(function (membership) {
      var project = projectById[mhAsText_(membership.project_id)] || {};
      return mhNormalizeRow_({
        membership_id: membership.membership_id,
        client_id: membership.client_id,
        project_id: membership.project_id,
        project_name: project.project_name,
        permission_code: membership.permission_code,
        allowed_pages: mhAllowedPagesForMembership_(membership),
        row_version: membership.row_version
      });
    });
    return mhNormalizeRow_({
      user_id: row.user_id,
      display_name: row.display_name,
      account: mhAsText_(row.email).replace(/@hub\.local$/i, ''),
      email: row.email,
      status_code: row.status_code,
      row_version: row.row_version,
      accesses: access
    });
  });
  return { clients: clients, projects: projects, accounts: users, pageOptions: MH_ACCESS_PAGES.slice() };
}

function mhPermissionAdminMutate_(request, actor) {
  mhAssertPermissionManager_(actor);
  var input = request.account || request.fields || {};
  var operation = mhAsText_(request.operation || input.operation || 'UPSERT').toUpperCase();
  if (operation !== 'UPSERT' && operation !== 'DISABLE') {
    throw mhApiError_('invalid_request', 'invalid_permission_operation', 400);
  }
  var account = mhAsText_(input.account);
  var email = mhNormalizeLoginAccount_(account);
  var displayName = mhAsText_(input.displayName || input.display_name);
  var projectId = mhAsText_(input.projectId || input.project_id);
  var membershipId = mhAsText_(input.membershipId || input.membership_id);
  var accessCode = String(input.accessCode || input.access_code || '');
  var allowedPages = mhNormalizeAllowedPages_(input.allowedPages || input.allowed_pages);
  if (!email || !displayName || !projectId || !allowedPages.length) {
    throw mhApiError_('validation_error', 'account_name_project_pages_required', 400);
  }
  if (accessCode && !mhValidAccessCode_(email, accessCode)) {
    throw mhApiError_('validation_error', 'invalid_access_code', 400);
  }
  var project = mhFindRecord_(MH_SHEETS.PROJECTS, 'project_id', projectId).row;
  if (!project || mhNonEmpty_(project.archived_at)) throw mhApiError_('not_found', 'project_not_found', 404);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) throw mhApiError_('lock_timeout', 'write_lock_timeout', 409);
  try {
    mhBeginMutationTables_();
    mhEnsureMembershipAccessHeader_();
    var now = mhNowIso_();
    var userTable = mhReadTable_(MH_SHEETS.USERS);
    var users = userTable.rows.filter(function (row) {
      return mhAsText_(row.email).toLowerCase() === email && !mhNonEmpty_(row.archived_at);
    });
    if (users.length > 1) throw mhApiError_('schema_mismatch', 'duplicate_user', 500);
    var existingUser = users[0] || null;
    var userId = existingUser ? mhAsText_(existingUser.user_id) : mhNewId_('USR');
    var enabled = operation !== 'DISABLE' && input.enabled !== false;
    var properties = PropertiesService.getScriptProperties();
    var propertyKey = mhAccessAccountPropertyKey_(email);
    var propertyAccount = mhParseJson_(properties.getProperty(propertyKey), {}) || {};
    if (!accessCode && !propertyAccount.access_code_hash && enabled) {
      throw mhApiError_('validation_error', 'access_code_required_for_new_account', 400);
    }
    var userRecord = {
      user_id: userId,
      display_name: displayName,
      email: email,
      organization_code: 'CLIENT',
      role_code: 'CLIENT_VIEWER',
      status_code: enabled ? 'ACTIVE' : 'DISABLED',
      created_at: existingUser && existingUser.created_at ? existingUser.created_at : now,
      updated_at: now,
      row_version: existingUser ? Number(existingUser.row_version || 0) + 1 : 1,
      archived_at: ''
    };
    if (existingUser) mhUpdateRecord_(userTable, existingUser.__rowNumber, userRecord);
    else mhAppendRecord_(MH_SHEETS.USERS, userRecord);

    mhUseFreshTables_();
    var membershipTable = mhReadTable_(MH_SHEETS.MEMBERSHIPS);
    var memberships = membershipTable.rows.filter(function (row) {
      if (mhNonEmpty_(row.archived_at) || mhAsText_(row.user_id) !== userId) return false;
      return membershipId ? mhAsText_(row.membership_id) === membershipId : mhAsText_(row.project_id) === projectId;
    });
    if (memberships.length > 1) throw mhApiError_('schema_mismatch', 'duplicate_active_membership', 500);
    var existingMembership = memberships[0] || null;
    var membershipRecord = {
      membership_id: existingMembership ? existingMembership.membership_id : mhNewId_('MEM'),
      user_id: userId,
      client_id: project.client_id,
      project_id: projectId,
      permission_code: 'READ_ONLY',
      status_code: enabled ? 'ACTIVE' : 'DISABLED',
      allowed_pages_json: JSON.stringify(allowedPages),
      created_at: existingMembership && existingMembership.created_at ? existingMembership.created_at : now,
      updated_at: now,
      row_version: existingMembership ? Number(existingMembership.row_version || 0) + 1 : 1,
      archived_at: ''
    };
    if (existingMembership) mhUpdateRecord_(membershipTable, existingMembership.__rowNumber, membershipRecord);
    else mhAppendRecord_(MH_SHEETS.MEMBERSHIPS, membershipRecord);

    if (accessCode) propertyAccount.access_code_hash = mhAccessCodeDigest_(email, accessCode);
    propertyAccount.email = email;
    propertyAccount.enabled = enabled;
    propertyAccount.updated_at = now;
    properties.setProperty(propertyKey, JSON.stringify(propertyAccount));
    MH_SETTINGS_MEMORY_CACHE = null;

    mhUseFreshTables_();
    return {
      saved: true,
      account: account,
      userId: userId,
      projectId: projectId,
      enabled: enabled,
      allowedPages: allowedPages
    };
  } finally {
    lock.releaseLock();
  }
}
