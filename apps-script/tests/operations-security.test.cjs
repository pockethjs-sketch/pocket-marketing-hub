const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isFinite };
vm.createContext(context);
vm.runInContext(
  ['Config.gs', 'Utils.gs', 'Operations.gs']
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
    .join('\n'),
  context,
  { filename: 'operations-security-bundle.gs' },
);

assert.doesNotThrow(() => context.mhAssertOperationsManager_({ role: 'MASTER', organization: 'POCKET' }));
assert.doesNotThrow(() => context.mhAssertOperationsManager_({ role: 'POCKET_MANAGER', organization: 'POCKET' }));
assert.throws(
  () => context.mhAssertOperationsManager_({ role: 'POCKET_MANAGER', organization: 'NS' }),
  /operations_manager_required/,
);
assert.throws(
  () => context.mhAssertOperationsManager_({ role: 'EXECUTOR_EDITOR', organization: 'NS' }),
  /operations_manager_required/,
);

context.mhHashToken_ = (value) => `hash:${value}`;
context.mhConstantTimeEquals_ = (left, right) => left === right;
context.mhSetting_ = () => context.mhHashToken_('runner-secret-that-is-long-enough-1234');
context.mhRunDailyBackup = (force) => ({ ok: true, force });
context.mhVerifyLatestBackup = () => ({ ok: true, verifiedSheets: 21 });
assert.throws(
  () => context.mhRunScheduledBackup_({ runnerSecret: 'wrong-runner-secret' }),
  /invalid_backup_runner/,
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.mhRunScheduledBackup_({ runnerSecret: 'runner-secret-that-is-long-enough-1234' }))),
  { ok: true, force: false, verification: { ok: true, verifiedSheets: 21 } },
);

const manifest = { sheets: { A: { rows: 2, columns: 2, digest: 'same' } } };
assert.deepEqual(
  JSON.parse(JSON.stringify(context.mhCompareBackupManifests_(manifest, manifest))),
  { ok: true, missingSheets: [], mismatchedSheets: [], verifiedSheets: 1 },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.mhCompareBackupManifests_(manifest, { sheets: { A: { rows: 2, columns: 2, digest: 'different' } } }))),
  { ok: false, missingSheets: [], mismatchedSheets: ['A'], verifiedSheets: 0 },
);

console.log('Operations maintenance authorization checks passed.');
