-- Supabase-native bootstrap, meeting, and KPI contracts.
-- Browser writes stay behind security-definer RPCs so page authorization,
-- optimistic concurrency, idempotency, and audit triggers share one transaction.

create or replace function public.read_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_profile public.profiles%rowtype;
  result_clients jsonb;
  result_projects jsonb;
  result_channels jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into current_profile
    from public.profiles profile
   where profile.id = current_user_id
     and profile.status_code = 'ACTIVE'
     and profile.archived_at is null;
  if not found then raise exception 'inactive_profile' using errcode = '42501'; end if;

  with visible_projects as (
    select project.*, membership.permission_code, membership.allowed_pages
      from public.projects project
      join public.clients client on client.id = project.client_id
      left join public.project_memberships membership
        on membership.project_id = project.id
       and membership.user_id = current_user_id
       and membership.status_code = 'ACTIVE'
       and membership.archived_at is null
     where project.status_code <> 'DISABLED'
       and project.archived_at is null
       and client.status_code = 'ACTIVE'
       and client.archived_at is null
       and ((select private.is_pocket_manager()) or membership.id is not null)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'project_id', coalesce(project.legacy_id, project.id::text),
    'client_id', coalesce(client.legacy_id, client.id::text),
    'project_name', project.project_name,
    'objective', project.description,
    'phase_code', project.phase_code,
    'status_code', project.status_code,
    'start_date', project.start_date,
    'end_date', project.end_date,
    'permission_code', coalesce(project.permission_code, 'ADMIN'),
    'allowed_pages', coalesce(project.allowed_pages, array['overview','plan','tasks','daily','performance','files']::text[]),
    'row_version', project.row_version
  ) order by project.id), '[]'::jsonb)
    into result_projects
    from visible_projects project
    join public.clients client on client.id = project.client_id;

  with visible_client_ids as (
    select distinct project.client_id
      from public.projects project
      left join public.project_memberships membership
        on membership.project_id = project.id
       and membership.user_id = current_user_id
       and membership.status_code = 'ACTIVE'
       and membership.archived_at is null
     where project.status_code <> 'DISABLED'
       and project.archived_at is null
       and ((select private.is_pocket_manager()) or membership.id is not null)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'client_id', coalesce(client.legacy_id, client.id::text),
    'display_name', client.display_name,
    'status_code', client.status_code
  ) order by client.id), '[]'::jsonb)
    into result_clients
    from public.clients client
    join visible_client_ids visible on visible.client_id = client.id
   where client.status_code = 'ACTIVE' and client.archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'channel_id', coalesce(channel.legacy_id, channel.id::text),
    'project_id', coalesce(project.legacy_id, project.id::text),
    'channel_code', channel.channel_code,
    'channel_name', channel.channel_name,
    'account_name', channel.account_name,
    'account_url', channel.account_url,
    'customer_visible', channel.customer_visible
  ) order by channel.id), '[]'::jsonb)
    into result_channels
    from public.project_channels channel
    join public.projects project on project.id = channel.project_id
   where channel.status_code = 'ACTIVE'
     and channel.archived_at is null
     and (select private.can_read_project(
       channel.project_id,
       case when current_profile.organization_code = 'CLIENT' then 'CLIENT' else 'PROJECT_TEAM' end,
       null
     ));

  return jsonb_build_object(
    'clients', result_clients,
    'projects', result_projects,
    'channels', result_channels,
    'currentUser', jsonb_build_object(
      'userId', coalesce(current_profile.legacy_id, current_profile.id::text),
      'displayName', current_profile.display_name,
      'role', current_profile.role_code,
      'organization', current_profile.organization_code
    )
  );
end;
$$;

revoke all on function public.read_bootstrap() from public, anon, authenticated;
grant execute on function public.read_bootstrap() to authenticated;

