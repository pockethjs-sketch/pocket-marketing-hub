import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupabaseTaskBatchMutator,
  createSupabaseTaskMutator,
  taskBatchMutationRpcArguments,
  taskMutationRpcArguments,
} from "../src/supabase/taskMutation.js";

const validInput = {
  mutationId: "mut_qa_12345678",
  projectId: 17,
  expectedRowVersion: 4,
  mutation: {
    entityType: "TASK",
    operation: "UPDATE",
    id: 31,
    fields: { status_code: "ON_HOLD", schedule_dates_json: "[]" },
  },
};

test("current task mutation input maps to the atomic Supabase RPC", () => {
  assert.deepEqual(taskMutationRpcArguments(validInput), {
    p_mutation_id: "mut_qa_12345678",
    p_operation: "UPDATE",
    p_project_id: "17",
    p_task_id: "31",
    p_expected_row_version: "4",
    p_fields: { status_code: "ON_HOLD", schedule_dates_json: "[]" },
  });
});

test("task RPC adapter preserves prefixed mutation ids and returns the canonical row", async () => {
  const calls = [];
  const mutate = createSupabaseTaskMutator({
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({
        data: { ok: true, generatedAt: "2026-09-03T01:00:00Z", data: { item: { id: 31, row_version: 5 } } },
        error: null,
      });
    },
  });
  const result = await mutate(validInput);
  assert.equal(calls[0].name, "mutate_task");
  assert.equal(calls[0].args.p_mutation_id, "mut_qa_12345678");
  assert.equal(result.data.record.task_id, 31);
  assert.equal(result.data.record.row_version, 5);
});

test("task RPC adapter creates one mutation id when the UI omits it", async () => {
  const calls = [];
  const mutate = createSupabaseTaskMutator({
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data: { ok: true, data: { item: { id: 52 } } }, error: null });
    },
  }, { createMutationId: () => "mut_generated_12345678" });

  const result = await mutate({
    projectId: 17,
    mutation: { entityType: "task", operation: "CREATE", fields: { title: "신규 업무" } },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_mutation_id, "mut_generated_12345678");
  assert.equal(result.data.record.task_id, 52);
});

test("database and application mutation errors become public Hub API errors", async () => {
  const databaseFailure = createSupabaseTaskMutator({
    rpc() {
      return Promise.resolve({ data: null, error: { code: "PGRST503", status: 503 } });
    },
  });
  await assert.rejects(databaseFailure(validInput), (error) => error.code === "PGRST503" && error.retriable === true);

  const invalidInput = createSupabaseTaskMutator({
    rpc() {
      return Promise.resolve({ data: null, error: { code: "22023", status: 400, message: "unknown_task_field:titel" } });
    },
  });
  await assert.rejects(
    invalidInput(validInput),
    (error) => error.code === "invalid_input" && error.message === "업무 입력값을 확인해 주세요." && error.retriable === false,
  );

  const conflict = createSupabaseTaskMutator({
    rpc() {
      return Promise.resolve({
        data: { ok: false, error: { code: "stale_row_version", message: "최신값 필요" } },
        error: null,
      });
    },
  });
  await assert.rejects(conflict(validInput), (error) => error.code === "conflict" && error.retriable === false);
});

test("Supabase task mutations fail closed on legacy text ids or missing versions", () => {
  assert.throws(
    () => taskMutationRpcArguments({ ...validInput, projectId: "PRJ-UND" }),
    (error) => error.code === "invalid_supabase_id"
  );
  assert.throws(
    () => taskMutationRpcArguments({ ...validInput, expectedRowVersion: null }),
    (error) => error.code === "invalid_supabase_id"
  );
});

test("Gantt task batches use one atomic Supabase RPC and return canonical rows", async () => {
  const calls = [];
  const input = {
    projectId: 17,
    mutations: [{ ...validInput.mutation, mutationId: validInput.mutationId, expectedRowVersion: 4 }],
  };
  const args = taskBatchMutationRpcArguments(input);
  assert.equal(args.p_project_id, "17");
  assert.equal(args.p_mutations.length, 1);
  assert.equal(args.p_mutations[0].task_id, "31");

  const mutateBatch = createSupabaseTaskBatchMutator({
    rpc(name, rpcArgs) {
      calls.push({ name, rpcArgs });
      return Promise.resolve({
        data: { ok: true, generatedAt: "2026-09-03T03:00:00Z", data: { results: [{ item: { id: 31, row_version: 5 } }] } },
        error: null,
      });
    },
  });
  const result = await mutateBatch(input);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "mutate_tasks_batch");
  assert.equal(result.data.results[0].record.task_id, 31);
});
