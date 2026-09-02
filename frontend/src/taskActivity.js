const USER_FACING_TASK_FIELDS = new Set([
  "title",
  "status_code",
  "description",
  "planned_start_date",
  "due_date",
  "schedule_dates_json",
  "progress_percent",
  "completion_url",
  "remarks",
  "priority_code",
  "responsible_org_code",
  "workstream_code",
  "phase_code",
  "visibility_code",
]);

const MEANINGFUL_ACTIONS_WITHOUT_CHANGES = new Set(["CREATED", "ARCHIVED", "APPROVED", "REJECTED"]);
const USER_TASK_ACTIONS = new Set(["CREATED", "UPDATED", "ARCHIVED"]);

function readableActor(value) {
  const actor = String(value || "").trim();
  if (!actor || actor === "확인되지 않은 사용자") return false;
  if (/^(system|시스템|migration|마이그레이션)$/i.test(actor)) return false;
  if (/^(usr|user|actor)-[a-z0-9_-]+$/i.test(actor)) return false;
  return true;
}

export function readableTaskActivities(items = [], tasks = []) {
  const taskTitles = new Map(tasks.map((task) => [String(task.id || ""), String(task.title || "").trim()]));
  return items.map((item) => {
    if (item?.type !== "task") return null;
    const taskTitle = String(item.taskTitle || taskTitles.get(String(item.entityId || "")) || "").trim();
    const changes = (item.changes || []).filter((change) => USER_FACING_TASK_FIELDS.has(String(change?.field || "")));
    const actionCode = String(item.actionCode || "").toUpperCase();
    if (!item.userInitiated || !USER_TASK_ACTIONS.has(actionCode)) return null;
    if (!taskTitle || !readableActor(item.actor)) return null;
    if (!changes.length && !MEANINGFUL_ACTIONS_WITHOUT_CHANGES.has(actionCode)) return null;
    return { ...item, taskTitle, changes };
  }).filter(Boolean);
}

export function taskActivitySentence(item = {}) {
  const action = String(item.actionCode || "").toUpperCase();
  if (action === "CREATED") return "업무가 추가되었습니다.";
  if (action === "ARCHIVED") return "업무가 보관되었습니다.";
  if (action === "APPROVED") return "업무가 승인되었습니다.";
  if (action === "REJECTED") return "업무가 반려되었습니다.";
  return "업무 정보가 변경되었습니다.";
}
