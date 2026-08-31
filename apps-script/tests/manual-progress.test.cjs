const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mutations = fs.readFileSync(path.join(root, 'Mutations.gs'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'Setup.gs'), 'utf8');
const router = fs.readFileSync(path.join(root, 'Router.gs'), 'utf8');

assert.doesNotMatch(mutations, /nextTaskStatus\s*===\s*'DONE'/);
assert.match(mutations, /record\.progress_percent\s*=\s*0/);
assert.match(setup, /function mhSetupResetDerivedTaskProgress\(\)/);
assert.match(setup, /setValues\(values\)\.setNumberFormat\('0'\)/);
assert.match(router, /action === 'reset_derived_task_progress'/);

console.log('Manual-only task progress contract checks passed.');
