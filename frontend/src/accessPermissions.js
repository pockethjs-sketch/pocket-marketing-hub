export const ACCESS_PAGE_OPTIONS = Object.freeze([
  Object.freeze({ id: "overview", label: "총괄 현황" }),
  Object.freeze({ id: "plan", label: "실행계획" }),
  Object.freeze({ id: "tasks", label: "업무" }),
  Object.freeze({ id: "content", label: "콘텐츠" }),
  Object.freeze({ id: "tracking", label: "성과 추적" }),
  Object.freeze({ id: "performance", label: "성과" }),
  Object.freeze({ id: "files", label: "자료·활동" }),
]);

export const ACCESS_PAGE_KEYS = Object.freeze(ACCESS_PAGE_OPTIONS.map((page) => page.id));

export function normalizeAllowedPages(value) {
  const requested = Array.isArray(value) ? value.map((item) => String(item || "").toLowerCase()) : [];
  return ACCESS_PAGE_KEYS.filter((page) => requested.includes(page));
}

export function firstAllowedView(value) {
  return normalizeAllowedPages(value)[0] || "overview";
}

export function isViewAllowed(view, allowedPages) {
  const normalized = String(view || "overview").toLowerCase();
  if (normalized === "permissions") return false;
  if (normalized === "daily" || normalized === "schedule") return normalizeAllowedPages(allowedPages).includes("tasks");
  return normalizeAllowedPages(allowedPages).includes(normalized);
}

export function accountSubmission(fields = {}) {
  const submission = {
    operation: "UPSERT",
    account: String(fields.account || "").trim(),
    displayName: String(fields.displayName || "").trim(),
    accessCode: String(fields.accessCode || ""),
    projectId: String(fields.projectId || "").trim(),
    allowedPages: normalizeAllowedPages(fields.allowedPages),
    enabled: fields.enabled !== false,
  };
  if (fields.membershipId) submission.membershipId = String(fields.membershipId);
  return submission;
}

export function removeAccessSubmission(fields = {}, access = {}) {
  return {
    operation: "REMOVE_ACCESS",
    account: String(fields.account || "").trim(),
    displayName: String(fields.displayName || "").trim(),
    projectId: String(access.projectId || "").trim(),
    membershipId: String(access.id || access.membershipId || "").trim(),
    allowedPages: normalizeAllowedPages(access.allowedPages),
  };
}
