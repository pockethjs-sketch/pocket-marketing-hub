const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isFinite };
vm.createContext(context);
vm.runInContext(
  ['Config.gs', 'Utils.gs', 'Mutations.gs']
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
    .join('\n'),
  context,
  { filename: 'kpi-mutations-bundle.gs' },
);

const spec = context.MH_ENTITY_SPECS.kpi_definition;
assert.ok(spec, 'KPI definition mutation spec is required');
assert.equal(spec.sheet, '11_KPI정의');
assert.deepEqual(Array.from(spec.operations), ['CREATE', 'UPDATE', 'ARCHIVE']);
assert.ok(spec.fields.includes('target_value'));
assert.ok(spec.fields.includes('customer_visible'));
assert.equal(context.mhCleanFieldValue_('target_value', 120), 120);
assert.equal(context.mhCleanFieldValue_('customer_visible', false), false);

const record = { kpi_id: 'KPI-TEST' };
context.mhApplyCreateDefaults_(record, 'kpi_definition', { userId: 'USR-TEST' }, '2026-08-27T00:00:00.000Z');
assert.equal(record.metric_code, 'CUSTOM_KPI_TEST');
assert.equal(record.aggregation_code, 'SUM');
assert.equal(record.display_order, 999);

console.log('KPI mutation contract checks passed.');
