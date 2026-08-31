function mhHandleMutation_(request, actor) {
  // Writes must never trust the short-lived read cache. Invalidate once, then
  // reuse the freshly read tables for the remainder of this execution.
  mhBeginMutationTables_();
  var mutation = request.mutation || request;
  var mutationId = mhAsText_(mutation.mutationId || mutation.mutation_id);
  var entityType = mhAsText_(mutation.entityType || mutation.entity_type).toLowerCase();
  var operation = mhAsText_(mutation.operation).toUpperCase();
  var projectId = mhAsText_(mutation.projectId || mutation.project_id);
  var spec = MH_ENTITY_SPECS[entityType];

  if (!/^mut_[A-Za-z0-9_-]{8,120}$/i.test(mutationId)) {
    throw mhApiError_('validation_error', 'invalid_mutation_id', 400);
  }
  if (!spec || ['CREATE', 'UPDATE', 'ARCHIVE'].indexOf(operation) < 0 ||
      (spec.operations && spec.operations.indexOf(operation) < 0) || !projectId) {
    throw mhApiError_('invalid_request', 'invalid_mutation_shape', 400);
  }
  if (actor.role === 'CLIENT_VIEWER' && entityType === 'task' && MH_PUBLIC_TASK_WRITES_ENABLED) {
    actor.allowPreviewTaskWrite = true;
  }
  var requestHash = mhMutationRequestHash_(entityType, operation, projectId, mutation, actor.userId);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MH_LOCK_TIMEOUT_MS)) throw mhApiError_('lock_timeout', 'write_lock_timeout', 409);
  try {
    var access = mhRequireProjectAccess_(actor, projectId, true);
    var scope = mhScopeForProject_(actor, access.project);
    var mutationLogs = mhFindMutationLogs_(mutationId);
    var mutationState = mutationLogs.commit || mutationLogs.prepare;
    if (mutationState && (
      mhAsText_(mutationState.entity_type).toLowerCase() !== entityType ||
      mhAsText_(mutationState.action_code) !== mhMutationActionCode_(operation)
    )) {
      throw mhApiError_('conflict', 'mutation_id_reused_for_different_operation', 409);
    }
    if (mutationLogs.commit) {
      if (mhAsText_(mutationState.project_id) !== projectId) {
        throw mhApiError_('forbidden', 'mutation_scope_mismatch', 403);
      }
      mhAssertMutationRequestHash_(mutationState, requestHash);
      return { scope: scope, data: mhMutationReplay_(mutationState, actor) };
    }
    if (mutationLogs.prepare) {
      if (mhAsText_(mutationState.project_id) !== projectId) {
        throw mhApiError_('forbidden', 'mutation_scope_mismatch', 403);
      }
      mhAssertMutationRequestHash_(mutationState, requestHash);
      var recovered = mhRecoverPreparedMutation_(mutationState, actor, access.project, requestHash);
      if (recovered) return { scope: scope, data: recovered };
    }
    var result = mhApplyMutationLocked_(mutationId, entityType, operation, mutation, actor, access.project, requestHash);
    return { scope: scope, data: result };
  } finally {
    lock.releaseLock();
  }
}

