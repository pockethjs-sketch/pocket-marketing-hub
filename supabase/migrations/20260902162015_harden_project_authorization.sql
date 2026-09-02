-- Security hardening found during the pre-remote QA pass.
-- This migration keeps the Sheets runtime untouched and narrows the future
-- browser-facing Supabase surface before any production data is imported.

-- Auth owns the login address. Project members only need a safe public profile.
alter table public.profiles drop column if exists email;

alter table public.project_memberships
  add constraint project_memberships_allowed_pages_check
  check (allowed_pages <@ array[
    'overview', 'plan', 'tasks', 'daily', 'content', 'tracking', 'performance', 'files'
  ]::text[]);

revoke create on schema public from public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

alter table public.contents
  add constraint contents_status_code_check
  check (status_code in (
    'DRAFT', 'IDEA', 'PRODUCTION', 'INTERNAL_REVIEW', 'WAITING_CLIENT',
    'REVISION', 'READY', 'PUBLISHED', 'BLOCKED', 'ON_HOLD', 'CANCELLED'
  ));
alter table public.content_versions
  add constraint content_versions_status_code_check
  check (status_code in ('DRAFT', 'INTERNAL_REVIEW', 'WAITING_CLIENT', 'REVISION', 'APPROVED', 'REJECTED'));

create or replace function private.normalize_task_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_dates date[];
begin
  if new.schedule_dates is not null then
    if cardinality(new.schedule_dates) = 0 then
      new.schedule_dates := array[]::date[];
      new.planned_start_date := null;
      new.due_date := null;
    else
      select array_agg(distinct day_value order by day_value)
        into normalized_dates
        from unnest(new.schedule_dates) as day_value;
      new.schedule_dates := normalized_dates;
      new.planned_start_date := normalized_dates[1];
      new.due_date := normalized_dates[cardinality(normalized_dates)];
    end if;
  end if;
  if new.status_code = 'DONE' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status_code <> 'DONE' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.touch_row() from public, anon, authenticated;
revoke all on function private.touch_timestamp() from public, anon, authenticated;
revoke all on function private.normalize_task_schedule() from public, anon, authenticated;

-- A project-scoped child must never point at an entity in another project.
create unique index tasks_id_project_uidx on public.tasks(id, project_id);
create unique index project_channels_id_project_uidx on public.project_channels(id, project_id);
create unique index contents_id_project_uidx on public.contents(id, project_id);
create unique index kpi_definitions_id_project_uidx on public.kpi_definitions(id, project_id);
create unique index plans_id_project_uidx on public.plans(id, project_id);

alter table public.tasks drop constraint tasks_parent_task_id_fkey;
alter table public.tasks
  add constraint tasks_parent_same_project_fkey
  foreign key (parent_task_id, project_id) references public.tasks(id, project_id);

alter table public.task_dependencies drop constraint task_dependencies_predecessor_task_id_fkey;
alter table public.task_dependencies drop constraint task_dependencies_successor_task_id_fkey;
alter table public.task_dependencies
  add constraint task_dependencies_predecessor_same_project_fkey
  foreign key (predecessor_task_id, project_id) references public.tasks(id, project_id);
alter table public.task_dependencies
  add constraint task_dependencies_successor_same_project_fkey
  foreign key (successor_task_id, project_id) references public.tasks(id, project_id);

alter table public.contents drop constraint contents_task_id_fkey;
alter table public.contents drop constraint contents_project_channel_id_fkey;
alter table public.contents
  add constraint contents_task_same_project_fkey
  foreign key (task_id, project_id) references public.tasks(id, project_id);
alter table public.contents
  add constraint contents_channel_same_project_fkey
  foreign key (project_channel_id, project_id) references public.project_channels(id, project_id);

alter table public.content_versions drop constraint content_versions_content_id_fkey;
alter table public.content_versions
  add constraint content_versions_content_same_project_fkey
  foreign key (content_id, project_id) references public.contents(id, project_id);

alter table public.kpi_actuals drop constraint kpi_actuals_kpi_id_fkey;
alter table public.kpi_actuals
  add constraint kpi_actuals_definition_same_project_fkey
  foreign key (kpi_id, project_id) references public.kpi_definitions(id, project_id);

alter table public.plan_sections drop constraint plan_sections_plan_id_fkey;
alter table public.plan_sections
  add constraint plan_sections_plan_same_project_fkey
  foreign key (plan_id, project_id) references public.plans(id, project_id);

-- Direct REST updates cannot move a row to another tenant or rewrite its
-- creator/source identity. Mutable business fields remain editable through RLS.
create or replace function private.enforce_immutable_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  column_name text;
  old_data jsonb := to_jsonb(old);
  new_data jsonb := to_jsonb(new);
