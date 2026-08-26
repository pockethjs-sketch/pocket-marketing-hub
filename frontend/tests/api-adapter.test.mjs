import assert from "node:assert/strict";
import test from "node:test";

import { readApiConfig } from "../src/api/config.js";
import { createHubDataSource } from "../src/api/dataSource.js";
import { OfflineMutationError } from "../src/api/errors.js";
import { HubApiError } from "../src/api/errors.js";
import { createHubApi } from "../src/api/hubApi.js";
import { createSessionStore } from "../src/api/session.js";
import { bootstrapViewModel, overviewViewModel, tasksViewModel } from "../src/api/viewModel.js";

test("API URL이 없으면 설정 오류를 명확히 반환한다", async () => {
  const config = readApiConfig({ VITE_POCKET_API_MODE: "auto" });
  const source = createHubDataSource({ config });

  await assert.rejects(
    source.bootstrap({ role: "pocket" }),
    (error) => error instanceof HubApiError && error.code === "missing_api_url",
  );
});

test("로그인 비활성화 설정을 명시적으로 읽는다", () => {
  const config = readApiConfig({
    VITE_POCKET_API_MODE: "auto",
    VITE_POCKET_LOGIN_ENABLED: "false",
  });
  assert.equal(config.loginEnabled, false);
});

test("API가 없을 때 쓰기는 저장 성공처럼 처리하지 않는다", async () => {
  const config = readApiConfig({ VITE_POCKET_API_MODE: "auto" });
  const source = createHubDataSource({ config });

  await assert.rejects(
    source.mutate({ mutation: { entity: "task", operation: "create" } }),
    OfflineMutationError,
  );
  assert.equal(source.getState().phase, "error");
});

test("live 읽기 성공 시 마지막 동기화 시각을 상태에 기록한다", async () => {
  const generatedAt = "2026-08-25T14:00:00+09:00";
  const live = {
    bootstrap: async () => ({ ok: true, generatedAt, data: { clients: [] } }),
  };
  const config = {
    endpoint: "https://example.invalid/api",
    mode: "live",
    timeoutMs: 60000,
    credentials: "omit",
    hasEndpoint: true,
    useDemoOnly: false,
  };
  const source = createHubDataSource({ config, live });

  await source.bootstrap();
  assert.equal(source.getState().mode, "live");
  assert.equal(source.getState().phase, "ready");
  assert.equal(source.getState().lastSuccessfulAt, generatedAt);
});

