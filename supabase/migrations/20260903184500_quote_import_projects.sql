-- Import a quote and all generated tasks in one authenticated transaction.
-- Direct table writes remain unavailable to browser roles.

alter table public.projects
  add column if not exists quote_data jsonb not null default '{}'::jsonb;

alter table public.projects
  drop constraint if exists projects_quote_data_object_check;
alter table public.projects
  add constraint projects_quote_data_object_check
  check (jsonb_typeof(quote_data) = 'object');

create or replace function public.create_project_from_quote(
  p_mutation_id text,
  p_client_name text,
  p_project_name text,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_quote_data jsonb default '{}'::jsonb,
  p_tasks jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_role text;
  request_fingerprint text;
  stored_fingerprint text;
  stored_response jsonb;
  project_result jsonb;
  task_result jsonb;
  failure_result jsonb;
  response_payload jsonb;
  task_payload jsonb;
  project_row public.projects%rowtype;
  task_count integer;
  task_index integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select profile.role_code into current_role
    from public.profiles profile
   where profile.id = current_user_id
     and profile.status_code = 'ACTIVE'
     and profile.archived_at is null;
  if current_role is null then
    raise exception 'inactive_profile' using errcode = '42501';
  end if;
  if p_mutation_id is null or length(trim(p_mutation_id)) < 8 or length(p_mutation_id) > 170 then
    raise exception 'invalid_mutation_id' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_quote_data, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_tasks, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_quote_payload' using errcode = '22023';
  end if;
  task_count := jsonb_array_length(coalesce(p_tasks, '[]'::jsonb));
  if task_count < 1 or task_count > 600 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid_batch_size',
      'message', '견적 업무는 한 번에 1개 이상 600개 이하로 생성할 수 있습니다.'
    ));
  end if;

  request_fingerprint := md5(concat_ws(
    '|', trim(coalesce(p_client_name, '')), trim(coalesce(p_project_name, '')),
    trim(coalesce(p_description, '')), coalesce(p_start_date::text, ''),
    coalesce(p_end_date::text, ''), coalesce(p_quote_data, '{}'::jsonb)::text,
    coalesce(p_tasks, '[]'::jsonb)::text
  ));
  perform pg_advisory_xact_lock(hashtext('quote-project:' || trim(p_mutation_id)));

  select mutation.request_hash, mutation.response_data
    into stored_fingerprint, stored_response
    from public.mutations mutation
   where mutation.mutation_id = trim(p_mutation_id);
  if found then
    if stored_fingerprint is distinct from request_fingerprint then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'mutation_id_reused',
        'message', '같은 저장 ID에 다른 견적서를 사용할 수 없습니다.'
      ));
    end if;
    return coalesce(stored_response, jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'mutation_in_progress', 'message', '같은 견적서를 저장하고 있습니다.'
    )));
  end if;

  begin
    project_result := public.create_project(
      trim(p_mutation_id) || ':project', p_client_name, p_project_name,
      p_description, p_start_date, p_end_date
    );
    if not coalesce((project_result ->> 'ok')::boolean, false) then
      failure_result := project_result;
      raise exception 'quote_project_create_failed' using errcode = 'P0001';
    end if;

    select * into project_row
      from public.projects project
     where project.legacy_id = project_result #>> '{data,project,project_id}'
       and project.archived_at is null
     for update;
    if not found then
      raise exception 'created_project_not_found' using errcode = 'P0002';
    end if;

    update public.projects project
       set quote_data = coalesce(p_quote_data, '{}'::jsonb)
     where project.id = project_row.id
     returning * into project_row;

    for task_payload in select value from jsonb_array_elements(p_tasks)
    loop
      task_index := task_index + 1;
      if jsonb_typeof(task_payload) <> 'object' then
        failure_result := jsonb_build_object('ok', false, 'error', jsonb_build_object(
          'code', 'invalid_input', 'message', '견적 업무 형식이 올바르지 않습니다.'
        ));
        raise exception 'quote_task_invalid' using errcode = '22023';
      end if;
      task_result := private.mutate_task(
        trim(p_mutation_id) || ':task:' || task_index::text,
        'CREATE', project_row.id, null, null,
        task_payload || jsonb_build_object(
          'source_task_id', trim(p_mutation_id) || ':' || task_index::text,
          'source_code', coalesce(nullif(task_payload ->> 'source_code', ''), 'QUOTE_IMPORT'),
          'sort_order', task_index * 10
        )
      );
      if not coalesce((task_result ->> 'ok')::boolean, false) then
        failure_result := task_result;
        raise exception 'quote_task_create_failed' using errcode = 'P0001';
      end if;
    end loop;

    response_payload := jsonb_set(
      jsonb_set(project_result, '{data,project,row_version}', to_jsonb(project_row.row_version), true),
      '{data,project,quote_data}', project_row.quote_data, true
    ) || jsonb_build_object('importedTaskCount', task_count);

    insert into public.mutations (
      mutation_id, request_hash, event_status_code, entity_type, entity_id,
      project_id, action_code, actor_user_id, actor_role_code,
      after_data, response_data
    ) values (
      trim(p_mutation_id), request_fingerprint, 'COMMIT', 'PROJECT', project_row.id,
      project_row.id, 'CREATE_FROM_QUOTE', current_user_id, current_role,
      to_jsonb(project_row), response_payload
    );
    return response_payload;
  exception when others then
    return coalesce(failure_result, jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', case sqlstate
        when '42501' then 'forbidden'
        when '22023' then 'invalid_input'
        else 'quote_import_failed'
      end,
      'message', case sqlstate
        when '42501' then '견적 프로젝트를 생성할 권한이 없습니다.'
        when '22023' then '견적 업무 입력값을 확인해 주세요.'
        else '견적 프로젝트와 업무를 저장하지 못했습니다.'
      end
    )));
  end;
