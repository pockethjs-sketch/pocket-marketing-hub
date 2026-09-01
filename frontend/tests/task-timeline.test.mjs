import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildTaskTimeline, withDisplayDeadline } from "../src/taskTimeline.js";

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

test("일정표는 날짜 셀 반복 채움 대신 시작점 하나의 간트 블록을 사용한다", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /starts \? <i style=\{\{ width:/);
  assert.match(appSource, /task-schedule-identity/);
  assert.match(styles, /\.task-schedule-row/);
  assert.match(styles, /\.is-schedule-start/);
});
