/**
 * One-time, idempotent migration for the approved 144-row UND tracker.
 *
 * Matching deliberately does not trust source_task_id first because the new
 * plan inserted rows in the middle and shifted several identifiers. Existing
 * operational state is preserved by matching phase + workstream + title, then
 * using source_task_id only for the four explicitly renamed SmartPlace rows.
 */
function mhMigrateUndTrackerV2() {
  var projectId = 'PRJ-UND-90D-001';
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) throw new Error('업무 원장이 사용 중입니다. 잠시 후 다시 실행하세요.');
  try {
    mhUseFreshTables_();
    var spreadsheet = mhSpreadsheet_();
    var sheet = spreadsheet.getSheetByName(MH_SHEETS.TASKS);
    if (!sheet) throw new Error(MH_SHEETS.TASKS + ' 탭이 없습니다.');
    var headers = mhTrackerEnsureHeaders_(sheet, ['plan_week', 'plan_note']);
    var values = sheet.getDataRange().getValues();
    headers = values[0].map(mhAsText_);
    var existing = mhTrackerObjects_(headers, values).filter(function (row) {
      return mhAsText_(row.project_id) === projectId && !mhNonEmpty_(row.archived_at) &&
        (mhAsText_(row.source_code).toUpperCase() === 'APPROVED_PLAN' ||
          /^(P0|M[123])-(MKT|DSN|VID)-/.test(mhAsText_(row.source_task_id)));
    });
    var project = mhActiveRows_(MH_SHEETS.PROJECTS).filter(function (row) {
      return mhAsText_(row.project_id) === projectId;
    })[0];
    if (!project) throw new Error('UND 프로젝트를 찾을 수 없습니다: ' + projectId);

    var exact = {};
    var bySource = {};
    existing.forEach(function (row) {
      var exactKey = mhTrackerExactKey_(row.phase_code, row.workstream_code, row.title);
      if (exact[exactKey]) throw new Error('기존 업무 제목이 중복됩니다: ' + row.title);
      exact[exactKey] = row;
      var sourceKey = mhAsText_(row.source_task_id);
      if (sourceKey) {
        if (bySource[sourceKey]) throw new Error('기존 source_task_id가 중복됩니다: ' + sourceKey);
        bySource[sourceKey] = row;
      }
    });

    var usedRows = {};
    var matchByPlanId = {};
    var matches = [];
    var created = [];
    var exactMatches = 0;
    var renamedMatches = 0;
    var now = mhNowIso_();

    // Pass 1: reserve every exact semantic match before looking at shifted
    // source IDs. Without this pass an inserted task could steal the row of a
    // later exact match merely because its new ID equals that old row's ID.
    MH_UND_TRACKER_PLAN.forEach(function (plan) {
      var exactKey = mhTrackerExactKey_(plan.phase, plan.team, plan.title);
      var row = exact[exactKey];
      if (row && !usedRows[row.__sheetRow]) {
        exactMatches += 1;
        usedRows[row.__sheetRow] = true;
        matchByPlanId[plan.id] = row;
      }
    });
    // Pass 2: only the four renamed SmartPlace rows may now fall back to the
    // same source ID. All genuinely new plan rows are created afterward.
    MH_UND_TRACKER_PLAN.forEach(function (plan) {
      if (matchByPlanId[plan.id]) return;
      var row = bySource[plan.id];
      if (row && !usedRows[row.__sheetRow]) {
        renamedMatches += 1;
        usedRows[row.__sheetRow] = true;
        matchByPlanId[plan.id] = row;
      }
    });
    MH_UND_TRACKER_PLAN.forEach(function (plan) {
      var row = matchByPlanId[plan.id];
      if (row) matches.push({ row: row, plan: plan });
      else created.push(mhTrackerNewTask_(project, plan, now));
    });

    var unmatchedExisting = existing.filter(function (row) { return !usedRows[row.__sheetRow]; });
    if (unmatchedExisting.length) {
      throw new Error('자동 병합되지 않은 기존 업무가 있습니다: ' + unmatchedExisting.map(function (row) {
        return mhAsText_(row.source_task_id) + ' ' + mhAsText_(row.title);
      }).join(' / '));
    }
    if (matches.length + created.length !== 144 || (existing.length === 103 && renamedMatches !== 4)) {
      throw new Error('마이그레이션 사전 검증 실패: matches=' + matches.length + ', created=' +
        created.length + ', renamed=' + renamedMatches);
    }

    var controlledFields = [
      'source_task_id', 'phase_code', 'workstream_code', 'category_code',
      'title', 'plan_week', 'plan_note', 'source_code', 'visibility_code', 'sort_order'
    ];
    var changedRows = {};
    var changedFields = {};
    matches.forEach(function (match) {
      var next = mhTrackerPlanFields_(match.plan);
      controlledFields.forEach(function (field) {
        if (mhStableJson_(mhToIsoValue_(match.row[field])) === mhStableJson_(mhToIsoValue_(next[field]))) return;
        match.row[field] = next[field];
        changedRows[match.row.__sheetRow] = true;
        changedFields[field] = (changedFields[field] || 0) + 1;
      });
    });
    matches.forEach(function (match) {
      if (!changedRows[match.row.__sheetRow]) return;
      match.row.updated_at = now;
      match.row.row_version = Number(match.row.row_version || 0) + 1;
    });

    var fieldWrites = controlledFields.concat(['updated_at', 'row_version']);
    fieldWrites.forEach(function (field) {
      var columnIndex = headers.indexOf(field);
      if (columnIndex < 0) throw new Error('필수 열이 없습니다: ' + field);
      var rowCount = Math.max(values.length - 1, 0);
      if (!rowCount) return;
      var range = sheet.getRange(2, columnIndex + 1, rowCount, 1);
      if (range.getFormulas().some(function (line) { return !!line[0]; })) {
        throw new Error('마이그레이션 대상 열에 수식이 있습니다: ' + field);
      }
      var columnValues = range.getValues();
      matches.forEach(function (match) {
        if (!changedRows[match.row.__sheetRow]) return;
        columnValues[match.row.__sheetRow - 2][0] = match.row[field];
      });
      range.setValues(columnValues);
    });

    if (created.length) {
      var appendValues = created.map(function (record) {
        return headers.map(function (header) {
          return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
        });
      });
      sheet.getRange(sheet.getLastRow() + 1, 1, appendValues.length, headers.length).setValues(appendValues);
    }
    SpreadsheetApp.flush();
    mhInvalidateTableCache_(MH_SHEETS.TASKS);
    var templateResult = mhSyncUndTrackerTemplateV2_(spreadsheet, now);
    mhTrackerWriteMigrationLog_(project, {
      beforeCount: existing.length,
      afterCount: 144,
      exactMatches: exactMatches,
      renamedMatches: renamedMatches,
      created: created.length,
      updated: Object.keys(changedRows).length,
      changedFields: changedFields,
      template: templateResult
    });

    var audit = mhAuditUndTrackerV2();
    if (!audit.ready) throw new Error('저장 후 검증 실패: ' + JSON.stringify(audit));
    return {
      ok: true,
      projectId: projectId,
      exactMatches: exactMatches,
      renamedMatches: renamedMatches,
      created: created.length,
      updated: Object.keys(changedRows).length,
      changedFields: changedFields,
      template: templateResult,
      audit: audit
    };
  } finally {
    lock.releaseLock();
  }
}