test("모든 live 요청은 text/plain POST이며 세션 토큰을 body로 전달한다", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const storageMap = new Map();
  const storage = {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, value) => storageMap.set(key, value),
    removeItem: (key) => storageMap.delete(key),
  };
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ options, body });
    const data = body.action === "login"
      ? { token: "session-token", expiresIn: 3600, user: { userId: "U-1", displayName: "포켓", role: "POCKET_MANAGER" } }
      : { currentUser: {}, clients: [], projects: [], channels: [] };
    return new Response(JSON.stringify({ ok: true, generatedAt: "2026-08-25T10:00:00+09:00", data }), { status: 200 });
  };

  try {
    const sessionStore = createSessionStore(storage);
    const api = createHubApi({ endpoint: "https://example.invalid/api", timeoutMs: 3000, credentials: "omit" }, { sessionStore });
    await api.login({ account: "pocket@hub.local", accessCode: "long-access-code" });
    await api.bootstrap();
    await api.mutate({
      projectId: "P-1",
      mutation: {
        entityType: "task",
        operation: "CREATE",
        fields: { title: "신규 업무", status_code: "NOT_STARTED" },
      },
    });
    await api.mutate({
      projectId: "P-1",
      mutation: {
        entityType: "project",
        operation: "UPDATE",
        id: "P-1",
        expectedRowVersion: 7,
        fields: { start_date: "2026-09-07" },
      },
    });

    assert.equal(calls.length, 4);
    calls.forEach((call) => {
      assert.equal(call.options.method, "POST");
      assert.equal(call.options.headers["Content-Type"], "text/plain;charset=UTF-8");
    });
    assert.equal(calls[0].body.email, "pocket@hub.local");
    assert.equal(calls[1].body.auth.sessionToken, "session-token");
    assert.equal(calls[2].body.action, "mutate");
    assert.equal(calls[2].body.auth.sessionToken, "session-token");
    assert.equal(calls[2].body.mutation.entityType, "task");
    assert.equal(calls[2].body.mutation.operation, "CREATE");
    assert.match(calls[2].body.mutation.mutationId, /^mut_/);
    assert.equal(calls[3].body.mutation.entityType, "project");
    assert.equal(calls[3].body.mutation.operation, "UPDATE");
    assert.equal(calls[3].body.mutation.expectedRowVersion, 7);
    assert.deepEqual(calls[3].body.mutation.fields, { start_date: "2026-09-07" });
    assert.equal(JSON.stringify([...storageMap.values()]).includes("long-access-code"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("공개 조회 세션도 서버 발급 토큰만 sessionStorage에 저장한다", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const storageMap = new Map();
  const storage = {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, value) => storageMap.set(key, value),
    removeItem: (key) => storageMap.delete(key),
  };
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return new Response(JSON.stringify({
      ok: true,
      generatedAt: "2026-08-25T10:00:00+09:00",
      data: { token: "preview-session-token", expiresIn: 3600, user: { role: "CLIENT_VIEWER" } },
    }), { status: 200 });
  };

  try {
    const api = createHubApi(
      { endpoint: "https://example.invalid/api", timeoutMs: 3000, credentials: "omit" },
      { sessionStore: createSessionStore(storage) },
    );
    await api.previewSession();
    assert.equal(calls[0].action, "preview_session");
    assert.equal(api.getSession().token, "preview-session-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("공개 첫 진입은 세션과 최소 bootstrap을 한 요청으로 받는다", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const storageMap = new Map();
  const storage = {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, value) => storageMap.set(key, value),
    removeItem: (key) => storageMap.delete(key),
  };
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return new Response(JSON.stringify({
      ok: true,
      generatedAt: "2026-08-26T09:00:00+09:00",
      data: {
        session: { token: "preview-bootstrap-token", expiresIn: 3600, user: { role: "CLIENT_VIEWER" } },
        bootstrap: {
          currentUser: { userId: "PREVIEW", displayName: "고객사", role: "CLIENT_VIEWER" },
          clients: [{ client_id: "C-1", display_name: "UND", status_code: "ACTIVE" }],
          projects: [{ project_id: "P-1", client_id: "C-1", project_name: "통합 마케팅", status_code: "ACTIVE" }],
          channels: [],
        },
      },
    }), { status: 200 });
  };

  try {
    const api = createHubApi(
      { endpoint: "https://example.invalid/api", timeoutMs: 3000, credentials: "omit" },
      { sessionStore: createSessionStore(storage) },
    );
    const envelope = await api.previewBootstrap();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, "preview_bootstrap");
    assert.equal(api.getSession().token, "preview-bootstrap-token");
    assert.equal(envelope.data.clients[0].display_name, "UND");
    assert.equal(envelope.data.token, undefined);
    assert.equal(envelope.data.session, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("공개 첫 총괄은 세션 없이 병렬 조회할 수 있다", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      ok: true,
      generatedAt: "2026-08-26T09:00:00+09:00",
      scope: { projectId: "P-1" },
      data: { project: { project_id: "P-1" }, summary: {} },
    }), { status: 200 });
  };

  try {
    const api = createHubApi(
      { endpoint: "https://example.invalid/api", timeoutMs: 3000, credentials: "omit" },
      { sessionStore: createSessionStore(null) },
    );
    const envelope = await api.previewOverview();
    assert.equal(requestBody.action, "preview_overview");
    assert.equal(requestBody.auth, undefined);
    assert.equal(envelope.scope.projectId, "P-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("data source previewBootstrap은 준비 상태와 사용자 정보를 함께 갱신한다", async () => {
  const generatedAt = "2026-08-26T09:00:00+09:00";
  const live = {
    getSession: () => ({ token: "preview-token", user: { role: "CLIENT_VIEWER" } }),
    previewBootstrap: async () => ({ ok: true, generatedAt, data: { clients: [], projects: [] } }),
  };
  const config = { endpoint: "https://example.invalid/api", mode: "live", timeoutMs: 3000, credentials: "omit", hasEndpoint: true, loginEnabled: false };
  const source = createHubDataSource({ config, live });

  await source.previewBootstrap();
  assert.equal(source.getState().phase, "ready");
  assert.equal(source.getState().user.role, "CLIENT_VIEWER");
  assert.equal(source.getState().lastSuccessfulAt, generatedAt);
});

