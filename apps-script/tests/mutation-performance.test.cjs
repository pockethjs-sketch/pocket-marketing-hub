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
  PropertiesService: {
    getScriptProperties: () => ({
      getProperties: () => ({ SHEET_ID: 'test-sheet' }),
    }),
  },
  CacheService: {
    getScriptCache: () => ({
      get: () => null,
      put: () => {},
      remove: () => {},
    }),
  },
  Utilities: {
    newBlob: (value) => ({ getBytes: () => Buffer.from(String(value)).toJSON().data }),
    formatDate: (value) => new Date(value).toISOString(),
  },
  SpreadsheetApp: { flush: () => {} },
};
vm.createContext(context);
vm.runInContext(
  ['Config.gs', 'Utils.gs', 'Sheets.gs']
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
    .join('\n'),
  context,
  { filename: 'mutation-performance-bundle.gs' },
);

const sheets = new Map();
const reads = new Map();
const writes = { setValue: 0, setValues: 0, payloads: [] };
const makeSheet = (name, headers, rows) => {
  const sheet = {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => headers.length,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => {
        reads.set(name, (reads.get(name) || 0) + 1);
        if (row === 1) return [headers, ...rows];
        return [rows[row - 2].slice(column - 1, column - 1 + columnCount)];
      },
      getFormulas: () => [Array(columnCount).fill('')],
      setValue: () => { writes.setValue += 1; },
      setValues: (payload) => { writes.setValues += 1; writes.payloads.push(payload); },
    }),
  };
  sheets.set(name, sheet);
  return sheet;
};
makeSheet('06_업무', ['task_id', 'title', 'row_version'], [['TSK-1', '기존', 1]]);
context.MH_SPREADSHEET_CACHE = { getSheetByName: (name) => sheets.get(name) };

// A mutation execution should invalidate once, then reuse each table's memory
// entry for all subsequent reads in that execution.
context.mhBeginMutationTables_();
context.mhReadTable_('06_업무');
context.mhReadTable_('06_업무');
assert.equal(reads.get('06_업무'), 1);

context.mhUpdateRecord_(context.mhReadTable_('06_업무'), 2, {
  task_id: 'TSK-1',
  title: '변경',
  row_version: 2,
});
assert.equal(writes.setValues, 1);
assert.equal(writes.setValue, 0);

makeSheet('formula-sheet', ['task_id', 'title', 'computed'], [['TSK-2', '기존', '계산 결과']]);
const formulaSheet = sheets.get('formula-sheet');
formulaSheet.getRange = (row, column, rowCount, columnCount) => ({
  getValues: () => row === 1
    ? [['task_id', 'title', 'computed'], ['TSK-2', '기존', '계산 결과']]
    : [['TSK-2', '기존', '계산 결과']],
  getFormulas: () => row === 1 ? [['', '', ''], ['', '', '=A2']] : [['', '', '=A2']],
  setValue: () => { writes.setValue += 1; },
  setValues: (payload) => { writes.setValues += 1; writes.payloads.push(payload); },
  setFormulas: () => {},
});
context.mhUpdateRecord_(context.mhReadTable_('formula-sheet'), 2, {
  task_id: 'TSK-2',
  title: '변경',
});
assert.deepEqual(JSON.parse(JSON.stringify(writes.payloads.at(-1))), [['TSK-2', '변경', '=A2']]);
assert.equal(writes.setValue, 0);

console.log('Mutation performance checks passed.');
