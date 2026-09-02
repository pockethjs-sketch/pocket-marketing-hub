export const TASK_RESPONSIBLE_ORG_OPTIONS = [
  ["POCKET", "포켓"],
  ["NS", "NS"],
  ["CLIENT", "UND"],
];

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
  return {
    title: String(fields.title || "").trim(),
    status_code: String(fields.status_code || "NOT_STARTED").toUpperCase(),
    description: fields.description || "",
    planned_start_date: fields.planned_start_date || "",
    due_date: fields.due_date || "",
    progress_percent: Number(fields.progress_percent || 0),
    completion_url: fields.completion_url || "",
    remarks: fields.remarks || "",
    priority_code: String(fields.priority_code || "NORMAL").toUpperCase(),
    responsible_org_code: String(fields.responsible_org_code || "POCKET").toUpperCase(),
  };
}
