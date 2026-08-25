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
};
context.mhActorByEmail_ = (email) => ({
  userId: 'USR-TEST',
  userRowVersion: 1,
  displayName: '테스트 사용자',
  email,
  organization: 'POCKET',
  role: 'POCKET_EDITOR',
  memberships: [],
});

const email = 'operator@example.com';
const accessCode = 'long-private-random-code-1234567890';
const digest = context.mhAccessCodeDigest_(email, accessCode);
context.MH_LOCAL_SECRETS.ACCESS_ACCOUNTS_JSON = JSON.stringify({
  [email]: { access_code_hash: digest, enabled: true },
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
});
assert.throws(() => context.mhVerifySessionToken_(login.token + 'tampered'));

const clientActor = { role: 'CLIENT_VIEWER' };
const teamActor = { role: 'EXECUTOR_EDITOR' };
assert.equal(context.mhCanSeeRow_(clientActor, { visibility_code: 'INTERNAL', source_code: 'MANUAL' }), false);
assert.equal(context.mhCanSeeRow_(clientActor, { visibility_code: 'CLIENT', source_code: 'HTML_REFERENCE' }), false);
assert.equal(context.mhCanSeeRow_(teamActor, { visibility_code: 'CLIENT', source_code: 'HTML_REFERENCE' }), true);

console.log(`Apps Script static/auth checks passed (${sourceFiles.length} source files).`);