function mhApplyMutationLocked_(mutationId, entityType, operation, mutation, actor, project, requestHash) {
  var spec = MH_ENTITY_SPECS[entityType];
  var fields = mutation.fields && typeof mutation.fields === 'object' ? mutation.fields : {};
  var id = mhAsText_(mutation.id || mutation.recordId || mutation.record_id);
  var existingResult = id ? mhFindRecord_(spec.sheet, spec.idField, id) : null;
  var before = existingResult && existingResult.row ? existingResult.row : null;
  var now = mhNowIso_();
  var after;

  if (operation === 'CREATE') {
    if (id) throw mhApiError_('validation_error', 'client_generated_record_id_not_allowed', 400);
    after = {};
    after[spec.idField] = mhNewId_(spec.idPrefix);
    after.client_id = mhAsText_(project.client_id);
    after.project_id = mhAsText_(project.project_id);
    mhAssertApproverAssignmentAllowed_(entityType, fields, null, actor);
    mhApplyAllowedFields_(after, fields, spec, actor);
    mhApplyCreateDefaults_(after, entityType, actor, now);
    mhValidateMutationRecord_(after, spec, entityType, actor, project, null);
  } else {
    if (!before || mhNonEmpty_(before.archived_at)) throw mhApiError_('not_found', 'record_not_found', 404);
    if (mhAsText_(before.project_id) !== mhAsText_(project.project_id)) {
      throw mhApiError_('forbidden', 'record_scope_mismatch', 403);
    }
    if (entityType === 'project' && ['MASTER', 'POCKET_MANAGER', 'POCKET_EDITOR'].indexOf(actor.role) < 0) {
      throw mhApiError_('forbidden', 'project_update_requires_internal_user', 403);
    }
    if (entityType !== 'project' && entityType !== 'kpi_definition' && !mhCanSeeRow_(actor, before)) {
      throw mhApiError_('forbidden', 'record_visibility_denied', 403);
    }
    if (actor.role === 'EXECUTOR_EDITOR' && mhNormalizeVisibility_(before.visibility_code) === 'CLIENT') {
      throw mhApiError_('forbidden', 'client_visible_record_requires_pocket', 403);
    }
    var expectedVersion = Number(mutation.expectedRowVersion || mutation.expected_row_version);
    var currentVersion = Number(before.row_version || 0);
    if (!isFinite(expectedVersion) || expectedVersion !== currentVersion) {
      throw mhApiError_('conflict', 'row_version_conflict', 409);
    }
    after = mhCopyRecord_(before);
    if (operation === 'UPDATE') {
      if (!Object.keys(fields).length) throw mhApiError_('validation_error', 'empty_update', 400);
      mhAssertApproverAssignmentAllowed_(entityType, fields, before, actor);
      mhApplyAllowedFields_(after, fields, spec, actor);
    }
    if (operation === 'ARCHIVE') after.archived_at = now;
    after.updated_at = now;
    after.row_version = currentVersion + 1;
    mhValidateMutationRecord_(after, spec, entityType, actor, project, before);
  }

  var prepareLog = mhActivityRecord_(
    mutationId, entityType, mhAsText_(after[spec.idField]), operation,
    before, after, actor, project, 'PREPARE', now, requestHash
  );
  mhAppendRecord_(MH_SHEETS.ACTIVITY, prepareLog);

  try {
    if (operation === 'CREATE') {
      mhAppendRecord_(spec.sheet, after);
    } else {
      mhUpdateRecord_(existingResult.table, before.__rowNumber, after);
    }
    var commitLog = mhActivityRecord_(
      mutationId, entityType, mhAsText_(after[spec.idField]), operation,
      before, after, actor, project, 'COMMIT', mhNowIso_(), requestHash
    );
    mhAppendRecord_(MH_SHEETS.ACTIVITY, commitLog);
    return {
      mutationId: mutationId,
      duplicate: false,
      entityType: entityType,
      operation: operation,
      record: mhMutationResponseRecord_(after, spec, actor)
    };
  } catch (error) {
    try {
      var failedLog = mhActivityRecord_(
        mutationId, entityType, mhAsText_(after[spec.idField]), operation,
        before, { error_code: error.apiCode || 'write_failed' }, actor, project,
        'FAILED', mhNowIso_(), requestHash
      );
      mhAppendRecord_(MH_SHEETS.ACTIVITY, failedLog);
    } catch (ignored) {}
    throw error;
  }
}

function mhApplyAllowedFields_(target, fields, spec, actor) {
  Object.keys(fields || {}).forEach(function (field) {
    if (spec.fields.indexOf(field) < 0) {
      throw mhApiError_('validation_error', 'field_not_allowed', 400);
    }
    target[field] = mhCleanFieldValue_(field, fields[field]);
  });
  if (mhNonEmpty_(target.visibility_code)) {
    var visibility = mhNormalizeVisibility_(target.visibility_code);
    if (['POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT'].indexOf(visibility) < 0) {
      throw mhApiError_('validation_error', 'invalid_visibility', 400);
    }
    var actorLevel = MH_ROLE_VISIBILITY_LEVEL[actor.role] || 0;
    if ((MH_VISIBILITY_LEVEL[visibility] || 99) > actorLevel) {
      throw mhApiError_('forbidden', 'visibility_outside_role', 403);
    }
    if (actor.role === 'EXECUTOR_EDITOR' && visibility === 'CLIENT') {
      throw mhApiError_('forbidden', 'client_disclosure_requires_pocket', 403);
    }
    target.visibility_code = visibility;
  }
}

