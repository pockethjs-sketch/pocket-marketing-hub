var MH_PLAN_HEADERS = [
  'plan_id', 'client_id', 'project_id', 'version_label', 'title', 'summary',
  'build_weeks', 'operation_months', 'monthly_output_target', 'initial_output_target',
  'primary_goal', 'status_code', 'effective_at', 'visibility_code', 'source_code',
  'created_at', 'updated_at', 'row_version', 'archived_at'
];

var MH_PLAN_SECTION_HEADERS = [
  'plan_section_id', 'plan_id', 'client_id', 'project_id', 'section_code',
  'nav_label', 'title', 'body_html', 'sort_order', 'status_code',
  'visibility_code', 'source_code', 'created_at', 'updated_at', 'row_version', 'archived_at'
];

/**
 * Self-heals the read-only approved plan tables on the first plan request.
 * The bundled plan has stable IDs, so concurrent/repeated calls remain idempotent.
 */
function mhEnsureUndClientPlanInstalled_() {
  if (typeof MH_UND_CLIENT_PLAN === 'undefined' || !MH_UND_CLIENT_PLAN) return;
  var spreadsheet = mhSpreadsheet_();
  var planSheet = spreadsheet.getSheetByName(MH_SHEETS.PLANS);
  var sectionSheet = spreadsheet.getSheetByName(MH_SHEETS.PLAN_SECTIONS);
  if (!planSheet || !sectionSheet) {
    mhMigrateUndClientPlanV1();
    return;
  }
  mhUseFreshTables_();
  var planId = mhAsText_(MH_UND_CLIENT_PLAN.id);
  var planExists = mhActiveRows_(MH_SHEETS.PLANS).some(function (row) {
    return mhAsText_(row.plan_id) === planId && mhAsText_(row.status_code).toUpperCase() === 'PUBLISHED';
  });
  var installedSections = {};
  mhActiveRows_(MH_SHEETS.PLAN_SECTIONS).forEach(function (row) {
    if (mhAsText_(row.plan_id) === planId && mhAsText_(row.status_code).toUpperCase() === 'PUBLISHED') {
      installedSections[mhAsText_(row.plan_section_id)] = true;
    }
  });
  var sectionsComplete = MH_UND_CLIENT_PLAN.sections.every(function (section) {
    return !!installedSections[mhAsText_(section.id)];
  });
  if (!planExists || !sectionsComplete) mhMigrateUndClientPlanV1();
}

/**
 * Installs the latest approved client-facing UND plan into Google Sheets.
 * Safe to rerun: controlled source fields are updated in place and IDs remain stable.
 */
