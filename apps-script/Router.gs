/**
 * Web App entry points.
 *
 * GitHub Pages must call doPost with Content-Type text/plain;charset=utf-8.
 * Authentication travels in the JSON body, never in a query string.
 */

function doGet(e) {
  var requestId = mhRequestId_();
  try {
    var action = mhAsText_(e && e.parameter && e.parameter.action).toLowerCase();
    if (action && action !== 'health') throw mhApiError_('invalid_request', 'post_required', 405);
    return mhJsonOutput_(mhSuccess_(requestId, null, null, mhHealth_(), mhRevision_()));
  } catch (error) {
    console.error('[marketing-hub] ' + requestId + ' ' + (error.stack || error));
    return mhJsonOutput_(mhFailure_(requestId, error));
  }
}

function doPost(e) {
  var requestId = mhRequestId_();
  try {
    var request = mhParsePostBody_(e);
    var action = mhAsText_(request.action).toLowerCase();
    if (!action) throw mhApiError_('invalid_request', 'action_required', 400);

    if (action === 'health') {
      return mhJsonOutput_(mhSuccess_(requestId, null, null, mhHealth_(), mhRevision_()));
    }
    if (action === 'login') {
      return mhJsonOutput_(mhSuccess_(requestId, null, null, mhLogin_(request), mhRevision_()));
    }
    if (action === 'preview_session') {
      return mhJsonOutput_(mhSuccess_(requestId, null, null, mhPreviewSession_(), mhRevision_()));
    }
    if (action === 'logout') {
      // Sessions are stateless. The client must delete its sessionStorage token.
      return mhJsonOutput_(mhSuccess_(requestId, null, null, { loggedOut: true }, mhRevision_()));
    }

    var actor = mhResolveActor_(request);
    if (action === 'deep_health') {
      if (actor.role !== 'MASTER' && actor.role !== 'POCKET_MANAGER') {
        throw mhApiError_('forbidden', 'deep_health_requires_manager', 403);
      }
      return mhJsonOutput_(mhSuccess_(requestId, actor, null, mhDeepHealth_(), mhRevision_()));
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
    throw mhApiError_('invalid_request', 'unsupported_action', 400);
  } catch (error) {
    console.error('[marketing-hub] ' + requestId + ' ' + (error.stack || error));
    return mhJsonOutput_(mhFailure_(requestId, error));
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
    writesEnabled: String(mhSetting_(MH_PROPERTY_KEYS.ENABLE_WRITES, 'false')).toLowerCase() === 'true'
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
    writesEnabled: String(mhSetting_(MH_PROPERTY_KEYS.ENABLE_WRITES, 'false')).toLowerCase() === 'true'
  };
}
