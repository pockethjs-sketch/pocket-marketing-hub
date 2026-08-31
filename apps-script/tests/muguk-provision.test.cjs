const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrations = fs.readFileSync(path.join(root, 'Migrations.gs'), 'utf8');
const router = fs.readFileSync(path.join(root, 'Router.gs'), 'utf8');

assert.match(migrations, /function mhProvisionMugukProject_\(actor\)/);
assert.match(migrations, /clientId\s*=\s*'CLT-MUGUK'/);
assert.match(migrations, /projectId\s*=\s*'PRJ-MUGUK-MKT-001'/);
assert.match(migrations, /project_name:\s*'무극 통합 마케팅 운영'/);
assert.match(migrations, /sourceProjectId\s*=\s*'PRJ-UND-90D-001'/);
assert.match(router, /action === 'provision_muguk'/);
assert.match(router, /mhProvisionMugukProject_\(actor\)/);

console.log('Muguk project provisioning contract checks passed.');
