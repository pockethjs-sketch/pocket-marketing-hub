-- Activity events are append-only and retained without an application TTL.
-- Expose them with keyset pagination so older events remain reachable without
-- loading an ever-growing audit table in one browser request.

drop function if exists public.read_task_activity(bigint, integer);
drop function if exists private.read_task_activity(bigint, integer);

create index if not exists activity_events_task_commit_project_cursor_idx
  on public.activity_events(project_id, created_at desc, id desc)
  where entity_type = 'TASK' and event_status_code = 'COMMIT';

create function private.read_task_activity(
  p_project_id bigint,
  p_limit integer default 100,
  p_before_created_at timestamptz default null,
  p_before_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_items jsonb;
  result_items jsonb;
  cursor_item jsonb;
  next_cursor jsonb := null;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.can_write_page(p_project_id, 'tasks')) then
    raise exception 'forbidden_project' using errcode = '42501';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'invalid_activity_cursor' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'cursorId', activity_row.id,
      'cursorCreatedAt', activity_row.created_at,
      'payload', activity_row.row_payload
    ) order by activity_row.created_at desc, activity_row.id desc
  ), '[]'::jsonb)
    into page_items
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
        and (
          p_before_created_at is null
          or (event.created_at, event.id) < (p_before_created_at, p_before_id)
        )
      order by event.created_at desc, event.id desc
      limit safe_limit + 1
    ) activity_row;

  select coalesce(jsonb_agg(item.value -> 'payload' order by item.ordinality), '[]'::jsonb)
    into result_items
    from jsonb_array_elements(page_items) with ordinality as item(value, ordinality)
   where item.ordinality <= safe_limit;

  if jsonb_array_length(page_items) > safe_limit then
    cursor_item := page_items -> (safe_limit - 1);
    next_cursor := jsonb_build_object(
      'createdAt', cursor_item ->> 'cursorCreatedAt',
      'id', (cursor_item ->> 'cursorId')::bigint
    );
  end if;

  return jsonb_build_object(
    'items', result_items,
    'loadedCount', jsonb_array_length(result_items),
    'nextCursor', next_cursor
  );
end;
$$;

revoke all on function private.read_task_activity(bigint, integer, timestamptz, bigint)
  from public, anon, authenticated;
grant execute on function private.read_task_activity(bigint, integer, timestamptz, bigint)
  to authenticated, service_role;

create function public.read_task_activity(
  p_project_id bigint,
  p_limit integer default 100,
  p_before_created_at timestamptz default null,
  p_before_id bigint default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.read_task_activity(p_project_id, p_limit, p_before_created_at, p_before_id);
$$;

revoke all on function public.read_task_activity(bigint, integer, timestamptz, bigint)
  from public, anon, authenticated;
grant execute on function public.read_task_activity(bigint, integer, timestamptz, bigint)
  to authenticated, service_role;

comment on table public.activity_events is
  'Append-only audit data retained without an application TTL. Browser clients can only read authorized projections.';