function mhAuditUndTrackerV2() {
  mhUseFreshTables_();
  var projectId = 'PRJ-UND-90D-001';
  var rows = mhActiveRows_(MH_SHEETS.TASKS).filter(function (row) {
    return mhAsText_(row.project_id) === projectId &&
      mhAsText_(row.source_code).toUpperCase() === 'APPROVED_PLAN';
  });
  var bySource = {};
  var duplicateSourceIds = [];
  rows.forEach(function (row) {
    var key = mhAsText_(row.source_task_id);
    if (bySource[key]) duplicateSourceIds.push(key);
    bySource[key] = row;
  });
  var missing = MH_UND_TRACKER_PLAN.filter(function (plan) { return !bySource[plan.id]; }).map(function (plan) {
    return plan.id;
  });
  var mismatched = MH_UND_TRACKER_PLAN.filter(function (plan) {
    var row = bySource[plan.id];
    return row && mhTrackerExactKey_(row.phase_code, row.workstream_code, row.title) !==
      mhTrackerExactKey_(plan.phase, plan.team, plan.title);
  }).map(function (plan) { return plan.id; });
  var plannedIds = {};
  MH_UND_TRACKER_PLAN.forEach(function (plan) { plannedIds[plan.id] = true; });
  var extra = rows.filter(function (row) { return !plannedIds[mhAsText_(row.source_task_id)]; }).map(function (row) {
    return mhAsText_(row.source_task_id);
  });
  var phases = mhGroupCounts_(rows, 'phase_code');
  var teams = mhGroupCounts_(rows, 'workstream_code');
  var expectedPhases = [
    { code: 'M1', count: 31 }, { code: 'M2', count: 28 },
    { code: 'M3', count: 28 }, { code: 'P0', count: 57 }
  ];
  var expectedTeams = [
    { code: 'DSN', count: 35 }, { code: 'MKT', count: 79 }, { code: 'VID', count: 30 }
  ];
  var template = mhSpreadsheet_().getSheetByName('91_업무템플릿');
  var templateHeaders = [];
  var templateRows = [];
  if (template) {
    var templateValues = template.getDataRange().getValues();
    templateHeaders = templateValues[0].map(mhAsText_);
    templateRows = mhTrackerObjects_(templateHeaders, templateValues).filter(function (row) {
      return mhAsText_(row.source_code).toUpperCase() === 'APPROVED_PLAN' &&
        /^(P0|M[123])-(MKT|DSN|VID)-/.test(mhAsText_(row.source_task_id));
    });
  }
  var templateIds = {};
  templateRows.forEach(function (row) { templateIds[mhAsText_(row.source_task_id)] = true; });
  var templateMissing = MH_UND_TRACKER_PLAN.filter(function (plan) { return !templateIds[plan.id]; }).map(function (plan) {
    return plan.id;
  });
  var templateReady = !template || (templateRows.length === 144 && !templateMissing.length);
  var ready = rows.length === 144 && !missing.length && !mismatched.length && !extra.length &&
    !duplicateSourceIds.length && mhStableJson_(phases) === mhStableJson_(expectedPhases) &&
    mhStableJson_(teams) === mhStableJson_(expectedTeams) && templateReady;
  return {
    ready: ready,
    count: rows.length,
    missing: missing,
    mismatched: mismatched,
    extra: extra,
    duplicateSourceIds: duplicateSourceIds,
    phases: phases,
    workstreams: teams,
    templateCount: templateRows.length,
    templateMissing: templateMissing,
    templateHeaders: templateHeaders
  };
}