begin
  foreach column_name in array tg_argv loop
    if (old_data -> column_name) is distinct from (new_data -> column_name) then
      raise exception 'immutable_column:%', column_name using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.enforce_immutable_columns() from public, anon, authenticated;

create trigger projects_immutable before update on public.projects
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'client_id', 'created_at');
create trigger memberships_immutable before update on public.project_memberships
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'project_id', 'user_id', 'created_at');
create trigger project_channels_immutable before update on public.project_channels
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'project_id', 'created_at');
create trigger tasks_immutable before update on public.tasks
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'source_task_id', 'project_id', 'created_by_user_id', 'created_at');
create trigger task_dependencies_immutable before update on public.task_dependencies
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'project_id', 'predecessor_task_id', 'successor_task_id', 'created_at');
create trigger contents_immutable before update on public.contents
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'project_id', 'created_by_user_id', 'created_at');
create trigger approvals_immutable before update on public.approvals
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'project_id', 'entity_type', 'entity_id', 'requested_by_user_id', 'requested_at', 'created_at');
create trigger kpi_definitions_immutable before update on public.kpi_definitions
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'project_id', 'created_by_user_id', 'created_at');
create trigger file_links_immutable before update on public.file_links
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'project_id', 'uploaded_by_user_id', 'created_at');
create trigger daily_meetings_immutable before update on public.daily_meetings
  for each row execute function private.enforce_immutable_columns('id', 'legacy_id', 'project_id', 'created_by_user_id', 'created_at');
create trigger notification_receipts_immutable before update on public.notification_receipts
  for each row execute function private.enforce_immutable_columns('id', 'user_id', 'task_id');

-- Drop policies that depend on the two-argument helper before replacing it
-- with a page-aware authorization contract.
drop policy if exists projects_select on public.projects;
drop policy if exists project_channels_select on public.project_channels;
drop policy if exists tasks_select on public.tasks;
drop policy if exists task_dependencies_select on public.task_dependencies;
drop policy if exists contents_select on public.contents;
drop policy if exists content_versions_select on public.content_versions;
drop policy if exists approvals_select on public.approvals;
drop policy if exists kpi_definitions_select on public.kpi_definitions;
drop policy if exists daily_performance_select on public.daily_performance;
drop policy if exists kpi_actuals_select on public.kpi_actuals;
drop policy if exists file_links_select on public.file_links;
drop policy if exists activity_events_select on public.activity_events;
drop policy if exists sync_status_select on public.sync_status;
drop policy if exists plans_select on public.plans;
drop policy if exists plan_sections_select on public.plan_sections;
drop policy if exists daily_meetings_select on public.daily_meetings;
drop policy if exists notification_receipts_insert on public.notification_receipts;

drop function private.can_read_project(bigint, text);

create function private.can_read_project(
  target_project_id bigint,
  row_visibility text default 'CLIENT',
  target_page text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_pocket_manager()) or exists (
    select 1
      from public.profiles profile
      join public.project_memberships membership
        on membership.user_id = profile.id
       and membership.project_id = target_project_id
      join public.projects project on project.id = membership.project_id
     where profile.id = (select auth.uid())
       and profile.status_code = 'ACTIVE'
       and profile.archived_at is null
       and membership.status_code = 'ACTIVE'
       and membership.archived_at is null
       and project.status_code <> 'DISABLED'
       and project.archived_at is null
       and (target_page is null or target_page = any(membership.allowed_pages))
       and (
         (profile.organization_code = 'CLIENT'
           and profile.role_code = 'CLIENT_VIEWER'
           and project.client_view_enabled
           and row_visibility = 'CLIENT')
         or (profile.organization_code = 'NS'
           and profile.role_code = 'EXECUTOR_EDITOR'
           and row_visibility in ('PROJECT_TEAM', 'CLIENT'))
         or (profile.organization_code = 'POCKET'
           and profile.role_code = 'POCKET_EDITOR')
       )
  );
$$;

create or replace function private.can_write_project(target_project_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_pocket_manager()) or exists (
    select 1
      from public.profiles profile
      join public.project_memberships membership
        on membership.user_id = profile.id
       and membership.project_id = target_project_id
      join public.projects project on project.id = membership.project_id
     where profile.id = (select auth.uid())
       and profile.status_code = 'ACTIVE'
       and profile.archived_at is null
       and profile.role_code in ('POCKET_EDITOR', 'EXECUTOR_EDITOR')
       and membership.permission_code in ('ADMIN', 'EDIT')
       and membership.status_code = 'ACTIVE'
       and membership.archived_at is null
       and project.status_code <> 'DISABLED'
       and project.archived_at is null
  );
