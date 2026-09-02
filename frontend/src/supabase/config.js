const BACKENDS = new Set(["sheets", "supabase"]);

function normalizedUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Supabase URL 형식이 올바르지 않습니다.");
  }
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("Supabase 운영 URL은 HTTPS여야 합니다.");
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

function jwtRole(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 3) return "";
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return String(JSON.parse(globalThis.atob(base64))?.role || "");
  } catch {
    return "";
  }
}

function publicBrowserKey(value) {
  const key = String(value || "").trim();
  if (/^sb_secret_/i.test(key) || jwtRole(key) === "service_role") {
    throw new Error("VITE_ 변수에는 Supabase secret/service-role key를 넣을 수 없습니다.");
  }
  return key;
}

export function readSupabaseConfig(env = {}) {
  const backend = String(env.VITE_POCKET_DATA_BACKEND || "sheets").trim().toLowerCase();

  if (!BACKENDS.has(backend)) {
    throw new Error("VITE_POCKET_DATA_BACKEND는 sheets 또는 supabase여야 합니다.");
  }

  const enabled = backend === "supabase";
  const url = enabled ? normalizedUrl(env.VITE_SUPABASE_URL) : "";
  const publishableKey = enabled ? publicBrowserKey(env.VITE_SUPABASE_PUBLISHABLE_KEY) : "";

  return Object.freeze({
    backend,
    enabled,
    url,
    publishableKey,
    configured: Boolean(url && publishableKey),
  });
}
