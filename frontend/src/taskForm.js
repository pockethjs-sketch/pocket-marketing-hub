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
    progress_percent: mode === "completed" ? 100 : 0,
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
