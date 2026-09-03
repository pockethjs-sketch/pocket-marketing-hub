import { scheduleDateRange, serializeScheduleDates } from "./taskGantt.js";

export function taskResponsibleOrgOptions(clientName = "고객사") {
  return [
    ["POCKET", "포켓"],
    ["NS", "NS"],
    ["CLIENT", String(clientName || "고객사").trim() || "고객사"],
  ];
}

export function taskResponsibleOrgLabel(code, clientName = "고객사") {
  return Object.fromEntries(taskResponsibleOrgOptions(clientName))[String(code || "").toUpperCase()] || "포켓";
}

const TASK_STATUS_CYCLE = ["NOT_STARTED", "IN_PROGRESS", "DONE", "ON_HOLD"];
const TASK_OWNER_CYCLE = ["POCKET", "NS", "CLIENT"];

export function nextTaskStatusCode(value) {
  const status = String(value || "").toUpperCase();
  const normalized = status === "TODO"
    ? "NOT_STARTED"
    : ["INTERNAL_REVIEW", "WAITING_CLIENT", "REVISION"].includes(status)
      ? "IN_PROGRESS"
      : status === "COMPLETED"
        ? "DONE"
        : status === "BLOCKED"
          ? "ON_HOLD"
          : status;
  const index = TASK_STATUS_CYCLE.indexOf(normalized);
  return TASK_STATUS_CYCLE[(index + 1 + TASK_STATUS_CYCLE.length) % TASK_STATUS_CYCLE.length];
}

export function nextTaskResponsibleOrgCode(value) {
  const index = TASK_OWNER_CYCLE.indexOf(String(value || "").toUpperCase());
  return TASK_OWNER_CYCLE[(index + 1 + TASK_OWNER_CYCLE.length) % TASK_OWNER_CYCLE.length];
}

// 업무 화면의 프레임은 프로젝트별 권한 캐시로 갈라지지 않는다.
// 내부 계정에는 동일한 조작 UI를 제공하고 실제 변경 권한은 서버가 다시 검증한다.
export function canOperateProjectTasks({ live, role, loginEnabled = true } = {}) {
  if (!live) return false;
  if (loginEnabled === false) return true;
  return role === "pocket" || role === "ns";
}

export function taskCreateInitialFields(role, mode = "default") {
  const responsibleOrgCode = role === "ns" ? "NS" : role === "client" ? "CLIENT" : "POCKET";
  return {
    title: "",
    phase_code: "M1",
    workstream_code: "MKT",
    responsible_org_code: responsibleOrgCode,
    status_code: mode === "completed" ? "DONE" : "NOT_STARTED",
    priority_code: "NORMAL",
    description: "",
    planned_start_date: "",
    due_date: "",
    progress_percent: 0,
    completion_url: "",
    remarks: "",
    visibility_code: role === "client" ? "CLIENT" : "PROJECT_TEAM",
  };
}

export function taskCreateSubmissionFields(fields) {
  const cleaned = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ""));
  if (Object.prototype.hasOwnProperty.call(cleaned, "progress_percent")) cleaned.progress_percent = Number(cleaned.progress_percent);
  return { ...cleaned, reviewer_org_code: "POCKET" };
}

export function taskUpdateInitialFields(task = {}) {
  return {
    title: task.title || "",
    status_code: task.statusCode === "COMPLETED" ? "DONE" : task.statusCode || "NOT_STARTED",
    description: task.description || "",
    planned_start_date: task.plannedStartDate || "",
    due_date: task.dueDate || "",
    progress_percent: task.progressPercent ?? 0,
    completion_url: task.completionUrl || "",
    remarks: task.remarks || "",
    priority_code: task.priorityCode || "NORMAL",
    responsible_org_code: task.responsibleOrgCode || "POCKET",
  };
}

export function taskUpdateSubmissionFields(fields = {}) {
  const plannedStartDate = fields.planned_start_date || "";
  const dueDate = fields.due_date || "";
  return {
    title: String(fields.title || "").trim(),
    status_code: String(fields.status_code || "NOT_STARTED").toUpperCase(),
    description: fields.description || "",
    planned_start_date: plannedStartDate,
    due_date: dueDate,
    schedule_dates_json: plannedStartDate && dueDate
      ? serializeScheduleDates(scheduleDateRange(plannedStartDate, dueDate))
      : null,
    progress_percent: Number(fields.progress_percent || 0),
    completion_url: fields.completion_url || "",
    remarks: fields.remarks || "",
    priority_code: String(fields.priority_code || "NORMAL").toUpperCase(),
    responsible_org_code: String(fields.responsible_org_code || "POCKET").toUpperCase(),
  };
}