create or replace function public.read_daily_meetings(
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
  current_user_id uuid := (select auth.uid());
  current_org text;
  result_items jsonb;
  result_total bigint;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select profile.organization_code into current_org
    from public.profiles profile
   where profile.id = current_user_id and profile.status_code = 'ACTIVE' and profile.archived_at is null;
  if current_org is null then raise exception 'inactive_profile' using errcode = '42501'; end if;
  if not (select private.can_read_project(
    p_project_id,
    case when current_org = 'CLIENT' then 'CLIENT' else 'PROJECT_TEAM' end,
    'daily'
  )) then raise exception 'forbidden_project' using errcode = '42501'; end if;

  select count(*) into result_total
    from public.daily_meetings meeting
   where meeting.project_id = p_project_id
     and meeting.archived_at is null
     and (current_org = 'POCKET'
       or (current_org = 'NS' and meeting.visibility_code in ('PROJECT_TEAM','CLIENT'))
       or (current_org = 'CLIENT' and meeting.visibility_code = 'CLIENT'));

  select coalesce(jsonb_agg(item order by meeting_date desc, created_at desc), '[]'::jsonb)
    into result_items
    from (
      select jsonb_build_object(
        'meeting_id', meeting.id,
        'meeting_date', meeting.meeting_date,
        'title', meeting.title,
        'attendees_text', meeting.attendees_text,
        'discussion_text', meeting.discussion_text,
        'decisions_text', meeting.decisions_text,
        'action_items_text', meeting.action_items_text,
        'created_by_user_id', case when current_org = 'CLIENT' then null else meeting.created_by_user_id end,
        'author_name', profile.display_name,
        'visibility_code', meeting.visibility_code,
        'created_at', meeting.created_at,
        'updated_at', meeting.updated_at,
        'row_version', meeting.row_version
      ) as item,
      meeting.meeting_date,
      meeting.created_at
      from public.daily_meetings meeting
      left join public.profiles profile on profile.id = meeting.created_by_user_id
     where meeting.project_id = p_project_id
       and meeting.archived_at is null
       and (current_org = 'POCKET'
         or (current_org = 'NS' and meeting.visibility_code in ('PROJECT_TEAM','CLIENT'))
         or (current_org = 'CLIENT' and meeting.visibility_code = 'CLIENT'))
     order by meeting.meeting_date desc, meeting.created_at desc
     limit safe_limit
    ) listed;

  return jsonb_build_object('items', result_items, 'totalMatching', result_total);
end;
$$;

revoke all on function public.read_daily_meetings(bigint, integer) from public, anon, authenticated;
grant execute on function public.read_daily_meetings(bigint, integer) to authenticated;

create or replace function public.read_performance(
  p_project_id bigint,
  p_start_date date default null,
  p_end_date date default null
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
  range_end date := coalesce(p_end_date, current_date);
  range_start date := coalesce(p_start_date, range_end - 30);
  definitions jsonb;
  actuals jsonb;
  daily_rows jsonb;
  channel_rows jsonb;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if range_end < range_start or range_end - range_start > 366 then
    raise exception 'invalid_date_range' using errcode = '22023';
  end if;
  select profile.organization_code into current_org
    from public.profiles profile
   where profile.id = current_user_id and profile.status_code = 'ACTIVE' and profile.archived_at is null;
  if current_org is null then raise exception 'inactive_profile' using errcode = '42501'; end if;
  if not (select private.can_read_project(
    p_project_id,
    case when current_org = 'CLIENT' then 'CLIENT' else 'PROJECT_TEAM' end,
    'performance'
  )) then raise exception 'forbidden_project' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kpi_id', definition.id,
    'phase_code', definition.phase_code,
    'channel_code', definition.channel_code,
    'metric_code', definition.metric_code,
    'metric_name', definition.metric_name,
    'unit_code', definition.unit_code,
    'period_type_code', definition.period_type_code,
    'baseline_value', definition.baseline_value,
    'target_value', definition.target_value,
    'aggregation_code', definition.aggregation_code,
    'display_order', definition.display_order,
    'customer_visible', definition.customer_visible,
    'row_version', definition.row_version,
    'created_at', definition.created_at,
    'updated_at', definition.updated_at
  ) order by definition.display_order, definition.id), '[]'::jsonb)
    into definitions
    from public.kpi_definitions definition
   where definition.project_id = p_project_id
     and definition.archived_at is null
     and (current_org <> 'CLIENT' or definition.customer_visible);

  select coalesce(jsonb_agg(jsonb_build_object(
    'kpi_actual_id', actual.id,
    'kpi_id', actual.kpi_id,
    'period_start', actual.period_start,
    'period_end', actual.period_end,
    'actual_value', actual.actual_value,
    'measured_at', actual.calculated_at
  ) order by actual.period_end, actual.id), '[]'::jsonb)
    into actuals
    from public.kpi_actuals actual
    join public.kpi_definitions definition on definition.id = actual.kpi_id
   where actual.project_id = p_project_id
     and actual.archived_at is null
     and definition.archived_at is null
     and actual.period_end between range_start and range_end
     and (current_org <> 'CLIENT' or definition.customer_visible);

  if current_org = 'CLIENT' then
    daily_rows := '[]'::jsonb;
    channel_rows := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(to_jsonb(performance) - 'source_payload' order by performance.performance_date, performance.id), '[]'::jsonb)
      into daily_rows
      from public.daily_performance performance
     where performance.project_id = p_project_id
       and performance.archived_at is null
       and performance.performance_date between range_start and range_end;

    select coalesce(jsonb_agg(channel_payload order by channel_code), '[]'::jsonb)
      into channel_rows
      from (
        select performance.channel_code,
          jsonb_build_object(
            'channelCode', performance.channel_code,
            'impressions', coalesce(sum(performance.metric_value) filter (where lower(performance.metric_code) = 'impressions'), 0),
            'engagements', coalesce(sum(performance.metric_value) filter (where lower(performance.metric_code) = 'engagements'), 0),
            'clicks', coalesce(sum(performance.metric_value) filter (where lower(performance.metric_code) = 'clicks'), 0),
            'inquiries', coalesce(sum(performance.metric_value) filter (where lower(performance.metric_code) = 'inquiries'), 0)
          ) as channel_payload
          from public.daily_performance performance
         where performance.project_id = p_project_id
           and performance.archived_at is null
           and performance.performance_date between range_start and range_end
         group by performance.channel_code
      ) grouped;
  end if;

  return jsonb_build_object(
    'range', jsonb_build_object('start', range_start, 'end', range_end),
    'definitions', definitions,
    'actuals', actuals,
    'daily', daily_rows,
    'channels', channel_rows
  );
