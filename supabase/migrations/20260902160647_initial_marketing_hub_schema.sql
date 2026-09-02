-- Pocket Marketing Hub: Supabase development schema.
-- The Google Sheets + Apps Script path remains the production source until
-- migration verification and an explicit cutover.

create schema if not exists private;
revoke all on schema private from public;

create table public.clients (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  slug text not null unique,
  display_name text not null,
  status_code text not null default 'ACTIVE' check (status_code in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.projects (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  client_id bigint not null references public.clients(id),
  project_name text not null,
  description text,
  phase_code text,
  status_code text not null default 'ACTIVE' check (status_code in ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'DISABLED')),
  start_date date,
  end_date date,
  client_view_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_id text unique,
  email text,
  display_name text not null,
  organization_code text not null check (organization_code in ('POCKET', 'NS', 'CLIENT')),
  role_code text not null check (role_code in ('POCKET_MANAGER', 'POCKET_EDITOR', 'EXECUTOR_EDITOR', 'CLIENT_VIEWER')),
  status_code text not null default 'ACTIVE' check (status_code in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.project_memberships (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  user_id uuid not null references public.profiles(id),
  permission_code text not null check (permission_code in ('ADMIN', 'EDIT', 'READ_ONLY')),
  allowed_pages text[] not null default array['overview', 'plan', 'tasks', 'daily', 'performance', 'files']::text[],
  status_code text not null default 'ACTIVE' check (status_code in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz
);

create unique index project_memberships_active_user_project_uidx
  on public.project_memberships(user_id, project_id)
  where archived_at is null and status_code = 'ACTIVE';

create table public.project_channels (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  channel_code text not null,
  channel_name text not null,
  account_name text,
  account_url text,
  customer_visible boolean not null default true,
  status_code text not null default 'ACTIVE' check (status_code in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index project_channels_active_code_uidx
  on public.project_channels(project_id, channel_code)
  where archived_at is null;

create table public.tasks (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  source_task_id text,
  project_id bigint not null references public.projects(id),
  parent_task_id bigint references public.tasks(id),
  phase_code text not null,
  workstream_code text not null check (workstream_code in ('MARKETING', 'DESIGN', 'VIDEO')),
  category_code text,
  title text not null,
  description text,
  plan_week smallint check (plan_week is null or plan_week > 0),
  plan_note text,
  responsible_org_code text not null check (responsible_org_code in ('POCKET', 'NS', 'CLIENT')),
  assignee_user_id uuid references public.profiles(id),
  reviewer_org_code text not null check (reviewer_org_code in ('POCKET', 'NS', 'CLIENT')),
  status_code text not null default 'NOT_STARTED' check (status_code in ('NOT_STARTED', 'IN_PROGRESS', 'INTERNAL_REVIEW', 'WAITING_CLIENT', 'REVISION', 'BLOCKED', 'ON_HOLD', 'DONE', 'CANCELLED')),
  priority_code text not null default 'NORMAL' check (priority_code in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  planned_start_date date,
  due_date date,
  schedule_dates date[],
  completed_at timestamptz,
  blocker_reason text,
  customer_status_text text,
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  completion_url text,
  remarks text,
  visibility_code text not null default 'PROJECT_TEAM' check (visibility_code in ('POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT')),
  source_code text,
  sort_order integer not null default 0,
  created_by_user_id uuid references public.profiles(id),
  updated_by_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz,
  last_mutation_id text,
  check (due_date is null or planned_start_date is null or due_date >= planned_start_date)
);

create unique index tasks_active_source_uidx
  on public.tasks(project_id, source_task_id)
  where archived_at is null and source_task_id is not null;

create table public.task_dependencies (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  predecessor_task_id bigint not null references public.tasks(id),
  successor_task_id bigint not null references public.tasks(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (predecessor_task_id <> successor_task_id)
);

create unique index task_dependencies_active_pair_uidx
  on public.task_dependencies(predecessor_task_id, successor_task_id)
  where archived_at is null;

create table public.contents (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  task_id bigint references public.tasks(id),
  project_channel_id bigint references public.project_channels(id),
  channel_code text not null,
  format_code text not null,
  title text not null,
  objective text,
  content_pillar text,
  status_code text not null,
  assignee_user_id uuid references public.profiles(id),
  planned_date date,
  shoot_date date,
  review_due_date date,
  publish_due_date date,
  published_at timestamptz,
  current_version_no integer not null default 1 check (current_version_no > 0),
  publish_url text,
  visibility_code text not null default 'PROJECT_TEAM' check (visibility_code in ('POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT')),
  notes text,
  created_by_user_id uuid references public.profiles(id),
  updated_by_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz
);

create table public.content_versions (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  content_id bigint not null references public.contents(id),
  version_no integer not null check (version_no > 0),
  file_url text,
  copy_text text,
  change_summary text,
  status_code text not null,
  created_by_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(content_id, version_no)
);

create table public.approvals (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  entity_type text not null check (entity_type in ('PROJECT', 'TASK', 'CONTENT', 'FILE')),
  entity_id bigint not null,
  requested_by_user_id uuid references public.profiles(id),
  requested_at timestamptz not null default now(),
  approver_user_id uuid references public.profiles(id),
  status_code text not null default 'REQUESTED' check (status_code in ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  responded_at timestamptz,
  response_note text,
  visibility_code text not null default 'PROJECT_TEAM' check (visibility_code in ('POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz
);

create table public.kpi_definitions (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  phase_code text,
  channel_code text,
  metric_code text not null,
  metric_name text not null,
  unit_code text not null,
  period_type_code text not null,
  baseline_value numeric,
  target_value numeric not null,
  aggregation_code text not null,
  display_order integer not null default 0,
  customer_visible boolean not null default false,
  created_by_user_id uuid references public.profiles(id),
  updated_by_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz
);

create unique index kpi_definitions_active_metric_uidx
  on public.kpi_definitions(project_id, metric_code, coalesce(channel_code, ''))
  where archived_at is null;

create table public.daily_performance (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  performance_date date not null,
  channel_code text not null,
  metric_code text not null,
  metric_value numeric not null,
  source_code text,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index daily_performance_active_metric_uidx
  on public.daily_performance(project_id, performance_date, channel_code, metric_code)
  where archived_at is null;

create table public.kpi_actuals (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  kpi_id bigint not null references public.kpi_definitions(id),
  period_start date not null,
  period_end date not null,
  actual_value numeric not null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (period_end >= period_start)
);

create unique index kpi_actuals_active_period_uidx
  on public.kpi_actuals(kpi_id, period_start, period_end)
  where archived_at is null;

create table public.file_links (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  entity_type text not null check (entity_type in ('PROJECT', 'TASK', 'CONTENT', 'APPROVAL', 'FILE')),
  entity_id bigint not null,
  title text not null,
  file_type_code text,
  storage_provider_code text not null,
  url text not null,
  source_filename text,
  visibility_code text not null default 'PROJECT_TEAM' check (visibility_code in ('POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT')),
  notes text,
  uploaded_by_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz
);

create table public.activity_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  mutation_id text,
  project_id bigint not null references public.projects(id),
  entity_type text not null,
  entity_id bigint,
  action_code text not null check (action_code in ('CREATED', 'UPDATED', 'ARCHIVED', 'RESTORED', 'MIGRATED')),
  before_data jsonb,
  after_data jsonb,
  visibility_code text not null default 'PROJECT_TEAM' check (visibility_code in ('POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT')),
  actor_user_id uuid references public.profiles(id),
  actor_role_code text,
  event_status_code text not null default 'COMMIT' check (event_status_code in ('PREPARE', 'COMMIT', 'FAILED')),
  created_at timestamptz not null default now()
);

create table public.sync_status (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  source_code text not null,
  status_code text not null check (status_code in ('IDLE', 'RUNNING', 'SUCCESS', 'FAILED')),
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  error_code text,
  error_message text,
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index sync_status_active_source_uidx
  on public.sync_status(project_id, source_code)
  where archived_at is null;

create table public.plans (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  version_label text not null,
  title text not null,
  summary text,
  build_weeks smallint,
  operation_months smallint,
  monthly_output_target integer,
  initial_output_target integer,
  primary_goal text,
  status_code text not null default 'DRAFT' check (status_code in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  effective_at timestamptz,
  visibility_code text not null default 'PROJECT_TEAM' check (visibility_code in ('POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT')),
  source_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz
);

create unique index plans_active_version_uidx
  on public.plans(project_id, source_code, version_label)
  where archived_at is null;

create table public.plan_sections (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  plan_id bigint not null references public.plans(id),
  section_code text not null,
  nav_label text,
  title text not null,
  body_html text not null,
  sort_order integer not null default 0,
  status_code text not null default 'PUBLISHED' check (status_code in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  visibility_code text not null default 'PROJECT_TEAM' check (visibility_code in ('POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT')),
  source_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz,
  unique(plan_id, section_code)
);

create table public.daily_meetings (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  project_id bigint not null references public.projects(id),
  meeting_date date not null,
  title text not null,
  attendees_text text,
  discussion_text text not null,
  decisions_text text,
  action_items_text text,
  created_by_user_id uuid references public.profiles(id),
  updated_by_user_id uuid references public.profiles(id),
  visibility_code text not null default 'PROJECT_TEAM' check (visibility_code in ('POCKET_ONLY', 'PROJECT_TEAM', 'CLIENT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  archived_at timestamptz
);

create table public.mutations (
  mutation_id text primary key,
  request_hash text not null,
  event_status_code text not null check (event_status_code in ('PREPARE', 'COMMIT', 'FAILED')),
  entity_type text not null,
  entity_id bigint,
  project_id bigint not null references public.projects(id),
  action_code text not null,
  before_data jsonb,
  after_data jsonb,
  actor_user_id uuid references public.profiles(id),
  actor_role_code text,
  response_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.backup_runs (
  id bigint generated always as identity primary key,
  legacy_id text unique,
  file_id text,
  file_name text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status_code text not null check (status_code in ('RUNNING', 'SUCCESS', 'FAILED', 'VERIFIED')),
  message text,
  manifest jsonb,
  verified_at timestamptz,
  verification_status text,
  created_at timestamptz not null default now()
);

create table public.notification_receipts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id bigint not null references public.tasks(id) on delete cascade,
  seen_at timestamptz not null default now(),
  unique(user_id, task_id)
);

-- Every foreign-key lookup used by joins, cascades, and RLS is indexed.
create index projects_client_id_idx on public.projects(client_id);
create index project_memberships_project_id_idx on public.project_memberships(project_id);
create index project_memberships_user_id_idx on public.project_memberships(user_id);
create index project_channels_project_id_idx on public.project_channels(project_id);
create index tasks_project_active_schedule_idx on public.tasks(project_id, planned_start_date, due_date, sort_order) where archived_at is null;
create index tasks_project_active_status_idx on public.tasks(project_id, status_code, updated_at desc) where archived_at is null;
create index tasks_parent_task_id_idx on public.tasks(parent_task_id);
create index tasks_assignee_user_id_idx on public.tasks(assignee_user_id);
create index tasks_created_by_user_id_idx on public.tasks(created_by_user_id);
create index tasks_updated_by_user_id_idx on public.tasks(updated_by_user_id);
create index task_dependencies_project_id_idx on public.task_dependencies(project_id);
create index task_dependencies_predecessor_idx on public.task_dependencies(predecessor_task_id);
create index task_dependencies_successor_idx on public.task_dependencies(successor_task_id);
create index contents_project_active_date_idx on public.contents(project_id, publish_due_date, status_code) where archived_at is null;
create index contents_task_id_idx on public.contents(task_id);
create index contents_project_channel_id_idx on public.contents(project_channel_id);
create index contents_assignee_user_id_idx on public.contents(assignee_user_id);
create index contents_created_by_user_id_idx on public.contents(created_by_user_id);
create index contents_updated_by_user_id_idx on public.contents(updated_by_user_id);
create index content_versions_project_id_idx on public.content_versions(project_id);
create index content_versions_content_id_idx on public.content_versions(content_id);
create index content_versions_created_by_user_id_idx on public.content_versions(created_by_user_id);
create index approvals_project_active_status_idx on public.approvals(project_id, status_code, requested_at desc) where archived_at is null;
create index approvals_requested_by_idx on public.approvals(requested_by_user_id);
create index approvals_approver_idx on public.approvals(approver_user_id);
create index kpi_definitions_project_id_idx on public.kpi_definitions(project_id);
create index kpi_definitions_created_by_user_id_idx on public.kpi_definitions(created_by_user_id);
create index kpi_definitions_updated_by_user_id_idx on public.kpi_definitions(updated_by_user_id);
create index daily_performance_project_date_idx on public.daily_performance(project_id, performance_date desc);
create index kpi_actuals_project_id_idx on public.kpi_actuals(project_id);
create index kpi_actuals_kpi_id_idx on public.kpi_actuals(kpi_id);
create index file_links_project_active_created_idx on public.file_links(project_id, created_at desc) where archived_at is null;
create index file_links_uploaded_by_user_id_idx on public.file_links(uploaded_by_user_id);
create index activity_events_project_created_idx on public.activity_events(project_id, created_at desc);
create index activity_events_actor_user_id_idx on public.activity_events(actor_user_id);
create index sync_status_project_id_idx on public.sync_status(project_id);
create index plans_project_id_idx on public.plans(project_id);
create index plan_sections_project_sort_idx on public.plan_sections(project_id, plan_id, sort_order);
create index plan_sections_plan_id_idx on public.plan_sections(plan_id);
create index daily_meetings_project_date_idx on public.daily_meetings(project_id, meeting_date desc) where archived_at is null;
create index daily_meetings_created_by_idx on public.daily_meetings(created_by_user_id);
create index daily_meetings_updated_by_idx on public.daily_meetings(updated_by_user_id);
create index mutations_project_created_idx on public.mutations(project_id, created_at desc);
create index mutations_actor_user_id_idx on public.mutations(actor_user_id);
create index notification_receipts_user_id_idx on public.notification_receipts(user_id);
create index notification_receipts_task_id_idx on public.notification_receipts(task_id);

create or replace function private.touch_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create or replace function private.touch_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.normalize_task_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  first_date date;
  last_date date;
begin
  if new.schedule_dates is not null then
    select min(day_value), max(day_value)
      into first_date, last_date
      from unnest(new.schedule_dates) as day_value;
    new.planned_start_date := first_date;
    new.due_date := last_date;
  end if;
  if new.status_code = 'DONE' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status_code <> 'DONE' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create or replace function private.audit_project_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_data jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_data jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_project_id bigint := coalesce((new_data ->> 'project_id')::bigint, (old_data ->> 'project_id')::bigint);
  target_entity_id bigint := coalesce((new_data ->> 'id')::bigint, (old_data ->> 'id')::bigint);
  target_mutation_id text := nullif(coalesce(new_data ->> 'last_mutation_id', old_data ->> 'last_mutation_id'), '');
  action_name text;
  actor_role text;
  target_visibility text := coalesce(new_data ->> 'visibility_code', old_data ->> 'visibility_code', 'PROJECT_TEAM');
begin
  if tg_argv[0] = 'PROJECT' then
    target_project_id := target_entity_id;
    target_visibility := 'POCKET_ONLY';
  elsif tg_argv[0] = 'PROJECT_MEMBERSHIP' then
    target_visibility := 'POCKET_ONLY';
  end if;
  if tg_op = 'INSERT' then
    action_name := 'CREATED';
  elsif tg_op = 'DELETE' then
    action_name := 'ARCHIVED';
  elsif old.archived_at is null and new.archived_at is not null then
    action_name := 'ARCHIVED';
  elsif old.archived_at is not null and new.archived_at is null then
    action_name := 'RESTORED';
  else
    action_name := 'UPDATED';
  end if;

  select p.role_code into actor_role
    from public.profiles p
   where p.id = (select auth.uid());

  insert into public.activity_events (
    mutation_id, project_id, entity_type, entity_id, action_code, visibility_code,
    before_data, after_data, actor_user_id, actor_role_code, event_status_code
  ) values (
    target_mutation_id, target_project_id, tg_argv[0], target_entity_id, action_name, target_visibility,
    old_data, new_data, (select auth.uid()), actor_role, 'COMMIT'
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_project_row() from public, anon, authenticated;

create trigger projects_touch before update on public.projects for each row execute function private.touch_row();
create trigger memberships_touch before update on public.project_memberships for each row execute function private.touch_row();
create trigger tasks_normalize_schedule before insert or update on public.tasks for each row execute function private.normalize_task_schedule();
create trigger tasks_touch before update on public.tasks for each row execute function private.touch_row();
create trigger contents_touch before update on public.contents for each row execute function private.touch_row();
create trigger approvals_touch before update on public.approvals for each row execute function private.touch_row();
create trigger kpi_definitions_touch before update on public.kpi_definitions for each row execute function private.touch_row();
create trigger file_links_touch before update on public.file_links for each row execute function private.touch_row();
create trigger plans_touch before update on public.plans for each row execute function private.touch_row();
create trigger plan_sections_touch before update on public.plan_sections for each row execute function private.touch_row();
create trigger daily_meetings_touch before update on public.daily_meetings for each row execute function private.touch_row();

create trigger clients_touch before update on public.clients for each row execute function private.touch_timestamp();
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_timestamp();
create trigger project_channels_touch before update on public.project_channels for each row execute function private.touch_timestamp();
create trigger daily_performance_touch before update on public.daily_performance for each row execute function private.touch_timestamp();
create trigger kpi_actuals_touch before update on public.kpi_actuals for each row execute function private.touch_timestamp();
create trigger sync_status_touch before update on public.sync_status for each row execute function private.touch_timestamp();
create trigger mutations_touch before update on public.mutations for each row execute function private.touch_timestamp();

create trigger projects_audit after update on public.projects for each row execute function private.audit_project_row('PROJECT');
create trigger tasks_audit after insert or update on public.tasks for each row execute function private.audit_project_row('TASK');
create trigger contents_audit after insert or update on public.contents for each row execute function private.audit_project_row('CONTENT');
create trigger approvals_audit after insert or update on public.approvals for each row execute function private.audit_project_row('APPROVAL');
create trigger kpi_definitions_audit after insert or update on public.kpi_definitions for each row execute function private.audit_project_row('KPI_DEFINITION');
create trigger file_links_audit after insert or update on public.file_links for each row execute function private.audit_project_row('FILE');
create trigger daily_meetings_audit after insert or update on public.daily_meetings for each row execute function private.audit_project_row('DAILY_MEETING');
create trigger memberships_audit after insert or update on public.project_memberships for each row execute function private.audit_project_row('PROJECT_MEMBERSHIP');

create or replace function private.is_pocket_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.organization_code = 'POCKET'
       and p.role_code = 'POCKET_MANAGER'
       and p.status_code = 'ACTIVE'
       and p.archived_at is null
  );
$$;

create or replace function private.can_read_project(target_project_id bigint, row_visibility text default 'CLIENT')
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_org text;
  current_role text;
begin
  if current_user_id is null then return false; end if;
  select p.organization_code, p.role_code
    into current_org, current_role
    from public.profiles p
   where p.id = current_user_id
     and p.status_code = 'ACTIVE'
     and p.archived_at is null;
  if current_role is null then return false; end if;
  if current_org = 'POCKET' and current_role = 'POCKET_MANAGER' then return true; end if;
  if not exists (
    select 1 from public.project_memberships m
     where m.project_id = target_project_id
       and m.user_id = current_user_id
       and m.status_code = 'ACTIVE'
       and m.archived_at is null
  ) then return false; end if;
  if current_role = 'CLIENT_VIEWER' then return row_visibility = 'CLIENT'; end if;
  if current_role = 'EXECUTOR_EDITOR' then return row_visibility in ('PROJECT_TEAM', 'CLIENT'); end if;
  return current_role in ('POCKET_MANAGER', 'POCKET_EDITOR');
end;
$$;

create or replace function private.can_write_project(target_project_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_org text;
  current_role text;
begin
  if current_user_id is null then return false; end if;
  select p.organization_code, p.role_code
    into current_org, current_role
    from public.profiles p
   where p.id = current_user_id
     and p.status_code = 'ACTIVE'
     and p.archived_at is null;
  if current_org = 'POCKET' and current_role = 'POCKET_MANAGER' then return true; end if;
  if current_role not in ('POCKET_EDITOR', 'EXECUTOR_EDITOR') then return false; end if;
  return exists (
    select 1 from public.project_memberships m
     where m.project_id = target_project_id
       and m.user_id = current_user_id
       and m.permission_code in ('ADMIN', 'EDIT')
       and m.status_code = 'ACTIVE'
       and m.archived_at is null
  );
end;
$$;

create or replace function private.can_read_client(target_client_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_pocket_manager()) or exists (
    select 1
      from public.projects p
     where p.client_id = target_client_id
       and p.archived_at is null
       and (select private.can_read_project(p.id, 'CLIENT'))
  );
$$;

create or replace function private.can_read_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = target_user_id
      or (select private.is_pocket_manager())
      or exists (
        select 1
          from public.project_memberships mine
          join public.project_memberships theirs on theirs.project_id = mine.project_id
         where mine.user_id = (select auth.uid())
           and theirs.user_id = target_user_id
           and mine.status_code = 'ACTIVE'
           and theirs.status_code = 'ACTIVE'
           and mine.archived_at is null
           and theirs.archived_at is null
      );
$$;

revoke all on function private.is_pocket_manager() from public, anon;
revoke all on function private.can_read_project(bigint, text) from public, anon;
revoke all on function private.can_write_project(bigint) from public, anon;
revoke all on function private.can_read_client(bigint) from public, anon;
revoke all on function private.can_read_profile(uuid) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_pocket_manager() to authenticated, service_role;
grant execute on function private.can_read_project(bigint, text) to authenticated, service_role;
grant execute on function private.can_write_project(bigint) to authenticated, service_role;
grant execute on function private.can_read_client(bigint) to authenticated, service_role;
grant execute on function private.can_read_profile(uuid) to authenticated, service_role;

alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.profiles enable row level security;
alter table public.project_memberships enable row level security;
alter table public.project_channels enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.contents enable row level security;
alter table public.content_versions enable row level security;
alter table public.approvals enable row level security;
alter table public.kpi_definitions enable row level security;
alter table public.daily_performance enable row level security;
alter table public.kpi_actuals enable row level security;
alter table public.file_links enable row level security;
alter table public.activity_events enable row level security;
alter table public.sync_status enable row level security;
alter table public.plans enable row level security;
alter table public.plan_sections enable row level security;
alter table public.daily_meetings enable row level security;
alter table public.mutations enable row level security;
alter table public.backup_runs enable row level security;
alter table public.notification_receipts enable row level security;

create policy clients_select on public.clients for select to authenticated using ((select private.can_read_client(id)));
create policy projects_select on public.projects for select to authenticated using ((select private.can_read_project(id, 'CLIENT')));
create policy projects_update on public.projects for update to authenticated using ((select private.can_write_project(id))) with check ((select private.can_write_project(id)));
create policy profiles_select on public.profiles for select to authenticated using ((select private.can_read_profile(id)));
create policy memberships_select on public.project_memberships for select to authenticated using (user_id = (select auth.uid()) or (select private.is_pocket_manager()));
create policy memberships_insert on public.project_memberships for insert to authenticated with check ((select private.is_pocket_manager()));
create policy memberships_update on public.project_memberships for update to authenticated using ((select private.is_pocket_manager())) with check ((select private.is_pocket_manager()));

create policy project_channels_select on public.project_channels for select to authenticated using ((select private.can_read_project(project_id, case when customer_visible then 'CLIENT' else 'PROJECT_TEAM' end)));
create policy project_channels_insert on public.project_channels for insert to authenticated with check ((select private.can_write_project(project_id)));
create policy project_channels_update on public.project_channels for update to authenticated using ((select private.can_write_project(project_id))) with check ((select private.can_write_project(project_id)));

create policy tasks_select on public.tasks for select to authenticated using ((select private.can_read_project(project_id, visibility_code)));
create policy tasks_insert on public.tasks for insert to authenticated with check ((select private.can_write_project(project_id)) and created_by_user_id = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated using ((select private.can_write_project(project_id))) with check ((select private.can_write_project(project_id)) and updated_by_user_id = (select auth.uid()));

create policy task_dependencies_select on public.task_dependencies for select to authenticated using ((select private.can_read_project(project_id, 'PROJECT_TEAM')));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated with check ((select private.can_write_project(project_id)));
create policy task_dependencies_update on public.task_dependencies for update to authenticated using ((select private.can_write_project(project_id))) with check ((select private.can_write_project(project_id)));

create policy contents_select on public.contents for select to authenticated using ((select private.can_read_project(project_id, visibility_code)));
create policy contents_insert on public.contents for insert to authenticated with check ((select private.can_write_project(project_id)) and created_by_user_id = (select auth.uid()));
create policy contents_update on public.contents for update to authenticated using ((select private.can_write_project(project_id))) with check ((select private.can_write_project(project_id)) and updated_by_user_id = (select auth.uid()));

create policy content_versions_select on public.content_versions for select to authenticated using ((select private.can_read_project(project_id, 'PROJECT_TEAM')));
create policy content_versions_insert on public.content_versions for insert to authenticated with check ((select private.can_write_project(project_id)) and created_by_user_id = (select auth.uid()));

create policy approvals_select on public.approvals for select to authenticated using ((select private.can_read_project(project_id, visibility_code)));
create policy approvals_insert on public.approvals for insert to authenticated with check ((select private.can_write_project(project_id)) and requested_by_user_id = (select auth.uid()));
create policy approvals_update on public.approvals for update to authenticated using ((select private.can_write_project(project_id))) with check ((select private.can_write_project(project_id)));

create policy kpi_definitions_select on public.kpi_definitions for select to authenticated using ((select private.can_read_project(project_id, case when customer_visible then 'CLIENT' else 'PROJECT_TEAM' end)));
create policy kpi_definitions_insert on public.kpi_definitions for insert to authenticated with check ((select private.can_write_project(project_id)) and created_by_user_id = (select auth.uid()));
create policy kpi_definitions_update on public.kpi_definitions for update to authenticated using ((select private.can_write_project(project_id))) with check ((select private.can_write_project(project_id)) and updated_by_user_id = (select auth.uid()));

create policy daily_performance_select on public.daily_performance for select to authenticated using ((select private.can_read_project(project_id, 'CLIENT')));
create policy kpi_actuals_select on public.kpi_actuals for select to authenticated using ((select private.can_read_project(project_id, 'CLIENT')));
create policy file_links_select on public.file_links for select to authenticated using ((select private.can_read_project(project_id, visibility_code)));
create policy file_links_insert on public.file_links for insert to authenticated with check ((select private.can_write_project(project_id)) and uploaded_by_user_id = (select auth.uid()));
create policy file_links_update on public.file_links for update to authenticated using ((select private.can_write_project(project_id))) with check ((select private.can_write_project(project_id)));

create policy activity_events_select on public.activity_events for select to authenticated using ((select private.can_write_project(project_id)) and (select private.can_read_project(project_id, visibility_code)));
create policy sync_status_select on public.sync_status for select to authenticated using ((select private.can_read_project(project_id, 'PROJECT_TEAM')));
create policy plans_select on public.plans for select to authenticated using ((select private.can_read_project(project_id, visibility_code)));
create policy plan_sections_select on public.plan_sections for select to authenticated using ((select private.can_read_project(project_id, visibility_code)));
create policy daily_meetings_select on public.daily_meetings for select to authenticated using ((select private.can_read_project(project_id, visibility_code)));
create policy daily_meetings_insert on public.daily_meetings for insert to authenticated with check ((select private.can_write_project(project_id)) and created_by_user_id = (select auth.uid()));
create policy daily_meetings_update on public.daily_meetings for update to authenticated using ((select private.can_write_project(project_id))) with check ((select private.can_write_project(project_id)) and updated_by_user_id = (select auth.uid()));
create policy mutations_select on public.mutations for select to authenticated using (actor_user_id = (select auth.uid()) or (select private.is_pocket_manager()));
create policy backup_runs_select on public.backup_runs for select to authenticated using ((select private.is_pocket_manager()));
create policy notification_receipts_select on public.notification_receipts for select to authenticated using (user_id = (select auth.uid()));
create policy notification_receipts_insert on public.notification_receipts for insert to authenticated with check (user_id = (select auth.uid()) and (select private.can_read_project((select t.project_id from public.tasks t where t.id = task_id), 'CLIENT')));
create policy notification_receipts_update on public.notification_receipts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.clients, public.projects, public.profiles, public.project_memberships,
  public.project_channels, public.tasks, public.task_dependencies, public.contents,
  public.content_versions, public.approvals, public.kpi_definitions, public.daily_performance,
  public.kpi_actuals, public.file_links, public.activity_events, public.sync_status,
  public.plans, public.plan_sections, public.daily_meetings, public.mutations,
  public.backup_runs, public.notification_receipts to authenticated;
grant insert, update on public.project_memberships, public.project_channels, public.tasks,
  public.task_dependencies, public.contents, public.approvals, public.kpi_definitions,
  public.file_links, public.daily_meetings, public.notification_receipts to authenticated;
grant update on public.projects to authenticated;
grant insert on public.content_versions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Explicitly keep elevated keys and all server-only writes outside browser code.
comment on schema private is 'Non-exposed authorization and trigger helpers.';
comment on table public.activity_events is 'Append-only audit data. Browser clients may read authorized rows but cannot write them.';
comment on table public.mutations is 'Server-side idempotency registry. Browser clients cannot write directly.';
