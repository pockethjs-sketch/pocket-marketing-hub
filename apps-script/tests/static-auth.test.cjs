const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const sourceFiles = fs.readdirSync(root)
  .filter((name) => name.endsWith('.gs') && name !== 'Secrets.gs')
  .sort();
const allSource = sourceFiles.map((name) => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');

new vm.Script(allSource, { filename: 'apps-script-bundle.gs' });

const scriptProperties = {};
const cache = new Map();
const cacheTtls = new Map();
const toWebSafe = (buffer) => Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const fromWebSafe = (text) => Buffer.from(String(text).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const asBuffer = (value) => {
  if (Buffer.isBuffer(value)) return value;
  if (value && typeof value.getBytes === 'function') return Buffer.from(value.getBytes());
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Buffer.from(value);
  return Buffer.from(String(value ?? ''), 'utf8');
};
const makeBlob = (value) => {
  const buffer = asBuffer(value);
  return {
    getBytes: () => [...buffer],
    getDataAsString: () => buffer.toString('utf8'),
  };
};

const context = {
  console,
  Date,
  JSON,
  Math,
  Object,
  Array,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  isFinite,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => Object.prototype.hasOwnProperty.call(scriptProperties, key) ? scriptProperties[key] : null,
      getProperties: () => ({ ...scriptProperties }),
      setProperty: (key, value) => { scriptProperties[key] = String(value); },
      deleteProperty: (key) => { delete scriptProperties[key]; },
    }),
  },
  CacheService: {
    getScriptCache: () => ({
      get: (key) => cache.get(key) || null,
      put: (key, value, ttl) => {
        cache.set(key, String(value));
        cacheTtls.set(key, Number(ttl || 0));
      },
      remove: (key) => cache.delete(key),
    }),
  },
  Utilities: {
    Charset: { UTF_8: 'UTF-8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeHmacSha256Signature: (value, key) => [...crypto.createHmac('sha256', String(key)).update(String(value)).digest()],
    computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value)).digest()],
    base64Encode: (value) => asBuffer(value).toString('base64'),
    base64Decode: (value) => [...Buffer.from(String(value), 'base64')],
    base64EncodeWebSafe: (value) => toWebSafe(typeof value === 'string' ? Buffer.from(value) : value),
    base64DecodeWebSafe: (value) => [...fromWebSafe(value)],
    newBlob: (value) => makeBlob(value),
    gzip: (value) => makeBlob(zlib.gzipSync(asBuffer(value))),
    ungzip: (value) => makeBlob(zlib.gunzipSync(asBuffer(value))),
    getUuid: () => crypto.randomUUID(),
    formatDate: (date) => new Date(date).toISOString(),
  },
  Session: { getTemporaryActiveUserKey: () => 'test-user' },
};
vm.createContext(context);
vm.runInContext(
  ['Config.gs', 'Utils.gs', 'Auth.gs'].map((name) => fs.readFileSync(path.join(root, name), 'utf8')).join('\n'),
  context,
  { filename: 'auth-test-bundle.gs' },
);

context.MH_LOCAL_SECRETS = {
  SESSION_SIGNING_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
  ACCESS_CODE_PEPPER: 'different-test-pepper-longer-than-thirty-two-characters',
  ACCESS_ACCOUNTS_JSON: '{}',
  ENABLE_WRITES: 'false',
  PUBLIC_PREVIEW_ENABLED: 'false',
  PUBLIC_PREVIEW_EMAIL: 'preview@example.com',
  PUBLIC_PREVIEW_PROJECT_IDS: 'PRJ-UND-90D-001',
};
context.mhActorByEmail_ = (email) => ({
  userId: 'USR-TEST',
  userRowVersion: 1,
  displayName: '테스트 사용자',
  email,
  organization: email === 'preview@example.com' ? 'CLIENT' : 'POCKET',
  role: email === 'preview@example.com' ? 'CLIENT_VIEWER' : 'POCKET_EDITOR',
  memberships: email === 'preview@example.com' ? [{
    client_id: 'CLT-UND',
    project_id: 'PRJ-UND-90D-001',
    permission_code: 'READ_ONLY',
    status_code: 'ACTIVE',
  }] : [],
});
context.mhFindRecord_ = (_sheet, _key, projectId) => ({
  row: {
    project_id: projectId,
    client_id: 'CLT-UND',
    client_view_enabled: true,
    archived_at: '',
  },
});

