-- Keep browser reads on explicit, page-scoped contracts. RLS protects rows,
-- but it cannot conditionally hide internal columns from CLIENT_VIEWER users
-- because every signed-in browser uses the same `authenticated` database role.

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
          from public.profiles viewer
          join public.project_memberships mine on mine.user_id = viewer.id
          join public.project_memberships theirs on theirs.project_id = mine.project_id
         where viewer.id = (select auth.uid())
           and viewer.organization_code in ('POCKET', 'NS')
           and viewer.role_code in ('POCKET_EDITOR', 'EXECUTOR_EDITOR')
           and viewer.status_code = 'ACTIVE'
           and viewer.archived_at is null
           and theirs.user_id = target_user_id
           and mine.status_code = 'ACTIVE'
           and theirs.status_code = 'ACTIVE'
           and mine.archived_at is null
           and theirs.archived_at is null
           and (select private.can_read_project(mine.project_id, 'PROJECT_TEAM', null))
      );
$$;

revoke all on function private.can_read_profile(uuid) from public, anon;
grant execute on function private.can_read_profile(uuid) to authenticated, service_role;

create or replace function public.read_tasks(
  p_project_id bigint,
  p_include_archived boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_org text;
  result_items jsonb;
  result_members jsonb;
  result_project jsonb;
  result_total bigint;
  can_include_archived boolean := false;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select profile.organization_code
    into current_org
    from public.profiles profile
   where profile.id = current_user_id
     and profile.status_code = 'ACTIVE'
     and profile.archived_at is null;
  if current_org is null then
    raise exception 'inactive_profile' using errcode = '42501';
  end if;
  if not (select private.can_read_project(
    p_project_id,
    case when current_org = 'CLIENT' then 'CLIENT' else 'PROJECT_TEAM' end,
    'tasks'
  )) then
    raise exception 'forbidden_project' using errcode = '42501';
  end if;
  can_include_archived := coalesce(p_include_archived, false)
    and (select private.can_write_page(p_project_id, 'tasks'));

  select count(*)
    into result_total
    from public.tasks task
   where task.project_id = p_project_id
     and (task.archived_at is null or can_include_archived)
     and (
       current_org = 'POCKET'
       or (current_org = 'NS' and task.visibility_code in ('PROJECT_TEAM', 'CLIENT'))
       or (current_org = 'CLIENT' and task.visibility_code = 'CLIENT')
     );

  select coalesce(jsonb_agg(
    case when current_org = 'CLIENT' then
      jsonb_build_object(
        'task_id', task.id,
        'project_id', task.project_id,
        'phase_code', task.phase_code,
        'workstream_code', task.workstream_code,
        'category_code', task.category_code,
        'title', task.title,
        'description', task.description,
        'responsible_org_code', 'POCKET',
        'status_code', task.status_code,
        'priority_code', task.priority_code,
        'planned_start_date', task.planned_start_date,
        'due_date', task.due_date,
        'schedule_dates_json', task.schedule_dates,
        'completed_at', task.completed_at,
        'customer_status_text', task.customer_status_text,
        'progress_percent', task.progress_percent,
        'completion_url', task.completion_url,
        'visibility_code', task.visibility_code,
        'sort_order', task.sort_order,
        'created_at', task.created_at,
        'updated_at', task.updated_at,
        'row_version', task.row_version
      )
    else
      to_jsonb(task)
        || jsonb_build_object(
          'task_id', task.id,
          'schedule_dates_json', task.schedule_dates
        )
    end
    order by task.sort_order, task.id
  ), '[]'::jsonb)
    into result_items
    from (
      select task.*
        from public.tasks task
       where task.project_id = p_project_id
         and (task.archived_at is null or can_include_archived)
         and (
           current_org = 'POCKET'
           or (current_org = 'NS' and task.visibility_code in ('PROJECT_TEAM', 'CLIENT'))
           or (current_org = 'CLIENT' and task.visibility_code = 'CLIENT')
         )
       order by task.sort_order, task.id
       limit 1000
    ) task;

  if current_org = 'CLIENT' then
    result_members := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', profile.id,
      'display_name', profile.display_name,
      'organization_code', profile.organization_code,
      'role_code', profile.role_code,
      'permission_code', membership.permission_code
    ) order by profile.display_name, profile.id), '[]'::jsonb)
      into result_members
      from public.project_memberships membership
      join public.profiles profile on profile.id = membership.user_id
     where membership.project_id = p_project_id
       and membership.status_code = 'ACTIVE'
       and membership.archived_at is null
       and profile.status_code = 'ACTIVE'
       and profile.archived_at is null;
  end if;

  select jsonb_build_object(
    'project_id', project.id,
    'phase_code', project.phase_code,
    'start_date', project.start_date,
    'end_date', project.end_date,
    'row_version', project.row_version
  )
    into result_project
    from public.projects project
   where project.id = p_project_id
     and project.archived_at is null;

  return jsonb_build_object(
    'items', result_items,
    'members', result_members,
    'totalMatching', result_total,
    'truncated', result_total > jsonb_array_length(result_items),
    'project', result_project
  );
end;
$$;

revoke all on function public.read_tasks(bigint, boolean) from public, anon, authenticated;
grant execute on function public.read_tasks(bigint, boolean) to authenticated;

-- These rows contain internal notes or source payloads. Keep them out of the
-- generic Data API until their page-specific masked RPCs are implemented.
revoke select on public.tasks, public.contents, public.content_versions, public.file_links from authenticated;
revoke select on public.daily_performance from authenticated;
grant select (
  id, legacy_id, project_id, performance_date, channel_code, metric_code,
  metric_value, source_code, created_at, updated_at, archived_at
) on public.daily_performance to authenticated;
