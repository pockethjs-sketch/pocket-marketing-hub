const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
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
};

vm.createContext(context);
vm.runInContext(
  ['Config.gs', 'Utils.gs', 'Mutations.gs']
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
    .join('\n'),
  context,
  { filename: 'task-status-transitions-bundle.gs' },
);

const primaryStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'ON_HOLD'];

for (const previous of primaryStatuses) {
  for (const next of primaryStatuses) {
    assert.doesNotThrow(
      () => context.mhValidateStatusTransition_(
        { status_code: next },
        { status_code: previous },
        'task',
      ),
      `expected task transition ${previous} -> ${next} to be allowed`,
    );
  }
}

// Content keeps its stricter publishing workflow.
assert.throws(
  () => context.mhValidateStatusTransition_(
    { status_code: 'PUBLISHED' },
    { status_code: 'IDEA' },
    'content',
  ),
  /invalid_status_transition/,
);

console.log('Task status transition checks passed.');
