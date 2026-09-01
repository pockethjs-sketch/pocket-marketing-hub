/**
 * Normalizes the approved UND tracker into the same explicit task/schedule
 * shape used by Muguk. Existing operational input is never overwritten.
 */
var MH_UND_STRUCTURE_PROJECT_ID = 'PRJ-UND-90D-001';
var MH_UND_STRUCTURE_DEFAULT_START = '2026-08-25';

function mhUndStructureDate_(value) {
  var text = mhDateOnly_(value);
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw mhApiError_('validation_error', 'invalid_und_project_start_date', 400);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

function mhUndStructureDateText_(value) {
  return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
}

function mhUndStructureSheetDate_(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mhAsText_(value));
  if (!match) throw mhApiError_('validation_error', 'invalid_und_sheet_date', 400);
  // Noon UTC remains on the requested calendar date in both the spreadsheet
  // timezone and the API's Asia/Seoul projection. Midnight strings can be
  // parsed one day earlier by Sheets depending on the script timezone.
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0));
}

function mhUndStructureAddDays_(value, amount) {
  var next = new Date(value.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function mhUndStructureForward_(value) {
  var next = new Date(value.getTime());
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  return next;
}

function mhUndStructureBack_(value) {
  var next = new Date(value.getTime());
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() - 1);
  return next;
}

function mhUndStructureBusinessDays_(value, amount) {
  var next = new Date(value.getTime());
  var counted = 0;
  while (counted < amount) {
    next.setDate(next.getDate() + 1);
    if (next.getDay() !== 0 && next.getDay() !== 6) counted += 1;
  }
  return next;
}

function mhUndStructureAddMonth_(value) {
  var next = new Date(value.getTime());
  var day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  var lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0, 12).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function mhUndStructurePhaseRanges_(startValue) {
  var p0Start = mhUndStructureForward_(mhUndStructureDate_(startValue));
  var p0End = mhUndStructureBusinessDays_(p0Start, 14);
  var ranges = { P0: { start: p0Start, end: p0End } };
  var cursor = mhUndStructureBusinessDays_(p0End, 1);
  ['M1', 'M2', 'M3'].forEach(function (phase) {
    var monthStart = mhUndStructureForward_(cursor);
    var monthEnd = mhUndStructureBack_(mhUndStructureAddDays_(mhUndStructureAddMonth_(monthStart), -1));
    ranges[phase] = { start: monthStart, end: monthEnd };
    cursor = mhUndStructureAddDays_(monthEnd, 1);
  });
  return ranges;
}

function mhUndStructureTaskDates_(plan, ranges) {
  var range = ranges[mhAsText_(plan.phase)];
  var week = Math.max(1, Number(plan.week || 1));
  if (!range) throw mhApiError_('schema_mismatch', 'unknown_und_task_phase', 500);
  var start;
  var end;
  if (plan.phase === 'P0') {
    start = mhUndStructureBusinessDays_(range.start, (week - 1) * 5);
    end = mhUndStructureBusinessDays_(start, 4);
  } else {
    start = mhUndStructureForward_(mhUndStructureAddDays_(range.start, (week - 1) * 7));
    end = mhUndStructureBack_(mhUndStructureAddDays_(start, 6));
  }
  if (start.getTime() > range.end.getTime()) start = new Date(range.end.getTime());
  if (end.getTime() > range.end.getTime()) end = new Date(range.end.getTime());
  if (end.getTime() < start.getTime()) end = new Date(start.getTime());
  return {
    start: mhUndStructureDateText_(start),
    end: mhUndStructureDateText_(end)
  };
}

function mhSyncUndTaskStructureV34() {
  if (typeof MH_UND_TRACKER_PLAN === 'undefined' || !Array.isArray(MH_UND_TRACKER_PLAN)) {
    throw mhApiError_('setup_required', 'und_tracker_plan_missing', 500);
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) throw mhApiError_('lock_timeout', 'write_lock_timeout', 409);
  try {
    mhUseFreshTables_();
    var projectResult = mhFindRecord_(MH_SHEETS.PROJECTS, 'project_id', MH_UND_STRUCTURE_PROJECT_ID);
    var project = projectResult.row;
    if (!project || mhNonEmpty_(project.archived_at)) throw mhApiError_('not_found', 'und_project_not_found', 404);
    var existingStartDate = mhDateOnly_(project.start_date);
    var existingEndDate = mhDateOnly_(project.end_date);
    var startDate = !existingStartDate || existingStartDate === '2026-08-24'
      ? MH_UND_STRUCTURE_DEFAULT_START : existingStartDate;
    var ranges = mhUndStructurePhaseRanges_(startDate);
    var calculatedEndDate = mhUndStructureDateText_(ranges.M3.end);
    var endDate = !existingEndDate || existingEndDate === '2026-12-14'
      ? calculatedEndDate : existingEndDate;
    var projectChanged = existingStartDate !== startDate || existingEndDate !== endDate;
    if (projectChanged) {
      var projectRecord = {};
      Object.keys(project).forEach(function (key) {
        if (key.indexOf('__') !== 0) projectRecord[key] = project[key];
      });
      projectRecord.start_date = mhUndStructureSheetDate_(startDate);
      projectRecord.end_date = mhUndStructureSheetDate_(endDate);
      projectRecord.updated_at = mhNowIso_();
      projectRecord.row_version = Number(projectRecord.row_version || 0) + 1;
      mhUpdateRecord_(projectResult.table, project.__rowNumber, projectRecord);
    }

    mhUseFreshTables_();
    var sheet = mhSpreadsheet_().getSheetByName(MH_SHEETS.TASKS);
    if (!sheet) throw mhApiError_('sheet_404', 'tasks_sheet_missing', 500);
    var values = sheet.getDataRange().getValues();
    var headers = values[0].map(mhAsText_);
    var rows = mhTrackerObjects_(headers, values).filter(function (row) {
      return mhAsText_(row.project_id) === MH_UND_STRUCTURE_PROJECT_ID &&
        mhAsText_(row.source_code).toUpperCase() === 'APPROVED_PLAN' && !mhNonEmpty_(row.archived_at);
    });
    if (rows.length !== MH_UND_TRACKER_PLAN.length) {
      throw mhApiError_('schema_mismatch', 'und_task_count_mismatch', 500);
    }
    var bySource = {};
    rows.forEach(function (row) {
      var sourceId = mhAsText_(row.source_task_id);
      if (!sourceId || bySource[sourceId]) throw mhApiError_('schema_mismatch', 'duplicate_und_source_task', 500);
      bySource[sourceId] = row;
    });

    var now = mhNowIso_();
    var changedRows = {};
    var changedFields = {};
    function setIfBlank(row, field, value) {
      if (mhNonEmpty_(row[field]) || !mhNonEmpty_(value)) return;
      row[field] = value;
      changedRows[row.__sheetRow] = true;
      changedFields[field] = (changedFields[field] || 0) + 1;
    }
    MH_UND_TRACKER_PLAN.forEach(function (plan) {
      var row = bySource[mhAsText_(plan.id)];
      if (!row) throw mhApiError_('schema_mismatch', 'und_source_task_missing', 500);
      var dates = mhUndStructureTaskDates_(plan, ranges);
      setIfBlank(row, 'description', mhAsText_(plan.category));
      setIfBlank(row, 'planned_start_date', dates.start);
      setIfBlank(row, 'due_date', dates.end);
      setIfBlank(row, 'remarks', mhAsText_(plan.planNote));
      if (changedRows[row.__sheetRow]) {
        row.updated_at = now;
        row.row_version = Number(row.row_version || 0) + 1;
      }
    });

    ['description', 'planned_start_date', 'due_date', 'remarks', 'updated_at', 'row_version'].forEach(function (field) {
      var columnIndex = headers.indexOf(field);
      if (columnIndex < 0) throw mhApiError_('schema_mismatch', 'missing_task_structure_field_' + field, 500);
      var range = sheet.getRange(2, columnIndex + 1, values.length - 1, 1);
      if (range.getFormulas().some(function (line) { return !!line[0]; })) {
        throw mhApiError_('schema_mismatch', 'task_structure_formula_' + field, 500);
      }
      var columnValues = range.getValues();
      rows.forEach(function (row) {
        if (changedRows[row.__sheetRow]) columnValues[row.__sheetRow - 2][0] = row[field];
      });
      range.setValues(columnValues);
    });
    SpreadsheetApp.flush();
    mhInvalidateTableCache_(MH_SHEETS.PROJECTS);
    mhInvalidateTableCache_(MH_SHEETS.TASKS);
    mhInvalidateClientReadCache_(MH_UND_STRUCTURE_PROJECT_ID);
    mhAppendRecord_(MH_SHEETS.ACTIVITY, {
      event_id: mhNewId_('EVT'),
      mutation_id: 'mut_und_structure_v34_' + new Date().getTime(),
      client_id: mhAsText_(project.client_id),
      project_id: MH_UND_STRUCTURE_PROJECT_ID,
      entity_type: 'TASK_PLAN',
      entity_id: MH_UND_STRUCTURE_PROJECT_ID,
      action_code: 'MIGRATE',
      before_json: mhSanitizeLogJson_({ explicitTaskStructure: false }),
      after_json: mhSanitizeLogJson_({ explicitTaskStructure: true, updated: Object.keys(changedRows).length, changedFields: changedFields }),
      actor_user_id: 'SYSTEM',
      actor_role_code: 'SYSTEM',
      event_status_code: 'COMMIT',
      created_at: now,
      archived_at: ''
    });
    return mhAuditUndTaskStructureV34();
  } finally {
    lock.releaseLock();
  }
}

function mhAuditUndTaskStructureV34() {
  mhUseFreshTables_();
  var project = mhFindRecord_(MH_SHEETS.PROJECTS, 'project_id', MH_UND_STRUCTURE_PROJECT_ID).row || {};
  var rows = mhActiveRows_(MH_SHEETS.TASKS).filter(function (row) {
    return mhAsText_(row.project_id) === MH_UND_STRUCTURE_PROJECT_ID &&
      mhAsText_(row.source_code).toUpperCase() === 'APPROVED_PLAN';
  });
  function count(field) { return rows.filter(function (row) { return mhNonEmpty_(row[field]); }).length; }
  var summary = {
    projectId: MH_UND_STRUCTURE_PROJECT_ID,
    projectStartDate: mhDateOnly_(project.start_date) || null,
    projectEndDate: mhDateOnly_(project.end_date) || null,
    total: rows.length,
    withDescription: count('description'),
    withStartDate: count('planned_start_date'),
    withDueDate: count('due_date'),
    withRemarks: count('remarks')
  };
  summary.ok = summary.total === 144 && summary.withDescription === 144 &&
    summary.withStartDate === 144 && summary.withDueDate === 144 &&
    !!summary.projectStartDate && !!summary.projectEndDate;
  return summary;
}
