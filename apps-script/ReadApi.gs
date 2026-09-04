function mhHandleRead_(action, request, actor) {
  if (action === 'bootstrap') return mhReadBootstrap_(request, actor);
  var projectId = mhAsText_(request.projectId || request.project_id);
  if (!projectId) throw mhApiError_('invalid_request', 'project_id_required', 400);
  var access = mhRequireProjectAccess_(actor, projectId, false);
  if (action !== 'project_snapshot') mhRequirePageAccess_(actor, access.permission, action, request);
  var scope = mhScopeForProject_(actor, access.project);
  var cached = mhCachedClientRead_(action, request, actor, projectId);
  if (cached.hit) return { scope: scope, data: cached.data };
  var data = null;
  if (action === 'project_overview') data = mhReadOverview_(request, actor, access.project);
  else if (action === 'project_plan') data = mhReadProjectPlan_(request, actor, access.project);
  else if (action === 'project_snapshot') data = mhReadProjectSnapshot_(request, actor, access.project);
  else if (action === 'tasks') data = mhReadTasks_(request, actor, access.project);
  else if (action === 'contents') data = mhReadContents_(request, actor, access.project);
  else if (action === 'approvals') data = mhReadApprovals_(request, actor, access.project);
  else if (action === 'performance_tracking') data = mhReadPerformanceTracking_(request, actor, access.project);
  else if (action === 'performance') data = mhReadPerformance_(request, actor, access.project);
  else if (action === 'files') data = mhReadFiles_(request, actor, access.project);
  else if (action === 'activity') data = mhReadActivity_(request, actor, access.project);
  else if (action === 'daily_meetings') data = mhReadDailyMeetings_(request, actor, access.project);
  else throw mhApiError_('invalid_request', 'unsupported_read_action', 400);
  mhRememberClientRead_(action, request, actor, projectId, data);
  return { scope: scope, data: data };
}

var MH_CLIENT_READ_CACHE_TTL_SECONDS = 120;
var MH_CLIENT_READ_CACHE_MAX_BYTES = 90000;

function mhClientReadCacheEpochKey_(projectId) {
  return 'CLIENT_READ_EPOCH_' + mhHashToken_(mhAsText_(projectId)).slice(0, 40);
}

function mhClientReadCacheEpoch_(projectId) {
  var key = mhClientReadCacheEpochKey_(projectId);
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) return cached;
    var persisted = PropertiesService.getScriptProperties().getProperty(key) || '0';
    cache.put(key, persisted, 21600);
    return persisted;
  } catch (ignored) {
    return '0';
  }
}

function mhInvalidateClientReadCache_(projectId) {
  var key = mhClientReadCacheEpochKey_(projectId);
  var epoch = String(Date.now());
  try { PropertiesService.getScriptProperties().setProperty(key, epoch); } catch (ignored) {}
  try { CacheService.getScriptCache().put(key, epoch, 21600); } catch (ignoredAgain) {}
  return epoch;
}

function mhClientReadCacheTtl_(action) {
  return action === 'project_plan' || action === 'project_snapshot'
    ? 300
    : MH_CLIENT_READ_CACHE_TTL_SECONDS;
}

function mhClientReadCacheKey_(action, request, actor, projectId) {
  return 'mh_client_read_v1_' + mhHashToken_(mhStableJson_({
    backend: MH_BACKEND_VERSION,
    action: action,
    actor: mhAsText_(actor.userId),
    role: mhAsText_(actor.role),
    projectId: mhAsText_(projectId),
    epoch: mhClientReadCacheEpoch_(projectId),
    filters: request.filters || null,
    startDate: request.startDate || request.start_date || null,
    endDate: request.endDate || request.end_date || null,
    planType: request.planType || request.plan_type || null,
    entityType: request.entityType || request.entity_type || null,
    query: request.query || null,
    limit: request.limit || null,
    cursor: request.cursor || null
  })).slice(0, 48);
}

function mhCachedClientRead_(action, request, actor, projectId) {
  try {
    var raw = CacheService.getScriptCache().get(
      mhClientReadCacheKey_(action, request, actor, projectId)
    );
    if (!raw) return { hit: false, data: null };
    var json = raw;
    if (raw.indexOf('z:') === 0) {
      json = Utilities.ungzip(
        Utilities.newBlob(Utilities.base64Decode(raw.slice(2)))
      ).getDataAsString('UTF-8');
    } else if (raw.indexOf('j:') === 0) {
      json = raw.slice(2);
    }
    var data = mhParseJson_(json, null);
    return data === null ? { hit: false, data: null } : { hit: true, data: data };
  } catch (ignored) {
    return { hit: false, data: null };
  }
}

function mhRememberClientRead_(action, request, actor, projectId, data) {
  try {
    var serialized = JSON.stringify(data);
    var payload = 'j:' + serialized;
    if (Utilities.newBlob(payload).getBytes().length > MH_CLIENT_READ_CACHE_MAX_BYTES) {
      payload = 'z:' + Utilities.base64Encode(
        Utilities.gzip(Utilities.newBlob(serialized, 'application/json')).getBytes()
      );
    }
    if (Utilities.newBlob(payload).getBytes().length > MH_CLIENT_READ_CACHE_MAX_BYTES) return;
    CacheService.getScriptCache().put(
      mhClientReadCacheKey_(action, request, actor, projectId),
      payload,
      mhClientReadCacheTtl_(action)
    );
  } catch (ignored) {}
}

