import assert from "node:assert/strict";
import test from "node:test";

import { summarizeSupabaseTasks } from "../src/supabase/hybridApi.js";

test("Supabase task rollup keeps overview task metrics on the active task source", () => {
  const rollup = summarizeSupabaseTasks([
    { status_code: "DONE", phase_code: "P0", workstream_code: "MKT" },
    { status_code: "IN_PROGRESS", phase_code: "P0", workstream_code: "MKT" },
    { status_code: "WAITING_CLIENT", phase_code: "M1", workstream_code: "DSN" },
    { status_code: "BLOCKED", phase_code: "M1", workstream_code: "VID" },
    { status_code: "DONE", phase_code: "P9", workstream_code: "MKT", archived_at: "2026-09-03T00:00:00Z" },
  ]);

  assert.deepEqual(rollup.summary, { total: 4, done: 1, inProgress: 2, blocked: 1 });
  assert.deepEqual(rollup.phases, [{ code: "P0", count: 2 }, { code: "M1", count: 2 }]);
  assert.deepEqual(rollup.workstreams, [
    { code: "MKT", count: 2 },
    { code: "DSN", count: 1 },
    { code: "VID", count: 1 },
  ]);
});