$$;

create or replace function private.can_manage_project(target_project_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_pocket_manager()) or exists (
    select 1
      from public.profiles p
      join public.project_memberships m on m.user_id = p.id
     where p.id = (select auth.uid())
       and p.organization_code = 'POCKET'
       and p.role_code = 'POCKET_EDITOR'
       and p.status_code = 'ACTIVE'
       and p.archived_at is null
       and m.project_id = target_project_id
       and m.permission_code in ('ADMIN', 'EDIT')
       and m.status_code = 'ACTIVE'
       and m.archived_at is null
  );
$$;

create or replace function private.can_write_page(target_project_id bigint, target_page text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.can_write_project(target_project_id))
     and (select private.can_read_project(target_project_id, 'PROJECT_TEAM', target_page));
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
       and (select private.can_read_project(p.id, 'CLIENT', null))
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
           and (select private.can_read_project(mine.project_id, 'CLIENT', null))
      );
$$;

revoke all on function private.can_read_project(bigint, text, text) from public, anon;
revoke all on function private.can_write_project(bigint) from public, anon;
revoke all on function private.can_manage_project(bigint) from public, anon;
revoke all on function private.can_write_page(bigint, text) from public, anon;
revoke all on function private.can_read_client(bigint) from public, anon;
revoke all on function private.can_read_profile(uuid) from public, anon;
grant execute on function private.can_read_project(bigint, text, text) to authenticated, service_role;
grant execute on function private.can_write_project(bigint) to authenticated, service_role;
grant execute on function private.can_manage_project(bigint) to authenticated, service_role;
grant execute on function private.can_write_page(bigint, text) to authenticated, service_role;
grant execute on function private.can_read_client(bigint) to authenticated, service_role;
grant execute on function private.can_read_profile(uuid) to authenticated, service_role;

drop policy if exists projects_update on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (archived_at is null and (select private.can_read_project(id, 'CLIENT', null)));
create policy projects_update on public.projects for update to authenticated
  using ((select private.can_manage_project(id)))
  with check ((select private.can_manage_project(id)));

create policy project_channels_select on public.project_channels for select to authenticated
  using (archived_at is null and (select private.can_read_project(project_id, case when customer_visible then 'CLIENT' else 'PROJECT_TEAM' end, 'overview')));
create policy tasks_select on public.tasks for select to authenticated
  using ((archived_at is null or (select private.can_write_project(project_id))) and (select private.can_read_project(project_id, visibility_code, 'tasks')));
create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using (archived_at is null and (select private.can_read_project(project_id, 'PROJECT_TEAM', 'tasks')));
create policy contents_select on public.contents for select to authenticated
  using ((archived_at is null or (select private.can_write_project(project_id))) and (select private.can_read_project(project_id, visibility_code, 'content')));
create policy content_versions_select on public.content_versions for select to authenticated
  using (archived_at is null and (select private.can_read_project(project_id, 'PROJECT_TEAM', 'content')));
create policy approvals_select on public.approvals for select to authenticated
  using ((archived_at is null or (select private.can_write_project(project_id))) and (select private.can_read_project(project_id, visibility_code, 'tasks')));
create policy kpi_definitions_select on public.kpi_definitions for select to authenticated
  using ((archived_at is null or (select private.can_write_project(project_id))) and (select private.can_read_project(project_id, case when customer_visible then 'CLIENT' else 'PROJECT_TEAM' end, 'performance')));
create policy daily_performance_select on public.daily_performance for select to authenticated
  using (archived_at is null and (select private.can_read_project(project_id, 'CLIENT', 'performance')));
create policy kpi_actuals_select on public.kpi_actuals for select to authenticated
  using (archived_at is null and (select private.can_read_project(project_id, 'CLIENT', 'performance')));
create policy file_links_select on public.file_links for select to authenticated
  using ((archived_at is null or (select private.can_write_project(project_id))) and (select private.can_read_project(project_id, visibility_code, 'files')));
create policy activity_events_select on public.activity_events for select to authenticated
  using ((select private.can_write_project(project_id)) and (select private.can_read_project(project_id, visibility_code, case when entity_type = 'TASK' then 'tasks' else 'files' end)));
create policy sync_status_select on public.sync_status for select to authenticated
  using (archived_at is null and (select private.can_read_project(project_id, 'PROJECT_TEAM', 'overview')));
create policy plans_select on public.plans for select to authenticated
  using (archived_at is null and (select private.can_read_project(project_id, visibility_code, 'plan')));
create policy plan_sections_select on public.plan_sections for select to authenticated
  using (archived_at is null and (select private.can_read_project(project_id, visibility_code, 'plan')));
