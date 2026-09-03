-- Optional date-only confirmation deadline; existing requests stay undated.
-- All writes still use the same scoped, versioned, idempotent RPC and audit.
set lock_timeout = '5s';
alter table public.project_issues add column due_date date;
comment on column public.project_issues.due_date is
  'Optional confirmation deadline through the selected day in Asia/Seoul.';

create or replace function private.mutate_project_issue(
  p_mutation_id text,
  p_operation text,
  p_project_id bigint,
  p_issue_id bigint default null,
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
  stored_response jsonb;
  inserted_count integer;
  issue_row public.project_issues%rowtype;
  unknown_field text;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_mutation_id, ''))) < 8 or length(p_mutation_id) > 200 then
    raise exception 'invalid_mutation_id' using errcode = '22023';
  end if;
  if operation_name not in ('CREATE', 'UPDATE', 'ARCHIVE') then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;
  if not (select private.can_write_page(p_project_id, 'tasks')) then
    raise exception 'forbidden_project' using errcode = '42501';
  end if;
  select profile.organization_code
    into current_org
    from public.profiles profile
   where profile.id = current_user_id
     and profile.status_code = 'ACTIVE'
     and profile.archived_at is null;
  if current_org not in ('POCKET', 'NS') then
    raise exception 'forbidden_profile' using errcode = '42501';
  end if;

  p_fields := coalesce(p_fields, '{}'::jsonb);
  if jsonb_typeof(p_fields) <> 'object' then
    raise exception 'fields_must_be_object' using errcode = '22023';
  end if;
  select field_name
    into unknown_field
    from jsonb_object_keys(p_fields) field_name
   where field_name not in (
     'issue_date', 'due_date', 'kind_text', 'related_task_text', 'body_text',
     'owner_text', 'status_code', 'completion_url', 'remarks'
   )
   limit 1;
  if unknown_field is not null then
    raise exception 'unknown_issue_field:%', unknown_field using errcode = '22023';
  end if;
  if operation_name = 'CREATE' and (p_issue_id is not null or p_expected_row_version is not null) then
    raise exception 'create_identity_must_be_empty' using errcode = '22023';
  end if;
  if operation_name <> 'CREATE' and (p_issue_id is null or p_expected_row_version is null) then
    raise exception 'issue_identity_required' using errcode = '22023';
  end if;
  if operation_name = 'ARCHIVE' and p_fields <> '{}'::jsonb then
    raise exception 'archive_fields_not_allowed' using errcode = '22023';
  end if;

  request_fingerprint := md5(concat_ws(
    '|', operation_name, p_project_id::text, coalesce(p_issue_id::text, ''),
    coalesce(p_expected_row_version::text, ''), p_fields::text
  ));

  insert into public.mutations (
    mutation_id, request_hash, event_status_code, entity_type, entity_id,
    project_id, action_code, actor_user_id, actor_role_code
  )
  select p_mutation_id, request_fingerprint, 'PREPARE', 'PROJECT_ISSUE', p_issue_id,
    p_project_id, operation_name, current_user_id, profile.role_code
    from public.profiles profile
   where profile.id = current_user_id
  on conflict (mutation_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    select mutation.request_hash, mutation.response_data
      into stored_fingerprint, stored_response
      from public.mutations mutation
     where mutation.mutation_id = p_mutation_id;
    if stored_fingerprint is distinct from request_fingerprint then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'mutation_id_reused',
          'message', '같은 저장 ID를 다른 변경에 사용할 수 없습니다.'
        )
      );
    end if;
    return coalesce(stored_response, jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'mutation_in_progress',
        'message', '같은 변경사항을 저장하고 있습니다.'
      )
    ));
  end if;

  begin
    if nullif(p_fields->>'due_date', '') is not null and (p_fields->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'invalid_due_date' using errcode = '22023';
    end if;
    if operation_name = 'CREATE' then
      insert into public.project_issues (
        project_id, issue_date, due_date, kind_text, related_task_text, body_text,
        owner_text, status_code, completion_url, remarks, visibility_code,
        created_by_user_id, updated_by_user_id, last_mutation_id
      ) values (
        p_project_id,
        coalesce(nullif(p_fields->>'issue_date', '')::date, current_date),
        nullif(p_fields->>'due_date', '')::date,
        trim(coalesce(p_fields->>'kind_text', '')),
        trim(coalesce(p_fields->>'related_task_text', '')),
        coalesce(p_fields->>'body_text', ''),
        trim(coalesce(p_fields->>'owner_text', '')),
        coalesce(nullif(p_fields->>'status_code', ''), 'IN_PROGRESS'),
        nullif(trim(coalesce(p_fields->>'completion_url', '')), ''),
        coalesce(p_fields->>'remarks', ''),
        'CLIENT',
        current_user_id,
        current_user_id,
        p_mutation_id
      ) returning * into issue_row;
    else
      select *
        into issue_row
        from public.project_issues issue
       where issue.id = p_issue_id
         and issue.project_id = p_project_id
         and issue.archived_at is null
       for update;
      if not found then
        raise exception 'issue_not_found' using errcode = 'P0002';
      end if;
      if issue_row.row_version <> p_expected_row_version then
        raise exception 'stale_row_version' using errcode = '40001';
      end if;

      if operation_name = 'ARCHIVE' then
        update public.project_issues
           set archived_at = now(),
               updated_by_user_id = current_user_id,
               last_mutation_id = p_mutation_id
         where id = p_issue_id
        returning * into issue_row;
      else
        update public.project_issues issue
           set issue_date = case when p_fields ? 'issue_date' then (p_fields->>'issue_date')::date else issue.issue_date end,
               due_date = case when p_fields ? 'due_date' then nullif(p_fields->>'due_date', '')::date else issue.due_date end,
               kind_text = case when p_fields ? 'kind_text' then trim(coalesce(p_fields->>'kind_text', '')) else issue.kind_text end,
               related_task_text = case when p_fields ? 'related_task_text' then trim(coalesce(p_fields->>'related_task_text', '')) else issue.related_task_text end,
               body_text = case when p_fields ? 'body_text' then coalesce(p_fields->>'body_text', '') else issue.body_text end,
               owner_text = case when p_fields ? 'owner_text' then trim(coalesce(p_fields->>'owner_text', '')) else issue.owner_text end,
               status_code = case when p_fields ? 'status_code' then p_fields->>'status_code' else issue.status_code end,
               completion_url = case when p_fields ? 'completion_url' then nullif(trim(coalesce(p_fields->>'completion_url', '')), '') else issue.completion_url end,
               remarks = case when p_fields ? 'remarks' then coalesce(p_fields->>'remarks', '') else issue.remarks end,
               updated_by_user_id = current_user_id,
               last_mutation_id = p_mutation_id
         where issue.id = p_issue_id
        returning * into issue_row;
      end if;
    end if;

    stored_response := jsonb_build_object(
      'ok', true,
      'generatedAt', now(),
      'data', jsonb_build_object(
        'item', to_jsonb(issue_row) || jsonb_build_object('issue_id', issue_row.id)
      )
    );
    update public.mutations
       set event_status_code = 'COMMIT',
           entity_id = issue_row.id,
           after_data = to_jsonb(issue_row),
           response_data = stored_response
     where mutation_id = p_mutation_id;
    return stored_response;
  exception when others then
    stored_response := jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', case sqlstate
          when '40001' then 'stale_row_version'
          when '42501' then 'forbidden'
          when 'P0002' then 'not_found'
          else 'invalid_input'
        end,
        'message', case sqlstate
          when '40001' then '다른 사용자가 먼저 수정했습니다. 최신값을 다시 불러와 주세요.'
          when '42501' then '이슈사항 저장 권한이 없습니다.'
          when 'P0002' then '이슈사항을 찾지 못했습니다.'
          else '이슈사항 입력값을 확인해 주세요.'
        end
      )
    );
    update public.mutations
       set event_status_code = 'FAILED', response_data = stored_response
     where mutation_id = p_mutation_id;
    return stored_response;
  end;
