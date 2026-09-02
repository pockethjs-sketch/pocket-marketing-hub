import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseTaskReader, taskReadRpcArguments } from "../src/supabase/taskRead.js";

test("task read parameters map to the masked Supabase RPC", () => {
  assert.deepEqual(taskReadRpcArguments({ projectId: 17 }), {
    p_project_id: "17",
    p_include_archived: false,
  });
  assert.deepEqual(taskReadRpcArguments({ projectId: "17", includeArchived: true }), {
    p_project_id: "17",
    p_include_archived: true,
  });
  assert.throws(() => taskReadRpcArguments({ projectId: "PRJ-UND" }), (error) => error.code === "invalid_supabase_id");
});

test("task reader returns the current view-model envelope contract", async () => {
  const calls = [];
  const readTasks = createSupabaseTaskReader({
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({
        data: { items: [{ task_id: 31, title: "검증 업무" }], members: [], totalMatching: 1, truncated: false },
        error: null,
      });
    },
  }, { now: () => "2026-09-03T03:00:00Z" });

  const result = await readTasks({ projectId: 17 });
  assert.equal(calls[0].name, "read_tasks");
  assert.equal(result.generatedAt, "2026-09-03T03:00:00Z");
  assert.equal(result.data.items[0].task_id, 31);
});

test("task reader maps authorization and malformed response failures", async () => {
  const forbidden = createSupabaseTaskReader({
    rpc() {
      return Promise.resolve({ data: null, error: { code: "42501", status: 403 } });
    },
  });
  await assert.rejects(forbidden({ projectId: 17 }), (error) => error.code === "forbidden" && error.retriable === false);

  const malformed = createSupabaseTaskReader({
    rpc() {
      return Promise.resolve({ data: { items: [] }, error: null });
    },
  });
  await assert.rejects(malformed({ projectId: 17 }), (error) => error.code === "invalid_contract");
});