end;
$$;

create or replace function public.import_quote_tasks(
  p_mutation_id text,
  p_project_id bigint,
  p_quote_data jsonb default '{}'::jsonb,
  p_tasks jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_role text;
  request_fingerprint text;
  stored_fingerprint text;
  stored_response jsonb;
  task_payload jsonb;
  task_result jsonb;
  failure_result jsonb;
  response_payload jsonb;
  project_row public.projects%rowtype;
  task_count integer;
  task_index integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select profile.role_code into current_role
    from public.profiles profile
   where profile.id = current_user_id
     and profile.status_code = 'ACTIVE'
     and profile.archived_at is null;
  if current_role is null or p_project_id is null
     or not (select private.can_write_page(p_project_id, 'tasks')) then
    raise exception 'quote_import_forbidden' using errcode = '42501';
  end if;
  if p_mutation_id is null or length(trim(p_mutation_id)) < 8 or length(p_mutation_id) > 170 then
    raise exception 'invalid_mutation_id' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_quote_data, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_tasks, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_quote_payload' using errcode = '22023';
  end if;
  task_count := jsonb_array_length(coalesce(p_tasks, '[]'::jsonb));
  if task_count < 1 or task_count > 600 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid_batch_size',
      'message', '견적 업무는 한 번에 1개 이상 600개 이하로 생성할 수 있습니다.'
    ));
  end if;

  request_fingerprint := md5(concat_ws(
    '|', p_project_id::text, coalesce(p_quote_data, '{}'::jsonb)::text,
    coalesce(p_tasks, '[]'::jsonb)::text
  ));
  perform pg_advisory_xact_lock(hashtext('quote-import:' || trim(p_mutation_id)));
  select mutation.request_hash, mutation.response_data
    into stored_fingerprint, stored_response
    from public.mutations mutation
   where mutation.mutation_id = trim(p_mutation_id);
  if found then
    if stored_fingerprint is distinct from request_fingerprint then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'mutation_id_reused', 'message', '같은 저장 ID에 다른 견적서를 사용할 수 없습니다.'
      ));
    end if;
    return coalesce(stored_response, jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'mutation_in_progress', 'message', '같은 견적서를 저장하고 있습니다.'
    )));
  end if;

  begin
    select * into project_row
      from public.projects project
     where project.id = p_project_id and project.archived_at is null
     for update;
    if not found then raise exception 'project_not_found' using errcode = 'P0002'; end if;

    update public.projects project
       set quote_data = coalesce(p_quote_data, '{}'::jsonb)
     where project.id = p_project_id
     returning * into project_row;

    for task_payload in select value from jsonb_array_elements(p_tasks)
    loop
      task_index := task_index + 1;
      if jsonb_typeof(task_payload) <> 'object' then
        failure_result := jsonb_build_object('ok', false, 'error', jsonb_build_object(
          'code', 'invalid_input', 'message', '견적 업무 형식이 올바르지 않습니다.'
        ));
        raise exception 'quote_task_invalid' using errcode = '22023';
      end if;
      task_result := private.mutate_task(
        trim(p_mutation_id) || ':task:' || task_index::text,
        'CREATE', p_project_id, null, null,
        task_payload || jsonb_build_object(
          'source_task_id', trim(p_mutation_id) || ':' || task_index::text,
          'source_code', coalesce(nullif(task_payload ->> 'source_code', ''), 'QUOTE_IMPORT'),
          'sort_order', 100000 + task_index * 10
        )
      );
      if not coalesce((task_result ->> 'ok')::boolean, false) then
        failure_result := task_result;
        raise exception 'quote_task_create_failed' using errcode = 'P0001';
      end if;
    end loop;

    response_payload := jsonb_build_object(
      'ok', true, 'generatedAt', now(),
      'data', jsonb_build_object(
        'project_id', project_row.legacy_id,
        'row_version', project_row.row_version,
        'quote_data', project_row.quote_data,
        'imported_task_count', task_count
      )
    );
    insert into public.mutations (
      mutation_id, request_hash, event_status_code, entity_type, entity_id,
      project_id, action_code, actor_user_id, actor_role_code,
      after_data, response_data
    ) values (
      trim(p_mutation_id), request_fingerprint, 'COMMIT', 'PROJECT', p_project_id,
      p_project_id, 'IMPORT_QUOTE', current_user_id, current_role,
      to_jsonb(project_row), response_payload
    );
    return response_payload;
  exception when others then
    return coalesce(failure_result, jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', case sqlstate
        when '42501' then 'forbidden'
        when 'P0002' then 'not_found'
        when '22023' then 'invalid_input'
        else 'quote_import_failed'
      end,
      'message', case sqlstate
        when '42501' then '이 프로젝트에 견적 업무를 추가할 권한이 없습니다.'
        when 'P0002' then '프로젝트를 찾지 못했습니다.'
        when '22023' then '견적 업무 입력값을 확인해 주세요.'
        else '견적 업무를 저장하지 못했습니다.'
      end
    )));
  end;
