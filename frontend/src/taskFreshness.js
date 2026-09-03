export const TASK_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
// One-time display reset requested on 2026-09-03. Preserve original creation
// timestamps; tasks created after this instant still receive 24-hour badges.
export const TASK_NEW_BASELINE_AT = "2026-09-03T06:05:52Z";
const TASK_NEW_BASELINE_MS = Date.parse(TASK_NEW_BASELINE_AT);

export function taskCreatedAtMs(task) {
  const timestamp = Date.parse(String(task?.createdAt || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isNewTask(task, now = Date.now()) {
  const createdAt = taskCreatedAtMs(task);
  if (createdAt === null || createdAt <= TASK_NEW_BASELINE_MS) return false;
  const age = now - createdAt;
  return age >= 0 && age < TASK_NEW_WINDOW_MS;
}

export function unacknowledgedNewTasks(tasks, acknowledgedTaskIds, now = Date.now()) {
  const acknowledged = new Set((acknowledgedTaskIds || []).map(String));
  return (tasks || []).filter((task) => isNewTask(task, now) && !acknowledged.has(String(task.id)));
}
