-- Save a Gantt drag or other multi-task edit in one network round trip and one
-- database transaction. Any failed item rolls back the entire batch.

create function private.mutate_tasks_batch(
  p_project_id bigint,
  p_mutations jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mutation jsonb;
  item_result jsonb;
  failure_result jsonb;
  results jsonb := '[]'::jsonb;
  item_project_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_mutations) <> 'array'
     or jsonb_array_length(p_mutations) < 1
     or jsonb_array_length(p_mutations) > 40 then
    raise exception 'invalid_batch_size' using errcode = '22023';
  end if;

  begin
    for mutation in select value from jsonb_array_elements(p_mutations)
    loop
      if jsonb_typeof(mutation) <> 'object' then
        failure_result := jsonb_build_object('ok', false, 'error', jsonb_build_object(
          'code', 'invalid_input', 'message', '업무 변경 묶음의 형식이 올바르지 않습니다.'
        ));
        raise exception 'batch_item_invalid' using errcode = '22023';
      end if;
      item_project_id := coalesce(nullif(mutation ->> 'project_id', '')::bigint, p_project_id);
      if item_project_id is distinct from p_project_id then
        failure_result := jsonb_build_object('ok', false, 'error', jsonb_build_object(
          'code', 'invalid_input', 'message', '한 번의 저장에는 같은 프로젝트 업무만 포함할 수 있습니다.'
        ));
        raise exception 'batch_project_mismatch' using errcode = '22023';
      end if;

      item_result := private.mutate_task(
        mutation ->> 'mutation_id',
        mutation ->> 'operation',
        p_project_id,
        nullif(mutation ->> 'task_id', '')::bigint,
        nullif(mutation ->> 'expected_row_version', '')::bigint,
        coalesce(mutation -> 'fields', '{}'::jsonb)
      );
      if not coalesce((item_result ->> 'ok')::boolean, false) then
        failure_result := item_result;
        raise exception 'batch_item_failed' using errcode = 'P0001';
      end if;
      results := results || jsonb_build_array(item_result -> 'data');
    end loop;
  exception when others then
    return coalesce(failure_result, jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', case sqlstate
        when '42501' then 'forbidden'
        when '22023' then 'invalid_input'
        else 'save_failed'
      end,
      'message', case sqlstate
        when '42501' then '이 프로젝트의 해당 변경 권한이 없습니다.'
        when '22023' then '업무 변경 묶음의 입력값을 확인해 주세요.'
        else '업무 변경 묶음을 저장하지 못했습니다.'
      end
    )));
  end;

  return jsonb_build_object(
    'ok', true,
    'generatedAt', now(),
    'data', jsonb_build_object('batch', true, 'results', results)
  );
end;
$$;

revoke all on function private.mutate_tasks_batch(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function private.mutate_tasks_batch(bigint, jsonb)
  to authenticated, service_role;

create function public.mutate_tasks_batch(
  p_project_id bigint,
  p_mutations jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.mutate_tasks_batch(p_project_id, p_mutations);
$$;

revoke all on function public.mutate_tasks_batch(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_tasks_batch(bigint, jsonb)
  to authenticated, service_role;
