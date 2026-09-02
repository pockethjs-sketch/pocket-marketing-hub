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
  { filename: 'gantt-schedule-bundle.gs' },
);

assert.ok(context.MH_ENTITY_SPECS.task.fields.includes('schedule_dates_json'));

const painted = {
  planned_start_date: '2026-09-01',
  due_date: '2026-09-05',
  schedule_dates_json: '["2026-09-05","2026-09-01","2026-09-05"]',
};
context.mhApplyTaskGanttSchedule_(painted, { schedule_dates_json: painted.schedule_dates_json }, 'task');
assert.equal(painted.schedule_dates_json, '["2026-09-01","2026-09-05"]');
assert.equal(painted.planned_start_date, '2026-09-01');
assert.equal(painted.due_date, '2026-09-05');

const erased = {
  planned_start_date: '2026-09-01',
  due_date: '2026-09-05',
  schedule_dates_json: '[]',
};
context.mhApplyTaskGanttSchedule_(erased, { schedule_dates_json: '[]' }, 'task');
assert.equal(erased.planned_start_date, '');
assert.equal(erased.due_date, '');

const manualDateEdit = {
  planned_start_date: '2026-09-02',
  due_date: '2026-09-04',
  schedule_dates_json: '["2026-09-01","2026-09-05"]',
};
context.mhApplyTaskGanttSchedule_(
  manualDateEdit,
  { planned_start_date: '2026-09-02' },
  'task',
  { planned_start_date: '2026-09-01', due_date: '2026-09-04' },
);
assert.equal(manualDateEdit.schedule_dates_json, '');

const ordinaryEdit = {
  planned_start_date: '2026-09-01',
  due_date: '2026-09-05',
  schedule_dates_json: '["2026-09-01","2026-09-03","2026-09-05"]',
};
context.mhApplyTaskGanttSchedule_(
  ordinaryEdit,
  { title: '제목만 수정', planned_start_date: '2026-09-01', due_date: '2026-09-05' },
  'task',
  { planned_start_date: '2026-09-01', due_date: '2026-09-05' },
);
assert.equal(ordinaryEdit.schedule_dates_json, '["2026-09-01","2026-09-03","2026-09-05"]');

assert.throws(
  () => context.mhApplyTaskGanttSchedule_({ schedule_dates_json: '["bad"]' }, { schedule_dates_json: '["bad"]' }, 'task'),
  /invalid_schedule_date/,
);

console.log('Gantt schedule mutation checks passed.');