const email = 'operator@example.com';
const accessCode = 'long-private-random-code-1234567890';
const digest = context.mhAccessCodeDigest_(email, accessCode);
context.MH_LOCAL_SECRETS.ACCESS_ACCOUNTS_JSON = JSON.stringify({
  [email]: { access_code_hash: digest, enabled: true },
  'preview@example.com': { access_code_hash: 'preview-account-enabled', enabled: true },
});

const login = context.mhLogin_({ email, accessCode });
assert.equal(login.user.userId, 'USR-TEST');
assert.ok(login.token.includes('.'));
assert.equal(context.mhVerifySessionToken_(login.token).email, email);
assert.equal(context.mhResolveActor_({ auth: { sessionToken: login.token } }).userId, 'USR-TEST');
context.MH_LOCAL_SECRETS.ACCESS_ACCOUNTS_JSON = JSON.stringify({
  [email]: { access_code_hash: digest, enabled: false },
});
assert.throws(() => context.mhResolveActor_({ auth: { sessionToken: login.token } }));
context.MH_LOCAL_SECRETS.ACCESS_ACCOUNTS_JSON = JSON.stringify({
  [email]: { access_code_hash: digest, enabled: true },
  'preview@example.com': { access_code_hash: 'preview-account-enabled', enabled: true },
});
assert.throws(() => context.mhVerifySessionToken_(login.token + 'tampered'));

context.MH_LOCAL_SECRETS.PUBLIC_PREVIEW_ENABLED = 'true';
const preview = context.mhPreviewSession_();
assert.equal(preview.user.role, 'CLIENT_VIEWER');
assert.equal(preview.expiresIn, 3600);
const previewClaims = context.mhVerifySessionToken_(preview.token);
assert.equal(previewClaims.sessionType, 'PUBLIC_PREVIEW');
assert.deepEqual(Array.from(previewClaims.previewProjectIds), ['PRJ-UND-90D-001']);
const previewActor = context.mhResolveActor_({ auth: { sessionToken: preview.token } });
assert.equal(previewActor.role, 'CLIENT_VIEWER');
assert.deepEqual(Array.from(previewActor.previewProjectIds), ['PRJ-UND-90D-001']);
assert.throws(() => context.mhRequireProjectAccess_(previewActor, 'PRJ-NOT-PUBLIC', false));
context.MH_LOCAL_SECRETS.PUBLIC_PREVIEW_PROJECT_IDS = 'PRJ-OTHER';
assert.throws(() => context.mhResolveActor_({ auth: { sessionToken: preview.token } }));
context.MH_LOCAL_SECRETS.PUBLIC_PREVIEW_PROJECT_IDS = '';
assert.throws(() => context.mhPreviewSession_());
context.MH_LOCAL_SECRETS.PUBLIC_PREVIEW_PROJECT_IDS = 'PRJ-UND-90D-001';
context.MH_LOCAL_SECRETS.PUBLIC_PREVIEW_ENABLED = 'false';
assert.throws(() => context.mhPreviewSession_());

