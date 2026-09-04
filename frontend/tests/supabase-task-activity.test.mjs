import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseTaskActivityReader } from "../src/supabase/taskActivityRead.js";

test("task activity follows Supabase task writes", async () => {
  const calls = [];
  const readActivity = createSupabaseTaskActivityReader({
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({
        data: { items: [{ event_id: "evt-1", entity_type: "TASK", task_title: "업무" }], totalMatching: 1 },
        error: null,
      });
    },
  });
  const result = await readActivity({
    projectId: 17,
    limit: 500,
    cursor: { createdAt: "2026-09-04T03:00:00.000Z", id: 321 },
  });
  assert.equal(calls[0].name, "read_task_activity");
  assert.equal(calls[0].args.p_project_id, "17");
  assert.equal(calls[0].args.p_limit, 200);
  assert.equal(calls[0].args.p_before_created_at, "2026-09-04T03:00:00.000Z");
  assert.equal(calls[0].args.p_before_id, "321");
  assert.equal(result.data.items[0].event_id, "evt-1");
});

test("task activity starts without a cursor and rejects malformed cursors", async () => {
  const calls = [];
  const readActivity = createSupabaseTaskActivityReader({
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data: { items: [], nextCursor: null }, error: null });
    },
  });
  await readActivity({ projectId: 17 });
  assert.equal(calls[0].args.p_before_created_at, null);
  assert.equal(calls[0].args.p_before_id, null);
  await assert.rejects(
    readActivity({ projectId: 17, cursor: { createdAt: "not-a-date", id: 1 } }),
    (error) => error.code === "invalid_activity_cursor",
  );
});

test("task activity fails closed on unauthorized or malformed responses", async () => {
  const forbidden = createSupabaseTaskActivityReader({
    rpc() { return Promise.resolve({ data: null, error: { code: "42501", status: 403 } }); },
  });
  await assert.rejects(forbidden({ projectId: 17 }), (error) => error.code === "forbidden");

  const malformed = createSupabaseTaskActivityReader({
    rpc() { return Promise.resolve({ data: {}, error: null }); },
  });
  await assert.rejects(malformed({ projectId: 17 }), (error) => error.code === "invalid_contract");
});
