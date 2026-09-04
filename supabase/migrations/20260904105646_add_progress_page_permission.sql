-- Progress is a separate customer-facing navigation grant. It reads the same
-- client-safe task projection as the task screen, but does not grant task-page
-- navigation or any write permission.

alter table public.project_memberships
  alter column allowed_pages set default array[
    'overview', 'plan', 'tasks', 'progress', 'daily', 'performance', 'files'
  ]::text[];

alter table public.project_memberships
  add constraint project_memberships_allowed_pages_check_v2
  check (allowed_pages <@ array[
    'overview', 'plan', 'tasks', 'progress', 'daily',
    'content', 'tracking', 'performance', 'files'
  ]::text[]) not valid;

alter table public.project_memberships
  validate constraint project_memberships_allowed_pages_check_v2;

alter table public.project_memberships
  drop constraint project_memberships_allowed_pages_check;

alter table public.project_memberships
  rename constraint project_memberships_allowed_pages_check_v2
  to project_memberships_allowed_pages_check;

create or replace function private.can_read_project(
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
       and (
         target_page is null
         or target_page = any(membership.allowed_pages)
         or (target_page = 'tasks' and 'progress' = any(membership.allowed_pages))
       )
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
