import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const functionSource = readFileSync(new URL("../../supabase/functions/access-admin/index.ts", import.meta.url), "utf8");

test("NS 권한 관리는 배정된 편집 프로젝트로 제한한다", () => {
  assert.match(functionSource, /actor\?\.organization_code === "NS" && actor\?\.role_code === "EXECUTOR_EDITOR"/);
  assert.match(functionSource, /\.in\("permission_code", \["ADMIN", "EDIT"\]\)/);
  assert.match(functionSource, /const canManageProject =/);
  assert.match(functionSource, /if \(!canManageProject\(project\.id\)\)/);
});

test("NS는 프로젝트 권한을 관리하되 전체 계정 비활성화는 못 한다", () => {
  assert.match(functionSource, /operation === "DISABLE" && !pocketManager/);
  assert.match(functionSource, /visibleMemberships/);
  assert.match(functionSource, /profile\.accesses\.length > 0/);
});

test("NS는 자기 프로젝트에 이미 연결된 고객 계정만 수정한다", () => {
  assert.match(functionSource, /if \(nsManager && authUser\)/);
  assert.match(functionSource, /이 고객 계정은 NS 관리 범위 밖에 있습니다/);
  assert.match(functionSource, /\.in\("project_id", scopedIds\)/);
});
