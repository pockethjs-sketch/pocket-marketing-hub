export const TASK_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export function taskCreatedAtMs(task) {
  const timestamp = Date.parse(String(task?.createdAt || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isNewTask(task, now = Date.now()) {
  const createdAt = taskCreatedAtMs(task);
  if (createdAt === null) return false;
  const age = now - createdAt;
  return age >= 0 && age < TASK_NEW_WINDOW_MS;
}

export function unacknowledgedNewTasks(tasks, acknowledgedTaskIds, now = Date.now()) {
  const acknowledged = new Set((acknowledgedTaskIds || []).map(String));
  return (tasks || []).filter((task) => isNewTask(task, now) && !acknowledged.has(String(task.id)));
}