end;
$$;

create or replace function private.read_task_workspace(
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
    'due_date', issue.due_date,
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

-- Keep the privileged implementation private, including latest quote projection.
create or replace function public.read_task_workspace(p_project_id bigint, p_include_archived boolean default false)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.read_task_workspace(p_project_id, p_include_archived); $$;
revoke all on function private.read_task_workspace(bigint, boolean) from public, anon;
revoke all on function private.mutate_project_issue(text,text,bigint,bigint,bigint,jsonb) from public, anon;
revoke all on function public.read_task_workspace(bigint, boolean) from public, anon;
grant execute on function private.read_task_workspace(bigint, boolean) to authenticated, service_role;
grant execute on function private.mutate_project_issue(text,text,bigint,bigint,bigint,jsonb) to authenticated, service_role;
grant execute on function public.read_task_workspace(bigint, boolean) to authenticated, service_role;

-- Canonical status/progress rules apply to every task mutation entry point.
create or replace function private.normalize_task_schedule()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare normalized_dates date[];
begin
  if new.schedule_dates is not null then
    if cardinality(new.schedule_dates) = 0 then
      new.schedule_dates := array[]::date[];
      new.planned_start_date := null;
      new.due_date := null;
    else
      select array_agg(distinct day_value order by day_value) into normalized_dates
        from unnest(new.schedule_dates) as day_value;
      new.schedule_dates := normalized_dates;
      new.planned_start_date := normalized_dates[1];
      new.due_date := normalized_dates[cardinality(normalized_dates)];
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if old.status_code = 'DONE' and new.status_code = 'DONE'
       and new.progress_percent is distinct from old.progress_percent
       and new.progress_percent < 100 then
      -- Explicit progress reduction reopens a completed task.
      new.status_code := 'IN_PROGRESS';
    elsif new.status_code <> 'DONE' and old.status_code = 'DONE' and new.progress_percent = 100 then
      new.progress_percent := 0;
    elsif new.status_code = 'NOT_STARTED' and old.status_code <> new.status_code then
      new.progress_percent := 0;
    end if;
  end if;
  if new.status_code = 'DONE' then
    new.progress_percent := 100;
    if new.completed_at is null then new.completed_at := now(); end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.normalize_task_schedule() from public, anon;

-- Repair only inconsistent completed rows, retaining audit before/after data.
-- No user impersonation: these are system corrections, not human task actions.
update public.tasks
   set progress_percent = 100,
       last_mutation_id = 'system:completed-progress-repair:20260904'
 where status_code = 'DONE' and progress_percent <> 100 and archived_at is null;