end;
$$;

revoke all on function public.read_performance(bigint, date, date) from public, anon, authenticated;
grant execute on function public.read_performance(bigint, date, date) to authenticated;

create or replace function public.mutate_daily_meeting(
  p_mutation_id text,
  p_operation text,
  p_project_id bigint,
  p_meeting_id bigint default null,
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
  meeting_row public.daily_meetings%rowtype;
  unknown_field text;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_mutation_id, ''))) < 8 or length(p_mutation_id) > 200 then raise exception 'invalid_mutation_id' using errcode = '22023'; end if;
  if operation_name not in ('CREATE','UPDATE','ARCHIVE') then raise exception 'invalid_operation' using errcode = '22023'; end if;
  if not (select private.can_write_page(p_project_id, 'daily')) then raise exception 'forbidden_project' using errcode = '42501'; end if;
  select profile.organization_code into current_org from public.profiles profile
   where profile.id = current_user_id and profile.status_code = 'ACTIVE' and profile.archived_at is null;
  if current_org not in ('POCKET','NS') then raise exception 'forbidden_profile' using errcode = '42501'; end if;
  p_fields := coalesce(p_fields, '{}'::jsonb);
  if jsonb_typeof(p_fields) <> 'object' then raise exception 'fields_must_be_object' using errcode = '22023'; end if;
  select field_name into unknown_field from jsonb_object_keys(p_fields) field_name
   where field_name not in ('meeting_date','title','attendees_text','discussion_text','decisions_text','action_items_text','visibility_code') limit 1;
  if unknown_field is not null then raise exception 'unknown_meeting_field:%', unknown_field using errcode = '22023'; end if;
  if operation_name = 'CREATE' and (p_meeting_id is not null or p_expected_row_version is not null) then raise exception 'create_identity_must_be_empty' using errcode = '22023'; end if;
  if operation_name <> 'CREATE' and (p_meeting_id is null or p_expected_row_version is null) then raise exception 'meeting_identity_required' using errcode = '22023'; end if;
  if operation_name = 'ARCHIVE' and p_fields <> '{}'::jsonb then raise exception 'archive_fields_not_allowed' using errcode = '22023'; end if;
  if current_org = 'NS' and p_fields ? 'visibility_code' and coalesce(nullif(p_fields->>'visibility_code',''),'PROJECT_TEAM') <> 'PROJECT_TEAM' then raise exception 'executor_visibility_forbidden' using errcode = '42501'; end if;
  request_fingerprint := md5(concat_ws('|', operation_name, p_project_id::text, coalesce(p_meeting_id::text,''), coalesce(p_expected_row_version::text,''), p_fields::text));

  insert into public.mutations (mutation_id,request_hash,event_status_code,entity_type,entity_id,project_id,action_code,actor_user_id,actor_role_code)
  select p_mutation_id,request_fingerprint,'PREPARE','DAILY_MEETING',p_meeting_id,p_project_id,operation_name,current_user_id,profile.role_code
    from public.profiles profile where profile.id=current_user_id on conflict (mutation_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    select mutation.request_hash,mutation.response_data into stored_fingerprint,stored_response from public.mutations mutation where mutation.mutation_id=p_mutation_id;
    if stored_fingerprint is distinct from request_fingerprint then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','mutation_id_reused','message','같은 저장 ID를 다른 변경에 사용할 수 없습니다.')); end if;
    return coalesce(stored_response,jsonb_build_object('ok',false,'error',jsonb_build_object('code','mutation_in_progress','message','같은 변경사항을 저장하고 있습니다.')));
  end if;

  begin
    if operation_name = 'CREATE' then
      if nullif(trim(p_fields->>'title'),'') is null or nullif(trim(p_fields->>'discussion_text'),'') is null or nullif(p_fields->>'meeting_date','') is null then raise exception 'required_fields_missing' using errcode='23514'; end if;
      insert into public.daily_meetings(project_id,meeting_date,title,attendees_text,discussion_text,decisions_text,action_items_text,created_by_user_id,updated_by_user_id,visibility_code)
      values(p_project_id,(p_fields->>'meeting_date')::date,trim(p_fields->>'title'),nullif(p_fields->>'attendees_text',''),p_fields->>'discussion_text',nullif(p_fields->>'decisions_text',''),nullif(p_fields->>'action_items_text',''),current_user_id,current_user_id,coalesce(nullif(p_fields->>'visibility_code',''),'PROJECT_TEAM'))
      returning * into meeting_row;
    else
      select * into meeting_row from public.daily_meetings meeting where meeting.id=p_meeting_id and meeting.project_id=p_project_id for update;
      if not found then raise exception 'meeting_not_found' using errcode='P0002'; end if;
      if meeting_row.row_version <> p_expected_row_version then raise exception 'stale_row_version' using errcode='40001'; end if;
      if operation_name = 'ARCHIVE' then
        update public.daily_meetings set archived_at=now(),updated_by_user_id=current_user_id where id=p_meeting_id returning * into meeting_row;
      else
        update public.daily_meetings meeting set
          meeting_date=case when p_fields?'meeting_date' then (p_fields->>'meeting_date')::date else meeting.meeting_date end,
          title=case when p_fields?'title' then trim(p_fields->>'title') else meeting.title end,
          attendees_text=case when p_fields?'attendees_text' then nullif(p_fields->>'attendees_text','') else meeting.attendees_text end,
          discussion_text=case when p_fields?'discussion_text' then p_fields->>'discussion_text' else meeting.discussion_text end,
          decisions_text=case when p_fields?'decisions_text' then nullif(p_fields->>'decisions_text','') else meeting.decisions_text end,
          action_items_text=case when p_fields?'action_items_text' then nullif(p_fields->>'action_items_text','') else meeting.action_items_text end,
          visibility_code=case when p_fields?'visibility_code' then p_fields->>'visibility_code' else meeting.visibility_code end,
          updated_by_user_id=current_user_id
        where meeting.id=p_meeting_id returning * into meeting_row;
        if nullif(trim(meeting_row.title),'') is null or nullif(trim(meeting_row.discussion_text),'') is null then raise exception 'required_fields_missing' using errcode='23514'; end if;
      end if;
    end if;
    stored_response := jsonb_build_object('ok',true,'generatedAt',now(),'data',jsonb_build_object('item',to_jsonb(meeting_row)||jsonb_build_object('meeting_id',meeting_row.id)));
    update public.mutations set event_status_code='COMMIT',entity_id=meeting_row.id,after_data=to_jsonb(meeting_row),response_data=stored_response where mutation_id=p_mutation_id;
    return stored_response;
  exception when others then
    stored_response := jsonb_build_object('ok',false,'error',jsonb_build_object(
      'code',case sqlstate when '40001' then 'stale_row_version' when '42501' then 'forbidden' when 'P0002' then 'not_found' else 'invalid_input' end,
      'message',case sqlstate when '40001' then '다른 사용자가 먼저 수정했습니다. 최신값을 다시 불러와 주세요.' when '42501' then '회의록 저장 권한이 없습니다.' when 'P0002' then '회의록을 찾지 못했습니다.' else '회의록 입력값을 확인해 주세요.' end));
    update public.mutations set event_status_code='FAILED',response_data=stored_response where mutation_id=p_mutation_id;
    return stored_response;
  end;
end;
$$;

revoke all on function public.mutate_daily_meeting(text,text,bigint,bigint,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.mutate_daily_meeting(text,text,bigint,bigint,bigint,jsonb) to authenticated;

create or replace function public.mutate_kpi_definition(
  p_mutation_id text,
  p_operation text,
  p_project_id bigint,
  p_kpi_id bigint default null,
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
  operation_name text := upper(trim(coalesce(p_operation,'')));
  request_fingerprint text;
  stored_fingerprint text;
  stored_response jsonb;
  inserted_count integer;
  kpi_row public.kpi_definitions%rowtype;
  unknown_field text;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_mutation_id,''))) < 8 or length(p_mutation_id)>200 then raise exception 'invalid_mutation_id' using errcode='22023'; end if;
  if operation_name not in ('CREATE','UPDATE','ARCHIVE') then raise exception 'invalid_operation' using errcode='22023'; end if;
  if not (select private.can_write_page(p_project_id,'performance')) then raise exception 'forbidden_project' using errcode='42501'; end if;
  p_fields:=coalesce(p_fields,'{}'::jsonb);
  if jsonb_typeof(p_fields)<>'object' then raise exception 'fields_must_be_object' using errcode='22023'; end if;
  select field_name into unknown_field from jsonb_object_keys(p_fields) field_name
   where field_name not in ('metric_name','target_value','unit_code','period_type_code','channel_code','customer_visible') limit 1;
  if unknown_field is not null then raise exception 'unknown_kpi_field:%',unknown_field using errcode='22023'; end if;
  if operation_name='CREATE' and (p_kpi_id is not null or p_expected_row_version is not null) then raise exception 'create_identity_must_be_empty' using errcode='22023'; end if;
  if operation_name<>'CREATE' and (p_kpi_id is null or p_expected_row_version is null) then raise exception 'kpi_identity_required' using errcode='22023'; end if;
  if operation_name='ARCHIVE' and p_fields<>'{}'::jsonb then raise exception 'archive_fields_not_allowed' using errcode='22023'; end if;
  request_fingerprint:=md5(concat_ws('|',operation_name,p_project_id::text,coalesce(p_kpi_id::text,''),coalesce(p_expected_row_version::text,''),p_fields::text));
  insert into public.mutations(mutation_id,request_hash,event_status_code,entity_type,entity_id,project_id,action_code,actor_user_id,actor_role_code)
  select p_mutation_id,request_fingerprint,'PREPARE','KPI_DEFINITION',p_kpi_id,p_project_id,operation_name,current_user_id,profile.role_code
  from public.profiles profile where profile.id=current_user_id on conflict(mutation_id) do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count=0 then
    select request_hash,response_data into stored_fingerprint,stored_response from public.mutations where mutation_id=p_mutation_id;
    if stored_fingerprint is distinct from request_fingerprint then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','mutation_id_reused','message','같은 저장 ID를 다른 변경에 사용할 수 없습니다.')); end if;
    return coalesce(stored_response,jsonb_build_object('ok',false,'error',jsonb_build_object('code','mutation_in_progress','message','같은 변경사항을 저장하고 있습니다.')));
  end if;
  begin
    if operation_name='CREATE' then
      if nullif(trim(p_fields->>'metric_name'),'') is null or nullif(p_fields->>'target_value','') is null then raise exception 'required_fields_missing' using errcode='23514'; end if;
      insert into public.kpi_definitions(project_id,phase_code,channel_code,metric_code,metric_name,unit_code,period_type_code,target_value,aggregation_code,display_order,customer_visible,created_by_user_id,updated_by_user_id)
      values(p_project_id,null,nullif(p_fields->>'channel_code',''),'CUSTOM_'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),trim(p_fields->>'metric_name'),coalesce(nullif(p_fields->>'unit_code',''),'COUNT'),coalesce(nullif(p_fields->>'period_type_code',''),'MONTHLY'),(p_fields->>'target_value')::numeric,'SUM',(select coalesce(max(display_order),0)+1 from public.kpi_definitions where project_id=p_project_id and archived_at is null),coalesce((p_fields->>'customer_visible')::boolean,true),current_user_id,current_user_id)
      returning * into kpi_row;
    else
      select * into kpi_row from public.kpi_definitions definition where definition.id=p_kpi_id and definition.project_id=p_project_id for update;
      if not found then raise exception 'kpi_not_found' using errcode='P0002'; end if;
      if kpi_row.row_version<>p_expected_row_version then raise exception 'stale_row_version' using errcode='40001'; end if;
      if operation_name='ARCHIVE' then
        update public.kpi_definitions set archived_at=now(),updated_by_user_id=current_user_id where id=p_kpi_id returning * into kpi_row;
      else
        update public.kpi_definitions definition set
          metric_name=case when p_fields?'metric_name' then trim(p_fields->>'metric_name') else definition.metric_name end,
          target_value=case when p_fields?'target_value' then (p_fields->>'target_value')::numeric else definition.target_value end,
          unit_code=case when p_fields?'unit_code' then p_fields->>'unit_code' else definition.unit_code end,
          period_type_code=case when p_fields?'period_type_code' then p_fields->>'period_type_code' else definition.period_type_code end,
          channel_code=case when p_fields?'channel_code' then nullif(p_fields->>'channel_code','') else definition.channel_code end,
          customer_visible=case when p_fields?'customer_visible' then (p_fields->>'customer_visible')::boolean else definition.customer_visible end,
          updated_by_user_id=current_user_id
        where definition.id=p_kpi_id returning * into kpi_row;
        if nullif(trim(kpi_row.metric_name),'') is null or kpi_row.target_value<0 then raise exception 'invalid_kpi_values' using errcode='23514'; end if;
      end if;
    end if;
    stored_response:=jsonb_build_object('ok',true,'generatedAt',now(),'data',jsonb_build_object('item',to_jsonb(kpi_row)||jsonb_build_object('kpi_id',kpi_row.id)));
    update public.mutations set event_status_code='COMMIT',entity_id=kpi_row.id,after_data=to_jsonb(kpi_row),response_data=stored_response where mutation_id=p_mutation_id;
    return stored_response;
  exception when others then
    stored_response:=jsonb_build_object('ok',false,'error',jsonb_build_object(
      'code',case sqlstate when '40001' then 'stale_row_version' when '42501' then 'forbidden' when 'P0002' then 'not_found' else 'invalid_input' end,
      'message',case sqlstate when '40001' then '다른 사용자가 먼저 수정했습니다. 최신값을 다시 불러와 주세요.' when '42501' then 'KPI 저장 권한이 없습니다.' when 'P0002' then 'KPI를 찾지 못했습니다.' else 'KPI 입력값을 확인해 주세요.' end));
    update public.mutations set event_status_code='FAILED',response_data=stored_response where mutation_id=p_mutation_id;
    return stored_response;
  end;
end;
$$;

revoke all on function public.mutate_kpi_definition(text,text,bigint,bigint,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.mutate_kpi_definition(text,text,bigint,bigint,bigint,jsonb) to authenticated;

-- Direct writes would bypass RPC idempotency and error contracts.
revoke insert, update, delete on public.daily_meetings, public.kpi_definitions from authenticated;