// A public first load must issue the session and return only the navigation
// bootstrap in one execution. In particular it must not read tasks, overview,
// KPI, content, approval, file, or activity sheets.
vm.runInContext(
  fs.readFileSync(path.join(root, 'ReadApi.gs'), 'utf8'),
  context,
  { filename: 'read-api-test-bundle.gs' },
);
context.MH_LOCAL_SECRETS.PUBLIC_PREVIEW_ENABLED = 'true';
const tablesRead = [];
context.mhActiveRows_ = (sheetName) => {
  tablesRead.push(sheetName);
  if (sheetName === context.MH_SHEETS.CLIENTS) {
    return [{
      client_id: 'CLT-UND',
      display_name: 'UND',
      status_code: 'ACTIVE',
      is_demo: false,
      logo_url: '',
    }];
  }
  if (sheetName === context.MH_SHEETS.CHANNELS) {
    return [{
      project_channel_id: 'CH-1',
      client_id: 'CLT-UND',
      project_id: 'PRJ-UND-90D-001',
      channel_code: 'YOUTUBE',
      display_name: 'YouTube',
      customer_visible: true,
      status_code: 'ACTIVE',
    }];
  }
  throw new Error(`unexpected bootstrap sheet read: ${sheetName}`);
};
let permissionChecks = 0;
const permissionForProject = context.mhPermissionForProject_;
context.mhPermissionForProject_ = (...args) => {
  permissionChecks += 1;
  return permissionForProject(...args);
};
const combined = context.mhPreviewBootstrap_({ projectId: 'PRJ-UND-90D-001' });
assert.equal(combined.actor.role, 'CLIENT_VIEWER');
assert.equal(combined.data.session.user.role, 'CLIENT_VIEWER');
assert.ok(combined.data.session.token.includes('.'));
assert.equal(combined.data.bootstrap.projects.length, 1);
assert.equal(combined.data.bootstrap.clients.length, 1);
assert.equal(combined.data.bootstrap.channels.length, 1);
assert.equal(Object.hasOwn(combined.data.bootstrap, 'initialOverview'), false);
assert.equal(Object.hasOwn(combined.data.bootstrap, 'initialTasks'), false);
assert.deepEqual(tablesRead, [context.MH_SHEETS.CLIENTS, context.MH_SHEETS.CHANNELS]);
assert.equal(permissionChecks, 1, 'preview scope permission must be validated only once');
assert.match(fs.readFileSync(path.join(root, 'Router.gs'), 'utf8'), /action === 'preview_bootstrap'/);

const clientActor = { role: 'CLIENT_VIEWER' };
const teamActor = { role: 'EXECUTOR_EDITOR' };
assert.equal(context.mhCanSeeRow_(clientActor, { visibility_code: 'INTERNAL', source_code: 'MANUAL' }), false);
assert.equal(context.mhCanSeeRow_(clientActor, { visibility_code: 'CLIENT', source_code: 'HTML_REFERENCE' }), false);
assert.equal(context.mhCanSeeRow_(teamActor, { visibility_code: 'CLIENT', source_code: 'HTML_REFERENCE' }), true);

