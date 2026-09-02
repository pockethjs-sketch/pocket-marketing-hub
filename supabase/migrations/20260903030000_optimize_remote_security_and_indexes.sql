-- Cover the composite same-project foreign keys used by tenant-safe joins.
create index if not exists tasks_parent_project_idx
  on public.tasks(parent_task_id, project_id);
create index if not exists task_dependencies_predecessor_project_idx
  on public.task_dependencies(predecessor_task_id, project_id);
create index if not exists task_dependencies_successor_project_idx
  on public.task_dependencies(successor_task_id, project_id);
create index if not exists contents_task_project_idx
  on public.contents(task_id, project_id);
create index if not exists contents_channel_project_idx
  on public.contents(project_channel_id, project_id);
create index if not exists content_versions_content_project_idx
  on public.content_versions(content_id, project_id);
create index if not exists kpi_actuals_definition_project_idx
  on public.kpi_actuals(kpi_id, project_id);
create index if not exists plan_sections_plan_project_idx
  on public.plan_sections(plan_id, project_id);

-- Keep privileged implementations outside the exposed API schema. The public
-- wrappers remain stable RPC names, but execute with the caller's privileges
-- and can only reach the private implementations through explicit grants.
alter function public.mutate_task(text, text, bigint, bigint, bigint, jsonb)
  set schema private;
alter function public.read_tasks(bigint, boolean)
  set schema private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

revoke all on function private.mutate_task(text, text, bigint, bigint, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function private.mutate_task(text, text, bigint, bigint, bigint, jsonb)
  to authenticated, service_role;

revoke all on function private.read_tasks(bigint, boolean)
  from public, anon, authenticated;
grant execute on function private.read_tasks(bigint, boolean)
  to authenticated, service_role;

create function public.mutate_task(
  p_mutation_id text,
  p_operation text,
  p_project_id bigint,
  p_task_id bigint default null,
  p_expected_row_version bigint default null,
  p_fields jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.mutate_task(
    p_mutation_id,
    p_operation,
    p_project_id,
    p_task_id,
    p_expected_row_version,
    p_fields
  );
$$;

create function public.read_tasks(
  p_project_id bigint,
  p_include_archived boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.read_tasks(p_project_id, p_include_archived);
$$;

revoke all on function public.mutate_task(text, text, bigint, bigint, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_task(text, text, bigint, bigint, bigint, jsonb)
  to authenticated, service_role;

revoke all on function public.read_tasks(bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.read_tasks(bigint, boolean)
  to authenticated, service_role;