function mhTrackerEnsureHeaders_(sheet, required) {
  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(mhAsText_);
  required.forEach(function (header) {
    if (headers.indexOf(header) >= 0) return;
    lastColumn += 1;
    sheet.getRange(1, lastColumn).setValue(header);
    headers.push(header);
  });
  var planWeekColumn = headers.indexOf('plan_week') + 1;
  if (planWeekColumn > 0 && sheet.getMaxRows() > 1) {
    // Appended columns may inherit a date format from the adjacent ledger
    // column. Force an integer format so week 1 is not read back as 1899-12-31.
    sheet.getRange(2, planWeekColumn, sheet.getMaxRows() - 1, 1).setNumberFormat('0');
  }
  SpreadsheetApp.flush();
  return headers;
}

function mhTrackerObjects_(headers, values) {
  var rows = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (!mhNonEmpty_(values[rowIndex][0])) continue;
    var row = { __sheetRow: rowIndex + 1 };
    headers.forEach(function (header, columnIndex) {
      if (header) row[header] = values[rowIndex][columnIndex];
    });
    rows.push(row);
  }
  return rows;
}

function mhTrackerExactKey_(phase, team, title) {
  return [mhAsText_(phase), mhAsText_(team), mhAsText_(title).replace(/\s+/g, ' ')].join('|');
}

