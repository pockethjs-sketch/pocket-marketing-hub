-- Allow Pocket and NS operators to create one company-scoped project safely.
-- The browser receives no direct INSERT grant: identity, membership, audit, and
-- idempotency are committed together by this RPC.

create or replace function public.create_project(
  p_mutation_id text,
  p_client_name text,
  p_project_name text,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_profile public.profiles%rowtype;
  client_row public.clients%rowtype;
  project_row public.projects%rowtype;
  membership_row public.project_memberships%rowtype;
  normalized_client_name text := trim(coalesce(p_client_name, ''));
  normalized_project_name text := trim(coalesce(p_project_name, ''));
  normalized_description text := nullif(trim(coalesce(p_description, '')), '');
  request_fingerprint text;
  stored_fingerprint text;
  stored_response jsonb;
  generated_token text;
  response_payload jsonb;
  error_code text;
  error_message text;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into current_profile
    from public.profiles profile
   where profile.id = current_user_id
     and profile.status_code = 'ACTIVE'
     and profile.archived_at is null;

  if not found
     or current_profile.organization_code not in ('POCKET', 'NS')
     or current_profile.role_code not in ('POCKET_MANAGER', 'POCKET_EDITOR', 'EXECUTOR_EDITOR') then
    raise exception 'project_create_forbidden' using errcode = '42501';
  end if;

  if p_mutation_id is null or length(trim(p_mutation_id)) < 8 or length(p_mutation_id) > 200 then
    raise exception 'invalid_mutation_id' using errcode = '22023';
  end if;

  if length(normalized_client_name) < 1 or length(normalized_client_name) > 120
     or length(normalized_project_name) < 1 or length(normalized_project_name) > 200
     or length(coalesce(normalized_description, '')) > 5000
     or (p_start_date is not null and p_end_date is not null and p_end_date < p_start_date) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid_input',
      'message', '고객사명, 프로젝트명, 프로젝트 기간을 확인해 주세요.'
    ));
  end if;

  request_fingerprint := md5(concat_ws(
    '|', normalized_client_name, normalized_project_name,
    coalesce(normalized_description, ''), coalesce(p_start_date::text, ''), coalesce(p_end_date::text, '')
  ));

  -- Serialise retries of the same request and concurrent attempts using the
  -- same company name. This prevents double-click and multi-tab duplicates.
  perform pg_advisory_xact_lock(hashtext('project-mutation:' || trim(p_mutation_id)));
  perform pg_advisory_xact_lock(hashtext('project-client:' || lower(normalized_client_name)));

  select mutation.request_hash, mutation.response_data
    into stored_fingerprint, stored_response
    from public.mutations mutation
   where mutation.mutation_id = trim(p_mutation_id);

  if found then
    if stored_fingerprint is distinct from request_fingerprint then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'mutation_id_reused',
        'message', '같은 저장 ID에 다른 프로젝트 정보를 사용할 수 없습니다.'
      ));
    end if;
    if stored_response is not null then return stored_response; end if;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'mutation_in_progress',
      'message', '같은 프로젝트를 생성하고 있습니다.'
    ));
  end if;

  if exists (
    select 1
      from public.clients client
     where lower(trim(client.display_name)) = lower(normalized_client_name)
       and client.status_code = 'ACTIVE'
       and client.archived_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'duplicate_client',
      'message', '같은 이름의 프로젝트 회사가 이미 있습니다.'
    ));
  end if;

  begin
    generated_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    insert into public.clients (legacy_id, slug, display_name, status_code)
    values (
      'CLT-WEB-' || generated_token,
      'client-' || lower(generated_token),
      normalized_client_name,
      'ACTIVE'
    ) returning * into client_row;

    insert into public.projects (
      legacy_id, client_id, project_name, description, phase_code,
      status_code, start_date, end_date, client_view_enabled
    ) values (
      'PRJ-WEB-' || generated_token,
      client_row.id,
      normalized_project_name,
      normalized_description,
      'P0',
      'ACTIVE',
      p_start_date,
      p_end_date,
      false
    ) returning * into project_row;

    insert into public.project_memberships (
      legacy_id, project_id, user_id, permission_code, allowed_pages, status_code
    ) values (
      'PM-WEB-' || generated_token,
      project_row.id,
      current_user_id,
      case when current_profile.organization_code = 'POCKET' then 'ADMIN' else 'EDIT' end,
      array['overview', 'plan', 'tasks', 'daily', 'performance', 'files']::text[],
      'ACTIVE'
    ) returning * into membership_row;

    response_payload := jsonb_build_object(
      'ok', true,
      'generatedAt', now(),
      'data', jsonb_build_object(
        'client', jsonb_build_object(
          'client_id', client_row.legacy_id,
          'display_name', client_row.display_name,
          'status_code', client_row.status_code
        ),
        'project', jsonb_build_object(
          'project_id', project_row.legacy_id,
          'client_id', client_row.legacy_id,
          'project_name', project_row.project_name,
          'objective', project_row.description,
          'phase_code', project_row.phase_code,
          'status_code', project_row.status_code,
          'start_date', project_row.start_date,
          'end_date', project_row.end_date,
          'permission_code', membership_row.permission_code,
          'allowed_pages', membership_row.allowed_pages,
          'row_version', project_row.row_version
        )
      )
    );

    insert into public.mutations (
      mutation_id, request_hash, event_status_code, entity_type, entity_id,
      project_id, action_code, actor_user_id, actor_role_code,
      after_data, response_data
    ) values (
      trim(p_mutation_id), request_fingerprint, 'COMMIT', 'PROJECT', project_row.id,
      project_row.id, 'CREATE', current_user_id, current_profile.role_code,
      to_jsonb(project_row), response_payload
    );

    return response_payload;
  exception when others then
    error_code := case sqlstate
      when '23505' then 'duplicate_value'
      when '23514' then 'invalid_input'
      when '22023' then 'invalid_input'
      when '42501' then 'forbidden'
      else 'project_create_failed'
    end;
    error_message := case error_code
      when 'duplicate_value' then '같은 프로젝트 식별자가 이미 있습니다.'
      when 'invalid_input' then '프로젝트 입력값을 확인해 주세요.'
      when 'forbidden' then '프로젝트를 생성할 권한이 없습니다.'
      else '프로젝트를 생성하지 못했습니다.'
    end;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', error_code,
      'message', error_message
    ));
  end;
end;
$$;

revoke all on function public.create_project(text, text, text, text, date, date) from public, anon, authenticated;
grant execute on function public.create_project(text, text, text, text, date, date) to authenticated;

-- Project creation is a human action too. Record inserts as well as updates.
drop trigger if exists projects_audit on public.projects;
create trigger projects_audit
  after insert or update on public.projects
  for each row execute function private.audit_project_row('PROJECT');
