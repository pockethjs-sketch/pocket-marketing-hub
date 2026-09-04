const DONE_CODES = new Set(["DONE", "COMPLETED"]);
const DAY_MS = 86_400_000;

function inclusiveDayCount(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(1, Math.floor((end - start) / DAY_MS) + 1);
}

export function koreaDateValue(value = new Date()) {
  if (typeof value === "string") return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function effectiveTaskScheduleState(task = {}, todayValue = new Date()) {
  const today = koreaDateValue(todayValue);
  const startDate = String(task.plannedStartDate || task.planned_start_date || "").slice(0, 10);
  const dueDate = String(task.dueDate || task.due_date || "").slice(0, 10);
  // Older production rows do not expose status_mode until the migration lands.
  // Treat those rows as manual so a frontend deployment cannot overwrite a
  // user's chosen state while the database rollout is pending.
  const statusMode = String(task.statusMode || task.status_mode || "MANUAL").toUpperCase();
  const storedStatus = String(task.statusCode || task.status_code || "NOT_STARTED").toUpperCase();
  let statusCode = storedStatus === "COMPLETED" ? "DONE" : storedStatus;

  if (dueDate && today > dueDate) statusCode = "DONE";
  else if (statusMode !== "MANUAL" && startDate && today < startDate) statusCode = "NOT_STARTED";
  else if (statusMode !== "MANUAL" && startDate && today >= startDate && (!dueDate || today <= dueDate)) statusCode = "IN_PROGRESS";

  const rawProgress = Number(task.progressPercent ?? task.progress_percent ?? 0);
  let progressPercent = Math.max(0, Math.min(100, Number.isFinite(rawProgress) ? rawProgress : 0));
  if (DONE_CODES.has(statusCode)) {
    progressPercent = 100;
  } else if (statusMode !== "MANUAL" && startDate && dueDate) {
    const totalDays = inclusiveDayCount(startDate, dueDate);
    const elapsedDays = inclusiveDayCount(startDate, today);
    if (totalDays !== null && elapsedDays !== null) {
      progressPercent = today < startDate ? 0 : Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));
    }
  } else if (statusCode === "NOT_STARTED" && statusMode !== "MANUAL") {
    progressPercent = 0;
  }
  return {
    statusMode,
    statusCode,
    progressPercent,
    automatic: statusMode !== "MANUAL" || Boolean(dueDate && today > dueDate),
  };
}
