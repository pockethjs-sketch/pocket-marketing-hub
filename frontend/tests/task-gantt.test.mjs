import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGanttAxis,
  ganttMonthClass,
  groupGanttTasks,
  normalizeScheduleDates,
  paintGanttRectangle,
  scheduleDateBounds,
  scheduleDateRange,
  serializeScheduleDates,
  taskScheduleDates,
} from "../src/taskGantt.js";

test("간트는 빈 화면 폭만 다음 달 날짜로 채우고 업무 일정은 바꾸지 않는다", () => {
  const axis = buildGanttAxis("2026-09-20", "2026-09-30", 35);
  assert.equal(axis.length, 35);
  assert.equal(axis.at(-1).iso, "2026-10-24");
  assert.equal(axis[11].iso, "2026-10-01");
  assert.match(ganttMonthClass(axis[11]), /month-start/);
  assert.notEqual(axis[0].monthTone, axis[11].monthTone);
  assert.equal(buildGanttAxis("2026-09-01", "2026-10-31", 10).length, 61);
  assert.deepEqual(buildGanttAxis(null, null, 50), []);
  assert.equal(buildGanttAxis("2026-12-31", "2026-12-31", 2)[1].iso, "2027-01-01");
  assert.equal(buildGanttAxis("2028-02-28", "2028-02-28", 3)[2].iso, "2028-03-01");
});

test("분야별 간트 화면 순서를 드래그 행 배열로 그대로 평탄화한다", () => {
  const tasks = [
    { id: "M-1", category: "마케팅" },
    { id: "D-1", category: "디자인" },
    { id: "M-2", category: "마케팅" },
  ];
  const groups = groupGanttTasks(tasks);
  assert.deepEqual(groups.map((group) => group.label), ["마케팅", "디자인"]);
  assert.deepEqual(groups.flatMap((group) => group.tasks).map((task) => task.id), ["M-1", "M-2", "D-1"]);
});

test("구버전 업무는 시작일과 종료일 사이를 간트 일정으로 사용한다", () => {
  assert.deepEqual(taskScheduleDates({
    plannedStartDate: "2026-09-01",
    dueDate: "2026-09-03",
    scheduleDates: null,
  }), ["2026-09-01", "2026-09-02", "2026-09-03"]);
});

test("명시적으로 비운 간트 일정은 시작일 fallback으로 되살리지 않는다", () => {
  assert.deepEqual(taskScheduleDates({
    plannedStartDate: "2026-09-01",
    dueDate: "2026-09-03",
    scheduleDates: [],
  }), []);
});

test("빈 셀 드래그는 여러 업무와 날짜의 사각 범위를 한 번에 추가한다", () => {
  const axisDays = scheduleDateRange("2026-09-01", "2026-09-05");
  const rows = [
    { id: "T-1", scheduleDates: ["2026-09-01"] },
    { id: "T-2", scheduleDates: [] },
    { id: "T-3", scheduleDates: ["2026-09-05"] },
  ];
  const result = paintGanttRectangle(
    rows,
    { rowIndex: 0, dayIndex: 1, axisDays },
    { rowIndex: 1, dayIndex: 3 },
    "paint",
  );
  assert.deepEqual(result.get("T-1"), ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
  assert.deepEqual(result.get("T-2"), ["2026-09-02", "2026-09-03", "2026-09-04"]);
  assert.deepEqual(result.get("T-3"), ["2026-09-05"]);
});

test("채워진 셀 드래그는 중간 날짜만 지워도 구멍을 보존한다", () => {
  const axisDays = scheduleDateRange("2026-09-01", "2026-09-05");
  const rows = [{ id: "T-1", scheduleDates: axisDays }];
  const result = paintGanttRectangle(
    rows,
    { rowIndex: 0, dayIndex: 1, axisDays },
    { rowIndex: 0, dayIndex: 3 },
    "erase",
  );
  assert.deepEqual(result.get("T-1"), ["2026-09-01", "2026-09-05"]);
  assert.deepEqual(scheduleDateBounds(result.get("T-1")), { start: "2026-09-01", end: "2026-09-05" });
});

test("간트 날짜 JSON은 중복과 순서를 정규화한다", () => {
  assert.deepEqual(normalizeScheduleDates('["2026-09-03","2026-09-01","2026-09-03"]'), ["2026-09-01", "2026-09-03"]);
  assert.equal(serializeScheduleDates(["2026-09-03", "2026-09-01"]), '["2026-09-01","2026-09-03"]');
});
