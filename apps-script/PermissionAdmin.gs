// 고객에게 실제 노출하는 화면의 단일 서버 허용 목록입니다.
// 화면을 추가하거나 숨길 때 frontend/src/accessPermissions.js의 customerSelectable과 함께 갱신하고
// permission-admin.test.cjs의 계약 검사를 통과시켜야 합니다.
var MH_ACCESS_PAGES = ['overview', 'plan', 'tasks', 'daily', 'performance', 'files'];

function mhAssertPermissionManager_(actor) {
  var master = actor && actor.role === 'MASTER';
  var pocketManager = actor && actor.role === 'POCKET_MANAGER' && actor.organization === 'POCKET';
  var nsManager = actor && actor.role === 'EXECUTOR_EDITOR' && actor.organization === 'NS';
  if (!master && !pocketManager && !nsManager) {
    throw mhApiError_('forbidden', 'permission_admin_requires_manager', 403);
  }
}

function mhPermissionManagerProjectIds_(actor) {
  mhAssertPermissionManager_(actor);
  if (actor.role === 'MASTER' || (actor.role === 'POCKET_MANAGER' && actor.organization === 'POCKET')) return null;
  var scope = {};
  (actor.memberships || []).forEach(function (membership) {
    if (MH_WRITE_PERMISSIONS[mhAsText_(membership.permission_code).toUpperCase()]) {
      scope[mhAsText_(membership.project_id)] = true;
    }
  });
  return scope;
}

function mhCanManagePermissionProject_(actor, projectId) {
  var scope = mhPermissionManagerProjectIds_(actor);
  return scope === null || scope[mhAsText_(projectId)] === true;
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
  if (action === 'daily_meetings') return 'daily';
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
  var projectScope = mhPermissionManagerProjectIds_(actor);
  mhEnsureMembershipAccessHeader_();
  var projects = mhActiveRows_(MH_SHEETS.PROJECTS).filter(function (row) {
    return projectScope === null || projectScope[mhAsText_(row.project_id)] === true;
  }).map(function (row) {
    return mhNormalizeRow_(mhPick_(row, ['project_id', 'client_id', 'project_name', 'status_code']));
  });
  var projectById = {};
  projects.forEach(function (row) { projectById[mhAsText_(row.project_id)] = row; });
  var clientScope = {};
  projects.forEach(function (row) { clientScope[mhAsText_(row.client_id)] = true; });
  var clients = mhActiveRows_(MH_SHEETS.CLIENTS).filter(function (row) {
    return clientScope[mhAsText_(row.client_id)] === true;
  }).map(function (row) {
    return mhNormalizeRow_(mhPick_(row, ['client_id', 'display_name', 'status_code']));
  });
  var memberships = mhActiveRows_(MH_SHEETS.MEMBERSHIPS);
  var users = mhActiveRows_(MH_SHEETS.USERS).filter(function (row) {
    return mhAsText_(row.role_code).toUpperCase() === 'CLIENT_VIEWER';
  }).map(function (row) {
    var access = memberships.filter(function (membership) {
      return mhAsText_(membership.user_id) === mhAsText_(row.user_id) &&
        mhAsText_(membership.status_code).toUpperCase() === 'ACTIVE' &&
        !!projectById[mhAsText_(membership.project_id)];
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
  }).filter(function (account) { return projectScope === null || account.accesses.length > 0; });
  return { clients: clients, projects: projects, accounts: users, pageOptions: MH_ACCESS_PAGES.slice() };
}

function mhPermissionAdminMutate_(request, actor) {
  mhAssertPermissionManager_(actor);
  var input = request.account || request.fields || {};
  var operation = mhAsText_(request.operation || input.operation || 'UPSERT').toUpperCase();
  if (operation !== 'UPSERT' && operation !== 'DISABLE' && operation !== 'REMOVE_ACCESS') {
    throw mhApiError_('invalid_request', 'invalid_permission_operation', 400);
  }
  var account = mhAsText_(input.account);
  var email = mhNormalizeLoginAccount_(account);
  var displayName = mhAsText_(input.displayName || input.display_name);
  var projectId = mhAsText_(input.projectId || input.project_id);
  var membershipId = mhAsText_(input.membershipId || input.membership_id);
  var accessCode = String(input.accessCode || input.access_code || '');
  var allowedPages = mhNormalizeAllowedPages_(input.allowedPages || input.allowed_pages);
  if (operation === 'REMOVE_ACCESS' && (!email || !projectId)) {
    throw mhApiError_('validation_error', 'account_project_required', 400);
  }
  if (operation !== 'REMOVE_ACCESS' && (!email || !displayName || !projectId || !allowedPages.length)) {
    throw mhApiError_('validation_error', 'account_name_project_pages_required', 400);
  }
  if (accessCode && !mhValidAccessCode_(email, accessCode)) {
    throw mhApiError_('validation_error', 'invalid_access_code', 400);
  }
  var project = mhFindRecord_(MH_SHEETS.PROJECTS, 'project_id', projectId).row;
  if (!project || mhNonEmpty_(project.archived_at)) throw mhApiError_('not_found', 'project_not_found', 404);
  if (!mhCanManagePermissionProject_(actor, projectId)) throw mhApiError_('forbidden', 'permission_project_forbidden', 403);
  if (operation === 'DISABLE' && actor.role === 'EXECUTOR_EDITOR') {
    throw mhApiError_('forbidden', 'permission_global_disable_requires_pocket', 403);
  }

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
    if (actor.role === 'EXECUTOR_EDITOR' && existingUser) {
      var actorProjectScope = mhPermissionManagerProjectIds_(actor);
      var scopedMemberships = mhReadTable_(MH_SHEETS.MEMBERSHIPS).rows.filter(function (row) {
        return !mhNonEmpty_(row.archived_at) &&
          mhAsText_(row.status_code).toUpperCase() === 'ACTIVE' &&
          mhAsText_(row.user_id) === mhAsText_(existingUser.user_id) &&
          actorProjectScope[mhAsText_(row.project_id)] === true;
      });
      if (!scopedMemberships.length) throw mhApiError_('forbidden', 'account_outside_manager_scope', 403);
    }
    if (operation === 'REMOVE_ACCESS') {
      if (!existingUser) throw mhApiError_('not_found', 'account_not_found', 404);
      mhUseFreshTables_();
      var removalTable = mhReadTable_(MH_SHEETS.MEMBERSHIPS);
      var removable = removalTable.rows.filter(function (row) {
        if (mhNonEmpty_(row.archived_at) || mhAsText_(row.user_id) !== mhAsText_(existingUser.user_id)) return false;
        if (mhAsText_(row.project_id) !== projectId) return false;
        return membershipId ? mhAsText_(row.membership_id) === membershipId : true;
      });
      if (removable.length !== 1) throw mhApiError_('not_found', 'membership_not_found', 404);
      var removed = {};
      Object.keys(removable[0]).forEach(function (key) {
        if (key.indexOf('__') !== 0) removed[key] = removable[0][key];
      });
      removed.status_code = 'DISABLED';
      removed.updated_at = now;
      removed.row_version = Number(removed.row_version || 0) + 1;
      removed.archived_at = now;
      mhUpdateRecord_(removalTable, removable[0].__rowNumber, removed);
      mhInvalidateClientReadCache_(projectId);
      return {
        saved: true, removed: true, account: account,
        userId: existingUser.user_id, projectId: projectId,
        membershipId: removed.membership_id
      };
    }
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
