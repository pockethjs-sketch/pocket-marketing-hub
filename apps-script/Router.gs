/**
 * Web App entry points.
 *
 * GitHub Pages must call doPost with Content-Type text/plain;charset=utf-8.
 * Authentication travels in the JSON body, never in a query string.
 */

function doGet(e) {
  var requestId = mhRequestId_();
  var startedAt = Date.now();
  var actionForLog = 'health';
  var outcomeForLog = 'OK';
  try {
    var action = mhAsText_(e && e.parameter && e.parameter.action).toLowerCase();
    if (action && action !== 'health') throw mhApiError_('invalid_request', 'post_required', 405);
    return mhJsonOutput_(mhSuccess_(requestId, null, null, mhHealth_(), mhRevision_()));
  } catch (error) {
    outcomeForLog = error.apiCode || 'internal_error';
    console.error('[marketing-hub] ' + requestId + ' ' + (error.stack || error));
    return mhJsonOutput_(mhFailure_(requestId, error));
  } finally {
    mhLogRequestMetric_(requestId, actionForLog, startedAt, outcomeForLog);
  }
}

function doPost(e) {
  var requestId = mhRequestId_();
  var startedAt = Date.now();
  var actionForLog = 'unknown';
  var outcomeForLog = 'OK';
  try {
    var request = mhParsePostBody_(e);
    var action = mhAsText_(request.action).toLowerCase();
    actionForLog = action || 'missing';
    if (!action) throw mhApiError_('invalid_request', 'action_required', 400);

    if (action === 'health') {
      return mhJsonOutput_(mhSuccess_(requestId, null, null, mhHealth_(), mhRevision_()));
    }
    if (action === 'login') {
      if (mhAsBoolean_(request.includeBootstrap)) {
        var loginResult = mhLoginBootstrap_(request);
        return mhJsonOutput_(mhSuccess_(
          requestId,
          loginResult.actor,
          loginResult.scope,
          loginResult.data,
          mhRevision_()
        ));
      }
      return mhJsonOutput_(mhSuccess_(requestId, null, null, mhLogin_(request), mhRevision_()));
    }
    if (action === 'preview_session') {
      return mhJsonOutput_(mhSuccess_(requestId, null, null, mhPreviewSession_(), mhRevision_()));
    }
    if (action === 'preview_bootstrap') {
      var previewResult = mhPreviewBootstrap_(request);
      return mhJsonOutput_(mhSuccess_(
        requestId,
        previewResult.actor,
        previewResult.scope,
        previewResult.data,
        mhRevision_()
      ));
    }
    if (action === 'preview_overview') {
      var previewOverview = mhPreviewOverview_(request);
      return mhJsonOutput_(mhSuccess_(
        requestId,
        previewOverview.actor,
        previewOverview.scope,
        previewOverview.data,
        mhRevision_()
      ));
    }
    if (action === 'logout') {
      // Sessions are stateless. The client must delete its sessionStorage token.
      return mhJsonOutput_(mhSuccess_(requestId, null, null, { loggedOut: true }, mhRevision_()));
    }
    if (action === 'scheduled_backup') {
      return mhJsonOutput_(mhSuccess_(requestId, null, null, mhRunScheduledBackup_(request), mhRevision_()));
    }

    var actor = mhResolveActor_(request);
    if (action === 'deep_health') {
      if (actor.role !== 'MASTER' && actor.role !== 'POCKET_MANAGER') {
        throw mhApiError_('forbidden', 'deep_health_requires_manager', 403);
      }
      return mhJsonOutput_(mhSuccess_(requestId, actor, null, mhDeepHealth_(), mhRevision_()));
    }
    if (action === 'access_admin') {
      return mhJsonOutput_(mhSuccess_(requestId, actor, null, mhReadPermissionAdmin_(actor), mhRevision_()));
    }
    if (action === 'access_admin_mutate') {
      return mhJsonOutput_(mhSuccess_(requestId, actor, null, mhPermissionAdminMutate_(request, actor), mhRevision_()));
    }
    if (action === 'ops_maintenance') {
      return mhJsonOutput_(mhSuccess_(requestId, actor, null, mhRunOperationsMaintenance_(request, actor), mhRevision_()));
    }
    if (action === 'ensure_daily_meetings') {
      if (actor.role !== 'MASTER' && actor.role !== 'POCKET_MANAGER') {
        throw mhApiError_('forbidden', 'daily_meeting_setup_requires_manager', 403);
      }
      return mhJsonOutput_(mhSuccess_(requestId, actor, null, mhSetupEnsureDailyMeetingsSheet(), mhRevision_()));
    }
    if (action === 'ensure_task_table_fields') {
      if (actor.role !== 'MASTER' && actor.role !== 'POCKET_MANAGER') {
        throw mhApiError_('forbidden', 'task_table_setup_requires_manager', 403);
      }
      return mhJsonOutput_(mhSuccess_(requestId, actor, null, mhSetupEnsureTaskTableFields(), mhRevision_()));
    }
    if (action === 'provision_muguk') {
      return mhJsonOutput_(mhSuccess_(
        requestId, actor, null, mhProvisionMugukProject_(actor), mhRevision_()
      ));
    }
    if (MH_READ_ACTIONS[action]) {
      var readResult = mhHandleRead_(action, request, actor);
      return mhJsonOutput_(mhSuccess_(
        requestId, actor, readResult.scope, readResult.data, mhRevision_()
      ));
    }
    if (action === 'mutate') {
      var mutationResult = mhHandleMutation_(request, actor);
      return mhJsonOutput_(mhSuccess_(
        requestId, actor, mutationResult.scope, mutationResult.data, mhRevision_()
      ));
    }
    if (action === 'mutate_batch') {
      var mutationBatchResult = mhHandleMutationBatch_(request, actor);
      return mhJsonOutput_(mhSuccess_(
        requestId, actor, mutationBatchResult.scope, mutationBatchResult.data, mhRevision_()
      ));
    }
    throw mhApiError_('invalid_request', 'unsupported_action', 400);
  } catch (error) {
    outcomeForLog = error.apiCode || 'internal_error';
    console.error('[marketing-hub] ' + requestId + ' ' + (error.stack || error));
    return mhJsonOutput_(mhFailure_(requestId, error));
  } finally {
    mhLogRequestMetric_(requestId, actionForLog, startedAt, outcomeForLog);
  }
}

