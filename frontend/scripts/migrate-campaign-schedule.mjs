import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const sourcePath = sourceIndex >= 0 ? args[sourceIndex + 1] : "";
const apply = args.includes("--apply");
if (!sourcePath) throw new Error("--source <campaign schedule html> is required");

const html = await readFile(path.resolve(sourcePath), "utf8");
const match = html.match(/<script\s+id="seed"\s+type="application\/json">([\s\S]*?)<\/script>/i);
if (!match) throw new Error("Campaign schedule seed JSON was not found");
const seed = JSON.parse(match[1]);
const campaigns = (seed.campaigns || []).filter((campaign) => ["mugeuk", "und"].includes(String(campaign?.id || "")));
if (campaigns.length !== 2) throw new Error("Both mugeuk and und campaigns are required");

const projectByCampaign = {
  mugeuk: "PRJ-MUGUK-MKT-001",
  und: "PRJ-UND-90D-001",
};
const statusCode = (value) => value === "완료" ? "DONE" : value === "진행중" || value === "진행" ? "IN_PROGRESS" : value === "보류" ? "ON_HOLD" : "NOT_STARTED";
const mediaCode = (value) => {
  const text = String(value || "").trim().toUpperCase();
  if (text === "YOUTUBE") return "YOUTUBE";
  if (text === "INSTAGRAM") return "INSTAGRAM";
  if (text === "NAVER" || text === "네이버블로그") return "NAVER_BLOG";
  if (text === "TIKTOK") return "TIKTOK";
  if (text === "ADS") return "ADS";
  return text || "OTHER";
};
const phaseCode = (row) => /(세팅|구축|최적화|아트워크\s*제작|디자인\s*제작|썸네일\s*제작)/.test(String(row.task || "")) ? "P0" : "M1";
const workstreamCode = (row) => {
  const text = `${row.task || ""} ${row.detail || ""}`;
  const media = String(row.media || "").trim().toUpperCase();
  if (/(디자인|아트워크|썸네일|카드뉴스|단일이미지)/.test(text)) return "DSN";
  if (["YOUTUBE", "TIKTOK"].includes(media) && /(영상|본편|쇼츠|릴스|콘텐츠\s*(운영|업로드))/.test(text)) return "VID";
  return "MKT";
};
const addDays = (iso, offset) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(offset));
  return date.toISOString().slice(0, 10);
};
const remarks = (campaignId, row) => {
  const values = [];
  if (row.note) values.push(String(row.note).trim());
  if (row.link && !/^https:\/\//i.test(String(row.link))) values.push(`완료링크 원문: ${String(row.link).trim()}`);
  (seed.issues || []).forEach((issue) => {
    if (String(issue.task || "").trim() !== String(row.task || "").trim()) return;
    if (issue.campaignId && String(issue.campaignId) !== campaignId) return;
    const detail = [`추가업무 ${issue.date || ""}`, issue.body || ""];
    if (issue.owner) detail.push(`담당 ${issue.owner}`);
    if (issue.status) detail.push(`상태 ${issue.status}`);
    if (issue.link) detail.push(`참고 ${issue.link}`);
    if (issue.note) detail.push(issue.note);
    values.push(detail.filter(Boolean).join(" · "));
  });
  return values.join("\n");
};

const expected = campaigns.flatMap((campaign) => campaign.rows.map((row, index) => ({
  campaignId: campaign.id,
  projectId: projectByCampaign[campaign.id],
  source_task_id: `CAMPAIGN_SCHEDULE_V1_${campaign.id.toUpperCase()}_${row.id}`,
  title: String(row.task || "").trim(),
  description: String(row.detail || "").trim(),
  phase_code: phaseCode(row),
  workstream_code: workstreamCode(row),
  category_code: mediaCode(row.media),
  responsible_org_code: row.owner === "포켓" ? "POCKET" : "NS",
  status_code: statusCode(row.status),
  planned_start_date: row.start,
  due_date: row.end,
  schedule_dates_json: JSON.stringify((row.days || []).map((offset) => addDays(campaign.start, offset)).sort()),
  progress_percent: 0,
  completion_url: /^https:\/\//i.test(String(row.link || "")) ? String(row.link).trim() : "",
  remarks: remarks(campaign.id, row),
  visibility_code: "CLIENT",
  sort_order: index + 1,
})));

const expectedByProject = Object.fromEntries(Object.values(projectByCampaign).map((projectId) => {
  const rows = expected.filter((row) => row.projectId === projectId);
  return [projectId, {
    rows: rows.length,
    done: rows.filter((row) => row.status_code === "DONE").length,
    inProgress: rows.filter((row) => row.status_code === "IN_PROGRESS").length,
    notStarted: rows.filter((row) => row.status_code === "NOT_STARTED").length,
    pocket: rows.filter((row) => row.responsible_org_code === "POCKET").length,
    ns: rows.filter((row) => row.responsible_org_code === "NS").length,
  }];
}));
const sourceHash = createHash("sha256").update(match[1], "utf8").digest("hex");

if (!apply) {
  console.log(JSON.stringify({ apply: false, sourceHash, sourceUpdatedAt: seed.updatedAt || null, projects: expectedByProject }, null, 2));
  process.exit(0);
}

const envText = await readFile(new URL("../.env.production.local", import.meta.url), "utf8");
const endpoint = process.env.POCKET_API_URL || envText.match(/^VITE_POCKET_API_URL=(.+)$/m)?.[1]?.trim();
const account = process.env.POCKET_ACCOUNT || "";
const accessCode = process.env.POCKET_ACCESS_CODE || "";
if (!endpoint || !account || !accessCode) throw new Error("POCKET_ACCOUNT and POCKET_ACCESS_CODE are required for --apply");

async function request(action, body = {}, timeoutMs = 90_000) {
  const url = new URL(endpoint);
  url.searchParams.set("_mh", `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action, ...body }),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok || !payload?.ok) throw new Error(`${action} failed: ${payload?.error?.code || response.status} ${payload?.error?.message || ""}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

const login = await request("login", { account, accessCode, includeBootstrap: false });
const sessionToken = login.data?.session?.sessionToken || login.data?.session?.token || login.data?.token;
if (!sessionToken) throw new Error("Login response did not contain a session token");
const auth = { sessionToken };

for (const projectId of Object.values(projectByCampaign)) {
  const current = await request("tasks", { auth, projectId });
  const currentRows = current.data?.items || [];
  const expectedRows = expected.filter((row) => row.projectId === projectId);
  const expectedSourceIds = new Set(expectedRows.map((row) => row.source_task_id));
  const exactPriorRun = currentRows.length === expectedRows.length && currentRows.every((row) =>
    expectedSourceIds.has(String(row.source_task_id || "")) && row.source_code === "CAMPAIGN_SCHEDULE_HTML"
  );
  if (currentRows.length && !exactPriorRun) throw new Error(`${projectId} contains non-migration tasks`);
}

const result = await request("ops_maintenance", {
  auth,
  operation: "migrate_campaign_schedule_v1",
  payload: {
    sourceName: path.basename(sourcePath),
    sourceUpdatedAt: seed.updatedAt || null,
    sourceHash,
    campaigns,
    issues: seed.issues || [],
  },
}, 360_000);

const mismatches = [];
const actualByProject = {};
for (const projectId of Object.values(projectByCampaign)) {
  const response = await request("tasks", { auth, projectId });
  const actual = response.data?.items || [];
  const expectedRows = expected.filter((row) => row.projectId === projectId);
  const actualBySource = new Map(actual.map((row) => [String(row.source_task_id || ""), row]));
  if (actual.length !== expectedRows.length || actualBySource.size !== actual.length) {
    mismatches.push(`${projectId}: row count or source ID uniqueness mismatch`);
  }
  for (const source of expectedRows) {
    const row = actualBySource.get(source.source_task_id);
    if (!row) {
      mismatches.push(`${projectId}/${source.source_task_id}: missing`);
      continue;
    }
    for (const field of ["title", "description", "phase_code", "workstream_code", "category_code", "responsible_org_code", "status_code", "planned_start_date", "due_date", "schedule_dates_json", "progress_percent", "completion_url", "remarks", "sort_order"]) {
      const actualValue = field.endsWith("_date") ? String(row[field] || "").slice(0, 10) : field === "progress_percent" || field === "sort_order" ? Number(row[field] || 0) : String(row[field] ?? "");
      const expectedValue = field === "progress_percent" || field === "sort_order" ? Number(source[field]) : String(source[field] ?? "");
      if (actualValue !== expectedValue) mismatches.push(`${projectId}/${source.source_task_id}/${field}`);
    }
  }
  actualByProject[projectId] = { rows: actual.length, uniqueSourceIds: actualBySource.size };
}
if (mismatches.length) throw new Error(`Migration verification failed: ${mismatches.slice(0, 20).join(", ")}`);

console.log(JSON.stringify({
  apply: true,
  sourceHash,
  sourceUpdatedAt: seed.updatedAt || null,
  expected: expectedByProject,
  actual: actualByProject,
  migration: result.data,
  verified: true,
}, null, 2));
