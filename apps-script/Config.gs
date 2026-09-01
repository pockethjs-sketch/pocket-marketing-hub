/**
 * Pocket Marketing Hub - server configuration.
 *
 * Secrets and deployment-specific values MUST live in Script Properties.
 * This file is safe to keep in a public repository.
 */

var MH_CONTRACT_VERSION = '2026-08-27-outcome-tracking-v11';
var MH_SCHEMA_VERSION = '2026-08-27-page-access-v4';
var MH_BACKEND_VERSION = '2026-09-01-und-task-structure-v37';

// Login is required. Public preview sessions cannot read internal plans or
// mutate tasks even if stale preview configuration remains in Script Properties.
var MH_PUBLIC_INTERNAL_PLAN_ENABLED = false;
var MH_PUBLIC_TASK_WRITES_ENABLED = false;

var MH_PROPERTY_KEYS = {
  SHEET_ID: 'SHEET_ID',
  ALLOWED_EMAIL_DOMAINS: 'ALLOWED_EMAIL_DOMAINS',
  ENABLE_WRITES: 'ENABLE_WRITES',
  ACCESS_ACCOUNTS_JSON: 'ACCESS_ACCOUNTS_JSON',
  ACCESS_ACCOUNT_PREFIX: 'ACCESS_ACCOUNT_',
  ACCESS_CODE_PEPPER: 'ACCESS_CODE_PEPPER',
  SESSION_SIGNING_SECRET: 'SESSION_SIGNING_SECRET',
  SESSION_TTL_SECONDS: 'SESSION_TTL_SECONDS',
  SESSION_VERSION: 'SESSION_VERSION',
  PUBLIC_PREVIEW_ENABLED: 'PUBLIC_PREVIEW_ENABLED',
  PUBLIC_PREVIEW_EMAIL: 'PUBLIC_PREVIEW_EMAIL',
  PUBLIC_PREVIEW_PROJECT_IDS: 'PUBLIC_PREVIEW_PROJECT_IDS',
  BACKUP_FOLDER_ID: 'BACKUP_FOLDER_ID',
  BACKUP_RETENTION_DAYS: 'BACKUP_RETENTION_DAYS',
  BACKUP_LAST_SUCCESS_AT: 'BACKUP_LAST_SUCCESS_AT',
  BACKUP_RUNNER_DIGEST: 'BACKUP_RUNNER_DIGEST'
};

var MH_SHEETS = {
  CLIENTS: '01_고객사',
  PROJECTS: '02_프로젝트',
  USERS: '03_사용자',
  MEMBERSHIPS: '04_프로젝트권한',
  CHANNELS: '05_프로젝트채널',
  TASKS: '06_업무',
  TASK_DEPENDENCIES: '07_업무의존성',
  CONTENTS: '08_콘텐츠',
  CONTENT_VERSIONS: '09_콘텐츠버전',
  APPROVALS: '10_승인',
  KPI_DEFINITIONS: '11_KPI정의',
  DAILY_PERFORMANCE: '12_성과일별',
  KPI_ACTUALS: '13_KPI실적',
  FILES: '14_파일링크',
  ACTIVITY: '15_활동로그',
  SYNC_STATUS: '16_동기화상태',
  PLANS: '17_실행계획',
  PLAN_SECTIONS: '18_실행계획섹션',
  DAILY_MEETINGS: '19_데일리회의록',
  MUTATIONS: '20_뮤테이션',
  BACKUP_LOG: '21_백업로그'
};

var MH_VISIBILITY_LEVEL = {
  CLIENT: 1,
  PROJECT_TEAM: 2,
  POCKET_ONLY: 3,
  // Legacy rows are intentionally treated as the narrowest scope.
  INTERNAL: 3
};

var MH_ROLE_VISIBILITY_LEVEL = {
  CLIENT_VIEWER: 1,
  EXECUTOR_EDITOR: 2,
  POCKET_EDITOR: 3,
  POCKET_MANAGER: 3,
  MASTER: 3,
  SYSTEM: 3
};

var MH_INTERACTIVE_ROLES = {
  MASTER: true,
  POCKET_MANAGER: true,
  POCKET_EDITOR: true,
  EXECUTOR_EDITOR: true,
  CLIENT_VIEWER: true
};

var MH_READ_ACTIONS = {
  bootstrap: true,
  project_overview: true,
  project_plan: true,
  project_snapshot: true,
  tasks: true,
  contents: true,
  approvals: true,
  performance: true,
  performance_tracking: true,
  files: true,
  activity: true,
  daily_meetings: true
};

var MH_WRITE_PERMISSIONS = { ADMIN: true, EDIT: true };
var MH_READ_PERMISSIONS = { ADMIN: true, EDIT: true, READ_ONLY: true };

var MH_FIELD_ENUMS = {
  visibility_code: ['POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT'],
  priority_code: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
  responsible_org_code: ['POCKET', 'NS', 'CLIENT'],
  reviewer_org_code: ['POCKET', 'NS', 'CLIENT'],
  approval_entity_type: ['PROJECT', 'TASK', 'CONTENT', 'FILE'],
  approval_status_code: ['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'],
  task_status_code: ['NOT_STARTED', 'IN_PROGRESS', 'INTERNAL_REVIEW', 'WAITING_CLIENT', 'REVISION', 'BLOCKED', 'ON_HOLD', 'DONE', 'CANCELLED'],
  content_status_code: ['IDEA', 'DRAFT', 'PLANNED', 'PRODUCTION', 'IN_PROGRESS', 'INTERNAL_REVIEW', 'REVISION', 'READY', 'PUBLISHED', 'BLOCKED', 'ON_HOLD', 'CANCELLED'],
  linked_entity_type: ['PROJECT', 'TASK', 'CONTENT', 'APPROVAL', 'FILE']
};