function mhMigrateUndClientPlanV1() {
  if (typeof MH_UND_CLIENT_PLAN === 'undefined' || !MH_UND_CLIENT_PLAN) {
    throw new Error('MH_UND_CLIENT_PLAN 데이터가 없습니다. UndClientPlan.gs를 확인하세요.');
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) throw new Error('실행계획 원장이 사용 중입니다. 잠시 후 다시 실행하세요.');
  try {
    mhUseFreshTables_();
    var spreadsheet = mhSpreadsheet_();
    var planSheet = mhPlanEnsureSheet_(spreadsheet, MH_SHEETS.PLANS, MH_PLAN_HEADERS);
    var sectionSheet = mhPlanEnsureSheet_(spreadsheet, MH_SHEETS.PLAN_SECTIONS, MH_PLAN_SECTION_HEADERS);
    var now = mhNowIso_();
    var plan = MH_UND_CLIENT_PLAN;
    var projectExists = mhActiveRows_(MH_SHEETS.PROJECTS).some(function (project) {
      return mhAsText_(project.project_id) === mhAsText_(plan.projectId) &&
        mhAsText_(project.client_id) === mhAsText_(plan.clientId);
    });
    if (!projectExists) throw new Error('실행계획의 고객사·프로젝트 범위가 원장과 일치하지 않습니다.');

    var planRecord = {
      plan_id: plan.id,
      client_id: plan.clientId,
      project_id: plan.projectId,
      version_label: plan.versionLabel,
      title: plan.title,
      summary: plan.summary,
      build_weeks: plan.buildWeeks,
      operation_months: plan.operationMonths,
      monthly_output_target: plan.monthlyOutputTarget,
      initial_output_target: plan.initialOutputTarget,
      primary_goal: plan.primaryGoal,
      status_code: plan.statusCode,
      effective_at: plan.effectiveAt,
      visibility_code: 'CLIENT',
      source_code: 'CLIENT_APPROVED_PLAN',
      archived_at: ''
    };
    var planResult = mhPlanUpsert_(planSheet, MH_PLAN_HEADERS, 'plan_id', planRecord, now);

    var sectionResults = plan.sections.map(function (section) {
      return mhPlanUpsert_(sectionSheet, MH_PLAN_SECTION_HEADERS, 'plan_section_id', {
        plan_section_id: section.id,
        plan_id: plan.id,
        client_id: plan.clientId,
        project_id: plan.projectId,
        section_code: section.code,
        nav_label: section.navLabel,
        title: section.title,
        body_html: section.bodyHtml,
        sort_order: section.sortOrder,
        status_code: 'PUBLISHED',
        visibility_code: 'CLIENT',
        source_code: 'CLIENT_APPROVED_PLAN',
        archived_at: ''
      }, now);
    });

    SpreadsheetApp.flush();
    mhInvalidateTableCache_(MH_SHEETS.PLANS);
    mhInvalidateTableCache_(MH_SHEETS.PLAN_SECTIONS);
    mhUseFreshTables_();
    return {
      ok: true,
      plan: planResult,
      sections: sectionResults.length,
      createdSections: sectionResults.filter(function (item) { return item.created; }).length,
      updatedSections: sectionResults.filter(function (item) { return item.updated; }).length,
      sourceFilename: plan.sourceFilename
    };
  } finally {
    lock.releaseLock();
  }
}

function mhPlanEnsureSheet_(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eefbf6');
    return sheet;
  }
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }
  var current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(mhAsText_);
  headers.forEach(function (header) {
    if (current.indexOf(header) >= 0) return;
    current.push(header);
    sheet.getRange(1, current.length).setValue(header);
  });
  return sheet;
}

function mhPlanUpsert_(sheet, headers, idField, record, now) {
  var values = sheet.getDataRange().getValues();
  var sheetHeaders = values[0].map(mhAsText_);
  var idColumn = sheetHeaders.indexOf(idField);
  if (idColumn < 0) throw new Error(sheet.getName() + '에 ' + idField + ' 열이 없습니다.');
  var targetRow = 0;
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (mhAsText_(values[rowIndex][idColumn]) === mhAsText_(record[idField])) {
      targetRow = rowIndex + 1;
      break;
    }
  }
  var existing = {};
  if (targetRow) {
    sheetHeaders.forEach(function (header, columnIndex) {
      existing[header] = values[targetRow - 1][columnIndex];
    });
  }
  var changed = !targetRow || Object.keys(record).some(function (field) {
    return mhStableJson_(mhToIsoValue_(existing[field])) !== mhStableJson_(mhToIsoValue_(record[field]));
  });
  if (!changed) return { id: record[idField], created: false, updated: false };

  var next = {};
  sheetHeaders.forEach(function (header) { next[header] = targetRow ? existing[header] : ''; });
  Object.keys(record).forEach(function (field) { next[field] = record[field]; });
  next.created_at = targetRow && existing.created_at ? existing.created_at : now;
  next.updated_at = now;
  next.row_version = targetRow ? Number(existing.row_version || 0) + 1 : 1;
  var rowValues = sheetHeaders.map(function (header) {
    return next[header] === undefined || next[header] === null ? '' : next[header];
  });
  if (targetRow) sheet.getRange(targetRow, 1, 1, sheetHeaders.length).setValues([rowValues]);
  else sheet.appendRow(rowValues);
  return { id: record[idField], created: !targetRow, updated: !!targetRow };
}