context.mhActiveRows_ = (sheetName) => {
  if (sheetName === context.MH_SHEETS.MEMBERSHIPS) return [
    { user_id: 'USR-1', client_id: 'CLT-UND', project_id: '', permission_code: 'EDIT', status_code: 'ACTIVE' },
    { user_id: 'USR-1', client_id: 'CLT-UND', project_id: 'PRJ-UND-90D-001', permission_code: 'READ_ONLY', status_code: 'ACTIVE' },
    { user_id: 'USR-2', client_id: 'CLT-UND', project_id: 'PRJ-UND-90D-001', permission_code: 'EDIT', status_code: 'ACTIVE' },
    { user_id: 'USR-3', client_id: 'CLT-UND', project_id: 'PRJ-OTHER', permission_code: 'EDIT', status_code: 'ACTIVE' },
  ];
  if (sheetName === context.MH_SHEETS.USERS) return [
    { user_id: 'USR-1', display_name: '포켓 담당자', organization_code: 'POCKET', role_code: 'POCKET_EDITOR', status_code: 'ACTIVE' },
    { user_id: 'USR-2', display_name: '비활성 담당자', organization_code: 'NS', role_code: 'EXECUTOR_EDITOR', status_code: 'DISABLED' },
    { user_id: 'USR-3', display_name: '타 프로젝트 담당자', organization_code: 'POCKET', role_code: 'POCKET_EDITOR', status_code: 'ACTIVE' },
  ];
  return [];
};
const activeProjectMembers = JSON.parse(JSON.stringify(context.mhActiveProjectMembers_({
  client_id: 'CLT-UND',
  project_id: 'PRJ-UND-90D-001',
})));
assert.deepEqual(activeProjectMembers, [{
  user_id: 'USR-1',
  display_name: '포켓 담당자',
  organization_code: 'POCKET',
  role_code: 'POCKET_EDITOR',
  permission_code: 'READ_ONLY',
}]);
assert.match(fs.readFileSync(path.join(root, 'ReadApi.gs'), 'utf8'), /members:\s*actor\.role === 'CLIENT_VIEWER' \? \[\] : mhActiveProjectMembers_\(project\)/);
const orderedTaskIds = Array.from(context.mhSortTaskRows_([
  { task_id: 'TSK-54', sort_order: 54 },
  { task_id: 'TSK-02', sort_order: 2 },
  { task_id: 'TSK-01B', sort_order: 1 },
  { task_id: 'TSK-01A', sort_order: 1 },
])).map((row) => row.task_id);
assert.deepEqual(orderedTaskIds, ['TSK-01A', 'TSK-01B', 'TSK-02', 'TSK-54']);

// Project snapshots must preserve the existing role-aware readers instead of
// bypassing their visibility projections. They run in one execution so the
// table-level memory cache is shared across all six resources.
assert.equal(context.MH_READ_ACTIONS.project_snapshot, true);
const snapshotCallOrder = [];
const snapshotReaders = [
  ['mhReadTasks_', 'tasks'],
  ['mhReadContents_', 'contents'],
  ['mhReadPerformance_', 'performance'],
  ['mhReadFiles_', 'files'],
  ['mhReadActivity_', 'activity'],
];
const originalSnapshotReaders = Object.fromEntries(snapshotReaders.map(([name]) => [name, context[name]]));
const originalPlanReader = context.mhReadProjectPlan_;
const snapshotActor = { userId: 'USR-SNAPSHOT', role: 'CLIENT_VIEWER' };
const snapshotProject = { client_id: 'CLT-UND', project_id: 'PRJ-UND-90D-001' };
context.mhReadProjectPlan_ = (request, actor, project) => {
  assert.equal(actor, snapshotActor);
  assert.equal(project, snapshotProject);
  snapshotCallOrder.push(`plan:${request.planType}`);
  return { resource: `plan:${request.planType}` };
};
snapshotReaders.forEach(([name, key]) => {
  context[name] = (request, actor, project) => {
    assert.equal(request.limit, 200);
    assert.equal(actor, snapshotActor);
    assert.equal(project, snapshotProject);
    snapshotCallOrder.push(key);
    return { resource: key };
  };
});
const snapshot = JSON.parse(JSON.stringify(context.mhReadProjectSnapshot_(
  { limit: 200 },
  snapshotActor,
  snapshotProject,
)));
assert.deepEqual(snapshotCallOrder, ['plan:CLIENT_SHARE', 'plan:INTERNAL', ...snapshotReaders.map(([, key]) => key)]);
assert.deepEqual(snapshot, {
  plan: { resource: 'plan:CLIENT_SHARE' },
  internalPlan: { resource: 'plan:INTERNAL' },
  ...Object.fromEntries(snapshotReaders.map(([, key]) => [key, { resource: key }])),
});
context.mhReadProjectPlan_ = originalPlanReader;
Object.entries(originalSnapshotReaders).forEach(([name, reader]) => { context[name] = reader; });