function mhApplyCreateDefaults_(record, entityType, actor, now) {
  record.created_at = now;
  record.updated_at = now;
  record.row_version = 1;
  record.archived_at = '';
  if (entityType === 'task') {
    record.source_code = 'MANUAL';
    if (!mhNonEmpty_(record.sort_order)) record.sort_order = 9999;
  }
  if (entityType === 'content' && !mhNonEmpty_(record.current_version_no)) {
    record.current_version_no = 1;
  }
  if (entityType === 'approval') record.requested_by_user_id = actor.userId;
  if (entityType === 'file') record.uploaded_by_user_id = actor.userId;
  if (entityType === 'kpi_definition') {
    if (!mhNonEmpty_(record.metric_code)) {
      record.metric_code = 'CUSTOM_' + mhAsText_(record.kpi_id).replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
    }
    if (!mhNonEmpty_(record.phase_code)) record.phase_code = 'ALL';
    if (!mhNonEmpty_(record.aggregation_code)) record.aggregation_code = 'SUM';
    if (!mhNonEmpty_(record.display_order)) record.display_order = 999;
    if (record.customer_visible === '' || record.customer_visible === null || record.customer_visible === undefined) {
      record.customer_visible = true;
    }
  }
}

function mhValidateMutationRecord_(record, spec, entityType, actor, project, before) {
  spec.required.forEach(function (field) {
    if (!mhNonEmpty_(record[field]) && record[field] !== 0) {
      throw mhApiError_('validation_error', 'required_field_missing', 400);
    }
  });
  if (mhAsText_(record.client_id) !== mhAsText_(project.client_id) ||
      mhAsText_(record.project_id) !== mhAsText_(project.project_id)) {
    throw mhApiError_('forbidden', 'record_scope_mismatch', 403);
  }
  mhValidateRecordFieldTypes_(record, entityType);
  mhValidateStatusTransition_(record, before, entityType);
  mhValidateApprovalTransition_(record, before, entityType, actor);
  ['start_date', 'planned_start_date', 'due_date', 'planned_date', 'shoot_date', 'review_due_date', 'publish_due_date'].forEach(function (field) {
    if (!mhNonEmpty_(record[field])) return;
    // Sheets returns date-formatted cells as Date objects. Normalize them to
    // the business date before validating or any unrelated task edit will be
    // rejected as an invalid ISO date.
    var dateText = mhDateOnly_(record[field]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      throw mhApiError_('validation_error', 'invalid_date', 400);
    }
    record[field] = dateText;
  });
  ['current_version_no', 'sort_order', 'baseline_value', 'target_value', 'display_order'].forEach(function (field) {
    if (mhNonEmpty_(record[field]) && (!isFinite(Number(record[field])) || Number(record[field]) < 0)) {
      throw mhApiError_('validation_error', 'invalid_number', 400);
    }
  });
  ['publish_url', 'url'].forEach(function (field) {
    if (!mhNonEmpty_(record[field])) return;
    if (!/^https:\/\//i.test(mhAsText_(record[field]))) {
      throw mhApiError_('validation_error', 'https_url_required', 400);
    }
  });
  if (mhNonEmpty_(record.assignee_user_id)) mhRequireActiveUser_(record.assignee_user_id);
  if (entityType === 'task' && mhNonEmpty_(record.parent_task_id)) {
    mhRequireEntityReference_('task', record.parent_task_id, project);
  }
  if (entityType === 'content' && mhNonEmpty_(record.task_id)) {
    mhRequireEntityReference_('task', record.task_id, project);
  }
  if ((entityType === 'approval' || entityType === 'file') && mhNonEmpty_(record.entity_type)) {
    mhRequireLinkedEntity_(record.entity_type, record.entity_id, project);
  }
  if (entityType === 'approval' && mhNonEmpty_(record.approver_user_id)) {
    mhRequireProjectMember_(record.approver_user_id, project);
  }
}

