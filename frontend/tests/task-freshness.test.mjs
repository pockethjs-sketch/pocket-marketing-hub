import assert from "node:assert/strict";
import test from "node:test";

import { isNewTask, TASK_NEW_WINDOW_MS, taskCreatedAtMs, unacknowledgedNewTasks } from "../src/taskFreshness.js";

const now = Date.parse("2026-09-03T12:00:00+09:00");

test("생성 후 24시간 미만인 업무만 신규로 판정한다", () => {
  assert.equal(isNewTask({ createdAt: "2026-09-02T12:00:01+09:00" }, now), true);
  assert.equal(isNewTask({ createdAt: "2026-09-02T12:00:00+09:00" }, now), false);
  assert.equal(isNewTask({ createdAt: "2026-09-02T11:59:59+09:00" }, now), false);
  assert.equal(TASK_NEW_WINDOW_MS, 86_400_000);
});

test("미래·누락·잘못된 생성 시각은 신규로 오인하지 않는다", () => {
  assert.equal(isNewTask({ createdAt: "2026-09-03T12:00:01+09:00" }, now), false);
  assert.equal(isNewTask({ createdAt: "" }, now), false);
  assert.equal(isNewTask({}, now), false);
  assert.equal(taskCreatedAtMs({ createdAt: "invalid" }), null);
});

test("수정 시각은 신규 판정에 사용하지 않는다", () => {
  assert.equal(isNewTask({ updatedAt: "2026-09-03T11:59:59+09:00" }, now), false);
  assert.equal(isNewTask({ createdAt: "2026-09-01T12:00:00+09:00", updatedAt: "2026-09-03T11:59:59+09:00" }, now), false);
});

test("확인한 업무가 시간 범위를 벗어나도 알림이 다시 생기지 않고 새 ID만 남긴다", () => {
  const tasks = [
    { id: "T-OLD", createdAt: "2026-09-02T11:59:59+09:00" },
    { id: "T-SEEN", createdAt: "2026-09-03T10:00:00+09:00" },
    { id: "T-NEW", createdAt: "2026-09-03T11:00:00+09:00" },
  ];
  assert.deepEqual(
    unacknowledgedNewTasks(tasks, ["T-SEEN"], now).map((task) => task.id),
    ["T-NEW"],
  );
});
