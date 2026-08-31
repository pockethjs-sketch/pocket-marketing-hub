import { readApiConfig } from "./config.js";
import { HubApiError, OfflineMutationError, publicApiError } from "./errors.js";
import { createHubApi, READ_ACTIONS } from "./hubApi.js";

const INITIAL_STATE = Object.freeze({
  mode: "initializing",
  phase: "idle",
  action: null,
  error: null,
  fallbackReason: null,
  lastSuccessfulAt: null,
});

export function createHubDataSource(options = {}) {
  const config = options.config || readApiConfig();
  const live = config.hasEndpoint ? (options.live || createHubApi(config, options)) : null;
  const listeners = new Set();
  let state = {
    ...INITIAL_STATE,
    mode: "live",
    user: live?.getSession?.()?.user || null,
  };

  function emit(next) {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener(state));
  }

  function getState() {
    return { ...state };
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  async function load(resource, params = {}) {
    if (!Object.prototype.hasOwnProperty.call(READ_ACTIONS, resource)) {
      throw new HubApiError("지원하지 않는 데이터 화면입니다.", {
        code: "unsupported_action",
        action: resource,
        retriable: false,
      });
    }

    emit({ phase: "loading", action: resource, error: null });

    if (!live) throw new HubApiError("API 주소가 설정되지 않았습니다.", { code: "missing_api_url", action: resource, retriable: false });

    try {
      const result = await live[resource](params);
      emit({
        mode: "live",
        phase: "ready",
        action: null,
        error: null,
        fallbackReason: null,
        lastSuccessfulAt: result.generatedAt || new Date().toISOString(),
      });
      return result;
    } catch (error) {
      const safeError = publicApiError(error);
      if (safeError.code === "unauthorized") live?.logout?.();
      emit({
        mode: "live",
        phase: "error",
        action: null,
        error: safeError,
        user: live?.getSession?.()?.user || null,
      });
      throw error;
    }
  }

  async function mutate(input) {
    if (!live) {
      const error = new OfflineMutationError();
      emit({ phase: "error", action: null, error: publicApiError(error) });
      throw error;
    }

    emit({ phase: "saving", action: "mutate", error: null });
    try {
      const result = await live.mutate(input);
      emit({
        mode: "live",
        phase: "ready",
        action: null,
        lastSuccessfulAt: result.generatedAt || new Date().toISOString(),
      });
      return result;
    } catch (error) {
      emit({ phase: "error", action: null, error: publicApiError(error) });
      throw error;
    }
  }

  async function accessAdminMutate(input) {
    if (!live) throw new OfflineMutationError();
    emit({ phase: "saving", action: "access_admin_mutate", error: null });
    try {
      const result = await live.accessAdminMutate(input);
      emit({ mode: "live", phase: "ready", action: null, error: null, lastSuccessfulAt: result.generatedAt || new Date().toISOString() });
      return result;
    } catch (error) {
      emit({ phase: "error", action: null, error: publicApiError(error) });
      throw error;
    }
  }

  async function login(credentials) {
    if (!live) {
      throw new HubApiError("API 주소가 설정되지 않았습니다.", {
        code: "missing_api_url",
        action: "login",
        retriable: false,
      });
    }
    emit({ phase: "loading", action: "login", error: null });
    try {
      const result = await live.login(credentials);
      emit({
        mode: "live",
        phase: "ready",
        action: null,
        error: null,
        user: result.data.user,
        lastSuccessfulAt: result.generatedAt || new Date().toISOString(),
      });
      return result;
    } catch (error) {
      emit({ phase: "error", action: null, error: publicApiError(error), user: null });
      throw error;
    }
  }

  async function previewSession(options = {}) {
    if (!live) {
      throw new HubApiError("API 주소가 설정되지 않았습니다.", {
        code: "missing_api_url",
        action: "preview_session",
        retriable: false,
      });
    }
    emit({ phase: "loading", action: "preview_session", error: null });
    try {
      const result = await live.previewSession(options);
      emit({
        mode: "live",
        phase: "ready",
        action: null,
        error: null,
        user: result.data.user,
        lastSuccessfulAt: result.generatedAt || new Date().toISOString(),
      });
      return result;
    } catch (error) {
      emit({ phase: "error", action: null, error: publicApiError(error), user: null });
      throw error;
    }
  }

  async function previewBootstrap(options = {}) {
    if (!live) {
      throw new HubApiError("API 주소가 설정되지 않았습니다.", {
        code: "missing_api_url",
        action: "preview_bootstrap",
        retriable: false,
      });
    }
    emit({ phase: "loading", action: "preview_bootstrap", error: null });
    try {
      const result = await live.previewBootstrap(options);
      emit({
        mode: "live",
        phase: "ready",
        action: null,
        error: null,
        user: live.getSession()?.user || null,
        lastSuccessfulAt: result.generatedAt || new Date().toISOString(),
      });
      return result;
    } catch (error) {
      emit({ phase: "error", action: null, error: publicApiError(error), user: null });
      throw error;
    }
  }

  async function previewOverview(options = {}) {
    if (!live) {
      throw new HubApiError("API 주소가 설정되지 않았습니다.", {
        code: "missing_api_url",
        action: "preview_overview",
        retriable: false,
      });
    }
    emit({ phase: "loading", action: "preview_overview", error: null });
    try {
      const result = await live.previewOverview(options);
      emit({
        mode: "live",
        phase: "ready",
        action: null,
        error: null,
        lastSuccessfulAt: result.generatedAt || new Date().toISOString(),
      });
      return result;
    } catch (error) {
      emit({ phase: "error", action: null, error: publicApiError(error) });
      throw error;
    }
  }

  function logout() {
    live?.logout?.();
    emit({ phase: "idle", action: null, error: null, user: null, lastSuccessfulAt: null });
  }

  return Object.freeze({
    config,
    getState,
    subscribe,
    login,
    previewSession,
    previewBootstrap,
    previewOverview,
    logout,
    getSession: () => live?.getSession?.() || null,
    load,
    bootstrap: (params) => load("bootstrap", params),
    workspace: (params) => load("workspace", params),
    overview: (params) => load("overview", params),
    plan: (params) => load("plan", params),
    tasks: (params) => load("tasks", params),
    dailyMeetings: (params) => load("dailyMeetings", params),
    contents: (params) => load("contents", params),
    tracking: (params) => load("tracking", params),
    performance: (params) => load("performance", params),
    files: (params) => load("files", params),
    activity: (params) => load("activity", params),
    permissions: (params) => load("permissions", params),
    accessAdminMutate,
    mutate,
  });
}
