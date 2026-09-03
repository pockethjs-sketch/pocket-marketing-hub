import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(frontendRoot, "..");

function readEnv(filename) {
  const values = {};
  if (!fs.existsSync(filename)) return values;
  fs.readFileSync(filename, "utf8").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  });
  return values;
}

function readGeneratedPlan(filename, variableName) {
  const source = fs.readFileSync(filename, "utf8");
  const prefix = `var ${variableName} = `;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`${variableName}을 찾지 못했습니다: ${filename}`);
  const json = source.slice(start + prefix.length).trim().replace(/;\s*$/, "");
  return JSON.parse(json);
}

const localEnv = readEnv(path.join(frontendRoot, ".env.production.local"));
const url = process.env.VITE_SUPABASE_URL || localEnv.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || localEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const account = String(process.env.PLAN_MIGRATION_ACCOUNT || "").trim().toLowerCase();
const password = String(process.env.PLAN_MIGRATION_PASSWORD || "");
if (!url || !key || !account || !password) throw new Error("Supabase URL/key와 PLAN_MIGRATION_ACCOUNT/PASSWORD가 필요합니다.");

const plans = [
  readGeneratedPlan(path.join(repositoryRoot, "apps-script", "UndClientPlan.gs"), "MH_UND_CLIENT_PLAN"),
  readGeneratedPlan(path.join(repositoryRoot, "apps-script", "UndInternalPlan.generated.gs"), "MH_UND_INTERNAL_PLAN"),
].map((plan) => ({
  ...plan,
  visibilityCode: plan.visibilityCode || "CLIENT",
  sourceCode: plan.sourceCode || "CLIENT_APPROVED_PLAN",
  sections: plan.sections.map((section) => ({
    ...section,
    visibilityCode: section.visibilityCode || plan.visibilityCode || "CLIENT",
  })),
}));

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const email = account.includes("@") ? account : `${account}@hub.local`;
const { error: signInError } = await client.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;

const results = [];
try {
  for (const plan of plans) {
    const { data: project, error: projectError } = await client
      .from("projects")
      .select("id")
      .eq("legacy_id", plan.projectId)
      .is("archived_at", null)
      .maybeSingle();
    if (projectError || !project?.id) throw projectError || new Error(`프로젝트를 찾지 못했습니다: ${plan.projectId}`);
    const { data, error } = await client.rpc("import_project_plan", { p_project_id: project.id, p_payload: plan });
    if (error) throw error;
    results.push(data);
  }
} finally {
  await client.auth.signOut({ scope: "local" });
}

console.log(JSON.stringify({ ok: true, plans: results.map((result) => ({ planId: result.planId, sections: result.sections })) }, null, 2));

