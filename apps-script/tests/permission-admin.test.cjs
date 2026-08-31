const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isFinite };
vm.createContext(context);
vm.runInContext(
  ['Config.gs', 'Utils.gs', 'PermissionAdmin.gs']
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
    .join('\n'),
  context,
  { filename: 'permission-admin-bundle.gs' },
);

assert.deepEqual(
  Array.from(context.mhNormalizeAllowedPages_(['tasks', 'overview', 'tasks', 'forbidden'])),
  ['overview', 'tasks'],
);
assert.equal(context.mhPageForReadAction_('project_overview', {}), 'overview');
assert.equal(context.mhPageForReadAction_('project_plan', {}), 'plan');
assert.equal(context.mhPageForReadAction_('tasks', {}), 'tasks');
assert.equal(context.mhPageForReadAction_('contents', {}), 'content');
assert.equal(context.mhPageForReadAction_('performance_tracking', {}), 'tracking');
assert.equal(context.mhPageForReadAction_('performance', {}), 'performance');
assert.equal(context.mhPageForReadAction_('activity', {}), 'files');
assert.deepEqual(
  Array.from(context.mhAllowedPagesForMembership_({ allowed_pages_json: '["overview","tasks"]' })),
  ['overview', 'tasks'],
);
assert.deepEqual(
  Array.from(context.mhAllowedPagesForMembership_({ allowed_pages_json: '' })),
  ['overview', 'plan', 'tasks', 'content', 'tracking', 'performance', 'files'],
);
assert.throws(
  () => context.mhRequirePageAccess_(
    { role: 'CLIENT_VIEWER' },
    { allowedPages: ['overview'] },
    'tasks',
    {},
  ),
  /page_access_denied/,
);
assert.doesNotThrow(() => context.mhAssertPermissionManager_({ role: 'MASTER', organization: 'POCKET' }));
assert.doesNotThrow(() => context.mhAssertPermissionManager_({ role: 'POCKET_MANAGER', organization: 'POCKET' }));
assert.throws(
  () => context.mhAssertPermissionManager_({ role: 'POCKET_MANAGER', organization: 'NS' }),
  /permission_admin_requires_manager/,
);
assert.throws(
  () => context.mhAssertPermissionManager_({ role: 'EXECUTOR_EDITOR', organization: 'NS' }),
  /permission_admin_requires_manager/,
);
const permissionSource = fs.readFileSync(path.join(root, 'PermissionAdmin.gs'), 'utf8');
assert.match(permissionSource, /operation !== 'REMOVE_ACCESS'/);
assert.match(permissionSource, /removed\.archived_at = now/);
assert.match(permissionSource, /mhInvalidateClientReadCache_\(projectId\)/);

console.log('Permission administration contract checks passed.');
