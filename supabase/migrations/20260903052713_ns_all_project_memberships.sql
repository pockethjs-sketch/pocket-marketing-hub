-- NS is the shared execution team for all projects, without Pocket admin or
-- POCKET_ONLY access. Keep the existing membership-based RLS checks unchanged.
insert into public.project_memberships
  (project_id, user_id, permission_code, allowed_pages, status_code)
select project.id, profile.id, 'EDIT',
       array['overview','plan','tasks','daily','performance','files']::text[], 'ACTIVE'
from public.projects project
cross join public.profiles profile
where project.archived_at is null and project.status_code <> 'DISABLED'
  and profile.organization_code = 'NS' and profile.role_code = 'EXECUTOR_EDITOR'
  and profile.status_code = 'ACTIVE' and profile.archived_at is null
on conflict (user_id, project_id) where archived_at is null and status_code = 'ACTIVE'
do update set permission_code = 'EDIT',
  allowed_pages = excluded.allowed_pages;

-- Runs in the authorized project-creation transaction (or privileged import).
-- The creating NS account is excluded here because create_project inserts its
-- own membership immediately afterwards; other NS accounts are attached here.
create or replace function private.attach_ns_project_memberships()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.archived_at is null and new.status_code <> 'DISABLED' then
    insert into public.project_memberships
      (project_id, user_id, permission_code, allowed_pages, status_code)
    select new.id, profile.id, 'EDIT',
           array['overview','plan','tasks','daily','performance','files']::text[], 'ACTIVE'
    from public.profiles profile
    where profile.organization_code = 'NS'
      and profile.role_code = 'EXECUTOR_EDITOR'
      and profile.status_code = 'ACTIVE' and profile.archived_at is null
      and profile.id is distinct from (select auth.uid())
    on conflict (user_id, project_id) where archived_at is null and status_code = 'ACTIVE'
    do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.attach_ns_project_memberships() from public, anon, authenticated;
drop trigger if exists projects_attach_ns_memberships on public.projects;
create trigger projects_attach_ns_memberships
  after insert on public.projects
  for each row execute function private.attach_ns_project_memberships();
