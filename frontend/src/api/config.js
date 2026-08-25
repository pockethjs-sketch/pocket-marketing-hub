import { HubApiError } from "./errors.js";

const VALID_MODES = new Set(["auto", "live"]);
const VALID_CREDENTIALS = new Set(["omit", "same-origin", "include"]);

function cleanEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HubApiError("API 주소 형식이 올바르지 않습니다.", {
      code: "invalid_api_url",
      retriable: false,
    });
  }

  const isLocalHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new HubApiError("운영 API는 HTTPS 주소만 사용할 수 있습니다.", {
      code: "insecure_api_url",
      retriable: false,
    });
  }

  url.hash = "";
  return url.toString();
}

function timeoutValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 60000;
  return Math.max(3000, Math.min(parsed, 60000));
}

function loginEnabledValue(value) {
  return !["false", "0", "off", "disabled"].includes(String(value ?? "true").trim().toLowerCase());
}

export function readApiConfig(env = import.meta.env) {
  const modeValue = String(env?.VITE_POCKET_API_MODE || "auto").trim().toLowerCase();
  const mode = VALID_MODES.has(modeValue) ? modeValue : "auto";
  const endpoint = cleanEndpoint(env?.VITE_POCKET_API_URL);
  const credentialsValue = String(env?.VITE_POCKET_API_CREDENTIALS || "omit").trim();
  const credentials = VALID_CREDENTIALS.has(credentialsValue) ? credentialsValue : "omit";

  if (mode === "live" && !endpoint) {
    throw new HubApiError("실연동 모드에 필요한 API 주소가 없습니다.", {
      code: "missing_api_url",
      retriable: false,
    });
  }

  return Object.freeze({
    endpoint,
    mode,
    timeoutMs: timeoutValue(env?.VITE_POCKET_API_TIMEOUT_MS),
    credentials,
    hasEndpoint: Boolean(endpoint),
    loginEnabled: loginEnabledValue(env?.VITE_POCKET_LOGIN_ENABLED),
  });
}
