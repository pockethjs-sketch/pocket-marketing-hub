begin;

select plan(18);

select is(
  (
    select count(*)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname = any(array[
         'clients', 'projects', 'profiles', 'project_memberships', 'project_channels',
         'tasks', 'task_dependencies', 'contents', 'content_versions', 'approvals',
         'kpi_definitions', 'daily_performance', 'kpi_actuals', 'file_links',
         'activity_events', 'sync_status', 'plans', 'plan_sections', 'daily_meetings',
         'mutations', 'backup_runs', 'notification_receipts'
       ])
  ),
  22::bigint,
  'all marketing hub tables exist'
);

select is(
  (
    select count(*)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
       and c.relname = any(array[
         'clients', 'projects', 'profiles', 'project_memberships', 'project_channels',
         'tasks', 'task_dependencies', 'contents', 'content_versions', 'approvals',
         'kpi_definitions', 'daily_performance', 'kpi_actuals', 'file_links',
         'activity_events', 'sync_status', 'plans', 'plan_sections', 'daily_meetings',
         'mutations', 'backup_runs', 'notification_receipts'
       ])
  ),
  22::bigint,
  'RLS is enabled on every exposed table'
);

select is(
  (
    select count(*)
      from information_schema.role_table_grants
     where grantee = 'anon'
       and table_schema = 'public'
       and table_name = any(array[
         'clients', 'projects', 'profiles', 'project_memberships', 'project_channels',
         'tasks', 'task_dependencies', 'contents', 'content_versions', 'approvals',
         'kpi_definitions', 'daily_performance', 'kpi_actuals', 'file_links',
         'activity_events', 'sync_status', 'plans', 'plan_sections', 'daily_meetings',
         'mutations', 'backup_runs', 'notification_receipts'
       ])
  ),
  0::bigint,
  'anonymous users have no table grants'
);

select is(
  (
    select count(*)
      from information_schema.routine_privileges
     where grantee = 'PUBLIC'
       and specific_schema in ('public', 'private')
  ),
  0::bigint,
  'application functions are not executable by PUBLIC'
);

select is(
  (
    select count(*)
      from information_schema.role_table_grants
     where grantee = 'authenticated'
       and privilege_type = 'DELETE'
       and table_schema = 'public'
  ),
  0::bigint,
  'authenticated users cannot physically delete rows'
);

select ok(
  not has_table_privilege('authenticated', 'public.tasks', 'SELECT,INSERT,UPDATE,DELETE')
    and has_function_privilege(
      'authenticated',
      'public.mutate_task(text,text,bigint,bigint,bigint,jsonb)',
      'EXECUTE'
    ),
  'task writes require the authorized atomic mutation RPC and raw task rows stay private'
);

select ok(
  has_function_privilege('authenticated', 'public.read_tasks(bigint,boolean)', 'EXECUTE'),
  'task reads require the masked project-scoped RPC'
);

select ok(
  not has_table_privilege('authenticated', 'public.activity_events', 'INSERT,UPDATE,DELETE'),
  'activity log is append-only through database triggers'
);

select ok(
  not has_table_privilege('authenticated', 'public.mutations', 'INSERT,UPDATE,DELETE'),
  'mutation registry remains server-only'
);

select is(
  (
    select count(*)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and c.contype = 'f'
       and not exists (
         select 1
           from pg_index i
          where i.indrelid = c.conrelid
            and c.conkey[1] = any(i.indkey)
       )
  ),
  0::bigint,
  'every foreign key has a supporting index'
);

select is(
  (
    select count(*)
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name = 'email'
  ),
  0::bigint,
  'public profiles do not expose authentication email addresses'
);

select is(
  (
    select count(*)
      from pg_proc function_row
      join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
     where namespace_row.nspname = 'private'
       and function_row.proname = 'can_read_project'
       and pg_get_function_identity_arguments(function_row.oid) = 'target_project_id bigint, row_visibility text, target_page text'
  ),
  1::bigint,
  'project authorization includes an explicit page boundary'
);

select is(
  (
    select count(*)
      from pg_constraint
     where conrelid = 'public.project_memberships'::regclass
       and conname = 'project_memberships_allowed_pages_check'
       and contype = 'c'
  ),
  1::bigint,
  'membership page codes are constrained to the application catalog'
);

select is(
  (
    select count(*)
      from pg_constraint
     where conname = any(array[
       'tasks_parent_same_project_fkey',
       'task_dependencies_predecessor_same_project_fkey',
       'task_dependencies_successor_same_project_fkey',
       'contents_task_same_project_fkey',
       'contents_channel_same_project_fkey',
       'content_versions_content_same_project_fkey',
       'kpi_actuals_definition_same_project_fkey',
       'plan_sections_plan_same_project_fkey'
     ])
       and contype = 'f'
  ),
  8::bigint,
  'project-scoped relationships reject cross-project references'
);

select is(
  (
    select count(*)
      from pg_trigger
     where not tgisinternal
       and tgname = any(array[
         'projects_immutable', 'memberships_immutable', 'project_channels_immutable',
         'tasks_immutable', 'task_dependencies_immutable', 'contents_immutable',
         'approvals_immutable', 'kpi_definitions_immutable', 'file_links_immutable',
         'daily_meetings_immutable', 'notification_receipts_immutable'
       ])
  ),
  11::bigint,
  'tenant and creator identity columns are protected by update triggers'
);

select is(
  (
    select count(*)
      from information_schema.column_privileges
     where grantee = 'authenticated'
       and table_schema = 'public'
       and table_name = 'activity_events'
       and column_name in ('before_data', 'after_data')
       and privilege_type = 'SELECT'
  ),
  0::bigint,
  'browser users cannot read raw audit row snapshots'
);

select is(
  (
    select count(*)
      from information_schema.column_privileges
     where grantee = 'authenticated'
       and table_schema = 'public'
       and table_name = 'activity_events'
       and column_name in (
         'id', 'event_id', 'project_id', 'entity_type', 'entity_id', 'action_code',
         'visibility_code', 'actor_user_id', 'actor_role_code', 'event_status_code', 'created_at'
       )
       and privilege_type = 'SELECT'
  ),
  11::bigint,
  'browser users retain safe audit metadata access through RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.contents', 'SELECT')
    and not has_table_privilege('authenticated', 'public.content_versions', 'SELECT')
    and not has_table_privilege('authenticated', 'public.file_links', 'SELECT'),
  'unmasked content and file rows are not exposed through the generic Data API'
);

select * from finish();
rollback;
