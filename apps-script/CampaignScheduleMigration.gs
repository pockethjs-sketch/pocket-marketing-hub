/**
 * Imports the two campaigns embedded in the approved local campaign schedule
 * HTML. This is manager-only, refuses to merge with an existing task ledger,
 * and creates a verified full-spreadsheet backup before the first write.
 */
function mhMigrateCampaignScheduleV1_(request, actor) {
  mhAssertOperationsManager_(actor);
  var payload = request && request.payload;
  if (!payload || !Array.isArray(payload.campaigns)) {
    throw mhApiError_('invalid_request', 'campaign_schedule_payload_required', 400);
  }
  var expectedProjects = {
    mugeuk: 'PRJ-MUGUK-MKT-001',
    und: 'PRJ-UND-90D-001'
  };
  var campaigns = payload.campaigns.filter(function (campaign) {
    return campaign && Object.prototype.hasOwnProperty.call(expectedProjects, mhAsText_(campaign.id));
  });
  if (campaigns.length !== 2 || campaigns.some(function (campaign) {
    return !Array.isArray(campaign.rows) || !campaign.rows.length;
  })) {
    throw mhApiError_('validation_error', 'campaign_schedule_requires_mugeuk_and_und', 400);
  }

  // Older deployments can expose the Gantt code before the physical
  // schedule_dates_json column exists. Ensure the ledger schema before any
  // import so selected day cells are never silently dropped.
  mhSetupEnsureTaskTableFields();
  mhUseFreshTables_();
  var projects = {};
  Object.keys(expectedProjects).forEach(function (campaignId) {
    var found = mhFindRecord_(MH_SHEETS.PROJECTS, 'project_id', expectedProjects[campaignId]).row;
    if (!found || mhNonEmpty_(found.archived_at)) {
      throw mhApiError_('configuration_error', 'campaign_schedule_project_missing', 500);
    }
    projects[campaignId] = found;
  });

  var issues = Array.isArray(payload.issues) ? payload.issues : [];
  var now = mhNowIso_();
  var records = [];
  campaigns.forEach(function (campaign) {
    var campaignId = mhAsText_(campaign.id);
    var sourceIds = {};
    campaign.rows.forEach(function (sourceRow, index) {
      var sourceRowId = mhAsText_(sourceRow && sourceRow.id);
      if (!sourceRowId || sourceIds[sourceRowId]) {
        throw mhApiError_('validation_error', 'campaign_schedule_source_id_invalid', 400);
      }
      sourceIds[sourceRowId] = true;
      records.push(mhCampaignScheduleRecord_(
        campaignId, campaign, sourceRow, index, projects[campaignId], issues, actor, now
      ));
    });
  });
  if (records.length > 200) {
    throw mhApiError_('validation_error', 'campaign_schedule_row_limit_exceeded', 400);
  }

  var projectIds = Object.keys(expectedProjects).map(function (key) { return expectedProjects[key]; });
  var existing = mhReadTable_(MH_SHEETS.TASKS).rows.filter(function (row) {
    return projectIds.indexOf(mhAsText_(row.project_id)) >= 0;
  });
  var expectedSourceIds = records.map(function (row) { return mhAsText_(row.source_task_id); }).sort();
  var existingSourceIds = existing.map(function (row) { return mhAsText_(row.source_task_id); }).sort();
  var exactExisting = existing.length === records.length && existing.every(function (row) {
    return !mhNonEmpty_(row.archived_at) && mhAsText_(row.source_code) === 'CAMPAIGN_SCHEDULE_HTML';
  }) && expectedSourceIds.every(function (sourceId, index) {
    return sourceId === existingSourceIds[index];
  });
  if (exactExisting) {
    var reconciled = mhCampaignScheduleReconcileExisting_(existing, records, payload, actor);
    if (reconciled) return reconciled;
    return mhCampaignScheduleSummary_(existing, payload, null, true);
  }
  if (existing.length) {
    throw mhApiError_('conflict', 'campaign_schedule_target_not_empty', 409);
  }

  var backup = mhRunDailyBackup(true);
  if (!backup || !backup.ok || !backup.verification || !backup.verification.ok) {
    throw mhApiError_('internal_error', 'campaign_schedule_backup_failed', 500);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) {
    throw mhApiError_('lock_timeout', 'campaign_schedule_lock_timeout', 409);
  }
  try {
    mhUseFreshTables_();
    var table = mhReadTable_(MH_SHEETS.TASKS);
    var raced = table.rows.some(function (row) {
      return projectIds.indexOf(mhAsText_(row.project_id)) >= 0;
    });
    if (raced) throw mhApiError_('conflict', 'campaign_schedule_target_changed', 409);

    var values = records.map(function (record) {
      return table.headers.map(function (header) {
        return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
      });
    });
    var sheet = table.sheet || mhSheet_(MH_SHEETS.TASKS);
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, table.headers.length).setValues(values);
    SpreadsheetApp.flush();
    mhInvalidateTableCache_(MH_SHEETS.TASKS);

    var summary = mhCampaignScheduleSummary_(records, payload, backup, false);
    mhAppendRecord_(MH_SHEETS.ACTIVITY, {
      event_id: mhNewId_('EVT'),
      mutation_id: 'mut_campaign_schedule_' + new Date().getTime(),
      client_id: '',
      project_id: '',
      entity_type: 'TASK_BATCH',
      entity_id: 'CAMPAIGN_SCHEDULE_HTML_V1',
      action_code: 'MIGRATE',
      before_json: JSON.stringify({ und: 0, mugeuk: 0 }),
      after_json: JSON.stringify(summary),
      actor_user_id: actor.userId,
      actor_role_code: actor.role,
      event_status_code: 'COMMIT',
      created_at: mhNowIso_()
    });
    projectIds.forEach(function (projectId) { mhInvalidateClientReadCache_(projectId); });
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function mhCampaignScheduleReconcileExisting_(existing, expected, payload, actor) {
  var desiredBySource = {};
  expected.forEach(function (row) { desiredBySource[mhAsText_(row.source_task_id)] = row; });
  var syncFields = MH_ENTITY_SPECS.task.fields.concat(['source_code']);
  var needsRepair = existing.some(function (row) {
    var desired = desiredBySource[mhAsText_(row.source_task_id)];
    return syncFields.some(function (field) {
      return mhCampaignScheduleComparable_(field, row[field]) !== mhCampaignScheduleComparable_(field, desired[field]);
    });
  });
  if (!needsRepair) return null;

  var backup = mhRunDailyBackup(true);
  if (!backup || !backup.ok || !backup.verification || !backup.verification.ok) {
    throw mhApiError_('internal_error', 'campaign_schedule_repair_backup_failed', 500);
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) {
    throw mhApiError_('lock_timeout', 'campaign_schedule_repair_lock_timeout', 409);
  }
  try {
    mhUseFreshTables_();
    var table = mhReadTable_(MH_SHEETS.TASKS);
    var sourceIds = Object.keys(desiredBySource);
    var current = table.rows.filter(function (row) {
      return sourceIds.indexOf(mhAsText_(row.source_task_id)) >= 0;
    }).sort(function (left, right) { return left.__rowNumber - right.__rowNumber; });
    if (current.length !== expected.length || current.some(function (row, index) {
      return index && row.__rowNumber !== current[0].__rowNumber + index;
    })) {
      throw mhApiError_('conflict', 'campaign_schedule_repair_rows_changed', 409);
    }
    var sheet = table.sheet || mhSheet_(MH_SHEETS.TASKS);
    var range = sheet.getRange(current[0].__rowNumber, 1, current.length, table.headers.length);
    var values = range.getValues();
    var formulas = range.getFormulas();
    var changedRows = 0;
    current.forEach(function (row, rowIndex) {
      var desired = desiredBySource[mhAsText_(row.source_task_id)];
      var changed = false;
      syncFields.forEach(function (field) {
        var columnIndex = table.headers.indexOf(field);
        if (columnIndex < 0) throw mhApiError_('schema_mismatch', 'campaign_schedule_repair_field_missing', 500);
        if (mhCampaignScheduleComparable_(field, values[rowIndex][columnIndex]) === mhCampaignScheduleComparable_(field, desired[field])) return;
        if (formulas[rowIndex][columnIndex]) throw mhApiError_('schema_mismatch', 'campaign_schedule_repair_formula_field', 500);
        values[rowIndex][columnIndex] = desired[field];
        changed = true;
      });
      if (changed) {
        var updatedIndex = table.headers.indexOf('updated_at');
        var versionIndex = table.headers.indexOf('row_version');
        values[rowIndex][updatedIndex] = mhNowIso_();
        values[rowIndex][versionIndex] = Number(row.row_version || 0) + 1;
        changedRows += 1;
      }
    });
    values.forEach(function (row, rowIndex) {
      formulas[rowIndex].forEach(function (formula, columnIndex) {
        if (formula) row[columnIndex] = formula;
      });
    });
    range.setValues(values);
    SpreadsheetApp.flush();
    mhInvalidateTableCache_(MH_SHEETS.TASKS);
    ['PRJ-MUGUK-MKT-001', 'PRJ-UND-90D-001'].forEach(function (projectId) {
      mhInvalidateClientReadCache_(projectId);
    });
    var summary = mhCampaignScheduleSummary_(expected, payload, backup, false);
    summary.reconciledRows = changedRows;
    mhAppendRecord_(MH_SHEETS.ACTIVITY, {
      event_id: mhNewId_('EVT'), mutation_id: 'mut_campaign_schedule_repair_' + new Date().getTime(),
      client_id: '', project_id: '', entity_type: 'TASK_BATCH', entity_id: 'CAMPAIGN_SCHEDULE_HTML_V1',
      action_code: 'RECONCILE', before_json: '', after_json: JSON.stringify(summary),
      actor_user_id: actor.userId, actor_role_code: actor.role,
      event_status_code: 'COMMIT', created_at: mhNowIso_()
    });
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function mhCampaignScheduleComparable_(field, value) {
  if (field === 'planned_start_date' || field === 'due_date') {
    return mhDateOnly_(value);
  }
  if (field === 'plan_week' || field === 'progress_percent' || field === 'sort_order') {
    return String(Number(value || 0));
  }
  if (field === 'schedule_dates_json') {
    var parsed = mhParseJson_(mhAsText_(value), []);
    if (!Array.isArray(parsed)) return '[]';
    return mhStableJson_(parsed.map(function (date) { return mhDateOnly_(date); }));
  }
  return mhAsText_(value);
}

function mhCampaignScheduleRecord_(campaignId, campaign, sourceRow, index, project, issues, actor, now) {
  var sourceRowId = mhAsText_(sourceRow.id);
  var fields = {
    source_task_id: 'CAMPAIGN_SCHEDULE_V1_' + campaignId.toUpperCase() + '_' + sourceRowId,
    parent_task_id: '',
    phase_code: mhCampaignSchedulePhase_(sourceRow),
    workstream_code: mhCampaignScheduleWorkstream_(sourceRow),
    category_code: mhCampaignScheduleMedia_(sourceRow.media),
    title: mhAsText_(sourceRow.task),
    description: mhAsText_(sourceRow.detail),
    plan_week: mhCampaignScheduleWeek_(campaign.start, sourceRow.start),
    plan_note: '',
    responsible_org_code: mhAsText_(sourceRow.owner) === '포켓' ? 'POCKET' : 'NS',
    assignee_user_id: '',
    reviewer_org_code: 'POCKET',
    status_code: mhCampaignScheduleStatus_(sourceRow.status),
    priority_code: 'NORMAL',
    planned_start_date: mhAsText_(sourceRow.start),
    due_date: mhAsText_(sourceRow.end),
    schedule_dates_json: JSON.stringify(mhCampaignScheduleDates_(campaign.start, sourceRow.days)),
    completed_at: '',
    blocker_reason: '',
    customer_status_text: mhAsText_(sourceRow.status),
    progress_percent: 0,
    completion_url: /^https:\/\//i.test(mhAsText_(sourceRow.link)) ? mhAsText_(sourceRow.link) : '',
    remarks: mhCampaignScheduleRemarks_(campaignId, sourceRow, issues),
    visibility_code: 'CLIENT',
    sort_order: index + 1
  };
  if (!fields.title || !fields.description || !fields.planned_start_date || !fields.due_date) {
    throw mhApiError_('validation_error', 'campaign_schedule_required_value_missing', 400);
  }
  var record = { task_id: mhNewId_('TSK'), client_id: project.client_id, project_id: project.project_id };
  mhApplyAllowedFields_(record, fields, MH_ENTITY_SPECS.task, actor);
  mhApplyTaskGanttSchedule_(record, fields, 'task', null);
  mhApplyCreateDefaults_(record, 'task', actor, now);
  record.source_code = 'CAMPAIGN_SCHEDULE_HTML';
  mhValidateMutationRecord_(record, MH_ENTITY_SPECS.task, 'task', actor, project, null);
  return record;
}

function mhCampaignScheduleStatus_(value) {
  var status = mhAsText_(value);
  if (status === '완료') return 'DONE';
  if (status === '진행중' || status === '진행') return 'IN_PROGRESS';
  if (status === '보류') return 'ON_HOLD';
  return 'NOT_STARTED';
}

function mhCampaignSchedulePhase_(row) {
  var title = mhAsText_(row && row.task);
  return /(세팅|구축|최적화|아트워크\s*제작|디자인\s*제작|썸네일\s*제작)/.test(title) ? 'P0' : 'M1';
}

function mhCampaignScheduleWorkstream_(row) {
  var title = mhAsText_(row && row.task);
  var detail = mhAsText_(row && row.detail);
  var media = mhAsText_(row && row.media).toUpperCase();
  if (/(디자인|아트워크|썸네일|카드뉴스|단일이미지)/.test(title + ' ' + detail)) return 'DSN';
  if ((media === 'YOUTUBE' || media === 'TIKTOK') && /(영상|본편|쇼츠|릴스|콘텐츠\s*(운영|업로드))/.test(title + ' ' + detail)) return 'VID';
  return 'MKT';
}

function mhCampaignScheduleMedia_(value) {
  var text = mhAsText_(value).toUpperCase();
  if (text === 'YOUTUBE') return 'YOUTUBE';
  if (text === 'INSTAGRAM') return 'INSTAGRAM';
  if (text === 'NAVER' || text === '네이버블로그') return 'NAVER_BLOG';
  if (text === 'TIKTOK') return 'TIKTOK';
  if (text === 'ADS') return 'ADS';
  return text || 'OTHER';
}

function mhCampaignScheduleWeek_(campaignStart, taskStart) {
  var start = new Date(mhAsText_(campaignStart) + 'T00:00:00Z');
  var task = new Date(mhAsText_(taskStart) + 'T00:00:00Z');
  if (isNaN(start.getTime()) || isNaN(task.getTime())) return 1;
  return Math.max(1, Math.floor((task.getTime() - start.getTime()) / 604800000) + 1);
}

function mhCampaignScheduleDates_(campaignStart, offsets) {
  if (!Array.isArray(offsets) || !offsets.length) {
    throw mhApiError_('validation_error', 'campaign_schedule_days_required', 400);
  }
  var base = new Date(mhAsText_(campaignStart) + 'T00:00:00Z');
  if (isNaN(base.getTime())) throw mhApiError_('validation_error', 'campaign_schedule_start_invalid', 400);
  var seen = {};
  return offsets.map(function (offset) {
    var day = Number(offset);
    if (!isFinite(day) || day < 0 || Math.floor(day) !== day) {
      throw mhApiError_('validation_error', 'campaign_schedule_day_invalid', 400);
    }
    var date = new Date(base.getTime());
    date.setUTCDate(date.getUTCDate() + day);
    var iso = Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
    if (seen[iso]) throw mhApiError_('validation_error', 'campaign_schedule_day_duplicate', 400);
    seen[iso] = true;
    return iso;
  }).sort();
}

function mhCampaignScheduleRemarks_(campaignId, row, issues) {
  var notes = [];
  var note = mhAsText_(row && row.note);
  var link = mhAsText_(row && row.link);
  if (note) notes.push(note);
  if (link && !/^https:\/\//i.test(link)) notes.push('완료링크 원문: ' + link);
  (issues || []).forEach(function (issue) {
    if (mhAsText_(issue.task) !== mhAsText_(row.task)) return;
    if (mhAsText_(issue.campaignId) && mhAsText_(issue.campaignId) !== campaignId) return;
    var detail = ['추가업무 ' + mhAsText_(issue.date), mhAsText_(issue.body)];
    if (mhAsText_(issue.owner)) detail.push('담당 ' + mhAsText_(issue.owner));
    if (mhAsText_(issue.status)) detail.push('상태 ' + mhAsText_(issue.status));
    if (mhAsText_(issue.link)) detail.push('참고 ' + mhAsText_(issue.link));
    if (mhAsText_(issue.note)) detail.push(mhAsText_(issue.note));
    notes.push(detail.filter(Boolean).join(' · '));
  });
  return notes.join('\n');
}

function mhCampaignScheduleSummary_(records, payload, backup, skipped) {
  var byProject = {};
  records.forEach(function (row) {
    var projectId = mhAsText_(row.project_id);
    if (!byProject[projectId]) byProject[projectId] = { rows: 0, done: 0, inProgress: 0, notStarted: 0 };
    byProject[projectId].rows += 1;
    var status = mhAsText_(row.status_code).toUpperCase();
    if (status === 'DONE') byProject[projectId].done += 1;
    else if (status === 'IN_PROGRESS') byProject[projectId].inProgress += 1;
    else if (status === 'NOT_STARTED') byProject[projectId].notStarted += 1;
  });
  return {
    ok: true,
    skipped: !!skipped,
    sourceName: mhAsText_(payload.sourceName),
    sourceUpdatedAt: payload.sourceUpdatedAt || null,
    totalRows: records.length,
    projects: byProject,
    backup: backup ? {
      fileId: backup.fileId,
      fileName: backup.fileName,
      verifiedSheets: backup.verification && backup.verification.verifiedSheets,
      missingSheets: backup.verification && backup.verification.missingSheets || [],
      mismatchedSheets: backup.verification && backup.verification.mismatchedSheets || []
    } : null
  };
}
