import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildTaskTimeline, filterTaskSchedule, sortTaskSchedule, taskScheduleCategory, taskScheduleStatusGroup, toggleScheduleStatusFilter, toggleScheduleTaskSelection, withDisplayDeadline } from "../src/taskTimeline.js";

test("업무 시작일과 종료일을 같은 축의 간트 위치로 변환한다", () => {
  const timeline = buildTaskTimeline([
    { id: "A", plannedStartDate: "2026-08-10", dueDate: "2026-08-20" },
    { id: "B", plannedStartDate: "2026-08-20", dueDate: "2026-09-09" },
  ], { startDate: "2026-08-10", endDate: "2026-09-09" }, "2026-08-31");
  assert.equal(timeline.start, "2026-08-10");
  assert.equal(timeline.end, "2026-09-09");
  assert.equal(timeline.dayCount, 31);
  assert.equal(timeline.rows.length, 2);
  assert.ok(timeline.rows[1].left > timeline.rows[0].left);
  assert.ok(timeline.todayLeft > 0 && timeline.todayLeft < 100);
});

test("날짜가 없는 업무는 일정 축에서 제외한다", () => {
  const timeline = buildTaskTimeline([{ id: "A" }], {});
  assert.equal(timeline.rows.length, 0);
  assert.equal(timeline.dayCount, 0);
});

test("계산된 마감 표시는 실제 사용자 입력 종료일을 덮어쓰지 않는다", () => {
  const task = { id: "A", dueDate: null, due: "미정" };
  const decorated = withDisplayDeadline(task, "09.09 · D-8");
  assert.equal(decorated.due, "09.09 · D-8");
  assert.equal(decorated.dueDate, null);
});

test("일정표 업무를 상태와 카테고리로 함께 필터링한다", () => {
  const tasks = [
    { id: "A", statusCode: "IN_PROGRESS", stream: "마케팅", plannedStartDate: "2026-08-20", dueDate: "2026-09-05" },
    { id: "B", statusCode: "DONE", stream: "디자인", plannedStartDate: "2026-08-10", dueDate: "2026-08-20" },
    { id: "C", statusCode: "ON_HOLD", stream: "영상", plannedStartDate: "2026-08-20", dueDate: "2026-09-05" },
  ];
  assert.equal(taskScheduleCategory(tasks[0]), "마케팅");
  assert.equal(taskScheduleStatusGroup(tasks[0]), "ACTIVE");
  assert.equal(taskScheduleStatusGroup(tasks[1]), "DONE");
  assert.equal(taskScheduleStatusGroup(tasks[2]), "HOLD");
  assert.deepEqual(filterTaskSchedule(tasks, { status: "ACTIVE", category: "마케팅" }, "2026-09-01").map((task) => task.id), ["A"]);
});

test("일정 구간은 월요일부터 일요일까지 지난주·이번주·다음주로 구분한다", () => {
  const tasks = [
    { id: "LAST", statusCode: "DONE", plannedStartDate: "2026-08-24", dueDate: "2026-08-30" },
    { id: "THIS", statusCode: "IN_PROGRESS", plannedStartDate: "2026-08-31", dueDate: "2026-09-06" },
    { id: "NEXT", statusCode: "NOT_STARTED", plannedStartDate: "2026-09-07", dueDate: "2026-09-13" },
    { id: "UNSCHEDULED", statusCode: "NOT_STARTED" },
  ];
  assert.deepEqual(filterTaskSchedule(tasks, { schedule: "LAST_WEEK" }, "2026-09-01").map((task) => task.id), ["LAST"]);
  assert.deepEqual(filterTaskSchedule(tasks, { schedule: "THIS_WEEK" }, "2026-09-01").map((task) => task.id), ["THIS"]);
  assert.deepEqual(filterTaskSchedule(tasks, { schedule: "NEXT_WEEK" }, "2026-09-01").map((task) => task.id), ["NEXT"]);
  assert.deepEqual(filterTaskSchedule(tasks, { schedule: "THIS_WEEK" }, new Date(2026, 8, 1, 9, 30)).map((task) => task.id), ["THIS"]);
});

test("일정표는 시작일과 종료일이 빠른 업무를 먼저 두고 미등록 업무를 마지막에 둔다", () => {
  const tasks = [
    { id: "NONE", title: "일정 없음" },
    { id: "LATE", title: "후순위", plannedStartDate: "2026-09-10", dueDate: "2026-09-12" },
    { id: "EARLY-B", title: "선순위 B", plannedStartDate: "2026-09-01", dueDate: "2026-09-05" },
    { id: "EARLY-A", title: "선순위 A", plannedStartDate: "2026-09-01", dueDate: "2026-09-03" },
  ];
  assert.deepEqual(sortTaskSchedule(tasks).map((task) => task.id), ["EARLY-A", "EARLY-B", "LATE", "NONE"]);
});

test("일정 블록은 첫 클릭에 수정 버튼을 열고 같은 블록 재클릭에 닫는다", () => {
  assert.equal(toggleScheduleTaskSelection(null, "TASK-1"), "TASK-1");
  assert.equal(toggleScheduleTaskSelection("TASK-1", "TASK-1"), null);
  assert.equal(toggleScheduleTaskSelection("TASK-1", "TASK-2"), "TASK-2");
});

test("일정표 상단 상태 요약은 같은 상태를 다시 누르면 전체로 돌아간다", () => {
  assert.equal(toggleScheduleStatusFilter("ALL", "DONE"), "DONE");
  assert.equal(toggleScheduleStatusFilter("DONE", "DONE"), "ALL");
  assert.equal(toggleScheduleStatusFilter("DONE", "ACTIVE"), "ACTIVE");
});

test("일정표는 날짜 셀 반복 채움 대신 시작점 하나의 간트 블록을 사용한다", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /starts \? <div className=\{`task-schedule-bar-shell/);
  assert.match(appSource, /task-schedule-color/);
  assert.match(appSource, /task-schedule-bar-edit/);
  assert.match(appSource, /<th rowSpan="2">상태<\/th><th rowSpan="2">담당<\/th>/);
  assert.match(appSource, /taskResponsibleOrgLabel\(task\.responsibleOrgCode, project\.clientName\)/);
  assert.match(appSource, /className="task-schedule-date"/);
  assert.match(styles, /\.task-schedule-row/);
  assert.match(styles, /\.task-schedule-date/);
  assert.match(styles, /\.is-schedule-start/);
  assert.doesNotMatch(appSource, /<select value=\{statusFilter\}/);
  assert.match(appSource, /scheduleWeekFilters/);
});