function mhAssertApproverAssignmentAllowed_(entityType, fields, before, actor) {
  if (entityType !== 'approval' || !Object.prototype.hasOwnProperty.call(fields || {}, 'approver_user_id')) return;
  var changed = !before || mhAsText_(fields.approver_user_id) !== mhAsText_(before.approver_user_id);
  if (!changed) return;
  if (actor.role !== 'MASTER' && actor.role !== 'POCKET_MANAGER') {
    throw mhApiError_('forbidden', 'approver_assignment_requires_manager', 403);
  }
}

function mhRequireProjectMember_(userId, project) {
  mhRequireActiveUser_(userId);
  var matches = mhActiveRows_(MH_SHEETS.MEMBERSHIPS).filter(function (row) {
    return mhAsText_(row.user_id) === mhAsText_(userId) &&
      mhAsText_(row.client_id) === mhAsText_(project.client_id) &&
      (!mhAsText_(row.project_id) || mhAsText_(row.project_id) === mhAsText_(project.project_id)) &&
      mhAsText_(row.status_code).toUpperCase() === 'ACTIVE' &&
      MH_READ_PERMISSIONS[mhAsText_(row.permission_code).toUpperCase()];
  });
  if (matches.length !== 1) throw mhApiError_('validation_error', 'approver_project_membership_invalid', 400);
}

