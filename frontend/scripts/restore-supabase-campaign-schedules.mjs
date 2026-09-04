import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};
const sourcePath = path.resolve(valueAfter("--source") || "");
const apply = args.includes("--apply");
const asOf = valueAfter("--as-of") || new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
if (!sourcePath) throw new Error("--source <campaign schedule html> is required");
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("--as-of must be YYYY-MM-DD");

const html = await readFile(sourcePath, "utf8");
const seedMatch = html.match(/<script\s+id="seed"\s+type="application\/json">([\s\S]*?)<\/script>/i);
if (!seedMatch) throw new Error("Campaign schedule seed JSON was not found");
const seed = JSON.parse(seedMatch[1]);
const campaigns = (seed.campaigns || []).filter((campaign) => ["mugeuk", "und"].includes(String(campaign?.id || "")));
if (campaigns.length !== 2) throw new Error("Both mugeuk and und campaigns are required");

const projectLegacyId = {
  mugeuk: "PRJ-MUGUK-MKT-001",
  und: "PRJ-UND-90D-001",
};
const sourceTaskId = (campaign, row) => `CAMPAIGN_SCHEDULE_V1_${campaign.id.toUpperCase()}_${row.id}`;
const isoDay = (value) => String(value || "").slice(0, 10);
const utcDate = (value) => new Date(`${isoDay(value)}T00:00:00Z`);
const addDays = (value, offset) => {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + Number(offset));
  return date.toISOString().slice(0, 10);
};
const inclusiveDays = (start, end) => Math.floor((utcDate(end) - utcDate(start)) / 86_400_000) + 1;
const progressAt = (row) => {
  if (String(row.status || "") === "완료") return 100;
  if (String(row.status || "") === "보류") return 0;
  const total = Math.max(1, inclusiveDays(row.start, row.end));
  const elapsed = inclusiveDays(row.start, asOf);
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
};
const scheduleDates = (campaign, row) => {
  const dates = Array.isArray(row.days) && row.days.length
    ? row.days.map((offset) => addDays(campaign.start, offset))
    : Array.from({ length: inclusiveDays(row.start, row.end) }, (_, offset) => addDays(row.start, offset));
  return [...new Set(dates.map(isoDay))].sort();
};

const envText = await readFile(new URL("../.env.production.local", import.meta.url), "utf8");
const envValue = (name) => envText.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim() || "";
const url = envValue("VITE_SUPABASE_URL");
const key = envValue("VITE_SUPABASE_PUBLISHABLE_KEY");
if (!url || !key) throw new Error("Supabase public configuration is missing");

const password = process.env.POCKET_HUB_PASSWORD || await new Promise((resolve, reject) => {
  let value = "";
  const raw = Boolean(process.stdin.isTTY && process.stdin.setRawMode);
  if (raw) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write("Pocket account password: ");
  const finish = () => {
    process.stdin.off("data", onData);
    if (raw) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\n");
    resolve(value.trim());
  };
  const onData = (chunk) => {
    const text = String(chunk);
    if (text === "\u0003") {
      if (raw) process.stdin.setRawMode(false);
      reject(new Error("Password input cancelled"));
      return;
    }
    if (text.includes("\r") || text.includes("\n")) {
      value += text.replace(/[\r\n]/g, "");
      finish();
      return;
    }
    if (text === "\u007f" || text === "\b") value = value.slice(0, -1);
    else value += text;
  };
  process.stdin.on("data", onData);
});
if (!password) throw new Error("Pocket account password is required");

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { error: authError } = await client.auth.signInWithPassword({ email: "pocket@hub.local", password });
if (authError) throw new Error(`Supabase login failed: ${authError.message}`);

const legacyIds = Object.values(projectLegacyId);
const { data: projects, error: projectsError } = await client
  .from("projects")
  .select("id,legacy_id,project_name")
  .in("legacy_id", legacyIds)
  .is("archived_at", null);
if (projectsError) throw new Error(`Project lookup failed: ${projectsError.message}`);
const projectsByLegacy = new Map((projects || []).map((project) => [project.legacy_id, project]));
if (legacyIds.some((legacyId) => !projectsByLegacy.has(legacyId))) throw new Error("A target Supabase project is missing");

const expectedByCampaign = new Map(campaigns.map((campaign) => [campaign.id, campaign.rows.map((row) => {
  const dates = scheduleDates(campaign, row);
  if (!dates.length || dates[0] !== isoDay(row.start) || dates.at(-1) !== isoDay(row.end)) {
    throw new Error(`${campaign.id}/${row.id} schedule boundaries do not match the source HTML`);
  }
  return {
    campaign,
    row,
    source_task_id: sourceTaskId(campaign, row),
    fields: {
      planned_start_date: dates[0],
      due_date: dates.at(-1),
      schedule_dates_json: JSON.stringify(dates),
      progress_percent: progressAt(row),
    },
  };
})]));

