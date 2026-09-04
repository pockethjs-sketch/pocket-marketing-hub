import { createClient } from "npm:@supabase/supabase-js@2.114.0";

const LEGACY_API_URL = Deno.env.get("LEGACY_API_URL") || "";

const ALLOWED_PAGES = new Set(["overview", "plan", "tasks", "progress", "daily", "performance", "files"]);
const INTERNAL_ORIGINS = new Set([
  "https://pockethjs-sketch.github.io",
]);

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (INTERNAL_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:"
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : INTERNAL_ORIGINS.values().next().value,
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function respond(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

function envJson(name: string) {
  const raw = Deno.env.get(name);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function roleForLegacy(role: string) {
  const value = String(role || "").toUpperCase();
  if (["POCKET_MANAGER", "POCKET_EDITOR", "EXECUTOR_EDITOR", "CLIENT_VIEWER"].includes(value)) return value;
  throw new Error("unsupported_legacy_role");
}

function organizationForLegacy(organization: string) {
  const value = String(organization || "").toUpperCase();
  if (["POCKET", "NS", "CLIENT"].includes(value)) return value;
  throw new Error("unsupported_legacy_organization");
}

function permissionForLegacy(permission: string) {
  const value = String(permission || "").toUpperCase();
  if (value === "ADMIN") return "ADMIN";
  if (value === "EDIT") return "EDIT";
  return "READ_ONLY";
}

function normalizedPages(value: unknown) {
  if (!Array.isArray(value)) return [...ALLOWED_PAGES];
  const pages = [...new Set(value.map((page) => String(page || "").trim().toLowerCase()))]
    .filter((page) => ALLOWED_PAGES.has(page));
  return pages.length ? pages : [...ALLOWED_PAGES];
}

async function legacyLogin(account: string, accessCode: string) {
  if (!LEGACY_API_URL) throw new Error("legacy_api_url_missing");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("legacy_timeout"), 40_000);
  try {
    const url = new URL(LEGACY_API_URL);
    url.searchParams.set("_mh", `${Date.now()}-${crypto.randomUUID()}`);
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        action: "login",
        account,
        accessCode,
        // Identity synchronization only needs projects and memberships.
        // Asking for an initial tasks payload adds every task to the login
        // response and was the dominant source of the previous timeout.
        includeBootstrap: true,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("legacy_invalid_json");
    }
    if (!response.ok || payload?.ok !== true || !payload?.data?.session || !payload?.data?.bootstrap) {
      const error = new Error(payload?.error?.code || "invalid_credentials");
      (error as any).status = Number(payload?.error?.status || response.status || 401);
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncIdentity(
  admin: ReturnType<typeof createClient>,
  emailClient: ReturnType<typeof createClient>,
  email: string,
  password: string,
  legacyPayload: any,
) {
  const legacySession = legacyPayload.data.session;
  const bootstrap = legacyPayload.data.bootstrap;
  const legacyUser = legacySession.user || bootstrap.currentUser || {};
  const legacyUserId = String(legacyUser.userId || "").trim();
  if (!legacyUserId) throw new Error("legacy_user_id_missing");

  const { data: existingProfile, error: profileReadError } = await admin
    .from("profiles")
    .select("id")
    .eq("legacy_id", legacyUserId)
    .maybeSingle();
  if (profileReadError) throw profileReadError;

  let authUserId = existingProfile?.id || null;
  if (authUserId) {
    // A migrated account is owned by Supabase Auth. A stale Sheets password
    // must never reset its password, reactivate it, or overwrite memberships.
    const { data, error } = await emailClient.auth.signInWithPassword({ email, password });
    if (error || !data?.session || data.user?.id !== authUserId) {
      const rejected = new Error("invalid_credentials");
      (rejected as any).status = 401;
      throw rejected;
    }
    return data.session;
  } else {
    // A previous bridge attempt may have created Auth before the profile write
    // completed. Reuse that identity instead of failing on duplicate email.
    const { data: userList, error: userListError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (userListError) throw userListError;
    const orphanedUser = userList.users.find((user) => String(user.email || "").toLowerCase() === email);
    if (orphanedUser) {
      authUserId = orphanedUser.id;
      const { error } = await admin.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
        user_metadata: { legacy_user_id: legacyUserId },
      });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { legacy_user_id: legacyUserId },
      });
      if (error || !data.user) throw error || new Error("auth_user_create_failed");
      authUserId = data.user.id;
    }
  }

  const organizationCode = organizationForLegacy(legacyUser.organization);
  const roleCode = roleForLegacy(legacyUser.role);
  const { error: profileWriteError } = await admin.from("profiles").upsert({
    id: authUserId,
    legacy_id: legacyUserId,
    display_name: String(legacyUser.displayName || accountLabel(email)),
    organization_code: organizationCode,
    role_code: roleCode,
    status_code: "ACTIVE",
    archived_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (profileWriteError) throw profileWriteError;

  const legacyProjects = Array.isArray(bootstrap.projects) ? bootstrap.projects : [];
  const projectLegacyIds = legacyProjects
    .map((project: any) => String(project.project_id || "").trim())
    .filter(Boolean);
  const { data: projects, error: projectError } = projectLegacyIds.length
    ? await admin.from("projects").select("id,legacy_id").in("legacy_id", projectLegacyIds)
    : { data: [], error: null };
  if (projectError) throw projectError;
  const projectIdByLegacy = new Map((projects || []).map((project: any) => [project.legacy_id, project.id]));

  const { data: currentMemberships, error: membershipsError } = await admin
    .from("project_memberships")
    .select("id,project_id")
    .eq("user_id", authUserId);
  if (membershipsError) throw membershipsError;
  const membershipByProject = new Map((currentMemberships || []).map((row: any) => [String(row.project_id), row]));
  const activeProjectIds: number[] = [];

  for (const project of legacyProjects) {
    const projectId = projectIdByLegacy.get(String(project.project_id || ""));
    if (!projectId) continue;
    activeProjectIds.push(Number(projectId));
    const fields = {
      legacy_id: `SB-MEM-${legacyUserId}-${project.project_id}`,
      project_id: projectId,
      user_id: authUserId,
      permission_code: permissionForLegacy(project.permission_code),
      allowed_pages: normalizedPages(project.allowed_pages),
      status_code: "ACTIVE",
      archived_at: null,
      updated_at: new Date().toISOString(),
    };
    const existing = membershipByProject.get(String(projectId));
    const result = existing
      ? await admin.from("project_memberships").update(fields).eq("id", existing.id)
      : await admin.from("project_memberships").insert(fields);
    if (result.error) throw result.error;
  }

  let disabled = admin.from("project_memberships").update({
    status_code: "DISABLED",
    archived_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", authUserId);
  if (activeProjectIds.length) disabled = disabled.not("project_id", "in", `(${activeProjectIds.join(",")})`);
  const { error: disableError } = await disabled;
  if (disableError) throw disableError;

  const { data: authData, error: signInError } = await emailClient.auth.signInWithPassword({ email, password });
  if (signInError || !authData.session) throw signInError || new Error("supabase_session_missing");
  return authData.session;
}

function accountLabel(email: string) {
  return email.split("@")[0] || "사용자";
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return respond(origin, 403, { ok: false, error: { code: "origin_not_allowed" } });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return respond(origin, 405, { ok: false, error: { code: "method_not_allowed" } });

  try {
    const body = await request.json();
    const account = String(body?.account || "").trim().toLowerCase();
    const accessCode = String(body?.accessCode || "");
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(account) || !/^\S{8,128}$/.test(accessCode)) {
      return respond(origin, 400, { ok: false, error: { code: "invalid_credentials" } });
    }

    const publishableKeys = envJson("SUPABASE_PUBLISHABLE_KEYS");
    const secretKeys = envJson("SUPABASE_SECRET_KEYS");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !publishableKey || !secretKey) throw new Error("supabase_environment_missing");

    const legacyPayload = await legacyLogin(account, accessCode);
    const email = `${account}@hub.local`;
    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const emailClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const session = await syncIdentity(admin, emailClient, email, accessCode, legacyPayload);

    return respond(origin, 200, {
      ok: true,
      data: {
        session,
        legacy: legacyPayload.data,
      },
    });
  } catch (error) {
    const code = String((error as any)?.message || "bridge_error");
    const status = Number((error as any)?.status || 0);
    if (status === 401 || code === "invalid_credentials" || code === "login_temporarily_blocked") {
      return respond(origin, 401, { ok: false, error: { code: "invalid_credentials" } });
    }
    console.error("hub-auth-bridge", { code, name: (error as any)?.name || "Error" });
    return respond(origin, 502, { ok: false, error: { code: "auth_bridge_unavailable" } });
  }
});