function mhTrackerPlanFields_(plan) {
  return {
    source_task_id: plan.id,
    phase_code: plan.phase,
    workstream_code: plan.team,
    category_code: plan.category,
    title: plan.title,
    plan_week: Number(plan.week || 0),
    plan_note: plan.planNote || '',
    source_code: 'APPROVED_PLAN',
    visibility_code: 'CLIENT',
    sort_order: Number(plan.sortOrder || 0)
  };
}

function mhTrackerNewTask_(project, plan, now) {
  var record = mhTrackerPlanFields_(plan);
  record.task_id = mhNewId_('TSK');
  record.client_id = mhAsText_(project.client_id);
  record.project_id = mhAsText_(project.project_id);
  record.parent_task_id = '';
  record.description = '';
  record.responsible_org_code = 'POCKET';
  record.assignee_user_id = '';
  record.reviewer_org_code = 'CLIENT';
  record.status_code = 'NOT_STARTED';
  record.priority_code = 'NORMAL';
  record.planned_start_date = '';
  record.due_date = '';
  record.completed_at = '';
  record.blocker_reason = '';
  record.customer_status_text = '예정';
  record.created_at = now;
  record.updated_at = now;
  record.row_version = 1;
  record.archived_at = '';
  return record;
}

function mhTrackerWriteMigrationLog_(project, summary) {
  mhInvalidateTableCache_(MH_SHEETS.ACTIVITY);
  mhAppendRecord_(MH_SHEETS.ACTIVITY, {
    event_id: mhNewId_('EVT'),
    mutation_id: 'mut_und_tracker_v2_' + new Date().getTime(),
    client_id: mhAsText_(project.client_id),
    project_id: mhAsText_(project.project_id),
    entity_type: 'TASK_PLAN',
    entity_id: mhAsText_(project.project_id),
    action_code: 'MIGRATE',
    before_json: mhSanitizeLogJson_({ approvedPlanCount: summary.beforeCount }),
    after_json: mhSanitizeLogJson_(summary),
    actor_user_id: 'SYSTEM',
    actor_role_code: 'SYSTEM',
    event_status_code: 'COMMIT',
    created_at: mhNowIso_(),
    archived_at: ''
  });
}

