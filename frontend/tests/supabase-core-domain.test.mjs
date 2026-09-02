import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseCoreDomainApi } from "../src/supabase/coreDomainApi.js";

function clientReturning(responses) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(responses[name] || { data: null, error: null });
    },
  };
}

test("Supabase bootstrap, 회의록, KPI는 화면별 RPC 계약을 사용한다", async () => {
  const client = clientReturning({
    read_bootstrap: { data: { clients: [], projects: [], channels: [], currentUser: { userId: "USR-1" } }, error: null },
    read_daily_meetings: { data: { items: [], totalMatching: 0 }, error: null },
    read_performance: { data: { definitions: [], actuals: [], daily: [], channels: [] }, error: null },
  });
  const api = createSupabaseCoreDomainApi(client);
  await api.bootstrap();
  await api.dailyMeetings({ projectId: "12", limit: 500 });
  await api.performance({ projectId: 12, startDate: "2026-09-01", endDate: "2026-09-03" });
  assert.deepEqual(client.calls.map((call) => call.name), ["read_bootstrap", "read_daily_meetings", "read_performance"]);
  assert.equal(client.calls[1].args.p_limit, 200);
  assert.equal(client.calls[2].args.p_start_date, "2026-09-01");
});
test("회의록과 KPI 저장은 mutation id, row version, 프로젝트를 RPC에 고정한다", async () => {
  const client = clientReturning({
    mutate_daily_meeting: { data: { ok: true, data: { item: { meeting_id: 3 } } }, error: null },
    mutate_kpi_definition: { data: { ok: true, data: { item: { kpi_id: 4 } } }, error: null },
  });
  const api = createSupabaseCoreDomainApi(client);
  await api.mutateMeeting({ projectId: "9", mutationId: "meeting_12345678", mutation: { entityType: "daily_meeting", operation: "CREATE", fields: { title: "회의" } } });
  await api.mutateKpi({ projectId: "9", mutationId: "kpi_12345678", expectedRowVersion: 7, mutation: { entityType: "kpi_definition", operation: "UPDATE", id: 4, fields: { target_value: 10 } } });
  assert.deepEqual(client.calls[0].args, {
    p_mutation_id: "meeting_12345678", p_operation: "CREATE", p_project_id: "9",
    p_meeting_id: null, p_expected_row_version: null, p_fields: { title: "회의" },
  });
  assert.equal(client.calls[1].args.p_kpi_id, "4");
  assert.equal(client.calls[1].args.p_expected_row_version, "7");
});

test("도메인 RPC의 애플리케이션 오류는 저장 성공으로 처리하지 않는다", async () => {
  const client = clientReturning({
    mutate_kpi_definition: { data: { ok: false, error: { code: "stale_row_version", message: "stale" } }, error: null },
  });
  const api = createSupabaseCoreDomainApi(client);
  await assert.rejects(
    api.mutateKpi({ projectId: 1, mutationId: "kpi_abcdefgh", expectedRowVersion: 2, mutation: { operation: "UPDATE", id: 3, fields: { target_value: 10 } } }),
    (error) => error.code === "conflict",
  );
});
