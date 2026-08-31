import assert from "node:assert/strict";
import test from "node:test";

let taskForm = {};
try {
  taskForm = await import("../src/taskForm.js");
} catch {}

test("업무 생성 폼은 로그인 조직을 기본 담당으로 사용한다", () => {
  assert.equal(typeof taskForm.taskCreateInitialFields, "function", "업무 생성 폼 모델이 필요합니다");
  assert.equal(taskForm.taskCreateInitialFields("pocket").responsible_org_code, "POCKET");
  assert.equal(taskForm.taskCreateInitialFields("ns").responsible_org_code, "NS");
  assert.equal(taskForm.taskCreateInitialFields("client").responsible_org_code, "CLIENT");
});

test("업무 생성 요청은 사용자가 고른 포켓 NS UND 담당을 덮어쓰지 않는다", () => {
  assert.equal(typeof taskForm.taskCreateSubmissionFields, "function", "업무 생성 요청 변환기가 필요합니다");
  for (const code of ["POCKET", "NS", "CLIENT"]) {
    const payload = taskForm.taskCreateSubmissionFields({
      title: "테스트 업무",
      responsible_org_code: code,
      due_date: "",
    });
    assert.equal(payload.responsible_org_code, code);
    assert.equal(payload.reviewer_org_code, "POCKET");
    assert.equal(Object.hasOwn(payload, "due_date"), false);
  }
});

test("업무 생성 담당 선택지는 포켓 NS UND 세 개만 제공한다", () => {
  assert.deepEqual(taskForm.TASK_RESPONSIBLE_ORG_OPTIONS, [
    ["POCKET", "포켓"],
    ["NS", "NS"],
    ["CLIENT", "UND"],
  ]);
});

test("완료 업무 추가는 완료 상태만 고정하고 담당 기본값은 로그인 조직을 따른다", () => {
  assert.equal(taskForm.taskCreateInitialFields("pocket", "completed").responsible_org_code, "POCKET");
  assert.equal(taskForm.taskCreateInitialFields("ns", "completed").responsible_org_code, "NS");
  assert.equal(taskForm.taskCreateInitialFields("client", "completed").responsible_org_code, "CLIENT");
  assert.equal(taskForm.taskCreateInitialFields("pocket", "completed").status_code, "DONE");
  assert.equal(taskForm.taskCreateInitialFields("pocket", "completed").progress_percent, 0);
});

test("업무 생성은 표·일정 필드를 보존하고 진행률을 숫자로 변환한다", () => {
  const payload = taskForm.taskCreateSubmissionFields({
    title: "업무",
    description: "세부내용",
    planned_start_date: "2026-09-01",
    due_date: "2026-09-03",
    progress_percent: "25",
    completion_url: "https://example.com/result",
    remarks: "비고",
  });
  assert.equal(payload.progress_percent, 25);
  assert.equal(payload.completion_url, "https://example.com/result");
  assert.equal(payload.remarks, "비고");
});
