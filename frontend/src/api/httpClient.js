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

    const controller = new AbortController();
    const detachAbort = attachAbort(options.signal, controller);
    const timer = setTimeout(() => controller.abort("timeout"), config.timeoutMs);

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
