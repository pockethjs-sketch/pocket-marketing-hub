import { HubApiError } from "./errors.js";

function attachAbort(parentSignal, controller) {
  if (!parentSignal) return () => {};
  if (parentSignal.aborted) {
    controller.abort(parentSignal.reason);
    return () => {};
  }

  const abort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", abort, { once: true });
  return () => parentSignal.removeEventListener("abort", abort);
}

async function parseJsonResponse(response, action) {
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new HubApiError("서버 응답을 읽을 수 없습니다.", {
      code: "invalid_json",
      status: response.status,
      action,
      retriable: response.status >= 500,
    });
  }

  if (!response.ok) {
    throw new HubApiError(payload?.error?.message || payload?.message || "서버 요청에 실패했습니다.", {
      code: payload?.error?.code || payload?.code || "http_error",
      status: payload?.error?.status || response.status,
      action,
      retriable: response.status >= 500 || response.status === 429,
    });
  }

  if (!payload || payload.ok !== true || !("data" in payload)) {
    throw new HubApiError(payload?.error?.message || payload?.message || "API 응답 계약이 올바르지 않습니다.", {
      code: payload?.error?.code || payload?.code || "invalid_contract",
      status: payload?.error?.status || response.status,
      action,
      retriable: false,
    });
  }

  return payload;
}

export function createHttpClient(config) {
  if (!config?.endpoint) {
    throw new HubApiError("API 주소가 설정되지 않았습니다.", {
      code: "missing_api_url",
      retriable: false,
    });
  }

  async function request(action, options = {}) {
    const method = "POST";
    const url = new URL(config.endpoint);
    // Apps Script responds through a short-lived googleusercontent redirect.
    // A unique query value prevents browsers/proxies from reusing an expired
    // 302 target, which otherwise appears as an intermittent 404/timeout.
    url.searchParams.set("_mh", `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

    const controller = new AbortController();
    const detachAbort = attachAbort(options.signal, controller);
    const actionTimeouts = {
      login: 30000,
      mutate: 30000,
      access_admin_mutate: 30000,
      project_plan: 25000,
      daily_meetings: 25000,
    };
    // Apps Script cold starts occasionally exceed 10 seconds. Aborting that
    // early turns a slow-but-valid response into a visible false failure.
    const timeoutMs = Math.min(config.timeoutMs, actionTimeouts[action] || 20000);
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

    const fetchOptions = {
      method,
      cache: "no-store",
      credentials: config.credentials,
      redirect: "follow",
      signal: controller.signal,
    };

    // Every request is a simple text/plain POST. This avoids Apps Script CORS
    // preflights and keeps session tokens out of URLs and browser history.
    fetchOptions.headers = { "Content-Type": "text/plain;charset=UTF-8" };
    fetchOptions.body = JSON.stringify({ action, ...(options.body || {}), ...(options.query || {}) });

    try {
      const response = await fetch(url, fetchOptions);
      return await parseJsonResponse(response, action);
    } catch (error) {
      if (error instanceof HubApiError) throw error;

      const timedOut = controller.signal.aborted && !options.signal?.aborted;
      throw new HubApiError(
        timedOut ? "서버 응답 시간이 초과되었습니다." : "서버에 연결할 수 없습니다.",
        {
          code: timedOut ? "timeout" : "network_error",
          action,
          retriable: true,
          cause: error,
        },
      );
    } finally {
      clearTimeout(timer);
      detachAbort();
    }
  }

  return Object.freeze({ request });
}