create policy daily_meetings_select on public.daily_meetings for select to authenticated
  using ((archived_at is null or (select private.can_write_project(project_id))) and (select private.can_read_project(project_id, visibility_code, 'daily')));
create policy notification_receipts_insert on public.notification_receipts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.can_read_project((select t.project_id from public.tasks t where t.id = task_id), 'CLIENT', 'tasks'))
  );

drop policy if exists project_channels_insert on public.project_channels;
drop policy if exists project_channels_update on public.project_channels;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists task_dependencies_insert on public.task_dependencies;
drop policy if exists task_dependencies_update on public.task_dependencies;
drop policy if exists contents_insert on public.contents;
drop policy if exists contents_update on public.contents;
drop policy if exists content_versions_insert on public.content_versions;
drop policy if exists approvals_insert on public.approvals;
drop policy if exists approvals_update on public.approvals;
drop policy if exists kpi_definitions_insert on public.kpi_definitions;
drop policy if exists kpi_definitions_update on public.kpi_definitions;
drop policy if exists file_links_insert on public.file_links;
drop policy if exists file_links_update on public.file_links;
drop policy if exists daily_meetings_insert on public.daily_meetings;
drop policy if exists daily_meetings_update on public.daily_meetings;

create policy project_channels_insert on public.project_channels for insert to authenticated
  with check ((select private.can_write_page(project_id, 'overview')));
create policy project_channels_update on public.project_channels for update to authenticated
  using ((select private.can_write_page(project_id, 'overview')))
  with check ((select private.can_write_page(project_id, 'overview')));
create policy tasks_insert on public.tasks for insert to authenticated
  with check ((select private.can_write_page(project_id, 'tasks')) and created_by_user_id = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using ((select private.can_write_page(project_id, 'tasks')))
  with check ((select private.can_write_page(project_id, 'tasks')) and updated_by_user_id = (select auth.uid()));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check ((select private.can_write_page(project_id, 'tasks')));
create policy task_dependencies_update on public.task_dependencies for update to authenticated
  using ((select private.can_write_page(project_id, 'tasks')))
  with check ((select private.can_write_page(project_id, 'tasks')));
create policy contents_insert on public.contents for insert to authenticated
  with check ((select private.can_write_page(project_id, 'content')) and created_by_user_id = (select auth.uid()));
create policy contents_update on public.contents for update to authenticated
  using ((select private.can_write_page(project_id, 'content')))
  with check ((select private.can_write_page(project_id, 'content')) and updated_by_user_id = (select auth.uid()));
create policy content_versions_insert on public.content_versions for insert to authenticated
  with check ((select private.can_write_page(project_id, 'content')) and created_by_user_id = (select auth.uid()));
create policy approvals_insert on public.approvals for insert to authenticated
  with check ((select private.can_write_page(project_id, 'tasks')) and requested_by_user_id = (select auth.uid()));
create policy approvals_update on public.approvals for update to authenticated
  using ((select private.can_write_page(project_id, 'tasks')))
  with check ((select private.can_write_page(project_id, 'tasks')));
create policy kpi_definitions_insert on public.kpi_definitions for insert to authenticated
  with check ((select private.can_write_page(project_id, 'performance')) and created_by_user_id = (select auth.uid()));
create policy kpi_definitions_update on public.kpi_definitions for update to authenticated
  using ((select private.can_write_page(project_id, 'performance')))
  with check ((select private.can_write_page(project_id, 'performance')) and updated_by_user_id = (select auth.uid()));
create policy file_links_insert on public.file_links for insert to authenticated
  with check ((select private.can_write_page(project_id, 'files')) and uploaded_by_user_id = (select auth.uid()));
create policy file_links_update on public.file_links for update to authenticated
  using ((select private.can_write_page(project_id, 'files')))
  with check ((select private.can_write_page(project_id, 'files')));
create policy daily_meetings_insert on public.daily_meetings for insert to authenticated
  with check ((select private.can_write_page(project_id, 'daily')) and created_by_user_id = (select auth.uid()));
create policy daily_meetings_update on public.daily_meetings for update to authenticated
  using ((select private.can_write_page(project_id, 'daily')))
  with check ((select private.can_write_page(project_id, 'daily')) and updated_by_user_id = (select auth.uid()));

-- Editors can read audit metadata, but raw before/after row JSON remains a
-- Pocket-only database concern and is not exposed through browser grants.
revoke select on public.activity_events from authenticated;
grant select (
  id, event_id, project_id, entity_type, entity_id, action_code,
  visibility_code, actor_user_id, actor_role_code, event_status_code, created_at
) on public.activity_events to authenticated;
