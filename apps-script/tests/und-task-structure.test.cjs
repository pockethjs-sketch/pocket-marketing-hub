const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'UndTaskStructure.gs'), 'utf8');
const operations = fs.readFileSync(path.join(root, 'Operations.gs'), 'utf8');
const utils = fs.readFileSync(path.join(root, 'Utils.gs'), 'utf8');
const readApi = fs.readFileSync(path.join(root, 'ReadApi.gs'), 'utf8');

assert.match(source, /MH_UND_STRUCTURE_DEFAULT_START = '2026-08-25'/);
assert.match(source, /Date\.UTC/);
assert.match(source, /setIfBlank\(row, 'description'/);
assert.match(source, /setIfBlank\(row, 'planned_start_date'/);
assert.match(source, /setIfBlank\(row, 'due_date'/);
assert.match(source, /setIfBlank\(row, 'remarks'/);
assert.match(source, /summary\.withStartDate === 144/);
assert.match(source, /mhInvalidateClientReadCache_\(MH_UND_STRUCTURE_PROJECT_ID\)/);
assert.match(operations, /operation === 'sync_und_task_structure'/);
assert.match(operations, /operation === 'audit_und_task_structure'/);
assert.match(utils, /CacheService serializes spreadsheet Date values as UTC ISO strings/);
assert.match(readApi, /'category_code', 'title', 'description', 'status_code'/);

const dateOnlySource = utils.match(/function mhDateOnly_\(value\) \{[\s\S]*?\n\}/)[0];
const dateContext = {
  Utilities: {
    formatDate(value) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date(value));
      const get = (type) => parts.find((part) => part.type === type).value;
      return `${get('year')}-${get('month')}-${get('day')}`;
    },
  },
};
vm.createContext(dateContext);
vm.runInContext(dateOnlySource, dateContext);
assert.equal(dateContext.mhDateOnly_('2026-08-25'), '2026-08-25');
assert.equal(dateContext.mhDateOnly_('2026-08-24T15:00:00.000Z'), '2026-08-25');

const context = {
  Utilities: {
    formatDate(value) {
      const date = new Date(value);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
  },
  mhDateOnly_: (value) => String(value || ''),
  mhAsText_: (value) => String(value || '').trim(),
  mhApiError_: (code, message) => Object.assign(new Error(message), { apiCode: code }),
};
vm.createContext(context);
vm.runInContext(source, context);
const ranges = context.mhUndStructurePhaseRanges_('2026-08-25');
assert.deepEqual(
  Object.fromEntries(Object.entries(ranges).map(([phase, range]) => [phase, [
    context.mhUndStructureDateText_(range.start),
    context.mhUndStructureDateText_(range.end),
  ]])),
  {
    P0: ['2026-08-25', '2026-09-14'],
    M1: ['2026-09-15', '2026-10-14'],
    M2: ['2026-10-15', '2026-11-13'],
    M3: ['2026-11-16', '2026-12-15'],
  },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.mhUndStructureTaskDates_({ phase: 'P0', week: 1 }, ranges))),
  { start: '2026-08-25', end: '2026-08-31' },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.mhUndStructureTaskDates_({ phase: 'M1', week: 5 }, ranges))),
  { start: '2026-10-13', end: '2026-10-14' },
);
assert.equal(
  context.mhUndStructureDateText_(context.mhUndStructureSheetDate_('2026-08-25')),
  '2026-08-25',
);

console.log('UND explicit task structure contract checks passed.');
