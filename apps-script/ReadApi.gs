function mhHandleRead_(action, request, actor) {
  if (action === 'bootstrap') return mhReadBootstrap_(request, actor);
  var projectId = mhAsText_(request.projectId || request.project_id);
  if (!projectId) throw mhApiError_('invalid_request', 'project_id_required', 400);
  var access = mhRequireProjectAccess_(actor, projectId, false);
  var scope = mhScopeForProject_(actor, access.project);
  if (action === 'project_overview') return { scope: scope, data: mhReadOverview_(request, actor, access.project) };
  if (action === 'tasks') return { scope: scope, data: mhReadTasks_(request, actor, access.project) };
  if (action === 'contents') return { scope: scope, data: mhReadContents_(request, actor, access.project) };
  if (action === 'approvals') return { scope: scope, data: mhReadApprovals_(request, actor, access.project) };
  if (action === 'performance') return { scope: scope, data: mhReadPerformance_(request, actor, access.project) };
  if (action === 'files') return { scope: scope, data: mhReadFiles_(request, actor, access.project) };
  if (action === 'activity') return { scope: scope, data: mhReadActivity_(request, actor, access.project) };
  throw mhApiError_('invalid_request', 'unsupported_read_action', 400);
}

function mhReadBootstrap_(request, actor) {
  var projects = mhAccessibleProjects_(actor);
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
  var projectItems = projects.map(function (project) {
    var permission = mhPermissionForProject_(actor, project);
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
      permission_code: permission ? permission.permissionCode : null
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
  return {
    scope: { clientId: null, projectId: null, visibility: null },
    data: {
      currentUser: {
        userId: actor.userId,
        displayName: actor.displayName,
        role: actor.role,
        organization: actor.organization
      },
      clients: clients,
      projects: projectItems,
      channels: channels
    }
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
  var activity = mhReadActivity_({ limit: 5 }, actor, project).items;
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
  var rows = mhProjectRows_(MH_SHEETS.TASKS, project.client_id, project.project_id, actor);
  var filters = request.filters || {};
  rows = rows.filter(function (row) {
    if (filters.statusCode && mhAsText_(row.status_code) !== mhAsText_(filters.statusCode)) return false;
    if (filters.phaseCode && mhAsText_(row.phase_code) !== mhAsText_(filters.phaseCode)) return false;
    if (filters.workstreamCode && mhAsText_(row.workstream_code) !== mhAsText_(filters.workstreamCode)) return false;
    if (filters.assigneeUserId && mhAsText_(row.assignee_user_id) !== mhAsText_(filters.assigneeUserId)) return false;
    return true;
  });
  var limit = mhClampLimit_(request.limit, MH_PAGE_DEFAULT, MH_PAGE_MAX);
  var page = mhPageRows_(rows, 'task_id', limit, mhDecodeCursor_(request.cursor));
  return {
    items: page.items.map(function (row) { return mhProjectTask_(row, actor); }),
    nextCursor: page.nextCursor,
    totalMatching: rows.length
  };
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
        'aggregation_code', 'display_order'
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

function mhReadActivity_(request, actor, project) {
  var projectId = mhAsText_(project.project_id);
  var clientId = mhAsText_(project.client_id);
  var clientVisibleEntities = actor.role === 'CLIENT_VIEWER'
    ? mhClientVisibleEntityIds_(clientId, projectId, actor)
    : null;
  var rows = mhActiveRows_(MH_SHEETS.ACTIVITY).filter(function (row) {
    if (mhAsText_(row.client_id) !== clientId || mhAsText_(row.project_id) !== projectId) return false;
    if (mhAsText_(row.event_status_code) !== 'COMMIT') return false;
    if (actor.role === 'CLIENT_VIEWER') {
      var actionVisible = ['CREATED', 'UPDATED', 'ARCHIVED', 'APPROVED', 'REJECTED'].indexOf(mhAsText_(row.action_code)) >= 0;
      var entityKey = mhAsText_(row.entity_type).toUpperCase() + ':' + mhAsText_(row.entity_id);
      return actionVisible && !!clientVisibleEntities[entityKey];
    }
    return true;
  });
  var limit = mhClampLimit_(request.limit, Math.min(20, MH_ACTIVITY_PAGE_MAX), MH_ACTIVITY_PAGE_MAX);
  var page = mhPageRows_(rows, 'event_id', limit, mhDecodeCursor_(request.cursor));
  return {
    items: page.items.map(function (row) {
      return mhNormalizeRow_({
        event_id: row.event_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action_code: row.action_code,
        summary: mhActivitySummary_(row.action_code, row.entity_type),
        created_at: row.created_at
      });
    }),
    nextCursor: page.nextCursor
  };
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
    'task_id', 'project_id', 'parent_task_id', 'phase_code', 'workstream_code',
    'category_code', 'title', 'status_code', 'priority_code',
    'planned_start_date', 'due_date', 'completed_at', 'customer_status_text',
    'sort_order', 'updated_at', 'row_version'
  ];
  if (actor.role !== 'CLIENT_VIEWER') {
    fields = fields.concat([
      'description', 'responsible_org_code', 'assignee_user_id',
      'reviewer_org_code', 'blocker_reason', 'source_code'
    ]);
  }
  return mhNormalizeRow_(mhPick_(row, fields));
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
    APPROVED: '승인됨', REJECTED: '반려됨'
  }[mhAsText_(actionCode)] || '변경됨';
  var entity = {
    task: '업무', content: '콘텐츠', approval: '승인', file: '자료',
    TASK: '업무', CONTENT: '콘텐츠', APPROVAL: '승인', FILE: '자료'
  }[mhAsText_(entityType)] || '항목';
  return entity + '가 ' + action;
}

function mhDefaultDateRange_(days) {
  var end = new Date();
  var start = new Date(end.getTime() - (Math.max(1, days) - 1) * 86400000);
  return {
    start: Utilities.formatDate(start, 'Asia/Seoul', 'yyyy-MM-dd'),
    end: Utilities.formatDate(end, 'Asia/Seoul', 'yyyy-MM-dd')
  };
}
