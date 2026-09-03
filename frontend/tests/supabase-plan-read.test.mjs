import assert from "node:assert/strict";
import test from "node:test";

import { createSupabasePlanReader } from "../src/supabase/planRead.js";

function queryBuilder(response, calls, table) {
  const operations = [];
  const builder = {
    select(value) { operations.push(["select", value]); return builder; },
    eq(field, value) { operations.push(["eq", field, value]); return builder; },
    is(field, value) { operations.push(["is", field, value]); return builder; },
    order(field, value) { operations.push(["order", field, value]); return builder; },
    limit(value) { operations.push(["limit", value]); return builder; },
    maybeSingle() { operations.push(["maybeSingle"]); calls.push({ table, operations }); return Promise.resolve(response); },
    then(resolve, reject) { calls.push({ table, operations }); return Promise.resolve(response).then(resolve, reject); },
  };
  return builder;
}

function clientReturning(responses) {
  const calls = [];
  return {
    calls,
    from(table) { return queryBuilder(responses[table], calls, table); },
  };
}

test("실행계획은 Sheets가 아니라 Supabase 계획 원장을 읽는다", async () => {
  const client = clientReturning({
    plans: { data: { id: 7, legacy_id: "PLAN-UND", title: "UND 실행계획", version_label: "v1" }, error: null },
    plan_sections: { data: [{ id: 8, legacy_id: "SEC-1", section_code: "S1", nav_label: "개요", title: "개요", body_html: "<p>본문</p>", sort_order: 1 }], error: null },
  });
  const read = createSupabasePlanReader(client, { now: () => "2026-09-03T00:00:00Z" });
  const result = await read({ projectId: "1", planType: "CLIENT_SHARE" });

  assert.deepEqual(client.calls.map((call) => call.table), ["plans", "plan_sections"]);
  assert(client.calls[0].operations.some((operation) => operation[0] === "eq" && operation[1] === "source_code" && operation[2] === "CLIENT_APPROVED_PLAN"));
  assert.equal(result.data.plan.plan_id, "PLAN-UND");
  assert.equal(result.data.sections[0].plan_section_id, "SEC-1");
});

test("내부 실행계획은 별도 source code로 조회하고 없는 계획은 빈 상태를 반환한다", async () => {
  const client = clientReturning({ plans: { data: null, error: null } });
  const result = await createSupabasePlanReader(client)({ projectId: 1, planType: "INTERNAL" });

  assert(client.calls[0].operations.some((operation) => operation[0] === "eq" && operation[1] === "source_code" && operation[2] === "INTERNAL_EXECUTION_PLAN"));
  assert.equal(result.data.planType, "INTERNAL");
  assert.deepEqual(result.data.sections, []);
});

test("잘못된 실행계획 유형은 Supabase 요청 전에 거부한다", async () => {
  const client = clientReturning({});
  await assert.rejects(
    createSupabasePlanReader(client)({ projectId: 1, planType: "UNKNOWN" }),
    (error) => error.code === "invalid_plan_type",
  );
  assert.equal(client.calls.length, 0);
});

