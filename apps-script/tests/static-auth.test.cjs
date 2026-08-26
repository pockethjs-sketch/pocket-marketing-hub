const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sourceFiles = fs.readdirSync(root)
  .filter((name) => name.endsWith('.gs') && name !== 'Secrets.gs')
  .sort();
const allSource = sourceFiles.map((name) => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');

new vm.Script(allSource, { filename: 'apps-script-bundle.gs' });

const scriptProperties = {};
const cache = new Map();
const toWebSafe = (buffer) => Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const fromWebSafe = (text) => Buffer.from(String(text).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

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
      put: (key, value) => cache.set(key, String(value)),
      remove: (key) => cache.delete(key),
    }),
  },
  Utilities: {
    Charset: { UTF_8: 'UTF-8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeHmacSha256Signature: (value, key) => [...crypto.createHmac('sha256', String(key)).update(String(value)).digest()],
    computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value)).digest()],
    base64EncodeWebSafe: (value) => toWebSafe(typeof value === 'string' ? Buffer.from(value) : value),
    base64DecodeWebSafe: (value) => [...fromWebSafe(value)],
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
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
assert.deepEqual(Array.from(context.MH_ENTITY_SPECS.project.operations), ['UPDATE']);
assert.deepEqual(Array.from(context.MH_ENTITY_SPECS.project.fields), ['start_date']);
const mutationSource = fs.readFileSync(path.join(root, 'Mutations.gs'), 'utf8');
assert.match(mutationSource, /spec\.operations && spec\.operations\.indexOf\(operation\) < 0/);
assert.match(mutationSource, /\['start_date', 'planned_start_date'/);
assert.match(mutationSource, /\['MASTER', 'POCKET_MANAGER', 'POCKET_EDITOR'\]\.indexOf\(actor\.role\) < 0/);

console.log(`Apps Script static/auth checks passed (${sourceFiles.length} source files).`);
