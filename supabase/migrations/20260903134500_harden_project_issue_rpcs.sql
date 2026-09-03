-- Keep privileged implementations outside the exposed API schema. Public RPC
-- names are narrow invoker wrappers and authenticated callers receive only the
-- exact private EXECUTE privileges required by those wrappers.

alter function public.read_task_workspace(bigint, boolean)
  set schema private;
alter function public.mutate_project_issue(text, text, bigint, bigint, bigint, jsonb)
  set schema private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

revoke all on function private.read_task_workspace(bigint, boolean)
  from public, anon, authenticated;
grant execute on function private.read_task_workspace(bigint, boolean)
  to authenticated, service_role;

revoke all on function private.mutate_project_issue(text, text, bigint, bigint, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function private.mutate_project_issue(text, text, bigint, bigint, bigint, jsonb)
  to authenticated, service_role;

create function public.read_task_workspace(
  p_project_id bigint,
  p_include_archived boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.read_task_workspace(p_project_id, p_include_archived);
$$;

create function public.mutate_project_issue(
  p_mutation_id text,
  p_operation text,
  p_project_id bigint,
  p_issue_id bigint default null,
  p_expected_row_version bigint default null,
  p_fields jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.mutate_project_issue(
    p_mutation_id,
    p_operation,
    p_project_id,
    p_issue_id,
    p_expected_row_version,
    p_fields
  );
$$;

revoke all on function public.read_task_workspace(bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.read_task_workspace(bigint, boolean)
  to authenticated, service_role;

revoke all on function public.mutate_project_issue(text, text, bigint, bigint, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_project_issue(text, text, bigint, bigint, bigint, jsonb)
  to authenticated, service_role;

