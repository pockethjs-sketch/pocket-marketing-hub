import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESS_PAGE_KEYS,
  accountSubmission,
  firstAllowedView,
  isViewAllowed,
  normalizeAllowedPages,
} from "../src/accessPermissions.js";

test("고객 권한은 알려진 페이지 코드만 중복 없이 보존한다", () => {
  assert.deepEqual(
    normalizeAllowedPages(["tasks", "overview", "tasks", "unknown"]),
    ["overview", "tasks"],
  );
});

test("고객에게 허용된 첫 화면과 실행계획 하위 경로를 판정한다", () => {
  assert.equal(firstAllowedView(["performance", "files"]), "performance");
  assert.equal(isViewAllowed("plan", ["plan"]), true);
  assert.equal(isViewAllowed("tasks", ["plan"]), false);
  assert.equal(isViewAllowed("daily", ["tasks"]), true);
  assert.equal(isViewAllowed("permissions", ACCESS_PAGE_KEYS), false);
});

test("고객 계정 저장 요청은 프로젝트와 페이지 권한을 명시한다", () => {
  const submission = accountSubmission({
    account: "client-und",
    displayName: "UND 고객",
    accessCode: "client-password",
    projectId: "PRJ-UND",
    allowedPages: ["overview", "tasks"],
    enabled: true,
  });
  assert.deepEqual(submission, {
    operation: "UPSERT",
    account: "client-und",
    displayName: "UND 고객",
    accessCode: "client-password",
    projectId: "PRJ-UND",
    allowedPages: ["overview", "tasks"],
    enabled: true,
  });
});

test("기존 고객 계정 수정은 현재 권한 행을 이어서 갱신한다", () => {
  const submission = accountSubmission({
    account: "client-und",
    displayName: "UND 고객",
    projectId: "PRJ-UND",
    membershipId: "MEM-UND-CLIENT",
    allowedPages: ["overview", "performance"],
  });
  assert.equal(submission.membershipId, "MEM-UND-CLIENT");
});
