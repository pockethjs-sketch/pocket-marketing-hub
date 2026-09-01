function mhNowIso_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function mhRequestId_() {
  return 'req_' + Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}

function mhNewId_(prefix) {
  return String(prefix || 'REC') + '-' + Utilities.getUuid().replace(/-/g, '').toUpperCase();
}

function mhApiError_(code, message, status) {
  var error = new Error(message || code || 'request_failed');
  error.apiCode = code || 'request_failed';
  error.apiStatus = status || 400;
  return error;
}

function mhJsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function mhSuccess_(requestId, actor, scope, data, revision) {
  return {
    ok: true,
    contractVersion: MH_CONTRACT_VERSION,
    schemaVersion: MH_SCHEMA_VERSION,
    backendVersion: MH_BACKEND_VERSION,
    revision: revision || mhRevision_(),
    generatedAt: mhNowIso_(),
    requestId: requestId,
    scope: scope || null,
    actor: actor ? {
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role
    } : null,
    data: data
  };
}

function mhFailure_(requestId, error) {
  var code = error && error.apiCode ? error.apiCode : 'internal_error';
  var status = error && error.apiStatus ? error.apiStatus : 500;
  var safeMessages = {
    invalid_request: '요청 형식이 올바르지 않습니다.',
    unauthorized: '로그인이 필요합니다.',
    forbidden: '이 데이터에 접근할 권한이 없습니다.',
    not_found: '요청한 데이터를 찾을 수 없습니다.',
    conflict: '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.',
    configuration_error: '서버 연결 설정이 완료되지 않았습니다.',
    schema_mismatch: 'Google Sheets 원장 구조가 예상과 다릅니다.',
    validation_error: '입력값을 확인해 주세요.',
    lock_timeout: '다른 저장 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.',
    internal_error: '요청 처리 중 오류가 발생했습니다.'
  };
  return {
    ok: false,
    contractVersion: MH_CONTRACT_VERSION,
    schemaVersion: MH_SCHEMA_VERSION,
    backendVersion: MH_BACKEND_VERSION,
    generatedAt: mhNowIso_(),
    requestId: requestId,
    error: {
      code: code,
      status: status,
      message: safeMessages[code] || safeMessages.internal_error
    }
  };
}

function mhRevision_() {
  return 'rev_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss');
}

function mhAsText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function mhAsBoolean_(value) {
  if (value === true || value === false) return value;
  var normalized = String(value || '').toLowerCase();
  return normalized === 'true' || normalized === 'y' || normalized === 'yes' || normalized === '1';
}

function mhToIsoValue_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (value === '') return null;
  return value;
}

function mhNormalizeRow_(row) {
  var result = {};
  Object.keys(row || {}).forEach(function (key) {
    result[key] = mhToIsoValue_(row[key]);
  });
  return result;
}

function mhNormalizeVisibility_(value) {
  var code = mhAsText_(value).toUpperCase();
  if (code === 'INTERNAL') return 'POCKET_ONLY';
  return code || 'POCKET_ONLY';
}

function mhCanSeeRow_(actor, row) {
  // Imported source HTML was not reviewed row-by-row for customer disclosure.
  // It remains visible to Pocket/project-team users, but never to customers.
  if (actor.role === 'CLIENT_VIEWER' && mhAsText_(row.source_code).toUpperCase() === 'HTML_REFERENCE') {
    return false;
  }
  var visibility = mhNormalizeVisibility_(row.visibility_code);
  var rowLevel = MH_VISIBILITY_LEVEL[visibility] || MH_VISIBILITY_LEVEL.POCKET_ONLY;
  var actorLevel = MH_ROLE_VISIBILITY_LEVEL[actor.role] || 0;
  return rowLevel <= actorLevel;
}

function mhClampLimit_(value, fallback, maximum) {
  var parsed = Number(value);
  if (!isFinite(parsed) || parsed <= 0) parsed = fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function mhParseJson_(text, fallback) {
  try {
    var parsed = JSON.parse(text);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
}

function mhEncodeCursor_(value) {
  if (!value) return null;
  return Utilities.base64EncodeWebSafe(JSON.stringify(value), Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function mhDecodeCursor_(cursor) {
  if (!cursor) return null;
  try {
    var bytes = Utilities.base64DecodeWebSafe(String(cursor));
    return JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
  } catch (error) {
    throw mhApiError_('invalid_request', 'invalid_cursor', 400);
  }
}

function mhCursorKey_(row, idField) {
  return {
    updatedAt: mhComparableDate_(row.updated_at || row.created_at || row.performance_date || row.period_end),
    id: mhAsText_(row[idField])
  };
}

function mhComparableDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  var text = mhAsText_(value);
  if (!text) return '';
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function mhCompareCursorKeysDesc_(left, right) {
  var leftDate = mhAsText_(left.updatedAt);
  var rightDate = mhAsText_(right.updatedAt);
  if (leftDate !== rightDate) return leftDate < rightDate ? 1 : -1;
  var leftId = mhAsText_(left.id);
  var rightId = mhAsText_(right.id);
  return leftId < rightId ? 1 : leftId > rightId ? -1 : 0;
}

function mhPageRows_(rows, idField, limit, cursor) {
  var keyed = rows.map(function (row) {
    return { row: row, key: mhCursorKey_(row, idField) };
  });
  keyed.sort(function (left, right) {
    return mhCompareCursorKeysDesc_(left.key, right.key);
  });
  if (cursor) {
    keyed = keyed.filter(function (item) {
      return mhCompareCursorKeysDesc_(item.key, cursor) > 0;
    });
  }
  var page = keyed.slice(0, limit);
  return {
    items: page.map(function (item) { return item.row; }),
    nextCursor: keyed.length > limit && page.length
      ? mhEncodeCursor_(page[page.length - 1].key)
      : null
  };
}

function mhDateOnly_(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  var text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  // CacheService serializes spreadsheet Date values as UTC ISO strings. A
  // Korean midnight therefore becomes the previous day's 15:00Z; slicing the
  // first ten characters silently shifts every cached date back one day.
  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return text.slice(0, 10);
}

function mhValidateDateWindow_(start, end, maximumDays) {
  if (!start && !end) return { start: '', end: '' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) {
    throw mhApiError_('validation_error', 'date_range_format', 400);
  }
  var startDate = new Date(start + 'T00:00:00+09:00');
  var endDate = new Date(end + 'T23:59:59+09:00');
  var days = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (days <= 0 || days > maximumDays) {
    throw mhApiError_('validation_error', 'date_range_limit', 400);
  }
  return { start: start, end: end };
}

function mhHashToken_(token) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(token),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function mhSanitizeLogJson_(value) {
  var text = JSON.stringify(value || {});
  if (text.length > 45000) throw mhApiError_('validation_error', 'activity_log_payload_too_large', 400);
  return text;
}

function mhStableJson_(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(mhStableJson_).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + mhStableJson_(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function mhPick_(source, fields) {
  var result = {};
  (fields || []).forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) {
      result[field] = mhToIsoValue_(source[field]);
    }
  });
  return result;
}

function mhNonEmpty_(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function mhInDateRange_(value, range) {
  if (!range || (!range.start && !range.end)) return true;
  var day = mhDateOnly_(value);
  if (!day) return false;
  return (!range.start || day >= range.start) && (!range.end || day <= range.end);
}
