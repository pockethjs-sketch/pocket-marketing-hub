-- Atomic task mutations for the browser-facing Supabase adapter.
-- The function owns idempotency, authorization, optimistic concurrency, audit
-- linkage, and schedule normalization in one short database transaction.

create or replace function private.jsonb_date_array(input_value jsonb)
returns date[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  result date[];
begin
  if input_value is null or jsonb_typeof(input_value) = 'null' then return null; end if;
  if jsonb_typeof(input_value) <> 'array' then
    raise exception 'invalid_schedule_dates_json' using errcode = '22023';
  end if;
  select coalesce(array_agg(value::date order by value::date), array[]::date[])
    into result
    from jsonb_array_elements_text(input_value);
  return result;
end;
$$;

revoke all on function private.jsonb_date_array(jsonb) from public, anon, authenticated;

create or replace function public.mutate_task(
  p_mutation_id text,
  p_operation text,
  p_project_id bigint,
  p_task_id bigint default null,
  p_expected_row_version bigint default null,
  p_fields jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_org text;
  operation_name text := upper(trim(coalesce(p_operation, '')));
  request_fingerprint text;
  stored_fingerprint text;
  stored_status text;
  stored_response jsonb;
  inserted_count integer;
  task_row public.tasks%rowtype;
  schedule_payload jsonb;
  unknown_field text;
  error_code text;
  error_message text;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_mutation_id is null or length(trim(p_mutation_id)) < 8 or length(p_mutation_id) > 200 then
    raise exception 'invalid_mutation_id' using errcode = '22023';
  end if;
  if operation_name not in ('CREATE', 'UPDATE', 'ARCHIVE') then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;
  if p_project_id is null or not (select private.can_write_page(p_project_id, 'tasks')) then
    raise exception 'forbidden_project' using errcode = '42501';
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

  p_fields := coalesce(p_fields, '{}'::jsonb);
  if jsonb_typeof(p_fields) <> 'object' then
    raise exception 'fields_must_be_object' using errcode = '22023';
  end if;
  select field_name
    into unknown_field
    from jsonb_object_keys(p_fields) as field_name
   where field_name not in (
     'legacy_id', 'source_task_id', 'parent_task_id', 'phase_code',
     'workstream_code', 'category_code', 'title', 'description', 'plan_week',
     'plan_note', 'responsible_org_code', 'assignee_user_id',
     'reviewer_org_code', 'status_code', 'priority_code',
     'planned_start_date', 'due_date', 'schedule_dates',
     'schedule_dates_json', 'blocker_reason', 'customer_status_text',
     'progress_percent', 'completion_url', 'remarks', 'visibility_code',
     'source_code', 'sort_order'
   )
   limit 1;
  if unknown_field is not null then
    raise exception 'unknown_task_field:%', unknown_field using errcode = '22023';
  end if;
  if operation_name = 'CREATE' and (p_task_id is not null or p_expected_row_version is not null) then
    raise exception 'create_identity_must_be_empty' using errcode = '22023';
  end if;
  if operation_name = 'UPDATE' and p_fields = '{}'::jsonb then
    raise exception 'empty_task_update' using errcode = '22023';
  end if;
  if operation_name = 'ARCHIVE' and p_fields <> '{}'::jsonb then
    raise exception 'archive_fields_not_allowed' using errcode = '22023';
  end if;
  if length(coalesce(p_fields ->> 'title', '')) > 500
     or length(coalesce(p_fields ->> 'description', '')) > 20000
     or length(coalesce(p_fields ->> 'plan_note', '')) > 10000
     or length(coalesce(p_fields ->> 'blocker_reason', '')) > 5000
     or length(coalesce(p_fields ->> 'customer_status_text', '')) > 2000
     or length(coalesce(p_fields ->> 'completion_url', '')) > 2048
     or length(coalesce(p_fields ->> 'remarks', '')) > 10000 then
    raise exception 'task_field_too_long' using errcode = '22023';
  end if;
  request_fingerprint := md5(concat_ws('|', operation_name, p_project_id::text, coalesce(p_task_id::text, ''), coalesce(p_expected_row_version::text, ''), p_fields::text));

  insert into public.mutations (
    mutation_id, request_hash, event_status_code, entity_type, entity_id,
    project_id, action_code, actor_user_id, actor_role_code
  )
  select
    p_mutation_id, request_fingerprint, 'PREPARE', 'TASK', p_task_id,
    p_project_id, operation_name, current_user_id, profile.role_code
  from public.profiles profile
  where profile.id = current_user_id
  on conflict (mutation_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    select mutation.request_hash, mutation.event_status_code, mutation.response_data
      into stored_fingerprint, stored_status, stored_response
      from public.mutations mutation
     where mutation.mutation_id = p_mutation_id;
    if stored_fingerprint is distinct from request_fingerprint then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'mutation_id_reused', 'message', '같은 저장 ID에 다른 변경 내용을 사용할 수 없습니다.'
      ));
    end if;
    if stored_response is not null then return stored_response; end if;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'mutation_in_progress', 'message', '같은 변경사항을 저장하고 있습니다.'
    ));
  end if;

  begin
    if p_fields ? 'schedule_dates' then
      schedule_payload := p_fields -> 'schedule_dates';
    elsif p_fields ? 'schedule_dates_json' then
      schedule_payload := case
        when nullif(p_fields ->> 'schedule_dates_json', '') is null then null
        else (p_fields ->> 'schedule_dates_json')::jsonb
      end;
    end if;
    if schedule_payload is not null
       and jsonb_typeof(schedule_payload) = 'array'
       and jsonb_array_length(schedule_payload) > 3660 then
      raise exception 'too_many_schedule_dates' using errcode = '22023';
    end if;

    if operation_name = 'CREATE' then
      if nullif(trim(p_fields ->> 'title'), '') is null then
        raise exception 'title_required' using errcode = '23514';
      end if;
      if current_org = 'NS' and coalesce(nullif(p_fields ->> 'visibility_code', ''), 'PROJECT_TEAM') <> 'PROJECT_TEAM' then
        raise exception 'executor_visibility_forbidden' using errcode = '42501';
      end if;

      insert into public.tasks (
        legacy_id, source_task_id, project_id, parent_task_id, phase_code,
        workstream_code, category_code, title, description, plan_week, plan_note,
        responsible_org_code, assignee_user_id, reviewer_org_code, status_code,
        priority_code, planned_start_date, due_date, schedule_dates, blocker_reason,
        customer_status_text, progress_percent, completion_url, remarks,
        visibility_code, source_code, sort_order, created_by_user_id,
        updated_by_user_id, last_mutation_id
      ) values (
        nullif(p_fields ->> 'legacy_id', ''),
        nullif(p_fields ->> 'source_task_id', ''),
        p_project_id,
        nullif(p_fields ->> 'parent_task_id', '')::bigint,
        coalesce(nullif(p_fields ->> 'phase_code', ''), 'P0'),
        coalesce(nullif(p_fields ->> 'workstream_code', ''), 'MARKETING'),
        nullif(p_fields ->> 'category_code', ''),
        trim(p_fields ->> 'title'),
        nullif(p_fields ->> 'description', ''),
        nullif(p_fields ->> 'plan_week', '')::smallint,
        nullif(p_fields ->> 'plan_note', ''),
        coalesce(nullif(p_fields ->> 'responsible_org_code', ''), case when current_org = 'NS' then 'NS' else 'POCKET' end),
        nullif(p_fields ->> 'assignee_user_id', '')::uuid,
        coalesce(nullif(p_fields ->> 'reviewer_org_code', ''), 'POCKET'),
        coalesce(nullif(p_fields ->> 'status_code', ''), 'NOT_STARTED'),
        coalesce(nullif(p_fields ->> 'priority_code', ''), 'NORMAL'),
        nullif(p_fields ->> 'planned_start_date', '')::date,
        nullif(p_fields ->> 'due_date', '')::date,
        case when p_fields ? 'schedule_dates' or p_fields ? 'schedule_dates_json'
          then private.jsonb_date_array(schedule_payload) else null end,
        nullif(p_fields ->> 'blocker_reason', ''),
        nullif(p_fields ->> 'customer_status_text', ''),
        coalesce(nullif(p_fields ->> 'progress_percent', '')::smallint, 0),
        nullif(p_fields ->> 'completion_url', ''),
        nullif(p_fields ->> 'remarks', ''),
        coalesce(nullif(p_fields ->> 'visibility_code', ''), 'PROJECT_TEAM'),
        nullif(p_fields ->> 'source_code', ''),
        coalesce(nullif(p_fields ->> 'sort_order', '')::integer, 0),
        current_user_id,
        current_user_id,
        p_mutation_id
      )
      returning * into task_row;
    else
      if p_task_id is null or p_expected_row_version is null then
        raise exception 'task_id_and_row_version_required' using errcode = '22023';
      end if;

      select * into task_row
        from public.tasks task
       where task.id = p_task_id
         and task.project_id = p_project_id
       for update;
      if not found then raise exception 'task_not_found' using errcode = 'P0002'; end if;
      if task_row.row_version <> p_expected_row_version then
        raise exception 'stale_row_version' using errcode = '40001';
      end if;
      if current_org = 'NS'
        and p_fields ? 'visibility_code'
        and nullif(p_fields ->> 'visibility_code', '') is distinct from task_row.visibility_code then
        raise exception 'executor_visibility_forbidden' using errcode = '42501';
      end if;

      if operation_name = 'ARCHIVE' then
        update public.tasks task set
          archived_at = now(),
          updated_by_user_id = current_user_id,
          last_mutation_id = p_mutation_id
        where task.id = p_task_id and task.project_id = p_project_id
        returning * into task_row;
      else
        update public.tasks task set
          parent_task_id = case when p_fields ? 'parent_task_id' then nullif(p_fields ->> 'parent_task_id', '')::bigint else task.parent_task_id end,
          phase_code = case when p_fields ? 'phase_code' then p_fields ->> 'phase_code' else task.phase_code end,
          workstream_code = case when p_fields ? 'workstream_code' then p_fields ->> 'workstream_code' else task.workstream_code end,
          category_code = case when p_fields ? 'category_code' then nullif(p_fields ->> 'category_code', '') else task.category_code end,
          title = case when p_fields ? 'title' then trim(p_fields ->> 'title') else task.title end,
          description = case when p_fields ? 'description' then nullif(p_fields ->> 'description', '') else task.description end,
          plan_week = case when p_fields ? 'plan_week' then nullif(p_fields ->> 'plan_week', '')::smallint else task.plan_week end,
          plan_note = case when p_fields ? 'plan_note' then nullif(p_fields ->> 'plan_note', '') else task.plan_note end,
          responsible_org_code = case when p_fields ? 'responsible_org_code' then p_fields ->> 'responsible_org_code' else task.responsible_org_code end,
          assignee_user_id = case when p_fields ? 'assignee_user_id' then nullif(p_fields ->> 'assignee_user_id', '')::uuid else task.assignee_user_id end,
          reviewer_org_code = case when p_fields ? 'reviewer_org_code' then p_fields ->> 'reviewer_org_code' else task.reviewer_org_code end,
          status_code = case when p_fields ? 'status_code' then p_fields ->> 'status_code' else task.status_code end,
          priority_code = case when p_fields ? 'priority_code' then p_fields ->> 'priority_code' else task.priority_code end,
          planned_start_date = case when p_fields ? 'planned_start_date' then nullif(p_fields ->> 'planned_start_date', '')::date else task.planned_start_date end,
          due_date = case when p_fields ? 'due_date' then nullif(p_fields ->> 'due_date', '')::date else task.due_date end,
          schedule_dates = case when p_fields ? 'schedule_dates' or p_fields ? 'schedule_dates_json' then private.jsonb_date_array(schedule_payload) else task.schedule_dates end,
          blocker_reason = case when p_fields ? 'blocker_reason' then nullif(p_fields ->> 'blocker_reason', '') else task.blocker_reason end,
          customer_status_text = case when p_fields ? 'customer_status_text' then nullif(p_fields ->> 'customer_status_text', '') else task.customer_status_text end,
          progress_percent = case when p_fields ? 'progress_percent' then (p_fields ->> 'progress_percent')::smallint else task.progress_percent end,
          completion_url = case when p_fields ? 'completion_url' then nullif(p_fields ->> 'completion_url', '') else task.completion_url end,
          remarks = case when p_fields ? 'remarks' then nullif(p_fields ->> 'remarks', '') else task.remarks end,
          visibility_code = case when p_fields ? 'visibility_code' then p_fields ->> 'visibility_code' else task.visibility_code end,
          source_code = case when p_fields ? 'source_code' then nullif(p_fields ->> 'source_code', '') else task.source_code end,
          sort_order = case when p_fields ? 'sort_order' then (p_fields ->> 'sort_order')::integer else task.sort_order end,
          updated_by_user_id = current_user_id,
          last_mutation_id = p_mutation_id
        where task.id = p_task_id and task.project_id = p_project_id
        returning * into task_row;

        if nullif(trim(task_row.title), '') is null then
          raise exception 'title_required' using errcode = '23514';
        end if;
      end if;
    end if;

    stored_response := jsonb_build_object(
      'ok', true,
      'generatedAt', now(),
      'data', jsonb_build_object('item', to_jsonb(task_row))
    );
    update public.mutations mutation set
      event_status_code = 'COMMIT',
      entity_id = task_row.id,
      after_data = to_jsonb(task_row),
      response_data = stored_response
    where mutation.mutation_id = p_mutation_id;
    return stored_response;
  exception when others then
    error_code := case sqlstate
      when '40001' then 'stale_row_version'
      when '42501' then 'forbidden'
      when 'P0002' then 'not_found'
      when '22023' then 'invalid_input'
      when '23502' then 'invalid_input'
      when '23503' then 'invalid_reference'
      when '23505' then 'duplicate_value'
      when '23514' then 'invalid_input'
      else 'save_failed'
    end;
    error_message := case error_code
      when 'stale_row_version' then '다른 사용자가 먼저 수정했습니다. 최신값을 불러온 뒤 다시 저장해 주세요.'
      when 'forbidden' then '이 프로젝트의 해당 변경 권한이 없습니다.'
      when 'not_found' then '변경할 업무를 찾지 못했습니다.'
      when 'invalid_reference' then '연결된 프로젝트 또는 업무 정보가 올바르지 않습니다.'
      when 'duplicate_value' then '이미 등록된 업무 식별자입니다.'
      when 'invalid_input' then '업무 입력값을 확인해 주세요.'
      else '업무를 저장하지 못했습니다.'
    end;
    stored_response := jsonb_build_object('ok', false, 'error', jsonb_build_object('code', error_code, 'message', error_message));
    update public.mutations mutation set
      event_status_code = 'FAILED',
      response_data = stored_response
    where mutation.mutation_id = p_mutation_id;
    return stored_response;
  end;
end;
$$;

revoke all on function public.mutate_task(text, text, bigint, bigint, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.mutate_task(text, text, bigint, bigint, bigint, jsonb) to authenticated;

-- Task writes must pass through mutate_task so row-version and idempotency
-- checks cannot be skipped with a direct Data API update.
revoke insert, update on public.tasks from authenticated;