function mhSyncUndTrackerTemplateV2_(spreadsheet, now) {
  var sheet = spreadsheet.getSheetByName('91_업무템플릿');
  if (!sheet) return { skipped: true, reason: 'sheet_missing' };
  mhTrackerEnsureHeaders_(sheet, ['source_task_id', 'plan_week', 'plan_note']);
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(mhAsText_);
  var rows = mhTrackerObjects_(headers, values).filter(function (row) {
    var phase = mhAsText_(row.phase_code);
    var team = mhAsText_(row.workstream_code);
    return /^(P0|M[123])$/.test(phase) && /^(MKT|DSN|VID)$/.test(team) &&
      (mhAsText_(row.source_code).toUpperCase() === 'APPROVED_PLAN' ||
        /UND/i.test(mhAsText_(row.template_code)));
  });
  if (!rows.length) return { skipped: true, reason: 'approved_template_not_found' };
  if ([103, 144].indexOf(rows.length) < 0) {
    throw new Error('91_업무템플릿의 UND 승인 업무 수를 확인하세요: ' + rows.length);
  }
  var sample = rows[0];
  var exact = {};
  rows.forEach(function (row) {
    var key = mhTrackerExactKey_(row.phase_code, row.workstream_code, row.title);
    if (exact[key]) throw new Error('업무 템플릿 제목이 중복됩니다: ' + row.title);
    exact[key] = row;
  });
  var used = {};
  var matches = [];
  var created = [];
  MH_UND_TRACKER_PLAN.forEach(function (plan) {
    var row = exact[mhTrackerExactKey_(plan.phase, plan.team, plan.title)];
    if (!row) {
      var legacyTitle = plan.phase === 'P0'
        ? '스마트플레이스 등록·최적화 (남양주·강남)'
        : '스마트플레이스 갱신 1회 (남양주·강남)';
      if (/스마트플레이스/.test(plan.title)) {
        row = exact[mhTrackerExactKey_(plan.phase, plan.team, legacyTitle)];
      }
    }
    if (row && !used[row.__sheetRow]) {
      used[row.__sheetRow] = true;
      matches.push({ row: row, plan: plan });
    } else {
      created.push(mhTrackerNewTemplateTask_(sample, plan, now));
    }
  });
  var extra = rows.filter(function (row) { return !used[row.__sheetRow]; });
  if (extra.length || matches.length + created.length !== 144) {
    throw new Error('91_업무템플릿 자동 병합 실패: extra=' + extra.length + ', created=' + created.length);
  }
  var fields = [
    'source_task_id', 'phase_code', 'workstream_code', 'category_code', 'title',
    'plan_week', 'plan_note', 'sort_order', 'active', 'source_code', 'updated_at'
  ];
  var changed = {};
  matches.forEach(function (match) {
    var next = mhTrackerTemplateFields_(match.plan);
    Object.keys(next).forEach(function (field) {
      if (mhStableJson_(mhToIsoValue_(match.row[field])) === mhStableJson_(mhToIsoValue_(next[field]))) return;
      match.row[field] = next[field];
      changed[match.row.__sheetRow] = true;
    });
    if (changed[match.row.__sheetRow]) match.row.updated_at = now;
  });
  fields.forEach(function (field) {
    var columnIndex = headers.indexOf(field);
    if (columnIndex < 0) throw new Error('91_업무템플릿 필수 열이 없습니다: ' + field);
    var rowCount = Math.max(values.length - 1, 0);
    if (!rowCount) return;
    var range = sheet.getRange(2, columnIndex + 1, rowCount, 1);
    if (range.getFormulas().some(function (line) { return !!line[0]; })) {
      throw new Error('91_업무템플릿 대상 열에 수식이 있습니다: ' + field);
    }
    var columnValues = range.getValues();
    matches.forEach(function (match) {
      if (!changed[match.row.__sheetRow]) return;
      columnValues[match.row.__sheetRow - 2][0] = match.row[field];
    });
    range.setValues(columnValues);
  });
  if (created.length) {
    var appendValues = created.map(function (record) {
      return headers.map(function (header) {
        return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
      });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, appendValues.length, headers.length).setValues(appendValues);
  }
  SpreadsheetApp.flush();
  return { skipped: false, before: rows.length, after: 144, created: created.length, updated: Object.keys(changed).length };
}

function mhTrackerTemplateFields_(plan) {
  return {
    source_task_id: plan.id,
    phase_code: plan.phase,
    workstream_code: plan.team,
    category_code: plan.category,
    title: plan.title,
    plan_week: Number(plan.week || 0),
    plan_note: plan.planNote || '',
    sort_order: Number(plan.sortOrder || 0),
    active: true,
    source_code: 'APPROVED_PLAN'
  };
}

function mhTrackerNewTemplateTask_(sample, plan, now) {
  var record = mhTrackerTemplateFields_(plan);
  record.template_task_id = mhNewId_('TPL');
  record.template_code = sample.template_code;
  record.service_type_code = sample.service_type_code;
  record.default_responsible_org_code = sample.default_responsible_org_code || 'POCKET';
  record.default_reviewer_org_code = sample.default_reviewer_org_code || 'CLIENT';
  record.default_priority_code = sample.default_priority_code || 'NORMAL';
  record.default_visibility_code = sample.default_visibility_code || 'CLIENT';
  record.created_at = now;
  record.updated_at = now;
  return record;
}