function mhReadProjectPlan_(request, actor, project) {
  var projectId = mhAsText_(project.project_id);
  var clientId = mhAsText_(project.client_id);
  var planType = mhNormalizeProjectPlanType_(request.planType || request.plan_type);
  var publicInternalPlan = planType === 'INTERNAL' &&
    actor.role === 'CLIENT_VIEWER' && MH_PUBLIC_INTERNAL_PLAN_ENABLED;
  if (planType === 'INTERNAL' && actor.role === 'CLIENT_VIEWER' && !publicInternalPlan) {
    throw mhApiError_('forbidden', 'internal_plan_requires_project_team', 403);
  }
  var planReader = actor;
  if (publicInternalPlan) {
    planReader = {};
    Object.keys(actor || {}).forEach(function (key) { planReader[key] = actor[key]; });
    planReader.role = 'POCKET_EDITOR';
  }
  var sourceCode = planType === 'INTERNAL'
    ? 'INTERNAL_EXECUTION_PLAN'
    : 'CLIENT_APPROVED_PLAN';
  var plans = mhProjectRows_(MH_SHEETS.PLANS, clientId, projectId, planReader).filter(function (row) {
    return mhAsText_(row.status_code).toUpperCase() === 'PUBLISHED' &&
      mhAsText_(row.source_code).toUpperCase() === sourceCode;
  }).sort(function (a, b) {
    var left = mhComparableDate_(a.effective_at);
    var right = mhComparableDate_(b.effective_at);
    if (left !== right) return left < right ? 1 : -1;
    return Number(b.row_version || 0) - Number(a.row_version || 0);
  });
  if (!plans.length) return {
    project: mhPlanProjectProjection_(project),
    planType: planType,
    plan: null,
    sections: []
  };

  var plan = plans[0];
  var sections = mhProjectRows_(MH_SHEETS.PLAN_SECTIONS, clientId, projectId, planReader).filter(function (row) {
    return mhAsText_(row.plan_id) === mhAsText_(plan.plan_id) &&
      mhAsText_(row.status_code).toUpperCase() === 'PUBLISHED';
  }).sort(function (a, b) {
    return Number(a.sort_order || 0) - Number(b.sort_order || 0);
  }).map(function (row) {
    return mhNormalizeRow_({
      plan_section_id: row.plan_section_id,
      section_code: row.section_code,
      nav_label: row.nav_label,
      title: row.title,
      body_html: mhSafeClientPlanHtml_(row.body_html),
      sort_order: row.sort_order,
      updated_at: row.updated_at
    });
  });

  var projectedPlan = mhNormalizeRow_(mhPick_(plan, [
    'plan_id', 'version_label', 'title', 'summary', 'build_weeks',
    'operation_months', 'monthly_output_target', 'initial_output_target',
    'primary_goal', 'status_code', 'effective_at', 'updated_at'
  ]));
  projectedPlan.plan_type_code = planType;
  return {
    project: mhPlanProjectProjection_(project),
    planType: planType,
    plan: projectedPlan,
    sections: sections
  };
}

function mhNormalizeProjectPlanType_(value) {
  var normalized = mhAsText_(value || 'CLIENT_SHARE').toUpperCase();
  if (normalized === 'CLIENT') normalized = 'CLIENT_SHARE';
  if (normalized !== 'CLIENT_SHARE' && normalized !== 'INTERNAL') {
    throw mhApiError_('invalid_request', 'invalid_plan_type', 400);
  }
  return normalized;
}

function mhPlanRequest_(request, planType) {
  var result = {};
  Object.keys(request || {}).forEach(function (key) { result[key] = request[key]; });
  result.planType = planType;
  delete result.plan_type;
  return result;
}

/**
 * Returns the read-only project workspace in one Apps Script execution.
 * Existing readers remain the source of truth for row visibility, field
 * projection, date limits, pagination and role-specific redaction. The shared
 * execution lets their full-table reads reuse mhReadTable_'s memory cache.
 */
function mhReadProjectSnapshot_(request, actor, project) {
  var permission = mhPermissionForProject_(actor, project);
  var allowed = actor.role === 'CLIENT_VIEWER' && permission
    ? permission.allowedPages : MH_ACCESS_PAGES.slice();
  var result = {};
  if (allowed.indexOf('plan') >= 0) {
    result.plan = mhReadProjectPlan_(mhPlanRequest_(request, 'CLIENT_SHARE'), actor, project);
    if (actor.role !== 'CLIENT_VIEWER') result.internalPlan = mhReadProjectPlan_(mhPlanRequest_(request, 'INTERNAL'), actor, project);
  }
  if (allowed.indexOf('tasks') >= 0) result.tasks = mhReadTasks_(request, actor, project);
  if (allowed.indexOf('content') >= 0) result.contents = mhReadContents_(request, actor, project);
  // 성과 추적은 90일 일별 원장을 별도로 읽는다. 모든 화면의 선조회인
  // project_snapshot에 포함하면 스냅샷 전체가 느려지므로 탭 진입 시만 조회한다.
  if (allowed.indexOf('performance') >= 0) result.performance = mhReadPerformance_(request, actor, project);
  if (allowed.indexOf('files') >= 0) {
    result.files = mhReadFiles_(request, actor, project);
    result.activity = mhReadActivity_(request, actor, project);
  }
  return result;
}

function mhPlanProjectProjection_(project) {
  return mhNormalizeRow_(mhPick_(project, [
    'project_id', 'client_id', 'project_name', 'phase_code', 'start_date', 'end_date'
  ]));
}

