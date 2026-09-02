import { readApiConfig } from "../api/config.js";
import { HubApiError } from "../api/errors.js";
import { createHubApi } from "../api/hubApi.js";
import { createSessionStore } from "../api/session.js";
import { getSupabaseClient } from "./client.js";
import { createSupabaseTaskReader } from "./taskRead.js";
import { createSupabaseTaskActivityReader } from "./taskActivityRead.js";
import { createSupabaseTaskBatchMutator, createSupabaseTaskMutator } from "./taskMutation.js";

function bridgeError(payload, status) {
  const code = String(payload?.error?.code || "auth_bridge_unavailable");
  return new HubApiError(
    code === "invalid_credentials"
      ? "아이디 또는 비밀번호를 확인해 주세요."
      : "로그인 서버에 연결하지 못했습니다.",
    {
      code: code === "invalid_credentials" ? "unauthorized" : code,
      status,
      action: "login",
      retriable: status >= 500 || status === 429,
    },
  );
}

async function fetchBridge(config, credentials = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(credentials.signal?.reason);
  if (credentials.signal) {
    if (credentials.signal.aborted) abort();
    else credentials.signal.addEventListener("abort", abort, { once: true });
  }
  const timer = setTimeout(() => controller.abort("timeout"), 45_000);
  try {
    const response = await fetch(`${config.url}/functions/v1/hub-auth-bridge`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account: String(credentials.account || credentials.email || "").trim(),
        accessCode: String(credentials.accessCode || ""),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true || !payload?.data?.session || !payload?.data?.legacy?.session) {
      throw bridgeError(payload, response.status);
    }
    return payload;
  } catch (error) {
    if (error instanceof HubApiError) throw error;
    throw new HubApiError(
      controller.signal.aborted ? "로그인 서버 응답 시간이 초과되었습니다." : "로그인 서버에 연결하지 못했습니다.",
      { code: controller.signal.aborted ? "timeout" : "network_error", action: "login", retriable: true, cause: error },
    );
  } finally {
    clearTimeout(timer);
    credentials.signal?.removeEventListener?.("abort", abort);
  }
}

function entityType(input = {}) {
  return String(input.mutation?.entityType || input.mutation?.entity || "").trim().toUpperCase();
}

export function summarizeSupabaseTasks(items = []) {
  const active = items.filter((item) => !item?.archived_at);
  const statusCount = (codes) => active.filter((item) => codes.includes(String(item?.status_code || "").toUpperCase())).length;
  const groupCounts = (field) => Object.entries(active.reduce((groups, item) => {
    const code = String(item?.[field] || "").trim().toUpperCase();
    if (code) groups[code] = (groups[code] || 0) + 1;
    return groups;
  }, {})).map(([code, count]) => ({ code, count }));

  return {
    summary: {
      total: active.length,
      done: statusCount(["DONE"]),
      inProgress: statusCount(["IN_PROGRESS", "INTERNAL_REVIEW", "WAITING_CLIENT", "REVISION"]),
      blocked: statusCount(["BLOCKED"]),
    },
    phases: groupCounts("phase_code"),
    workstreams: groupCounts("workstream_code"),
  };
}

