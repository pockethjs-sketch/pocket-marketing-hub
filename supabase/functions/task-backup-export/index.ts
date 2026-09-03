import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const EXPECTED_TOKEN_HASH = "f11b05cad81010a28e03ec835350099f4f768834e23e6dce3a763f9dd7cc0838";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { ok: false, error: { code: "method_not_allowed" } });
  const supplied = req.headers.get("x-backup-token") || "";
  const suppliedHash = await sha256(supplied);
  if (!supplied || !constantTimeEquals(suppliedHash, EXPECTED_TOKEN_HASH)) {
    return json(401, { ok: false, error: { code: "unauthorized" } });
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: { code: "server_not_configured" } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin
    .from("tasks")
    .select("id,legacy_id,project_id,title,description,phase_code,workstream_code,category_code,responsible_org_code,status_code,priority_code,planned_start_date,due_date,schedule_dates,progress_percent,completion_url,remarks,visibility_code,row_version,created_at,updated_at,archived_at,projects!inner(project_name,clients!inner(display_name))")
    .order("project_id")
    .order("sort_order")
    .order("id")
    .limit(5000);
  if (error) {
    console.error("[task-backup-export]", error);
    return json(500, { ok: false, error: { code: "export_failed" } });
  }
  const tasks = (data || []).map((row: Record<string, unknown>) => {
    const project = row.projects as Record<string, unknown> | null;
    const client = project?.clients as Record<string, unknown> | null;
    return {
      ...row,
      projects: undefined,
      project_name: project?.project_name || "",
      client_name: client?.display_name || "",
    };
  });
  const exportedAt = new Date().toISOString();
  const snapshotId = await sha256(JSON.stringify(tasks));
  return json(200, {
    ok: true,
    data: {
      source: "SUPABASE",
      snapshotId,
      exportedAt,
      taskCount: tasks.length,
      tasks,
    },
  });
});
