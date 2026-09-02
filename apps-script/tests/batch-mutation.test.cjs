const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const router = fs.readFileSync(path.join(root, 'Router.gs'), 'utf8');
const mutations = fs.readFileSync(path.join(root, 'Mutations.gs'), 'utf8');
const sheets = fs.readFileSync(path.join(root, 'Sheets.gs'), 'utf8');
const operations = fs.readFileSync(path.join(root, 'Operations.gs'), 'utf8');

assert.match(router, /action === 'mutate_batch'/);
assert.match(mutations, /function mhHandleMutationBatch_/);
assert.match(mutations, /mutations\.length > 40/);
assert.match(mutations, /mhRequireProjectAccess_\(actor, projectId, true\)/);
assert.match(mutations, /function mhFindMutationLogsBatch_/);
assert.match(mutations, /logsByMutationId\[item\.mutationId\]/);
assert.match(mutations, /mhAppendRecordsToTable_\(activityTable,[\s\S]*prepareLog/);
assert.match(mutations, /mhUpdateRecords_\(pending\[0\]\.existingResult\.table/);
assert.match(mutations, /mhRememberMutationRegistries_/);
assert.match(mutations, /mhInvalidateClientReadCache_\(projectId\)/);
assert.match(sheets, /function mhAppendRecordsToTable_/);
assert.match(sheets, /function mhUpdateRecords_/);
assert.match(operations, /function mhRememberMutationRegistries_/);

console.log('Batch mutation contract checks passed.');