end;
$$;

revoke all on function public.create_project_from_quote(text, text, text, text, date, date, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_project_from_quote(text, text, text, text, date, date, jsonb, jsonb)
  to authenticated;
revoke all on function public.import_quote_tasks(text, bigint, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_quote_tasks(text, bigint, jsonb, jsonb)
  to authenticated;

create or replace function public.read_task_workspace(
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
  task_payload jsonb;
  issue_items jsonb;
  project_quote jsonb;
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

  task_payload := private.read_tasks(p_project_id, p_include_archived);
  select case when current_org = 'CLIENT' then '{}'::jsonb else project.quote_data end
    into project_quote
    from public.projects project
   where project.id = p_project_id and project.archived_at is null;
  task_payload := task_payload || jsonb_build_object(
    'project', coalesce(task_payload -> 'project', '{}'::jsonb)
      || jsonb_build_object('quote_data', coalesce(project_quote, '{}'::jsonb))
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'issue_id', issue.id,
    'project_id', issue.project_id,
    'issue_date', issue.issue_date,
    'kind_text', issue.kind_text,
    'related_task_text', issue.related_task_text,
    'body_text', issue.body_text,
    'owner_text', issue.owner_text,
    'status_code', issue.status_code,
    'completion_url', issue.completion_url,
    'remarks', issue.remarks,
    'visibility_code', issue.visibility_code,
    'created_at', issue.created_at,
    'updated_at', issue.updated_at,
    'row_version', issue.row_version
  ) order by issue.issue_date desc, issue.id desc), '[]'::jsonb)
    into issue_items
    from public.project_issues issue
   where issue.project_id = p_project_id
     and issue.archived_at is null
     and (
       current_org = 'POCKET'
       or (current_org = 'NS' and issue.visibility_code in ('PROJECT_TEAM', 'CLIENT'))
       or (current_org = 'CLIENT' and issue.visibility_code = 'CLIENT')
     );

  return task_payload || jsonb_build_object(
    'issues', issue_items,
    'issueCanWrite', (select private.can_write_page(p_project_id, 'tasks'))
      and current_org in ('POCKET', 'NS')
  );
end;
$$;

revoke all on function public.read_task_workspace(bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.read_task_workspace(bigint, boolean)
  to authenticated;

comment on column public.projects.quote_data is
  'Latest quote metadata and totals imported for the project; task line items live in public.tasks.';
comment on function public.create_project_from_quote(text, text, text, text, date, date, jsonb, jsonb) is
  'Creates a company, project, editor membership, quote metadata, and up to 600 tasks atomically.';
comment on function public.import_quote_tasks(text, bigint, jsonb, jsonb) is
  'Stores quote metadata and appends up to 600 generated tasks to an editable project atomically.';
