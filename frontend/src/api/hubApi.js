import { HubApiError } from "./errors.js";
import { createHttpClient } from "./httpClient.js";
import { createSessionStore } from "./session.js";

export const READ_ACTIONS = Object.freeze({
  bootstrap: "bootstrap",
  workspace: "project_snapshot",
  overview: "project_overview",
  plan: "project_plan",
  tasks: "tasks",
  contents: "contents",
  performance: "performance",
  files: "files",
  activity: "activity",
});

function scopeQuery(params = {}) {
  return {
    clientId: params.clientId,
    projectId: params.projectId,
    cursor: params.cursor,
    limit: params.limit,
    startDate: params.startDate,
    endDate: params.endDate,
    query: params.query,
    status: params.status,
    channel: params.channel,
    planType: params.planType,
  };
}

export function createMutationId(prefix = "mut") {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function createHubApi(config, options = {}) {
  const http = createHttpClient(config);
  const sessionStore = options.sessionStore || createSessionStore();

  function sessionToken() {
    const session = sessionStore.read();
    if (!session?.token) {
      throw new HubApiError("로그인이 필요합니다.", {
        code: "unauthorized",
        status: 401,
        retriable: false,
      });
    }
    return session.token;
  }

  async function login(credentials = {}) {
    const response = await http.request("login", {
      body: {
        email: String(credentials.account || credentials.email || "").trim(),
        accessCode: String(credentials.accessCode || ""),
      },
      signal: credentials.signal,
    });
    sessionStore.write(response.data);
    return response;
  }

  async function previewSession(options = {}) {
    const response = await http.request("preview_session", { signal: options.signal });
    sessionStore.write(response.data);
    return response;
  }

  async function previewBootstrap(options = {}) {
    const response = await http.request("preview_bootstrap", { signal: options.signal });
    const payload = response.data || {};
    const session = payload.session || payload;
    sessionStore.write(session);

    // The optimized endpoint returns the session and the minimum navigation
    // bootstrap in one round trip. Keep a narrow flat-response compatibility
    // path so a staged Apps Script deployment does not strand the client.
    const bootstrap = payload.bootstrap?.data || payload.bootstrap || payload;
    return {
      ...response,
      generatedAt: payload.bootstrap?.generatedAt || response.generatedAt,
      data: bootstrap,
    };
  }

  async function previewOverview(options = {}) {
    return http.request("preview_overview", {
      body: { projectId: options.projectId },
      signal: options.signal,
    });
  }

  async function read(resource, params = {}) {
    const action = READ_ACTIONS[resource];
    if (!action) {
      throw new HubApiError("지원하지 않는 조회 요청입니다.", {
        code: "unsupported_action",
        action: resource,
        retriable: false,
      });
    }

    return http.request(action, {
      body: {
        auth: { sessionToken: sessionToken() },
        ...scopeQuery(params),
      },
      signal: params.signal,
    });
  }

  async function mutate(input = {}) {
    const mutationId = input.mutationId || createMutationId();
    const mutation = input.mutation;

    if (!mutation || typeof mutation !== "object") {
      throw new HubApiError("저장할 변경 내용이 없습니다.", {
        code: "missing_mutation",
        action: "mutate",
        retriable: false,
      });
    }

    return http.request("mutate", {
      signal: input.signal,
      body: {
        auth: { sessionToken: sessionToken() },
        mutation: {
          mutationId,
          entityType: mutation.entityType || mutation.entity,
          operation: String(mutation.operation || "").toUpperCase(),
          projectId: input.projectId ?? mutation.projectId ?? null,
          id: mutation.id ?? null,
          expectedRowVersion: input.expectedRowVersion ?? mutation.expectedRowVersion ?? null,
          fields: mutation.fields || mutation.values || {},
        },
      },
    });
  }

  return Object.freeze({
    read,
    login,
    previewSession,
    previewBootstrap,
    previewOverview,
    logout: () => sessionStore.clear(),
    getSession: () => sessionStore.read(),
    bootstrap: (params) => read("bootstrap", params),
    workspace: (params) => read("workspace", params),
    overview: (params) => read("overview", params),
    plan: (params) => read("plan", params),
    tasks: (params) => read("tasks", params),
    contents: (params) => read("contents", params),
    performance: (params) => read("performance", params),
    files: (params) => read("files", params),
    activity: (params) => read("activity", params),
    mutate,
  });
}
