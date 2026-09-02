const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'CampaignScheduleMigration.gs'), 'utf8');
const operations = fs.readFileSync(path.join(root, 'Operations.gs'), 'utf8');

assert.match(operations, /operation === 'migrate_campaign_schedule_v1'/);
assert.match(migration, /mhAssertOperationsManager_\(actor\)/);
assert.match(migration, /mhRunDailyBackup\(true\)/);
assert.match(migration, /mhSetupEnsureTaskTableFields\(\)/);
assert.match(migration, /mhCampaignScheduleReconcileExisting_/);
assert.match(migration, /function mhCampaignScheduleComparable_\(field, value\)/);
assert.match(migration, /field === 'planned_start_date' \|\| field === 'due_date'/);
assert.match(migration, /field === 'schedule_dates_json'/);
assert.match(migration, /campaign_schedule_target_not_empty/);
assert.match(migration, /PRJ-MUGUK-MKT-001/);
assert.match(migration, /PRJ-UND-90D-001/);
assert.match(migration, /source_code = 'CAMPAIGN_SCHEDULE_HTML'/);
assert.match(migration, /entity_type: 'TASK_BATCH'/);
assert.match(migration, /progress_percent: 0/);
assert.match(migration, /visibility_code: 'CLIENT'/);
assert.match(migration, /완료링크 원문:/);

console.log('Campaign schedule migration safety checks passed.');