function mhParsePostBody_(e) {
  var content = e && e.postData ? String(e.postData.contents || '') : '';
  if (!content || content.length > 250000) throw mhApiError_('invalid_request', 'invalid_body_size', 400);
  var parsed = mhParseJson_(content, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw mhApiError_('invalid_request', 'json_object_required', 400);
  }
  return parsed;
}

function mhHealth_() {
  var hasSheet = !!mhSetting_(MH_PROPERTY_KEYS.SHEET_ID, '');
  var hasSecret = mhAsText_(mhSetting_(MH_PROPERTY_KEYS.SESSION_SIGNING_SECRET, '')).length >= 32;
  var hasPepper = mhAsText_(mhSetting_(MH_PROPERTY_KEYS.ACCESS_CODE_PEPPER, '')).length >= 32;
  var digests = mhAccessCodeDigests_();
  var hasAccounts = Object.keys(digests).some(function (email) {
    return !!digests[email];
  });
  return {
    status: hasSheet && hasSecret && hasPepper && hasAccounts ? 'READY' : 'SETUP_REQUIRED',
    backendVersion: MH_BACKEND_VERSION,
    authentication: 'SIGNED_SESSION',
    publicPreviewEnabled: String(
      mhSetting_(MH_PROPERTY_KEYS.PUBLIC_PREVIEW_ENABLED, 'false')
    ).toLowerCase() === 'true',
    writesEnabled: String(mhSetting_(MH_PROPERTY_KEYS.ENABLE_WRITES, 'false')).toLowerCase() === 'true',
    backupConfigured: !!mhSetting_(MH_PROPERTY_KEYS.BACKUP_RUNNER_DIGEST, ''),
    lastBackupAt: mhSetting_(MH_PROPERTY_KEYS.BACKUP_LAST_SUCCESS_AT, '') || null
  };
}

function mhDeepHealth_() {
  mhSpreadsheet_();
  mhSchemaCheck_();
  return {
    status: 'READY',
    spreadsheetAccessible: true,
    schemaValid: true,
    enabledAccounts: Object.keys(mhAccessCodeDigests_()).length,
    writesEnabled: String(mhSetting_(MH_PROPERTY_KEYS.ENABLE_WRITES, 'false')).toLowerCase() === 'true',
    backupConfigured: !!mhSetting_(MH_PROPERTY_KEYS.BACKUP_RUNNER_DIGEST, ''),
    lastBackupAt: mhSetting_(MH_PROPERTY_KEYS.BACKUP_LAST_SUCCESS_AT, '') || null
  };
}

function mhLogRequestMetric_(requestId, action, startedAt, outcome) {
  try {
    console.log('[marketing-hub-metric] ' + JSON.stringify({
      requestId: requestId,
      action: action,
      durationMs: Math.max(0, Date.now() - Number(startedAt || Date.now())),
      outcome: outcome,
      backendVersion: MH_BACKEND_VERSION
    }));
  } catch (ignored) {}
}
