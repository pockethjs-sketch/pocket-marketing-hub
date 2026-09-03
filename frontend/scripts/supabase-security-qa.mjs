import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const migrationsDir = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url)).replace(/\\$/, "");
const db = new PGlite();
const userIds = {
  manager: "00000000-0000-4000-8000-000000000001",
  ns: "00000000-0000-4000-8000-000000000002",
  client: "00000000-0000-4000-8000-000000000003",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function scalar(sql, key = "count") {
  const { rows } = await db.query(sql);
  return rows[0]?.[key];
}

async function expectDenied(sql, label) {
  try {
    await db.exec(sql);
  } catch (error) {
    const message = String(error?.message || error);
    assert(/permission denied|row-level security|immutable_column|forbidden_project/i.test(message), `${label}: unexpected error ${message}`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
}

async function expectNoRows(sql, label) {
  const { rows } = await db.query(sql);
  assert(rows.length === 0, `${label}: ${rows.length} row(s) unexpectedly changed`);
}

await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`);

for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(`${migrationsDir}/${file}`, "utf8"));
}

await db.exec(`
  truncate table public.clients restart identity cascade;
  insert into auth.users(id) values
    ('${userIds.manager}'), ('${userIds.ns}'), ('${userIds.client}');
  insert into public.clients(slug, display_name) values ('und', 'UND'), ('muguk', '무극');
  insert into public.projects(client_id, project_name, client_view_enabled)
    values (1, 'UND 통합 마케팅', true), (2, '무극 통합 마케팅', true);
  insert into public.profiles(id, display_name, organization_code, role_code) values
    ('${userIds.manager}', 'Pocket Manager', 'POCKET', 'POCKET_MANAGER'),
    ('${userIds.ns}', 'NS Editor', 'NS', 'EXECUTOR_EDITOR'),
    ('${userIds.client}', 'UND Client', 'CLIENT', 'CLIENT_VIEWER');
  insert into public.project_memberships(project_id, user_id, permission_code, allowed_pages) values
    (1, '${userIds.ns}', 'EDIT', array['tasks']),
    (1, '${userIds.client}', 'READ_ONLY', array['overview']);
  insert into public.tasks(
    project_id, phase_code, workstream_code, title, plan_note, blocker_reason, remarks, responsible_org_code,
    reviewer_org_code, visibility_code, created_by_user_id, updated_by_user_id
  ) values
    (1, 'P0', 'MARKETING', '고객 공개 업무', '내부 계획', '내부 차단', '내부 메모', 'NS', 'POCKET', 'CLIENT', '${userIds.manager}', '${userIds.manager}'),
    (1, 'P0', 'MARKETING', '팀 전용 업무', null, null, null, 'NS', 'POCKET', 'PROJECT_TEAM', '${userIds.manager}', '${userIds.manager}');
`);

assert(await scalar("select count(*)::int as count from pg_tables where schemaname = 'public'") === 23, "table count mismatch");
assert(await scalar("select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity") === 23, "RLS coverage mismatch");
assert(await scalar("select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='email'") === 0, "public profile still exposes email");
assert(await scalar("select count(*)::int as count from information_schema.role_table_grants where grantee='anon' and table_schema='public'") === 0, "anon grants found");
assert(await scalar("select count(*)::int as count from information_schema.routine_privileges where grantee='PUBLIC' and specific_schema in ('public','private')") === 0, "PUBLIC function execute grants found");
assert(await scalar("select count(*)::int as count from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and c.contype='f' and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and c.conkey[1]=any(i.indkey))") === 0, "unindexed foreign key found");

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userIds.client}', false);`);
await expectDenied("select public.read_tasks(1, false)", "client tasks page permission");
await expectDenied("select * from public.tasks", "client raw task table");
assert(await scalar("select count(*)::int as count from public.profiles") === 1, "client can enumerate project executors");

await db.exec(`reset role; update public.project_memberships set allowed_pages=array['overview','tasks'] where user_id='${userIds.client}'; set role authenticated; select set_config('request.jwt.claim.sub', '${userIds.client}', false);`);
const { rows: [clientRead] } = await db.query("select public.read_tasks(1, false) as response");
assert(clientRead.response?.items?.length === 1, `client task access mismatch: ${JSON.stringify(clientRead.response)}`);
const clientTask = clientRead.response.items[0];
assert(clientTask.title === "고객 공개 업무", "client received the wrong task");
assert(clientTask.responsible_org_code === "POCKET", "client can infer the executor organization");
assert(!("plan_note" in clientTask) && !("blocker_reason" in clientTask) && !("remarks" in clientTask), "client task payload leaked internal notes");
assert(clientRead.response.members.length === 0, "client task payload leaked project members");
const { rows: [clientWorkspace] } = await db.query("select public.read_task_workspace(1, false) as response");
assert(Array.isArray(clientWorkspace.response?.issues) && clientWorkspace.response.issues.length === 0, "client issue workspace contract mismatch");
assert(clientWorkspace.response.issueCanWrite === false, "client received issue write permission");
await expectDenied("select before_data from public.activity_events", "raw audit payload");

await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${userIds.ns}', false);`);
await expectDenied("select * from public.tasks", "NS raw task table");
const { rows: [nsRead] } = await db.query("select public.read_tasks(1, false) as response");
assert(nsRead.response?.items?.length === 2, "NS task access mismatch");
assert(nsRead.response.members.length === 2, "NS project member projection mismatch");
await expectDenied("select * from public.project_issues", "NS raw issue table");
const { rows: [issueCreate] } = await db.query(`
  select public.mutate_project_issue(
    'mut_issue_create_0001', 'CREATE', 1, null, null,
    jsonb_build_object(
      'issue_date', '2026-09-03', 'kind_text', '추가업무',
      'related_task_text', '검증 업무', 'body_text', '검증 요청',
      'owner_text', 'NS', 'status_code', 'IN_PROGRESS',
      'completion_url', 'https://example.com/result', 'remarks', 'QA'
    )
  ) as response
`);
assert(issueCreate.response?.ok === true, `valid issue RPC failed: ${JSON.stringify(issueCreate.response)}`);
const issueId = issueCreate.response.data.item.issue_id;
const issueVersion = issueCreate.response.data.item.row_version;
const { rows: [nsWorkspace] } = await db.query("select public.read_task_workspace(1, false) as response");
assert(nsWorkspace.response?.issues?.length === 1, "saved issue did not appear in task workspace");
assert(nsWorkspace.response.issueCanWrite === true, "NS issue write permission missing");
const { rows: [issueUpdate] } = await db.query(`
  select public.mutate_project_issue(
    'mut_issue_update_0001', 'UPDATE', 1, ${issueId}, ${issueVersion},
    jsonb_build_object('status_code', 'DONE', 'remarks', '완료 검증')
  ) as response
`);
assert(issueUpdate.response?.ok === true && issueUpdate.response.data.item.status_code === 'DONE', "issue optimistic update failed");
const { rows: [issueInvalid] } = await db.query(`
  select public.mutate_project_issue(
    'mut_issue_invalid_001', 'UPDATE', 1, ${issueId}, ${issueVersion + 1},
    jsonb_build_object('completion_url', 'javascript:alert(1)')
  ) as response
`);
assert(issueInvalid.response?.ok === false && issueInvalid.response.error.code === 'invalid_input', "unsafe issue URL was accepted");
const { rows: [issueArchive] } = await db.query(`
  select public.mutate_project_issue(
    'mut_issue_archive_001', 'ARCHIVE', 1, ${issueId}, ${issueVersion + 1}, '{}'::jsonb
  ) as response
`);
assert(issueArchive.response?.ok === true && issueArchive.response.data.item.archived_at, "issue archive failed");
const { rows: [workspaceAfterIssueArchive] } = await db.query("select public.read_task_workspace(1, false) as response");
assert(workspaceAfterIssueArchive.response.issues.length === 0, "archived issue remained visible");
const { rows: [createResult] } = await db.query(`
  select public.mutate_task(
    'mut_qa_create_0001', 'CREATE', 1, null, null,
    jsonb_build_object(
      'phase_code', 'P0', 'workstream_code', 'DESIGN', 'title', 'NS 작성 업무',
      'responsible_org_code', 'NS', 'reviewer_org_code', 'POCKET',
      'schedule_dates', jsonb_build_array('2026-09-05', '2026-09-03', '2026-09-05')
    )
  ) as response
`);
assert(createResult.response?.ok === true, `valid task RPC failed: ${JSON.stringify(createResult.response)}`);
assert(await scalar("select count(*)::int as count from public.activity_events where entity_type='TASK'") >= 1, "safe task activity metadata is not readable by NS");
await expectDenied("select before_data from public.activity_events", "NS raw audit payload");
await expectDenied(`insert into public.kpi_definitions(project_id, metric_code, metric_name, unit_code, period_type_code, target_value, aggregation_code, created_by_user_id, updated_by_user_id) values (1, 'QA', '권한 우회', 'COUNT', 'MONTHLY', 1, 'SUM', '${userIds.ns}', '${userIds.ns}')`, "page-specific KPI write");
try {
  await db.query(`
    select public.mutate_task(
      'mut_qa_unknown_0001', 'CREATE', 1, null, null,
      jsonb_build_object('title', '오타 저장', 'titel', '잘못된 필드')
    ) as response
  `);
  throw new Error("unknown task fields were silently ignored");
} catch (error) {
  assert(/unknown_task_field:titel/.test(String(error?.message || error)), `unknown field rejection mismatch: ${error?.message || error}`);
}
const { rows: [createReplay] } = await db.query(`
  select public.mutate_task(
    'mut_qa_create_0001', 'CREATE', 1, null, null,
    jsonb_build_object(
      'phase_code', 'P0', 'workstream_code', 'DESIGN', 'title', 'NS 작성 업무',
      'responsible_org_code', 'NS', 'reviewer_org_code', 'POCKET',
      'schedule_dates', jsonb_build_array('2026-09-05', '2026-09-03', '2026-09-05')
    )
  ) as response
`);
assert(JSON.stringify(createReplay.response) === JSON.stringify(createResult.response), "idempotent replay returned a different result");
await expectDenied(`insert into public.tasks(project_id, phase_code, workstream_code, title, responsible_org_code, reviewer_org_code, created_by_user_id, updated_by_user_id) values (1, 'P0', 'DESIGN', '직접 쓰기', 'NS', 'POCKET', '${userIds.ns}', '${userIds.ns}')`, "direct task insert");
await expectDenied(`select public.mutate_task('mut_qa_cross_0001', 'CREATE', 2, null, null, jsonb_build_object('title', '타 프로젝트 업무'))`, "cross-project RPC insert");
await expectNoRows("update public.projects set project_name='NS가 바꿈' where id=1 returning id", "NS project administration");

await db.exec("reset role");
assert(await scalar("select count(*)::int as count from public.tasks where title='NS 작성 업무'") === 1, "idempotent replay created a duplicate task");
assert(await scalar("select array_to_string(schedule_dates, ',') as value from public.tasks where title='NS 작성 업무'", "value") === "2026-09-03,2026-09-05", "schedule dates were not sorted and deduplicated");
assert(await scalar("select planned_start_date::text as value from public.tasks where title='NS 작성 업무'", "value") === "2026-09-03", "schedule start boundary mismatch");
assert(await scalar("select due_date::text as value from public.tasks where title='NS 작성 업무'", "value") === "2026-09-05", "schedule end boundary mismatch");
const taskId = await scalar("select id::int as value from public.tasks where title='NS 작성 업무'", "value");
const taskVersion = await scalar("select row_version::int as value from public.tasks where id=" + taskId, "value");
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userIds.ns}', false);`);
const { rows: [staleResult] } = await db.query(`select public.mutate_task('mut_qa_stale_0001', 'UPDATE', 1, ${taskId}, ${taskVersion - 1}, jsonb_build_object('title', '충돌 수정')) as response`);
assert(staleResult.response?.ok === false && staleResult.response?.error?.code === "stale_row_version", "stale row version was not rejected");
const { rows: [updateResult] } = await db.query(`select public.mutate_task('mut_qa_update_0001', 'UPDATE', 1, ${taskId}, ${taskVersion}, jsonb_build_object('title', '정상 수정')) as response`);
assert(updateResult.response?.ok === true && updateResult.response?.data?.item?.row_version === taskVersion + 1, "valid optimistic update failed");
const { rows: [clearScheduleResult] } = await db.query(`select public.mutate_task('mut_qa_clear_0001', 'UPDATE', 1, ${taskId}, ${taskVersion + 1}, jsonb_build_object('schedule_dates_json', '[]')) as response`);
assert(clearScheduleResult.response?.ok === true, "clearing the Gantt schedule failed");
assert(Array.isArray(clearScheduleResult.response?.data?.item?.schedule_dates) && clearScheduleResult.response.data.item.schedule_dates.length === 0, "cleared Gantt dates were restored");
assert(clearScheduleResult.response?.data?.item?.planned_start_date === null && clearScheduleResult.response?.data?.item?.due_date === null, "cleared Gantt boundaries were restored");
const { rows: [archiveResult] } = await db.query(`select public.mutate_task('mut_qa_archive_0001', 'ARCHIVE', 1, ${taskId}, ${taskVersion + 2}, '{}'::jsonb) as response`);
assert(archiveResult.response?.ok === true && archiveResult.response?.data?.item?.archived_at, "task archive failed");
const { rows: [activeAfterArchive] } = await db.query("select public.read_tasks(1, false) as response");
const { rows: [allAfterArchive] } = await db.query("select public.read_tasks(1, true) as response");
assert(activeAfterArchive.response?.items?.length === 2, "archived task remained in the active list");
assert(allAfterArchive.response?.items?.length === 3, "authorized archived task read failed");

await db.exec("reset role");
await expectDenied(`update public.tasks set project_id=2 where id=${taskId}`, "cross-project row move");

await db.exec("reset role");
console.log(JSON.stringify({
  migrations: readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).length,
  tables: 23,
  rlsTables: 23,
  pageBoundary: "pass",
  visibilityBoundary: "pass",
  tenantWriteBoundary: "pass",
  immutableTenantKey: "pass",
  idempotentTaskMutation: "pass",
  optimisticConcurrency: "pass",
  ganttClearAndArchive: "pass",
  rawAuditPayload: "blocked",
  clientInternalFields: "masked",
  clientExecutorProfiles: "blocked",
  unknownMutationFields: "rejected",
  projectIssueLedger: "pass",
}));
await db.close();