function mhSafeClientPlanHtml_(value) {
  return String(value || '')
    .replace(/<(script|style|iframe|object|embed|form|input|button)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button)\b[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\shref\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/\shref\s*=\s*(["'])(?!#|https:\/\/)[\s\S]*?\1/gi, '');
}

function mhPreviewBootstrap_(request) {
  var preview = mhCreatePreviewContext_();
  var bootstrap = mhReadBootstrap_(request, preview.actor);
  return {
    actor: preview.actor,
    scope: bootstrap.scope,
    data: {
      session: preview.session,
      bootstrap: bootstrap.data
    }
  };
}

/**
 * Authenticates and returns the minimum navigation bootstrap in one Apps
 * Script execution. Keeping this combined path behind an explicit request
 * flag preserves the legacy flat login response for older clients.
 */
function mhLoginBootstrap_(request) {
  var session = mhLogin_(request);
  var actor = mhResolveActor_({ auth: { sessionToken: session.token } });
  var bootstrap = mhReadBootstrap_(request, actor);
  return {
    actor: actor,
    scope: bootstrap.scope,
    data: {
      session: session,
      bootstrap: bootstrap.data
    }
  };
}

function mhPreviewOverview_(request) {
  var preview = mhCreatePreviewContext_();
  var projectId = mhAsText_(request.projectId || request.project_id) || preview.actor.previewProjectIds[0];
  if (!projectId) throw mhApiError_('not_found', 'preview_project_not_found', 404);
  var access = mhRequireProjectAccess_(preview.actor, projectId, false);
  var cached = mhCachedClientRead_('project_overview', request, preview.actor, projectId);
  var data = cached.hit ? cached.data : mhReadOverview_(request, preview.actor, access.project);
  if (!cached.hit) mhRememberClientRead_('project_overview', request, preview.actor, projectId, data);
  return {
    actor: preview.actor,
    scope: mhScopeForProject_(preview.actor, access.project),
    data: data
  };
}

function mhReadBootstrap_(request, actor) {
  var accesses = mhAccessibleProjectAccesses_(actor);
  var projects = accesses.map(function (access) { return access.project; });
  var projectKeys = {};
  var clientIds = {};
  projects.forEach(function (project) {
    projectKeys[mhAsText_(project.client_id) + '|' + mhAsText_(project.project_id)] = true;
    clientIds[mhAsText_(project.client_id)] = true;
  });
  var clients = mhActiveRows_(MH_SHEETS.CLIENTS).filter(function (client) {
    return !!clientIds[mhAsText_(client.client_id)];
  }).map(function (client) {
    return mhNormalizeRow_(mhPick_(client, [
      'client_id', 'display_name', 'status_code', 'is_demo', 'logo_url'
    ]));
  });
  var projectItems = accesses.map(function (access) {
    var project = access.project;
    var permission = access.permission;
    return mhNormalizeRow_({
      project_id: project.project_id,
      client_id: project.client_id,
      project_name: project.project_name,
      service_type_code: project.service_type_code,
      objective: project.objective,
      phase_code: project.phase_code,
      status_code: project.status_code,
      start_date: project.start_date,
      end_date: project.end_date,
      row_version: project.row_version,
      permission_code: permission ? permission.permissionCode : null,
      allowed_pages: permission && permission.allowedPages ? permission.allowedPages : MH_ACCESS_PAGES.slice()
    });
  });
  var channels = mhActiveRows_(MH_SHEETS.CHANNELS).filter(function (channel) {
    return !!projectKeys[mhAsText_(channel.client_id) + '|' + mhAsText_(channel.project_id)] &&
      (actor.role !== 'CLIENT_VIEWER' || mhAsBoolean_(channel.customer_visible));
  }).map(function (channel) {
    return mhNormalizeRow_(mhPick_(channel, [
      'project_channel_id', 'client_id', 'project_id', 'channel_code',
      'display_name', 'account_url', 'channel_role', 'cadence', 'status_code'
    ]));
  });
  var data = {
    currentUser: {
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role,
      organization: actor.organization
    },
    clients: clients,
    projects: projectItems,
    channels: channels
  };
  var initialView = mhAsText_(request.initialView || request.initial_view).toLowerCase();
  var initialAccess = accesses[0] || null;
  if (initialAccess && (initialView === 'overview' || initialView === 'tasks')) {
    var initialAction = initialView === 'overview' ? 'project_overview' : 'tasks';
    mhRequirePageAccess_(actor, initialAccess.permission, initialAction, request);
    data.initial = {
      view: initialView,
      projectId: mhAsText_(initialAccess.project.project_id),
      payload: initialView === 'overview'
        ? mhReadOverview_(request, actor, initialAccess.project)
        : mhReadTasks_(request, actor, initialAccess.project)
    };
  }
  return {
    scope: { clientId: null, projectId: null, visibility: null },
    data: data
  };
}

function mhReadOverview_(request, actor, project) {
  var projectId = mhAsText_(project.project_id);
  var clientId = mhAsText_(project.client_id);
  var tasks = mhProjectRows_(MH_SHEETS.TASKS, clientId, projectId, actor);
  var contents = mhProjectRows_(MH_SHEETS.CONTENTS, clientId, projectId, actor);
  var approvals = mhProjectRows_(MH_SHEETS.APPROVALS, clientId, projectId, actor);
  var kpiDefinitions = mhActiveRows_(MH_SHEETS.KPI_DEFINITIONS).filter(function (row) {
    return mhAsText_(row.client_id) === clientId && mhAsText_(row.project_id) === projectId &&
      (actor.role !== 'CLIENT_VIEWER' || mhAsBoolean_(row.customer_visible));
  });
  var kpiIds = {};
  kpiDefinitions.forEach(function (row) { kpiIds[mhAsText_(row.kpi_id)] = true; });
  var actuals = mhActiveRows_(MH_SHEETS.KPI_ACTUALS).filter(function (row) {
    return mhAsText_(row.client_id) === clientId && mhAsText_(row.project_id) === projectId && !!kpiIds[mhAsText_(row.kpi_id)];
  });
  var latestActuals = {};
  actuals.forEach(function (row) {
    var key = mhAsText_(row.kpi_id);
    var current = latestActuals[key];
    if (!current || mhComparableDate_(row.period_end) > mhComparableDate_(current.period_end)) latestActuals[key] = row;
  });
  var kpis = kpiDefinitions.sort(function (a, b) {
    return Number(a.display_order || 0) - Number(b.display_order || 0);
  }).slice(0, 12).map(function (definition) {
    var actual = latestActuals[mhAsText_(definition.kpi_id)];
    return mhNormalizeRow_({
      kpi_id: definition.kpi_id,
      metric_code: definition.metric_code,
      metric_name: definition.metric_name,
      channel_code: definition.channel_code,
      unit_code: definition.unit_code,
      target_value: definition.target_value,
      actual_value: actual ? actual.actual_value : null,
      period_start: actual ? actual.period_start : null,
      period_end: actual ? actual.period_end : null
    });
  });
  var activity = mhReadActivity_({ limit: 5, userFacingOnly: true }, actor, project).items;
  return {
    project: mhNormalizeRow_(mhPick_(project, [
      'project_id', 'client_id', 'project_name', 'objective', 'phase_code',
      'status_code', 'start_date', 'end_date'
    ])),
    summary: {
      tasks: {
        total: tasks.length,
        done: mhCountByValue_(tasks, 'status_code', ['DONE']),
        inProgress: mhCountByValue_(tasks, 'status_code', ['IN_PROGRESS', 'INTERNAL_REVIEW', 'WAITING_CLIENT', 'REVISION']),
        blocked: mhCountByValue_(tasks, 'status_code', ['BLOCKED'])
      },
      contents: {
        total: contents.length,
        published: mhCountByValue_(contents, 'status_code', ['PUBLISHED']),
        inReview: mhCountByValue_(contents, 'status_code', ['INTERNAL_REVIEW', 'READY'])
      },
      approvals: {
        pending: mhCountByValue_(approvals, 'status_code', ['REQUESTED']),
        approved: mhCountByValue_(approvals, 'status_code', ['APPROVED']),
        rejected: mhCountByValue_(approvals, 'status_code', ['REJECTED'])
      }
    },
    phases: mhGroupCounts_(tasks, 'phase_code'),
    workstreams: mhGroupCounts_(tasks, 'workstream_code'),
    kpis: kpis,
    recentActivity: activity
  };
}

function mhReadTasks_(request, actor, project) {
  var allRows = mhProjectRows_(MH_SHEETS.TASKS, project.client_id, project.project_id, actor);
  var rows = allRows.slice();
  var filters = request.filters || {};
  rows = rows.filter(function (row) {
    if (filters.statusCode && mhAsText_(row.status_code) !== mhAsText_(filters.statusCode)) return false;
    if (filters.phaseCode && mhAsText_(row.phase_code) !== mhAsText_(filters.phaseCode)) return false;
    if (filters.workstreamCode && mhAsText_(row.workstream_code) !== mhAsText_(filters.workstreamCode)) return false;
    if (filters.assigneeUserId && mhAsText_(row.assignee_user_id) !== mhAsText_(filters.assigneeUserId)) return false;
    return true;
  });
  var orderedRows = mhSortTaskRows_(rows).slice(0, MH_PAGE_MAX);
  var projectedProject = mhNormalizeRow_(mhPick_(project, [
      'project_id', 'phase_code', 'start_date', 'end_date', 'row_version'
    ]));
  projectedProject.start_date = mhDateOnly_(project.start_date) || null;
  projectedProject.end_date = mhDateOnly_(project.end_date) || null;
  return {
    project: projectedProject,
    members: actor.role === 'CLIENT_VIEWER' ? [] : mhActiveProjectMembers_(project),
    publishing: mhTrackerPublishingSummary_(project, actor, allRows),
    items: orderedRows.map(function (row) { return mhProjectTask_(row, actor); }),
    nextCursor: null,
    totalMatching: rows.length
  };
}

function mhSortTaskRows_(rows) {
  return (rows || []).slice().sort(function (left, right) {
    var leftOrder = mhNonEmpty_(left.sort_order) && isFinite(Number(left.sort_order))
      ? Number(left.sort_order) : 9007199254740991;
    var rightOrder = mhNonEmpty_(right.sort_order) && isFinite(Number(right.sort_order))
      ? Number(right.sort_order) : 9007199254740991;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    var leftId = mhAsText_(left.task_id);
    var rightId = mhAsText_(right.task_id);
    if (leftId === rightId) return 0;
    return leftId < rightId ? -1 : 1;
  });
}

function mhActiveProjectMembers_(project) {
  var projectId = mhAsText_(project.project_id);
  var clientId = mhAsText_(project.client_id);
  var membershipByUser = {};
  mhActiveRows_(MH_SHEETS.MEMBERSHIPS).forEach(function (row) {
    var userId = mhAsText_(row.user_id);
    var memberProjectId = mhAsText_(row.project_id);
    if (!userId || mhAsText_(row.client_id) !== clientId ||
        (memberProjectId && memberProjectId !== projectId) ||
        mhAsText_(row.status_code).toUpperCase() !== 'ACTIVE' ||
        !MH_READ_PERMISSIONS[mhAsText_(row.permission_code).toUpperCase()]) return;
    var exact = memberProjectId === projectId;
    if (!membershipByUser[userId] || (exact && !membershipByUser[userId].exact)) {
      membershipByUser[userId] = { row: row, exact: exact };
    }
  });
  var members = [];
  mhActiveRows_(MH_SHEETS.USERS).forEach(function (user) {
    var userId = mhAsText_(user.user_id);
    var membership = membershipByUser[userId];
    if (!membership || mhAsText_(user.status_code).toUpperCase() !== 'ACTIVE') return;
    members.push(mhNormalizeRow_({
      user_id: userId,
      display_name: mhAsText_(user.display_name) || userId,
      organization_code: mhAsText_(user.organization_code).toUpperCase(),
      role_code: mhAsText_(user.role_code).toUpperCase(),
      permission_code: mhAsText_(membership.row.permission_code).toUpperCase()
    }));
  });
  members.sort(function (left, right) {
    return mhAsText_(left.display_name).localeCompare(mhAsText_(right.display_name));
  });
  return members;
}

function mhReadContents_(request, actor, project) {
  var defaultRange = mhDefaultDateRange_(31);
  var range = mhValidateDateWindow_(
    mhAsText_(request.startDate || request.start_date || defaultRange.start),
    mhAsText_(request.endDate || request.end_date || defaultRange.end),
    MH_CONTENT_DATE_LIMIT_DAYS
  );
  var rows = mhProjectRows_(MH_SHEETS.CONTENTS, project.client_id, project.project_id, actor).filter(function (row) {
    var date = row.publish_due_date || row.planned_date || row.published_at || row.created_at;
    return mhInDateRange_(date, range);
  });
  var contentIds = {};
  rows.forEach(function (row) { contentIds[mhAsText_(row.content_id)] = true; });
  var versionsByContent = {};
  mhActiveRows_(MH_SHEETS.CONTENT_VERSIONS).forEach(function (version) {
    var contentId = mhAsText_(version.content_id);
    if (mhAsText_(version.client_id) !== mhAsText_(project.client_id) ||
        mhAsText_(version.project_id) !== mhAsText_(project.project_id) || !contentIds[contentId]) return;
    if (actor.role === 'CLIENT_VIEWER' &&
        ['FINAL', 'APPROVED', 'PUBLISHED', 'CLIENT_APPROVED'].indexOf(mhAsText_(version.status_code).toUpperCase()) < 0) return;
    var current = versionsByContent[contentId];
    if (!current || Number(version.version_no || 0) > Number(current.version_no || 0)) {
      versionsByContent[contentId] = version;
    }
  });
  var limit = mhClampLimit_(request.limit, MH_PAGE_DEFAULT, MH_PAGE_MAX);
  var page = mhPageRows_(rows, 'content_id', limit, mhDecodeCursor_(request.cursor));
  return {
    range: range,
    items: page.items.map(function (row) {
      var projected = mhProjectContent_(row, actor);
      var version = versionsByContent[mhAsText_(row.content_id)];
      var versionFields = [
        'content_version_id', 'version_no', 'file_url', 'copy_text',
        'status_code', 'created_at'
      ];
      if (actor.role !== 'CLIENT_VIEWER') versionFields.push('change_summary');
      projected.currentVersion = version ? mhNormalizeRow_(mhPick_(version, versionFields)) : null;
      return projected;
    }),
    nextCursor: page.nextCursor,
    totalMatching: rows.length
  };
}

function mhReadApprovals_(request, actor, project) {
  var rows = mhProjectRows_(MH_SHEETS.APPROVALS, project.client_id, project.project_id, actor);
  if (request.statusCode || request.status_code) {
    var status = mhAsText_(request.statusCode || request.status_code);
    rows = rows.filter(function (row) { return mhAsText_(row.status_code) === status; });
  }
  var limit = mhClampLimit_(request.limit, MH_PAGE_DEFAULT, MH_PAGE_MAX);
  var page = mhPageRows_(rows, 'approval_id', limit, mhDecodeCursor_(request.cursor));
  return {
    items: page.items.map(function (row) {
      return mhNormalizeRow_(mhPick_(row, [
        'approval_id', 'project_id', 'entity_type', 'entity_id', 'requested_at',
        'status_code', 'responded_at', 'response_note', 'row_version', 'updated_at'
      ]));
    }),
    nextCursor: page.nextCursor,
    totalMatching: rows.length
  };
}

function mhReadPerformance_(request, actor, project) {
  var defaultRange = mhDefaultDateRange_(31);
  var range = mhValidateDateWindow_(
    mhAsText_(request.startDate || request.start_date || defaultRange.start),
    mhAsText_(request.endDate || request.end_date || defaultRange.end),
    MH_PERFORMANCE_DATE_LIMIT_DAYS
  );
  var projectId = mhAsText_(project.project_id);
  var clientId = mhAsText_(project.client_id);
  var definitions = mhActiveRows_(MH_SHEETS.KPI_DEFINITIONS).filter(function (row) {
    return mhAsText_(row.client_id) === clientId && mhAsText_(row.project_id) === projectId &&
      (actor.role !== 'CLIENT_VIEWER' || mhAsBoolean_(row.customer_visible));
  });
  var kpiIds = {};
  definitions.forEach(function (row) { kpiIds[mhAsText_(row.kpi_id)] = true; });
  var actuals = mhActiveRows_(MH_SHEETS.KPI_ACTUALS).filter(function (row) {
    return mhAsText_(row.client_id) === clientId && mhAsText_(row.project_id) === projectId &&
      !!kpiIds[mhAsText_(row.kpi_id)] &&
      mhInDateRange_(row.period_end, range);
  });
  var daily = mhActiveRows_(MH_SHEETS.DAILY_PERFORMANCE).filter(function (row) {
    return mhAsText_(row.client_id) === clientId && mhAsText_(row.project_id) === projectId && mhInDateRange_(row.performance_date, range);
  });
  var channels = {};
  daily.forEach(function (row) {
    var code = mhAsText_(row.channel_code) || 'UNKNOWN';
    if (!channels[code]) {
      channels[code] = {
        channelCode: code, spend: 0, impressions: 0, reach: 0, clicks: 0,
        videoViews: 0, engagements: 0, saves: 0, inquiries: 0,
        leads: 0, conversions: 0, revenue: 0
      };
    }
    var target = channels[code];
    target.spend += Number(row.spend || 0);
    target.impressions += Number(row.impressions || 0);
    target.reach += Number(row.reach || 0);
    target.clicks += Number(row.clicks || 0);
    target.videoViews += Number(row.video_views || 0);
    target.engagements += Number(row.engagements || 0);
    target.saves += Number(row.saves || 0);
    target.inquiries += Number(row.inquiries || 0);
    target.leads += Number(row.leads || 0);
    target.conversions += Number(row.conversions || 0);
    target.revenue += Number(row.revenue || 0);
  });
  return {
    range: range,
    definitions: definitions.sort(function (a, b) {
      return Number(a.display_order || 0) - Number(b.display_order || 0);
    }).map(function (row) {
      return mhNormalizeRow_(mhPick_(row, [
        'kpi_id', 'phase_code', 'channel_code', 'metric_code', 'metric_name',
        'unit_code', 'period_type_code', 'baseline_value', 'target_value',
        'aggregation_code', 'display_order', 'customer_visible',
        'row_version', 'created_at', 'updated_at'
      ]));
    }),
    actuals: actuals.map(function (row) {
      var fields = [
        'kpi_actual_id', 'kpi_id', 'period_start', 'period_end',
        'actual_value', 'source_code', 'measured_at'
      ];
      if (actor.role !== 'CLIENT_VIEWER') fields.push('evidence_url');
      return mhNormalizeRow_(mhPick_(row, fields));
    }),
    daily: actor.role === 'CLIENT_VIEWER' ? [] : daily.map(function (row) {
      return mhNormalizeRow_(mhPick_(row, [
        'performance_id', 'performance_date', 'channel_code', 'campaign_id',
        'content_id', 'source_code', 'spend', 'impressions', 'reach', 'clicks',
        'video_views', 'watch_time_sec', 'engagements', 'saves',
        'followers_delta', 'inquiries', 'leads', 'reservations',
        'conversions', 'revenue', 'source_updated_at'
      ]));
    }),
    channels: actor.role === 'CLIENT_VIEWER' ? [] : Object.keys(channels).sort().map(function (key) { return channels[key]; })
  };
}

function mhReadPerformanceTracking_(request, actor, project) {
  var defaultRange = mhDefaultDateRange_(90);
  var range = mhValidateDateWindow_(
    mhAsText_(request.startDate || request.start_date || defaultRange.start),
    mhAsText_(request.endDate || request.end_date || defaultRange.end),
    MH_PERFORMANCE_DATE_LIMIT_DAYS
  );
  var projectId = mhAsText_(project.project_id);
  var clientId = mhAsText_(project.client_id);
  // 이 화면의 첫 응답은 12_성과일별 한 탭만 읽는다. 업무·콘텐츠·KPI 원장을
  // 한 요청에서 다시 읽던 이전 구현은 Apps Script 302 응답이 만료될 정도로 느렸다.
  var allowedChannelCodes = null;
  if (actor.role === 'CLIENT_VIEWER') {
    allowedChannelCodes = mhActiveRows_(MH_SHEETS.CHANNELS).filter(function (row) {
      return mhAsText_(row.client_id) === clientId && mhAsText_(row.project_id) === projectId &&
        mhAsBoolean_(row.customer_visible);
    }).map(function (row) { return mhAsText_(row.channel_code); });
  }
  var dailyRows = mhActiveRows_(MH_SHEETS.DAILY_PERFORMANCE).filter(function (row) {
    if (mhAsText_(row.client_id) !== clientId || mhAsText_(row.project_id) !== projectId || !mhInDateRange_(row.performance_date, range)) return false;
    return !allowedChannelCodes || allowedChannelCodes.indexOf(mhAsText_(row.channel_code)) >= 0;
  });
  var metricFields = [
    'spend', 'impressions', 'reach', 'video_views', 'watch_time_sec', 'engagements',
    'saves', 'followers_delta', 'clicks', 'inquiries', 'leads', 'reservations',
    'conversions', 'revenue'
  ];
  function emptyMetrics() {
    var result = {};
    metricFields.forEach(function (field) { result[field] = 0; });
    return result;
  }
  function addMetrics(target, row) {
    metricFields.forEach(function (field) { target[field] += Number(row[field] || 0); });
  }
  var totals = emptyMetrics();
  var daily = {};
  var channels = {};
  dailyRows.forEach(function (row) {
    var date = mhDateOnly_(row.performance_date);
    var channelCode = mhAsText_(row.channel_code) || 'UNKNOWN';
    if (!daily[date]) daily[date] = emptyMetrics();
    if (!channels[channelCode]) channels[channelCode] = emptyMetrics();
    addMetrics(totals, row);
    addMetrics(daily[date], row);
    addMetrics(channels[channelCode], row);
  });
  return {
    range: range,
    totals: mhNormalizeRow_(totals),
    daily: Object.keys(daily).sort().map(function (date) {
      return mhNormalizeRow_(Object.assign({ date: date }, daily[date]));
    }),
    channels: Object.keys(channels).sort().map(function (code) {
      return mhNormalizeRow_(Object.assign({
        channelCode: code
      }, channels[code]));
    }),
    source: MH_SHEETS.DAILY_PERFORMANCE
  };
}

function mhReadFiles_(request, actor, project) {
  var rows = mhProjectRows_(MH_SHEETS.FILES, project.client_id, project.project_id, actor);
  var limit = mhClampLimit_(request.limit, MH_PAGE_DEFAULT, MH_PAGE_MAX);
  var page = mhPageRows_(rows, 'file_id', limit, mhDecodeCursor_(request.cursor));
  return {
    items: page.items.map(function (row) {
      var fields = [
        'file_id', 'project_id', 'entity_type', 'entity_id', 'title',
        'file_type_code', 'storage_provider_code', 'url',
        'created_at', 'updated_at', 'row_version'
      ];
      if (actor.role !== 'CLIENT_VIEWER') fields.push('source_filename', 'notes');
      return mhNormalizeRow_(mhPick_(row, fields));
    }),
    nextCursor: page.nextCursor,
    totalMatching: rows.length
  };
}

function mhReadDailyMeetings_(request, actor, project) {
  var users = {};
  mhActiveRows_(MH_SHEETS.USERS).forEach(function (user) {
    users[mhAsText_(user.user_id)] = mhAsText_(user.display_name || user.email || user.user_id);
  });
  var rows = mhProjectRows_(MH_SHEETS.DAILY_MEETINGS, project.client_id, project.project_id, actor);
  rows.sort(function (left, right) {
    var dateCompare = mhDateOnly_(right.meeting_date).localeCompare(mhDateOnly_(left.meeting_date));
    if (dateCompare) return dateCompare;
    return mhAsText_(right.created_at).localeCompare(mhAsText_(left.created_at));
  });
  var total = rows.length;
  var limit = Math.min(Math.max(Number(request.limit || 100), 1), MH_PAGE_MAX);
  return {
    items: rows.slice(0, limit).map(function (row) {
      var projected = mhNormalizeRow_(mhPick_(row, [
        'meeting_id', 'meeting_date', 'title', 'attendees_text', 'discussion_text',
        'decisions_text', 'action_items_text', 'created_by_user_id',
        'visibility_code', 'created_at', 'updated_at', 'row_version'
      ]));
      projected.meeting_date = mhDateOnly_(row.meeting_date) || null;
      projected.author_name = users[mhAsText_(row.created_by_user_id)] || '확인되지 않은 사용자';
      if (actor.role === 'CLIENT_VIEWER') delete projected.created_by_user_id;
      return projected;
    }),
    totalMatching: total,
    nextCursor: total > limit ? String(limit) : null
  };
}

function mhReadActivity_(request, actor, project) {
  var projectId = mhAsText_(project.project_id);
  var clientId = mhAsText_(project.client_id);
  var entityType = mhAsText_(request.entityType || request.entity_type).toUpperCase();
  var userFacingOnly = mhAsBoolean_(request.userFacingOnly);
  var clientVisibleEntities = actor.role === 'CLIENT_VIEWER'
    ? mhClientVisibleEntityIds_(clientId, projectId, actor)
    : null;
  var rows = mhActiveRows_(MH_SHEETS.ACTIVITY).filter(function (row) {
    if (mhAsText_(row.client_id) !== clientId || mhAsText_(row.project_id) !== projectId) return false;
    if (mhAsText_(row.event_status_code) !== 'COMMIT') return false;
    if (userFacingOnly && mhAsText_(row.entity_type).toUpperCase() === 'TASK_PLAN') return false;
    if (entityType && mhAsText_(row.entity_type).toUpperCase() !== entityType) return false;
    if (actor.role === 'CLIENT_VIEWER') {
      var actionVisible = ['CREATED', 'UPDATED', 'ARCHIVED', 'APPROVED', 'REJECTED'].indexOf(mhAsText_(row.action_code)) >= 0;
      var entityKey = mhAsText_(row.entity_type).toUpperCase() + ':' + mhAsText_(row.entity_id);
      return actionVisible && !!clientVisibleEntities[entityKey];
    }
    return true;
  });
  var taskTitles = {};
  var actorNames = {};
  if (entityType === 'TASK') {
    mhProjectRows_(MH_SHEETS.TASKS, clientId, projectId, actor).forEach(function (task) {
      taskTitles[mhAsText_(task.task_id)] = mhAsText_(task.title);
    });
    mhActiveRows_(MH_SHEETS.USERS).forEach(function (user) {
      actorNames[mhAsText_(user.user_id)] = mhAsText_(user.display_name);
    });
  }
  var limit = mhClampLimit_(request.limit, Math.min(20, MH_ACTIVITY_PAGE_MAX), MH_ACTIVITY_PAGE_MAX);
  var page = mhPageRows_(rows, 'event_id', limit, mhDecodeCursor_(request.cursor));
  return {
    items: page.items.map(function (row) {
      var projected = {
        event_id: row.event_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action_code: row.action_code,
        summary: mhActivitySummary_(row.action_code, row.entity_type),
        created_at: row.created_at
      };
      if (entityType === 'TASK') {
        projected.task_title = taskTitles[mhAsText_(row.entity_id)] || null;
        projected.actor_display_name = actorNames[mhAsText_(row.actor_user_id)] || null;
        projected.changes = mhTaskActivityChanges_(row);
      }
      return mhNormalizeRow_(projected);
    }),
    nextCursor: page.nextCursor
  };
}

function mhTaskActivityChanges_(row) {
  var before = mhParseJson_(mhAsText_(row.before_json), {});
  var after = mhParseJson_(mhAsText_(row.after_json), {});
  var fields = [
    ['title', '업무명'], ['status_code', '상태'], ['responsible_org_code', '담당 조직'], ['priority_code', '우선순위'],
    ['planned_start_date', '시작일'], ['due_date', '마감일'], ['schedule_dates_json', '간트 일정'],
    ['progress_percent', '진행률'], ['completion_url', '완료링크'], ['remarks', '비고'],
    ['completed_at', '완료일'], ['customer_status_text', '고객 공유 메모'],
    ['visibility_code', '고객 공개 범위']
  ];
  var changes = [];
  fields.forEach(function (entry) {
    var field = entry[0];
    var beforeValue = Object.prototype.hasOwnProperty.call(before, field) ? mhToIsoValue_(before[field]) : null;
    var afterValue = Object.prototype.hasOwnProperty.call(after, field) ? mhToIsoValue_(after[field]) : null;
    if (mhStableJson_(beforeValue) === mhStableJson_(afterValue)) return;
    changes.push({ field: field, label: entry[1], before: beforeValue, after: afterValue });
  });
  return changes;
}

function mhClientVisibleEntityIds_(clientId, projectId, actor) {
  var result = {};
  result['PROJECT:' + mhAsText_(projectId)] = true;
  [
    [MH_SHEETS.TASKS, 'TASK', 'task_id'],
    [MH_SHEETS.CONTENTS, 'CONTENT', 'content_id'],
    [MH_SHEETS.APPROVALS, 'APPROVAL', 'approval_id'],
    [MH_SHEETS.FILES, 'FILE', 'file_id']
  ].forEach(function (entry) {
    mhProjectRows_(entry[0], clientId, projectId, actor).forEach(function (row) {
      result[entry[1] + ':' + mhAsText_(row[entry[2]])] = true;
    });
  });
  return result;
}

function mhProjectRows_(sheetName, clientId, projectId, actor) {
  return mhActiveRows_(sheetName).filter(function (row) {
    return mhAsText_(row.client_id) === mhAsText_(clientId) &&
      mhAsText_(row.project_id) === mhAsText_(projectId) && mhCanSeeRow_(actor, row);
  });
}

function mhProjectTask_(row, actor) {
  var fields = [
    'task_id', 'project_id', 'source_task_id', 'parent_task_id', 'phase_code', 'workstream_code',
    'category_code', 'title', 'description', 'status_code', 'priority_code',
    'plan_week', 'planned_start_date', 'due_date', 'schedule_dates_json', 'completed_at', 'customer_status_text',
    'progress_percent', 'completion_url', 'remarks',
    'sort_order', 'created_at', 'updated_at', 'row_version'
  ];
  if (actor.role !== 'CLIENT_VIEWER') {
    fields = fields.concat([
      'plan_note', 'responsible_org_code', 'assignee_user_id',
      'reviewer_org_code', 'blocker_reason', 'source_code'
    ]);
  } else if (MH_PUBLIC_TASK_WRITES_ENABLED) {
    fields = fields.concat(['assignee_user_id']);
  }
  var projected = mhNormalizeRow_(mhPick_(row, fields));
  projected.planned_start_date = mhDateOnly_(row.planned_start_date) || null;
  projected.due_date = mhDateOnly_(row.due_date) || null;
  projected.contract_linked = mhNonEmpty_(row.plan_note);
  return projected;
}

function mhTrackerPublishingSummary_(project, actor, tasks) {
  var targets = {
    P0: { long_form: 2, short_form: 10, instagram: 10, blog: 10 },
    M1: { long_form: 2, short_form: 10, instagram: 10, blog: 4 },
    M2: { long_form: 2, short_form: 10, instagram: 10, blog: 4 },
    M3: { long_form: 2, short_form: 10, instagram: 10, blog: 4 }
  };
  var taskPhase = {};
  (tasks || []).forEach(function (task) {
    taskPhase[mhAsText_(task.task_id)] = mhAsText_(task.phase_code);
  });
  var actuals = {};
  Object.keys(targets).forEach(function (phase) {
    actuals[phase] = { long_form: 0, short_form: 0, instagram: 0, blog: 0 };
  });
  mhProjectRows_(MH_SHEETS.CONTENTS, project.client_id, project.project_id, actor).forEach(function (content) {
    if (mhAsText_(content.status_code).toUpperCase() !== 'PUBLISHED') return;
    var phase = taskPhase[mhAsText_(content.task_id)];
    if (!actuals[phase]) return;
    var format = mhAsText_(content.format_code).toUpperCase();
    if (['LONG_FORM', 'LONGFORM', 'YOUTUBE_LONG'].indexOf(format) >= 0) actuals[phase].long_form += 1;
    else if (['SHORT_FORM', 'SHORTFORM', 'YOUTUBE_SHORT', 'REELS'].indexOf(format) >= 0) actuals[phase].short_form += 1;
    else if (['INSTAGRAM', 'FEED', 'INSTAGRAM_FEED', 'CARD_NEWS'].indexOf(format) >= 0) actuals[phase].instagram += 1;
    else if (['NAVER_BLOG', 'BLOG', 'ARTICLE'].indexOf(format) >= 0) actuals[phase].blog += 1;
  });
  return {
    source: '08_콘텐츠:PUBLISHED',
    phases: ['P0', 'M1', 'M2', 'M3'].map(function (phase) {
      var target = targets[phase];
      var actual = actuals[phase];
      target.total = target.long_form + target.short_form + target.instagram + target.blog;
      actual.total = actual.long_form + actual.short_form + actual.instagram + actual.blog;
      return { phase_code: phase, target: target, actual: actual };
    })
  };
}

function mhProjectContent_(row, actor) {
  var fields = [
    'content_id', 'project_id', 'task_id', 'channel_code', 'format_code',
    'title', 'objective', 'content_pillar', 'status_code', 'planned_date',
    'shoot_date', 'review_due_date', 'publish_due_date', 'published_at',
    'current_version_no', 'publish_url', 'updated_at', 'row_version'
  ];
  if (actor.role !== 'CLIENT_VIEWER') fields = fields.concat(['assignee_user_id', 'notes']);
  return mhNormalizeRow_(mhPick_(row, fields));
}

function mhCountByValue_(rows, field, values) {
  var lookup = {};
  values.forEach(function (value) { lookup[value] = true; });
  return rows.filter(function (row) { return !!lookup[mhAsText_(row[field])]; }).length;
}

function mhGroupCounts_(rows, field) {
  var counts = {};
  rows.forEach(function (row) {
    var key = mhAsText_(row[field]) || 'UNSET';
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.keys(counts).sort().map(function (key) {
    return { code: key, count: counts[key] };
  });
}

function mhActivitySummary_(actionCode, entityType) {
  var action = {
    CREATED: '추가됨', UPDATED: '수정됨', ARCHIVED: '보관됨',
    APPROVED: '승인됨', REJECTED: '반려됨', MIGRATE: '동기화됨'
  }[mhAsText_(actionCode)] || '변경됨';
  var entity = {
    task: '업무가', content: '콘텐츠가', approval: '승인이', file: '자료가',
    kpi: 'KPI가', daily_meeting: '회의록이', task_plan: '업무 계획이',
    TASK: '업무가', CONTENT: '콘텐츠가', APPROVAL: '승인이', FILE: '자료가',
    KPI: 'KPI가', DAILY_MEETING: '회의록이', TASK_PLAN: '업무 계획이'
  }[mhAsText_(entityType)] || '항목이';
  return entity + ' ' + action;
}

function mhDefaultDateRange_(days) {
  var end = new Date();
  var start = new Date(end.getTime() - (Math.max(1, days) - 1) * 86400000);
  return {
    start: Utilities.formatDate(start, 'Asia/Seoul', 'yyyy-MM-dd'),
    end: Utilities.formatDate(end, 'Asia/Seoul', 'yyyy-MM-dd')
  };
}
