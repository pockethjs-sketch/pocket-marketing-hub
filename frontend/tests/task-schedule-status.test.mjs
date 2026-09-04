import assert from "node:assert/strict";
import test from "node:test";
import { effectiveTaskScheduleState, koreaDateValue } from "../src/taskScheduleStatus.js";

test("일정 자동 상태는 시작 전 미착수, 기간 중 진행, 종료일 다음 날 완료다", () => {
  const task = { status_mode: "SCHEDULE", status_code: "NOT_STARTED", planned_start_date: "2026-09-04", due_date: "2026-09-06", progress_percent: 35 };
  assert.deepEqual(effectiveTaskScheduleState(task, "2026-09-03"), { statusMode: "SCHEDULE", statusCode: "NOT_STARTED", progressPercent: 0, automatic: true });
  assert.equal(effectiveTaskScheduleState(task, "2026-09-04").statusCode, "IN_PROGRESS");
  assert.equal(effectiveTaskScheduleState(task, "2026-09-06").statusCode, "IN_PROGRESS");
  assert.deepEqual(effectiveTaskScheduleState(task, "2026-09-07"), { statusMode: "SCHEDULE", statusCode: "DONE", progressPercent: 100, automatic: true });
});

test("수동 상태는 기간 중 유지하지만 만료 업무는 무조건 완료한다", () => {
  const task = { statusMode: "MANUAL", statusCode: "ON_HOLD", plannedStartDate: "2026-09-01", dueDate: "2026-09-06", progressPercent: 40 };
  assert.equal(effectiveTaskScheduleState(task, "2026-09-04").statusCode, "ON_HOLD");
  assert.equal(effectiveTaskScheduleState(task, "2026-09-07").statusCode, "DONE");
  assert.equal(effectiveTaskScheduleState(task, "2026-09-07").progressPercent, 100);
});

test("한국 날짜 계산은 UTC 자정 경계와 무관하게 서울 날짜를 쓴다", () => {
  assert.equal(koreaDateValue(new Date("2026-09-03T16:00:00Z")), "2026-09-04");
});

test("DB 마이그레이션 전 status_mode가 없는 행은 수동 상태를 보존한다", () => {
  const task = { status_code: "ON_HOLD", planned_start_date: "2026-09-01", due_date: "2026-09-06", progress_percent: 40 };
  assert.deepEqual(effectiveTaskScheduleState(task, "2026-09-04"), { statusMode: "MANUAL", statusCode: "ON_HOLD", progressPercent: 40, automatic: false });
});