var MH_ENTITY_SPECS = {
  project: {
    sheet: '02_프로젝트',
    idField: 'project_id',
    idPrefix: 'PRJ',
    operations: ['UPDATE'],
    fields: ['start_date'],
    required: []
  },
  task: {
    sheet: '06_업무',
    idField: 'task_id',
    idPrefix: 'TSK',
    fields: [
      'source_task_id', 'parent_task_id', 'phase_code', 'workstream_code',
      'category_code', 'title', 'description', 'plan_week', 'plan_note', 'responsible_org_code',
      'assignee_user_id', 'reviewer_org_code', 'status_code', 'priority_code',
      'planned_start_date', 'due_date', 'completed_at', 'blocker_reason',
      'customer_status_text', 'progress_percent', 'completion_url', 'remarks',
      'visibility_code', 'sort_order'
    ],
    required: [
      'phase_code', 'workstream_code', 'title', 'responsible_org_code',
      'reviewer_org_code', 'status_code', 'priority_code', 'visibility_code'
    ]
  },
  content: {
    sheet: '08_콘텐츠',
    idField: 'content_id',
    idPrefix: 'CNT',
    fields: [
      'task_id', 'channel_code', 'format_code', 'title', 'objective',
      'content_pillar', 'status_code', 'assignee_user_id', 'planned_date',
      'shoot_date', 'review_due_date', 'publish_due_date', 'published_at',
      'current_version_no', 'publish_url', 'visibility_code', 'notes'
    ],
    required: [
      'channel_code', 'format_code', 'title', 'status_code',
      'current_version_no', 'visibility_code'
    ]
  },
  approval: {
    sheet: '10_승인',
    idField: 'approval_id',
    idPrefix: 'APR',
    fields: [
      'entity_type', 'entity_id', 'requested_at', 'approver_user_id',
      'status_code', 'responded_at', 'response_note', 'visibility_code'
    ],
    required: [
      'entity_type', 'entity_id', 'requested_at', 'status_code',
      'visibility_code'
    ]
  },
  kpi_definition: {
    sheet: '11_KPI정의',
    idField: 'kpi_id',
    idPrefix: 'KPI',
    operations: ['CREATE', 'UPDATE', 'ARCHIVE'],
    fields: [
      'phase_code', 'channel_code', 'metric_code', 'metric_name',
      'unit_code', 'period_type_code', 'baseline_value', 'target_value',
      'aggregation_code', 'display_order', 'customer_visible'
    ],
    required: [
      'metric_code', 'metric_name', 'unit_code', 'period_type_code',
      'target_value', 'aggregation_code', 'display_order'
    ]
  },
  file: {
    sheet: '14_파일링크',
    idField: 'file_id',
    idPrefix: 'FIL',
    fields: [
      'entity_type', 'entity_id', 'title', 'file_type_code',
      'storage_provider_code', 'url', 'source_filename', 'visibility_code',
      'notes'
    ],
    required: [
      'entity_type', 'entity_id', 'title', 'storage_provider_code',
      'visibility_code'
    ]
  },
  daily_meeting: {
    sheet: '19_데일리회의록',
    idField: 'meeting_id',
    idPrefix: 'MTG',
    fields: [
      'meeting_date', 'title', 'attendees_text', 'discussion_text',
      'decisions_text', 'action_items_text', 'visibility_code'
    ],
    required: [
      'meeting_date', 'title', 'discussion_text', 'visibility_code'
    ]
  }
};

var MH_PAGE_DEFAULT = 30;
var MH_PAGE_MAX = 200;
var MH_ACTIVITY_PAGE_MAX = 50;
var MH_CONTENT_DATE_LIMIT_DAYS = 92;
var MH_PERFORMANCE_DATE_LIMIT_DAYS = 366;
var MH_LOCK_TIMEOUT_MS = 20000;
var MH_SESSION_TTL_DEFAULT_SECONDS = 28800;
var MH_SESSION_TTL_MAX_SECONDS = 43200;
var MH_SETTINGS_MEMORY_CACHE = null;

function mhSettings_() {
  if (!MH_SETTINGS_MEMORY_CACHE) {
    MH_SETTINGS_MEMORY_CACHE = PropertiesService.getScriptProperties().getProperties();
  }
  return MH_SETTINGS_MEMORY_CACHE;
}

function mhSetting_(key, fallback) {
  var properties = mhSettings_();
  var propertyValue = Object.prototype.hasOwnProperty.call(properties, key)
    ? properties[key]
    : null;
  if (propertyValue !== null && propertyValue !== undefined && String(propertyValue) !== '') {
    return propertyValue;
  }
  if (typeof MH_LOCAL_SECRETS !== 'undefined' && MH_LOCAL_SECRETS &&
      Object.prototype.hasOwnProperty.call(MH_LOCAL_SECRETS, key)) {
    var localValue = MH_LOCAL_SECRETS[key];
    if (localValue !== null && localValue !== undefined && String(localValue) !== '') return localValue;
  }
  return fallback;
}
