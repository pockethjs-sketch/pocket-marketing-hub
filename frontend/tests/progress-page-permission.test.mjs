import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/20260904105646_add_progress_page_permission.sql", import.meta.url),
  "utf8",
);
const bridge = await readFile(
  new URL("../../supabase/functions/hub-auth-bridge/index.ts", import.meta.url),
  "utf8",
);

test("Supabase 허용 페이지 제약은 진행상황 코드를 포함한다", () => {
  assert.match(migration, /'overview', 'plan', 'tasks', 'progress', 'daily'/);
  assert.match(migration, /validate constraint project_memberships_allowed_pages_check_v2/);
  assert.match(bridge, /"overview", "plan", "tasks", "progress", "daily"/);
});

test("진행상황 전용 고객은 읽기 전용 업무 투영을 조회할 수 있다", () => {
  assert.match(migration, /target_page = 'tasks' and 'progress' = any\(membership\.allowed_pages\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /auth\.uid\(\)/);
});