assert.equal(context.mhNormalizeProjectPlanType_(), 'CLIENT_SHARE');
assert.equal(context.mhNormalizeProjectPlanType_('client'), 'CLIENT_SHARE');
assert.equal(context.mhNormalizeProjectPlanType_('INTERNAL'), 'INTERNAL');
assert.throws(() => context.mhNormalizeProjectPlanType_('UNKNOWN'));

const originalProjectRows = context.mhProjectRows_;
const planRows = [{
  plan_id: 'PLAN-CLIENT', client_id: 'CLT-UND', project_id: 'PRJ-UND-90D-001',
  source_code: 'CLIENT_APPROVED_PLAN', status_code: 'PUBLISHED', visibility_code: 'CLIENT',
  effective_at: '2026-08-25', row_version: 1, title: '공유 계획',
}, {
  plan_id: 'PLAN-INTERNAL', client_id: 'CLT-UND', project_id: 'PRJ-UND-90D-001',
  source_code: 'INTERNAL_EXECUTION_PLAN', status_code: 'PUBLISHED', visibility_code: 'PROJECT_TEAM',
  effective_at: '2026-08-25', row_version: 1, title: '내부 계획',
}];
const sectionRows = [{
  plan_section_id: 'SEC-TEAM', plan_id: 'PLAN-INTERNAL', source_code: 'INTERNAL_EXECUTION_PLAN',
  status_code: 'PUBLISHED', visibility_code: 'PROJECT_TEAM', sort_order: 1,
  section_code: 'S1', title: '실행 본문', body_html: '<p>팀 공개</p>',
}, {
  plan_section_id: 'SEC-POCKET', plan_id: 'PLAN-INTERNAL', source_code: 'INTERNAL_EXECUTION_PLAN',
  status_code: 'PUBLISHED', visibility_code: 'POCKET_ONLY', sort_order: 2,
  section_code: 'A1', title: '포켓 부록', body_html: '<p>포켓 전용</p>',
}];
context.mhProjectRows_ = (sheetName, _clientId, _projectId, actor) => {
  const rows = sheetName === context.MH_SHEETS.PLANS ? planRows : sectionRows;
  return rows.filter((row) => context.mhCanSeeRow_(actor, row));
};
const teamInternalPlan = JSON.parse(JSON.stringify(context.mhReadProjectPlan_(
  { planType: 'INTERNAL' },
  { role: 'EXECUTOR_EDITOR' },
  snapshotProject,
)));
assert.equal(teamInternalPlan.plan.plan_id, 'PLAN-INTERNAL');
assert.equal(teamInternalPlan.plan.plan_type_code, 'INTERNAL');
assert.deepEqual(teamInternalPlan.sections.map((row) => row.plan_section_id), ['SEC-TEAM']);
const pocketInternalPlan = JSON.parse(JSON.stringify(context.mhReadProjectPlan_(
  { planType: 'INTERNAL' },
  { role: 'POCKET_EDITOR' },
  snapshotProject,
)));
assert.deepEqual(pocketInternalPlan.sections.map((row) => row.plan_section_id), ['SEC-TEAM', 'SEC-POCKET']);
const previewInternalPlan = JSON.parse(JSON.stringify(context.mhReadProjectPlan_(
  { planType: 'INTERNAL' },
  { role: 'CLIENT_VIEWER' },
  snapshotProject,
)));
assert.deepEqual(previewInternalPlan.sections.map((row) => row.plan_section_id), ['SEC-TEAM', 'SEC-POCKET']);
context.mhProjectRows_ = originalProjectRows;

const clientPlanCacheKey = context.mhClientReadCacheKey_(
  'project_plan', { planType: 'CLIENT_SHARE' }, snapshotActor, 'PRJ-UND-90D-001',
);
const internalPlanCacheKey = context.mhClientReadCacheKey_(
  'project_plan', { planType: 'INTERNAL' }, snapshotActor, 'PRJ-UND-90D-001',
);
assert.notEqual(clientPlanCacheKey, internalPlanCacheKey);