test("live 조회 실패는 데모 데이터로 대체하지 않는다", async () => {
  const failure = new HubApiError("연결 실패", { code: "network_error", retriable: true });
  const live = { getSession: () => ({ token: "x", user: {} }), bootstrap: async () => { throw failure; } };
  const config = { endpoint: "https://example.invalid/api", mode: "auto", timeoutMs: 3000, credentials: "omit", hasEndpoint: true, useDemoOnly: false };
  const source = createHubDataSource({ config, live });

  await assert.rejects(source.bootstrap(), failure);
  assert.equal(source.getState().mode, "live");
  assert.equal(source.getState().phase, "error");
});

test("Sheets 응답을 Pocket 화면 뷰모델로 변환한다", () => {
  const bootstrap = bootstrapViewModel({
    generatedAt: "2026-08-25T10:00:00+09:00",
    data: {
      currentUser: { userId: "U-1", displayName: "포켓", role: "POCKET_MANAGER", organization: "POCKET" },
      clients: [{ client_id: "C-1", display_name: "UND", status_code: "ACTIVE", is_demo: false }],
      projects: [{ project_id: "P-1", client_id: "C-1", project_name: "운영", phase_code: "M1", status_code: "ACTIVE" }],
    },
  });
  assert.equal(bootstrap.clients[0].name, "UND");
  assert.equal(bootstrap.actor.role, "pocket");

  const overview = overviewViewModel({
    generatedAt: "2026-08-25T10:00:00+09:00",
    data: {
      project: { project_id: "P-1", client_id: "C-1", project_name: "운영", phase_code: "M1", status_code: "ACTIVE" },
      summary: { tasks: { total: 4, done: 2, inProgress: 1 }, contents: { total: 2, published: 1 }, approvals: { pending: 1 } },
      phases: [{ code: "M1", count: 4 }],
      workstreams: [{ code: "MKT", count: 4 }],
      recentActivity: [],
    },
  }, bootstrap.projects["P-1"]);
  assert.equal(overview.project.metrics[0].value, "4건");

  const taskPage = tasksViewModel({
    generatedAt: "2026-08-25T10:00:00+09:00",
    data: {
      totalMatching: 2,
      project: { project_id: "P-1", phase_code: "M1", start_date: "2026-09-01", end_date: "2026-11-30", row_version: 7 },
      publishing: {
        phases: [{
          phase_code: "M1",
          targets: { long_form: 2, short_form: 10, instagram: 10, blog: 4 },
          actuals: { long_form: 1, short_form: 3, instagram: 2, blog: 1 },
        }],
      },
      members: [{
        user_id: "USR-POCKET-1",
        display_name: "포켓 담당자",
        organization_code: "POCKET",
        role_code: "POCKET_EDITOR",
        permission_code: "EDIT",
      }],
      items: [{
        task_id: "T-1",
        source_task_id: "M1-VID-01",
        title: "촬영",
        phase_code: "M1",
        workstream_code: "VID",
        category_code: "YOUTUBE",
        status_code: "IN_PROGRESS",
        priority_code: "HIGH",
        plan_week: 2,
        contract_linked: true,
        customer_status_text: "촬영 일정 확인 중",
        assignee_user_id: "USR-POCKET-1",
        sort_order: 20,
        row_version: 4,
      }, {
        task_id: "T-2",
        title: "자료 취합",
        phase_code: "P0",
        workstream_code: "MKT",
        status_code: "TODO",
        sort_order: 10,
        row_version: 1,
      }],
    },
  });
  assert.deepEqual(taskPage.items.map((item) => item.id), ["T-2", "T-1"]);
  const trackedTask = taskPage.items.find((item) => item.id === "T-1");
  assert.equal(trackedTask.status, "진행");
  assert.equal(trackedTask.stream, "영상");
  assert.equal(trackedTask.sourceTaskId, "M1-VID-01");
  assert.equal(trackedTask.planWeek, 2);
  assert.equal(trackedTask.contractLinked, true);
  assert.equal(trackedTask.customerStatus, "촬영 일정 확인 중");
  assert.equal(taskPage.members[0].userId, "USR-POCKET-1");
  assert.equal(taskPage.members[0].displayName, "포켓 담당자");
  assert.equal(taskPage.members[0].organization, "포켓컴퍼니");
  assert.equal(taskPage.items[0].status, "미착수");
  assert.equal(taskPage.project.startDate, "2026-09-01");
  assert.equal(taskPage.project.rowVersion, 7);
  assert.equal(taskPage.publishing.phases[0].target.total, 26);
  assert.equal(taskPage.publishing.phases[0].actual.total, 7);
});
