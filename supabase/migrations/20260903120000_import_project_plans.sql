-- Pocket-manager-only import path for approved project-plan snapshots.
-- The client reads the resulting rows through the existing RLS policies.

create or replace function public.import_project_plan(
  p_project_id bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  plan_legacy_id text;
  plan_source text;
  plan_visibility text;
  imported_plan public.plans%rowtype;
  existing_project_id bigint;
  section_payload jsonb;
  section_legacy_id text;
  section_code text;
  section_visibility text;
  section_ids text[] := array[]::text[];
  section_count integer;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not (select private.is_pocket_manager()) then raise exception 'pocket_manager_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.projects project
     where project.id = p_project_id and project.archived_at is null and project.status_code <> 'DISABLED'
  ) then raise exception 'project_not_found' using errcode = 'P0002'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 2000000 then
    raise exception 'invalid_plan_payload' using errcode = '22023';
  end if;

  plan_legacy_id := trim(coalesce(p_payload->>'id', ''));
  plan_source := upper(trim(coalesce(p_payload->>'sourceCode', '')));
  plan_visibility := upper(trim(coalesce(p_payload->>'visibilityCode', '')));
  if length(plan_legacy_id) < 4 or length(plan_legacy_id) > 200 then raise exception 'invalid_plan_id' using errcode = '22023'; end if;
  if plan_source not in ('CLIENT_APPROVED_PLAN', 'INTERNAL_EXECUTION_PLAN') then raise exception 'invalid_plan_source' using errcode = '22023'; end if;
  if (plan_source = 'CLIENT_APPROVED_PLAN' and plan_visibility <> 'CLIENT')
     or (plan_source = 'INTERNAL_EXECUTION_PLAN' and plan_visibility <> 'PROJECT_TEAM') then
    raise exception 'invalid_plan_visibility' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_payload->>'title', ''))) < 2 then raise exception 'plan_title_required' using errcode = '22023'; end if;
  if jsonb_typeof(p_payload->'sections') <> 'array' then raise exception 'plan_sections_required' using errcode = '22023'; end if;
  section_count := jsonb_array_length(p_payload->'sections');
  if section_count < 1 or section_count > 100 then raise exception 'invalid_plan_section_count' using errcode = '22023'; end if;
  if section_count <> (select count(distinct section->>'id') from jsonb_array_elements(p_payload->'sections') section)
     or section_count <> (select count(distinct upper(section->>'code')) from jsonb_array_elements(p_payload->'sections') section) then
    raise exception 'duplicate_plan_section' using errcode = '22023';
  end if;

  select plan.project_id into existing_project_id from public.plans plan where plan.legacy_id = plan_legacy_id;
  if existing_project_id is not null and existing_project_id <> p_project_id then
    raise exception 'plan_project_mismatch' using errcode = '42501';
  end if;

  insert into public.plans (
    legacy_id, project_id, version_label, title, summary, build_weeks,
    operation_months, monthly_output_target, initial_output_target, primary_goal,
    status_code, effective_at, visibility_code, source_code, archived_at
  ) values (
    plan_legacy_id, p_project_id, trim(coalesce(p_payload->>'versionLabel', '현재 승인본')),
    trim(p_payload->>'title'), nullif(trim(coalesce(p_payload->>'summary', '')), ''),
    nullif(p_payload->>'buildWeeks', '')::smallint,
    nullif(p_payload->>'operationMonths', '')::smallint,
    nullif(p_payload->>'monthlyOutputTarget', '')::integer,
    nullif(p_payload->>'initialOutputTarget', '')::integer,
    nullif(trim(coalesce(p_payload->>'primaryGoal', '')), ''),
    'PUBLISHED', nullif(p_payload->>'effectiveAt', '')::timestamptz,
    plan_visibility, plan_source, null
  )
  on conflict (legacy_id) do update set
    version_label = excluded.version_label,
    title = excluded.title,
    summary = excluded.summary,
    build_weeks = excluded.build_weeks,
    operation_months = excluded.operation_months,
    monthly_output_target = excluded.monthly_output_target,
    initial_output_target = excluded.initial_output_target,
    primary_goal = excluded.primary_goal,
    status_code = 'PUBLISHED',
    effective_at = excluded.effective_at,
    visibility_code = excluded.visibility_code,
    source_code = excluded.source_code,
    archived_at = null,
    updated_at = now(),
    row_version = public.plans.row_version + 1
  returning * into imported_plan;

  for section_payload in select value from jsonb_array_elements(p_payload->'sections') loop
    section_legacy_id := trim(coalesce(section_payload->>'id', ''));
    section_code := upper(trim(coalesce(section_payload->>'code', '')));
    section_visibility := upper(trim(coalesce(section_payload->>'visibilityCode', plan_visibility)));
    if length(section_legacy_id) < 4 or length(section_legacy_id) > 200 or length(section_code) < 1 then
      raise exception 'invalid_plan_section_identity' using errcode = '22023';
    end if;
    if length(trim(coalesce(section_payload->>'title', ''))) < 1
       or length(coalesce(section_payload->>'bodyHtml', '')) < 1
       or length(coalesce(section_payload->>'bodyHtml', '')) > 100000 then
      raise exception 'invalid_plan_section_content:%', section_code using errcode = '22023';
    end if;
    if plan_source = 'CLIENT_APPROVED_PLAN' and section_visibility <> 'CLIENT' then
      raise exception 'invalid_client_section_visibility:%', section_code using errcode = '22023';
    end if;
    if plan_source = 'INTERNAL_EXECUTION_PLAN' and section_visibility not in ('PROJECT_TEAM', 'POCKET_ONLY') then
      raise exception 'invalid_internal_section_visibility:%', section_code using errcode = '22023';
    end if;
    if exists (
      select 1 from public.plan_sections section
       where section.legacy_id = section_legacy_id and section.project_id <> p_project_id
    ) then raise exception 'plan_section_project_mismatch:%', section_code using errcode = '42501'; end if;

    insert into public.plan_sections (
      legacy_id, project_id, plan_id, section_code, nav_label, title, body_html,
      sort_order, status_code, visibility_code, source_code, archived_at
    ) values (
      section_legacy_id, p_project_id, imported_plan.id, section_code,
      nullif(trim(coalesce(section_payload->>'navLabel', '')), ''),
      trim(section_payload->>'title'), section_payload->>'bodyHtml',
      coalesce(nullif(section_payload->>'sortOrder', '')::integer, 0),
      'PUBLISHED', section_visibility, plan_source, null
    )
    on conflict (legacy_id) do update set
      plan_id = excluded.plan_id,
      section_code = excluded.section_code,
      nav_label = excluded.nav_label,
      title = excluded.title,
      body_html = excluded.body_html,
      sort_order = excluded.sort_order,
      status_code = 'PUBLISHED',
      visibility_code = excluded.visibility_code,
      source_code = excluded.source_code,
      archived_at = null,
      updated_at = now(),
      row_version = public.plan_sections.row_version + 1;
    section_ids := array_append(section_ids, section_legacy_id);
  end loop;

  update public.plan_sections section set
    status_code = 'ARCHIVED', archived_at = now(), updated_at = now(), row_version = section.row_version + 1
   where section.plan_id = imported_plan.id
     and section.archived_at is null
     and not (section.legacy_id = any(section_ids));

  insert into public.activity_events (
    mutation_id, project_id, entity_type, entity_id, action_code, after_data,
    visibility_code, actor_user_id, actor_role_code, event_status_code
  )
  select concat('plan-import:', plan_legacy_id, ':', imported_plan.row_version), p_project_id,
    'PLAN', imported_plan.id, 'MIGRATED',
    jsonb_build_object('legacy_id', plan_legacy_id, 'source_code', plan_source, 'sections', section_count),
    'POCKET_ONLY', current_user_id, profile.role_code, 'COMMIT'
    from public.profiles profile where profile.id = current_user_id;

  return jsonb_build_object(
    'ok', true,
    'planId', imported_plan.id,
    'legacyId', imported_plan.legacy_id,
    'sourceCode', imported_plan.source_code,
    'sections', section_count,
    'rowVersion', imported_plan.row_version
  );
end;
$$;

revoke all on function public.import_project_plan(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.import_project_plan(bigint, jsonb) to authenticated;

