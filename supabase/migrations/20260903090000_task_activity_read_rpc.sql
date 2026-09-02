-- Task activity follows task writes into Supabase so the in-page task log does
-- not split its source of truth from the task table.

create function private.read_task_activity(
  p_project_id bigint,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_items jsonb;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.can_write_page(p_project_id, 'tasks')) then
    raise exception 'forbidden_project' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_payload order by created_at desc, id desc), '[]'::jsonb)
    into result_items
    from (
      select
        event.created_at,
        event.id,
        jsonb_build_object(
          'event_id', event.event_id,
          'entity_type', event.entity_type,
          'entity_id', event.entity_id,
          'action_code', event.action_code,
          'actor_user_id', event.actor_user_id,
          'actor_display_name', profile.display_name,
          'task_title', coalesce(event.after_data ->> 'title', event.before_data ->> 'title', ''),
          'user_initiated', event.actor_user_id is not null,
          'created_at', event.created_at,
          'changes', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'field', field_name,
              'before', event.before_data -> source_name,
              'after', event.after_data -> source_name
            ) order by field_name), '[]'::jsonb)
            from (values
              ('title', 'title'),
              ('status_code', 'status_code'),
              ('description', 'description'),
              ('planned_start_date', 'planned_start_date'),
              ('due_date', 'due_date'),
              ('schedule_dates_json', 'schedule_dates'),
              ('progress_percent', 'progress_percent'),
              ('completion_url', 'completion_url'),
              ('remarks', 'remarks'),
              ('priority_code', 'priority_code'),
              ('responsible_org_code', 'responsible_org_code'),
              ('workstream_code', 'workstream_code'),
              ('phase_code', 'phase_code'),
              ('visibility_code', 'visibility_code')
            ) as fields(field_name, source_name)
            where event.before_data -> source_name is distinct from event.after_data -> source_name
          )
        ) as row_payload
      from public.activity_events event
      left join public.profiles profile on profile.id = event.actor_user_id
      where event.project_id = p_project_id
        and event.entity_type = 'TASK'
        and event.event_status_code = 'COMMIT'
      order by event.created_at desc, event.id desc
      limit safe_limit
    ) activity_rows;

  return jsonb_build_object(
    'items', result_items,
    'totalMatching', jsonb_array_length(result_items),
    'nextCursor', null
  );
end;
$$;

revoke all on function private.read_task_activity(bigint, integer)
  from public, anon, authenticated;
grant execute on function private.read_task_activity(bigint, integer)
  to authenticated, service_role;

create function public.read_task_activity(
  p_project_id bigint,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.read_task_activity(p_project_id, p_limit);
$$;

revoke all on function public.read_task_activity(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.read_task_activity(bigint, integer)
  to authenticated, service_role;