function mhCleanFieldValue_(field, value) {
  if (value === null || value === undefined) return '';
  if (['current_version_no', 'sort_order', 'plan_week', 'baseline_value', 'target_value', 'display_order'].indexOf(field) >= 0) {
    var numeric = Number(value);
    if (!isFinite(numeric)) throw mhApiError_('validation_error', 'invalid_number', 400);
    return numeric;
  }
  if (field === 'customer_visible') {
    if (value === true || value === false) return value;
    var booleanText = mhAsText_(value).toLowerCase();
    if (['true', '1', 'y', 'yes'].indexOf(booleanText) >= 0) return true;
    if (['false', '0', 'n', 'no'].indexOf(booleanText) >= 0) return false;
    throw mhApiError_('validation_error', 'invalid_boolean', 400);
  }
  if (typeof value !== 'string') throw mhApiError_('validation_error', 'invalid_field_type', 400);
  var text = value.trim();
  if (text.length > 10000) throw mhApiError_('validation_error', 'field_too_long', 400);
  // Prevent spreadsheet formula injection for user-entered text.
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function mhValidateRecordFieldTypes_(record, entityType) {
  var enumChecks = [];
  if (mhNonEmpty_(record.visibility_code)) enumChecks.push(['visibility_code', MH_FIELD_ENUMS.visibility_code]);
  if (entityType === 'task') {
    if (mhNonEmpty_(record.status_code)) enumChecks.push(['status_code', MH_FIELD_ENUMS.task_status_code]);
    if (mhNonEmpty_(record.priority_code)) enumChecks.push(['priority_code', MH_FIELD_ENUMS.priority_code]);
  }
  if (entityType === 'content' && mhNonEmpty_(record.status_code)) {
    enumChecks.push(['status_code', MH_FIELD_ENUMS.content_status_code]);
  }
  if (entityType === 'approval') {
    if (mhNonEmpty_(record.entity_type)) enumChecks.push(['entity_type', MH_FIELD_ENUMS.approval_entity_type]);
    if (mhNonEmpty_(record.status_code)) enumChecks.push(['status_code', MH_FIELD_ENUMS.approval_status_code]);
  }
  if (entityType === 'file' && mhNonEmpty_(record.entity_type)) {
    enumChecks.push(['entity_type', MH_FIELD_ENUMS.linked_entity_type]);
  }
  if (entityType === 'kpi_definition') {
    if (mhNonEmpty_(record.unit_code)) enumChecks.push(['unit_code', ['COUNT', 'PEOPLE', 'KRW', 'PERCENT', 'RATE', 'VIEW']]);
    if (mhNonEmpty_(record.period_type_code)) enumChecks.push(['period_type_code', ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY']]);
    if (mhNonEmpty_(record.aggregation_code)) enumChecks.push(['aggregation_code', ['SUM', 'AVERAGE', 'LATEST', 'MAX', 'MIN']]);
  }
  enumChecks.forEach(function (entry) {
    var normalized = mhAsText_(record[entry[0]]).toUpperCase();
    if (entry[1].indexOf(normalized) < 0) throw mhApiError_('validation_error', 'invalid_enum_value', 400);
    record[entry[0]] = normalized;
  });
}

function mhValidateApprovalTransition_(record, before, entityType, actor) {
  if (entityType !== 'approval') return;
  var next = mhAsText_(record.status_code).toUpperCase();
  if (!before) {
    if (next !== 'REQUESTED') throw mhApiError_('validation_error', 'approval_must_start_requested', 400);
    return;
  }
  var previous = mhAsText_(before.status_code).toUpperCase();
  if (next === previous) return;
  if (previous !== 'REQUESTED' || ['APPROVED', 'REJECTED', 'CANCELLED'].indexOf(next) < 0) {
    throw mhApiError_('validation_error', 'invalid_approval_transition', 400);
  }
  if (next === 'APPROVED' || next === 'REJECTED') {
    var manager = actor.role === 'MASTER' || actor.role === 'POCKET_MANAGER';
    if (!manager && mhAsText_(before.approver_user_id) !== actor.userId) {
      throw mhApiError_('forbidden', 'approval_actor_not_assigned', 403);
    }
    record.responded_at = record.responded_at || mhNowIso_();
  }
}

function mhValidateStatusTransition_(record, before, entityType) {
  if (!before || ['task', 'content'].indexOf(entityType) < 0) return;
  var previous = mhAsText_(before.status_code).toUpperCase();
  var next = mhAsText_(record.status_code).toUpperCase();
  if (!previous || previous === next) return;
  // The task screen exposes these four states as direct controls. They are
  // corrective workflow states, so users must be able to move between them
  // without following the more granular content-production state machine.
  var primaryTaskStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'ON_HOLD'];
  if (entityType === 'task' &&
      primaryTaskStatuses.indexOf(previous) >= 0 &&
      primaryTaskStatuses.indexOf(next) >= 0) return;
  var transitions = entityType === 'task' ? {
    NOT_STARTED: ['IN_PROGRESS', 'ON_HOLD', 'BLOCKED', 'CANCELLED'],
    IN_PROGRESS: ['INTERNAL_REVIEW', 'WAITING_CLIENT', 'BLOCKED', 'ON_HOLD', 'DONE', 'CANCELLED'],
    INTERNAL_REVIEW: ['REVISION', 'WAITING_CLIENT', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
    WAITING_CLIENT: ['REVISION', 'IN_PROGRESS', 'DONE', 'ON_HOLD'],
    REVISION: ['IN_PROGRESS', 'INTERNAL_REVIEW', 'BLOCKED'],
    BLOCKED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    ON_HOLD: ['NOT_STARTED', 'IN_PROGRESS', 'CANCELLED'],
    DONE: ['IN_PROGRESS'],
    CANCELLED: ['NOT_STARTED']
  } : {
    IDEA: ['DRAFT', 'PLANNED', 'PRODUCTION', 'ON_HOLD', 'CANCELLED'],
    DRAFT: ['PLANNED', 'PRODUCTION', 'INTERNAL_REVIEW', 'ON_HOLD', 'CANCELLED'],
    PLANNED: ['PRODUCTION', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    PRODUCTION: ['INTERNAL_REVIEW', 'REVISION', 'READY', 'BLOCKED', 'ON_HOLD'],
    IN_PROGRESS: ['INTERNAL_REVIEW', 'READY', 'BLOCKED', 'ON_HOLD'],
    INTERNAL_REVIEW: ['REVISION', 'READY', 'PUBLISHED', 'BLOCKED'],
    REVISION: ['PRODUCTION', 'IN_PROGRESS', 'INTERNAL_REVIEW'],
    READY: ['PUBLISHED', 'REVISION', 'ON_HOLD'],
    PUBLISHED: ['REVISION'],
    BLOCKED: ['PRODUCTION', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    ON_HOLD: ['IDEA', 'DRAFT', 'PLANNED', 'PRODUCTION', 'CANCELLED'],
    CANCELLED: ['IDEA', 'DRAFT']
  };
  if (!transitions[previous] || transitions[previous].indexOf(next) < 0) {
    throw mhApiError_('validation_error', 'invalid_status_transition', 400);
  }
}

function mhRequireActiveUser_(userId) {
  var user = mhFindRecord_(MH_SHEETS.USERS, 'user_id', userId).row;
  if (!user || mhNonEmpty_(user.archived_at) || mhAsText_(user.status_code) !== 'ACTIVE') {
    throw mhApiError_('validation_error', 'assignee_not_active', 400);
  }
}

function mhRequireEntityReference_(entityType, id, project) {
  var spec = MH_ENTITY_SPECS[entityType];
  var row = mhFindRecord_(spec.sheet, spec.idField, id).row;
  if (!row || mhNonEmpty_(row.archived_at) ||
      mhAsText_(row.client_id) !== mhAsText_(project.client_id) ||
      mhAsText_(row.project_id) !== mhAsText_(project.project_id)) {
    throw mhApiError_('validation_error', 'invalid_reference', 400);
  }
}

function mhFindMutationLogs_(mutationId) {
  var rows = mhReadTable_(MH_SHEETS.ACTIVITY).rows;
  var found = { commit: null, prepare: null };
  for (var i = rows.length - 1; i >= 0; i -= 1) {
    if (mhAsText_(rows[i].mutation_id) !== mutationId) continue;
    var status = mhAsText_(rows[i].event_status_code);
    if (status === 'COMMIT' && !found.commit) found.commit = rows[i];
    if (status === 'PREPARE' && !found.prepare) found.prepare = rows[i];
    if (found.commit && found.prepare) break;
  }
  return found;
}

function mhRequireLinkedEntity_(entityType, entityId, project) {
  var normalized = mhAsText_(entityType).toUpperCase();
  if (normalized === 'PROJECT') {
    if (mhAsText_(entityId) !== mhAsText_(project.project_id)) throw mhApiError_('validation_error', 'invalid_project_reference', 400);
    return;
  }
  var typeMap = { TASK: 'task', CONTENT: 'content', APPROVAL: 'approval', FILE: 'file' };
  var mapped = typeMap[normalized];
  if (!mapped) throw mhApiError_('validation_error', 'unsupported_entity_reference', 400);
  mhRequireEntityReference_(mapped, entityId, project);
}

function mhMutationReplay_(log, actor) {
  var after = mhParseJson_(mhAsText_(log.after_json), {});
  delete after.__mutation_request_hash;
  var entityType = mhAsText_(log.entity_type).toLowerCase();
  var spec = MH_ENTITY_SPECS[entityType];
  if (spec && entityType !== 'project' && !mhCanSeeRow_(actor, after)) {
    throw mhApiError_('forbidden', 'record_visibility_denied', 403);
  }
  var operation = mhAsText_(log.action_code) === 'CREATED'
    ? 'CREATE' : mhAsText_(log.action_code) === 'UPDATED' ? 'UPDATE' : 'ARCHIVE';
  return {
    mutationId: mhAsText_(log.mutation_id),
    duplicate: true,
    entityType: entityType,
    operation: operation,
    record: spec ? mhMutationResponseRecord_(after, spec, actor) : mhNormalizeRow_(after)
  };
}

function mhRecoverPreparedMutation_(prepareLog, actor, project, requestHash) {
  var entityType = mhAsText_(prepareLog.entity_type).toLowerCase();
  var spec = MH_ENTITY_SPECS[entityType];
  if (!spec) return null;
  var intended = mhParseJson_(mhAsText_(prepareLog.after_json), null);
  if (!intended) return null;
  delete intended.__mutation_request_hash;
  var current = mhFindRecord_(spec.sheet, spec.idField, prepareLog.entity_id).row;
  var operation = mhAsText_(prepareLog.action_code) === 'CREATED'
    ? 'CREATE' : mhAsText_(prepareLog.action_code) === 'UPDATED' ? 'UPDATE' : 'ARCHIVE';
  if (!current) {
    if (operation === 'CREATE') {
      mhAppendRecord_(spec.sheet, intended);
      current = intended;
    } else {
      return null;
    }
  }
  if (operation !== 'CREATE' && Number(current.row_version || 0) > Number(intended.row_version || 0)) {
    throw mhApiError_('conflict', 'prepared_mutation_superseded', 409);
  }
  if (operation !== 'CREATE' && Number(current.row_version || 0) < Number(intended.row_version || 0)) return null;
  if (!mhRecordMatchesIntended_(current, intended)) {
    throw mhApiError_('conflict', 'prepared_mutation_record_mismatch', 409);
  }
  var auditActor = {
    userId: mhAsText_(prepareLog.actor_user_id),
    role: mhAsText_(prepareLog.actor_role_code)
  };
  var commit = mhActivityRecord_(
    mhAsText_(prepareLog.mutation_id), entityType, mhAsText_(prepareLog.entity_id), operation,
    mhParseJson_(mhAsText_(prepareLog.before_json), {}), current, auditActor, project,
    'COMMIT', mhNowIso_(), requestHash
  );
  mhAppendRecord_(MH_SHEETS.ACTIVITY, commit);
  return mhMutationReplay_(commit, actor);
}

function mhActivityRecord_(mutationId, entityType, entityId, operation, before, after, actor, project, status, createdAt, requestHash) {
  var loggedAfter = mhWithoutInternalRowFields_(after || {});
  loggedAfter.__mutation_request_hash = requestHash;
  return {
    event_id: mhNewId_('EVT'),
    mutation_id: mutationId,
    client_id: mhAsText_(project.client_id),
    project_id: mhAsText_(project.project_id),
    entity_type: entityType.toUpperCase(),
    entity_id: entityId,
    action_code: mhMutationActionCode_(operation),
    before_json: mhSanitizeLogJson_(mhWithoutInternalRowFields_(before || {})),
    after_json: mhSanitizeLogJson_(loggedAfter),
    actor_user_id: actor.userId,
    actor_role_code: actor.role,
    event_status_code: status,
    created_at: createdAt
  };
}

function mhMutationActionCode_(operation) {
  return operation === 'CREATE' ? 'CREATED' : operation === 'UPDATE' ? 'UPDATED' : 'ARCHIVED';
}

function mhMutationResponseRecord_(record, spec, actor) {
  var safe = mhWithoutInternalRowFields_(record);
  if (actor.role === 'CLIENT_VIEWER') {
    delete safe.description;
    delete safe.blocker_reason;
    delete safe.notes;
    delete safe.responsible_org_code;
    delete safe.reviewer_org_code;
    delete safe.assignee_user_id;
  }
  return mhNormalizeRow_(safe);
}

function mhWithoutInternalRowFields_(row) {
  var copy = {};
  Object.keys(row || {}).forEach(function (key) {
    if (key.indexOf('__') !== 0) copy[key] = row[key];
  });
  return copy;
}

function mhMutationRequestHash_(entityType, operation, projectId, mutation, actorUserId) {
  return mhHashToken_(mhStableJson_({
    entityType: entityType,
    operation: operation,
    projectId: projectId,
    actorUserId: mhAsText_(actorUserId),
    id: mhAsText_(mutation.id || mutation.recordId || mutation.record_id),
    expectedRowVersion: mutation.expectedRowVersion === undefined
      ? mutation.expected_row_version : mutation.expectedRowVersion,
    fields: mutation.fields || {}
  }));
}

function mhRecordMatchesIntended_(current, intended) {
  return Object.keys(intended || {}).filter(function (key) {
    return key.indexOf('__') !== 0;
  }).every(function (key) {
    return mhStableJson_(mhToIsoValue_(current[key])) === mhStableJson_(mhToIsoValue_(intended[key]));
  });
}

function mhAssertMutationRequestHash_(log, requestHash) {
  var after = mhParseJson_(mhAsText_(log.after_json), {});
  if (!after.__mutation_request_hash || !mhConstantTimeEquals_(after.__mutation_request_hash, requestHash)) {
    throw mhApiError_('conflict', 'mutation_id_reused_for_different_request', 409);
  }
}

function mhCopyRecord_(row) {
  return mhWithoutInternalRowFields_(row);
}