const readApiSource = fs.readFileSync(path.join(root, 'ReadApi.gs'), 'utf8');
assert.match(readApiSource, /action === 'project_snapshot'\) data = mhReadProjectSnapshot_/);
assert.match(fs.readFileSync(path.join(root, 'Router.gs'), 'utf8'), /if \(MH_READ_ACTIONS\[action\]\)/);
assert.doesNotMatch(fs.readFileSync(path.join(root, 'Router.gs'), 'utf8'), /migrate_und_plan_variants_v2/);
assert.match(fs.readFileSync(path.join(root, 'PlanMigrations.gs'), 'utf8'), /INTERNAL_EXECUTION_PLAN/);
assert.match(fs.readFileSync(path.join(root, '..', '.gitignore'), 'utf8'), /UndInternalPlan\.generated\.gs/);
const projectPlanReaderSource = readApiSource.slice(
  readApiSource.indexOf('function mhReadProjectPlan_'),
  readApiSource.indexOf('function mhReadProjectSnapshot_'),
);
assert.doesNotMatch(projectPlanReaderSource, /mhEnsureUndClientPlanInstalled_/);
assert.equal(context.MH_CLIENT_READ_CACHE_TTL_SECONDS, 120);
assert.equal(context.mhClientReadCacheTtl_('project_overview'), 120);
assert.equal(context.mhClientReadCacheTtl_('project_plan'), 300);
assert.equal(context.mhClientReadCacheTtl_('project_snapshot'), 300);
assert.match(fs.readFileSync(path.join(root, 'Sheets.gs'), 'utf8'), /MH_TABLE_CACHE_TTL_SECONDS\s*=\s*180/);

// The combined snapshot is commonly larger than CacheService's raw per-key
// budget. Verify that the client cache compresses it and restores the same
// projection without changing its 300-second read-only TTL.
const cacheActor = { userId: 'USR-CACHE', role: 'CLIENT_VIEWER' };
const largeSnapshot = {
  tasks: Array.from({ length: 1500 }, (_, index) => ({
    id: `TSK-${index}`,
    title: '반복 가능한 공개 업무 데이터',
    status: index % 2 ? 'IN_PROGRESS' : 'DONE',
  })),
};
const snapshotCacheRequest = { limit: 200 };
const snapshotCacheKey = context.mhClientReadCacheKey_(
  'project_snapshot', snapshotCacheRequest, cacheActor, 'PRJ-UND-90D-001',
);
context.mhRememberClientRead_(
  'project_snapshot', snapshotCacheRequest, cacheActor, 'PRJ-UND-90D-001', largeSnapshot,
);
assert.match(cache.get(snapshotCacheKey), /^z:/);
assert.equal(cacheTtls.get(snapshotCacheKey), 300);
const cachedSnapshot = context.mhCachedClientRead_(
  'project_snapshot', snapshotCacheRequest, cacheActor, 'PRJ-UND-90D-001',
);
assert.equal(cachedSnapshot.hit, true);
assert.deepEqual(JSON.parse(JSON.stringify(cachedSnapshot.data)), largeSnapshot);

assert.deepEqual(Array.from(context.MH_ENTITY_SPECS.project.operations), ['UPDATE']);
assert.deepEqual(Array.from(context.MH_ENTITY_SPECS.project.fields), ['start_date']);
const mutationSource = fs.readFileSync(path.join(root, 'Mutations.gs'), 'utf8');
assert.match(mutationSource, /spec\.operations && spec\.operations\.indexOf\(operation\) < 0/);
assert.match(mutationSource, /\['start_date', 'planned_start_date'/);
assert.match(mutationSource, /\['MASTER', 'POCKET_MANAGER', 'POCKET_EDITOR'\]\.indexOf\(actor\.role\) < 0/);

console.log(`Apps Script static/auth checks passed (${sourceFiles.length} source files).`);