const plans = [];
for (const campaign of campaigns) {
  const project = projectsByLegacy.get(projectLegacyId[campaign.id]);
  const { data, error } = await client.rpc("read_task_workspace", {
    p_project_id: String(project.id),
    p_include_archived: false,
  });
  if (error) throw new Error(`${campaign.id} task read failed: ${error.message}`);
  const tasks = data?.items || [];
  const bySourceId = new Map(tasks.map((task) => [String(task.source_task_id || ""), task]));
  const expectedRows = expectedByCampaign.get(campaign.id);
  const missing = expectedRows.filter((item) => !bySourceId.has(item.source_task_id));
  if (missing.length) {
    throw new Error(`${campaign.id}: ${missing.length} source tasks are missing (${missing.slice(0, 5).map((item) => item.source_task_id).join(", ")})`);
  }
  const updates = expectedRows.map((item) => ({ ...item, task: bySourceId.get(item.source_task_id) })).filter(({ task, fields }) => {
    const currentDates = Array.isArray(task.schedule_dates_json)
      ? JSON.stringify(task.schedule_dates_json.map(isoDay))
      : String(task.schedule_dates_json || "");
    return isoDay(task.planned_start_date) !== fields.planned_start_date
      || isoDay(task.due_date) !== fields.due_date
      || currentDates !== fields.schedule_dates_json
      || Number(task.progress_percent || 0) !== fields.progress_percent;
  });
  plans.push({ campaign, project, tasks, expectedRows, updates });
}

const summary = plans.map(({ campaign, project, tasks, expectedRows, updates }) => ({
  campaign: campaign.id,
  project: project.project_name,
  sourceRows: expectedRows.length,
  databaseRows: tasks.length,
  rowsToRestore: updates.length,
  scheduledRowsAfterRestore: expectedRows.filter((item) => JSON.parse(item.fields.schedule_dates_json).length > 0).length,
  progress: Object.fromEntries([...new Set(expectedRows.map((item) => item.fields.progress_percent))].sort((a, b) => a - b).map((percent) => [percent, expectedRows.filter((item) => item.fields.progress_percent === percent).length])),
}));

if (!apply) {
  console.log(JSON.stringify({ apply: false, asOf, summary }, null, 2));
  await client.auth.signOut();
  process.exit(0);
}

const backupDir = path.resolve(new URL("../../artifacts/backups", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"));
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-");
const backupPath = path.join(backupDir, `campaign-schedule-before-${stamp}.json`);
await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), asOf, projects: plans.map(({ project, tasks }) => ({ project, tasks })) }, null, 2), "utf8");

for (const plan of plans) {
  for (let index = 0; index < plan.updates.length; index += 40) {
    const chunk = plan.updates.slice(index, index + 40);
    const mutations = chunk.map(({ task, fields }) => ({
      mutation_id: `restore_schedule_${randomUUID()}`,
      operation: "UPDATE",
      project_id: String(plan.project.id),
      task_id: String(task.task_id || task.id),
      expected_row_version: String(task.row_version),
      fields,
    }));
    const { data, error } = await client.rpc("mutate_tasks_batch", {
      p_project_id: String(plan.project.id),
      p_mutations: mutations,
    });
    if (error || !data?.ok) throw new Error(`${plan.campaign.id} restore failed: ${error?.message || data?.error?.message || "unknown error"}`);
  }
}

const verification = [];
for (const plan of plans) {
  const { data, error } = await client.rpc("read_task_workspace", {
    p_project_id: String(plan.project.id),
    p_include_archived: false,
  });
  if (error) throw new Error(`${plan.campaign.id} verification read failed: ${error.message}`);
  const bySourceId = new Map((data?.items || []).map((task) => [String(task.source_task_id || ""), task]));
  const mismatches = [];
  for (const expected of plan.expectedRows) {
    const task = bySourceId.get(expected.source_task_id);
    const dates = Array.isArray(task?.schedule_dates_json) ? task.schedule_dates_json.map(isoDay) : [];
    if (!task
      || isoDay(task.planned_start_date) !== expected.fields.planned_start_date
      || isoDay(task.due_date) !== expected.fields.due_date
      || JSON.stringify(dates) !== expected.fields.schedule_dates_json
      || Number(task.progress_percent || 0) !== expected.fields.progress_percent) {
      mismatches.push(expected.source_task_id);
    }
  }
  verification.push({ campaign: plan.campaign.id, verifiedRows: plan.expectedRows.length - mismatches.length, mismatches });
}
if (verification.some((item) => item.mismatches.length)) throw new Error(`Verification failed: ${JSON.stringify(verification)}`);

console.log(JSON.stringify({ apply: true, asOf, backupPath, summary, verification }, null, 2));
await client.auth.signOut();
