import { readApiConfig } from "./config.js";
import { createDemoAdapter } from "./demoAdapter.js";
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
  const demo = options.demo || createDemoAdapter();
  const live = config.hasEndpoint ? (options.live || createHubApi(config, options)) : null;
  const listeners = new Set();
  let state = {
    ...INITIAL_STATE,
    mode: config.useDemoOnly ? "offline-demo" : "live",
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

    if (config.useDemoOnly) {
      const result = await demo[resource](params);
      emit({
        mode: "offline-demo",
        phase: "ready",
        action: null,
        fallbackReason: config.mode === "demo" ? "forced_demo" : "missing_api_url",
      });
      return result;
    }

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
    if (!live || state.mode === "offline-demo") {
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

  function logout() {
    live?.logout?.();
    emit({ phase: "idle", action: null, error: null, user: null, lastSuccessfulAt: null });
  }

  return Object.freeze({
    config,
    getState,
    subscribe,
    login,
    logout,
    getSession: () => live?.getSession?.() || null,
    load,
    bootstrap: (params) => load("bootstrap", params),
    overview: (params) => load("overview", params),
    tasks: (params) => load("tasks", params),
    contents: (params) => load("contents", params),
    performance: (params) => load("performance", params),
    files: (params) => load("files", params),
    activity: (params) => load("activity", params),
    mutate,
  });
}