export function createSupabaseHybridApi(storageConfig, options = {}) {
  const env = options.env ?? import.meta.env;
  const sessionStore = options.sessionStore || createSessionStore();
  const sheets = createHubApi(options.legacyConfig || readApiConfig(env), { ...options, sessionStore });
  const client = options.supabaseClient || getSupabaseClient(env);
  const readTasks = createSupabaseTaskReader(client, options);
  const readTaskActivity = createSupabaseTaskActivityReader(client, options);
  const mutateTask = createSupabaseTaskMutator(client, options);
  const mutateTasksBatch = createSupabaseTaskBatchMutator(client, options);
  const projectIds = new Map();

  async function requireAuth() {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) {
      sessionStore.clear();
      throw new HubApiError("로그인이 필요합니다.", {
        code: "unauthorized",
        status: 401,
        action: "supabase_session",
        retriable: false,
        cause: error || undefined,
      });
    }
    return data.session;
  }

  async function resolveProjectId(value) {
    const key = String(value ?? "").trim();
    if (/^[1-9]\d*$/.test(key)) return key;
    if (projectIds.has(key)) return projectIds.get(key);
    await requireAuth();
    const { data, error } = await client
      .from("projects")
      .select("id,legacy_id")
      .eq("legacy_id", key)
      .is("archived_at", null)
      .maybeSingle();
    if (error || !data?.id) {
      throw new HubApiError("Supabase 프로젝트 연결 정보를 찾지 못했습니다.", {
        code: error?.code || "project_mapping_missing",
        action: "resolve_project",
        retriable: false,
        cause: error || undefined,
      });
    }
    const id = String(data.id);
    projectIds.set(key, id);
    return id;
  }

  async function login(credentials = {}) {
    const payload = await fetchBridge(storageConfig, credentials);
    const { error } = await client.auth.setSession({
      access_token: payload.data.session.access_token,
      refresh_token: payload.data.session.refresh_token,
    });
    if (error) throw bridgeError({ error }, 401);
    const legacy = payload.data.legacy;
    sessionStore.write(legacy.session);
    projectIds.clear();
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      data: legacy.session,
      bootstrap: legacy.bootstrap
        ? { ok: true, generatedAt: new Date().toISOString(), data: legacy.bootstrap }
        : null,
    };
  }

  async function tasks(params = {}) {
    const projectId = await resolveProjectId(params.projectId);
    return readTasks({ ...params, projectId });
  }

  async function overview(params = {}) {
    const projectId = await resolveProjectId(params.projectId);
    const [legacyOverview, taskEnvelope] = await Promise.all([
      sheets.overview(params),
      readTasks({ ...params, projectId }),
    ]);
    const taskRollup = summarizeSupabaseTasks(taskEnvelope.data.items);
    return {
      ...legacyOverview,
      generatedAt: taskEnvelope.generatedAt || legacyOverview.generatedAt,
      data: {
        ...(legacyOverview.data || {}),
        summary: {
          ...(legacyOverview.data?.summary || {}),
          tasks: taskRollup.summary,
        },
        phases: taskRollup.phases,
        workstreams: taskRollup.workstreams,
      },
    };
  }

  async function mutate(input = {}) {
    if (entityType(input) !== "TASK") return sheets.mutate(input);
    const projectId = await resolveProjectId(input.projectId ?? input.mutation?.projectId);
    return mutateTask({ ...input, projectId, mutation: { ...input.mutation, projectId } });
  }

  async function mutateBatch(input = {}) {
    const mutations = Array.isArray(input.mutations) ? input.mutations : [];
    if (!mutations.length || mutations.some((mutation) => String(mutation?.entityType || mutation?.entity || "").toUpperCase() !== "TASK")) {
      return sheets.mutateBatch(input);
    }
    const projectId = await resolveProjectId(input.projectId);
    return mutateTasksBatch({ ...input, projectId, mutations: mutations.map((mutation) => ({ ...mutation, projectId })) });
  }

  async function activity(params = {}) {
    if (String(params.entityType || "").toUpperCase() !== "TASK") return sheets.activity(params);
    const projectId = await resolveProjectId(params.projectId);
    return readTaskActivity({ ...params, projectId });
  }

  function logout() {
    sessionStore.clear();
    projectIds.clear();
    void client.auth.signOut({ scope: "local" });
  }

  return Object.freeze({
    login,
    logout,
    getSession: () => sessionStore.read(),
    previewSession: sheets.previewSession,
    previewBootstrap: sheets.previewBootstrap,
    previewOverview: sheets.previewOverview,
    bootstrap: sheets.bootstrap,
    workspace: sheets.workspace,
    overview,
    plan: sheets.plan,
    tasks,
    dailyMeetings: sheets.dailyMeetings,
    contents: sheets.contents,
    tracking: sheets.tracking,
    performance: sheets.performance,
    files: sheets.files,
    activity,
    permissions: sheets.permissions,
    accessAdminMutate: sheets.accessAdminMutate,
    mutate,
    mutateBatch,
  });
}
