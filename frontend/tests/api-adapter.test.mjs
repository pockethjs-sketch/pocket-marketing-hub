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

    assert.equal(calls.length, 3);
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
    assert.equal(JSON.stringify([...storageMap.values()]).includes("long-access-code"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

  const taskPage = tasksViewModel({ data: { totalMatching: 1, items: [{ task_id: "T-1", title: "촬영", phase_code: "M1", workstream_code: "VID", status_code: "IN_PROGRESS", priority_code: "HIGH" }] } });
  assert.equal(taskPage.items[0].status, "진행");
  assert.equal(taskPage.items[0].stream, "영상");
});
