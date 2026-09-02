// v2 forces one clean sign-in when task persistence moves from Apps Script to
// Supabase, ensuring both sessions exist before the first task read.
export const SESSION_STORAGE_KEY = "pocket_marketing_hub_session_v2";

function safeStorage(candidate) {
  if (candidate) return candidate;
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

export function createSessionStore(storageCandidate) {
  const storage = safeStorage(storageCandidate);
  let memorySession = null;

  function read() {
    let value = memorySession;
    if (storage) {
      try {
        value = JSON.parse(storage.getItem(SESSION_STORAGE_KEY) || "null");
      } catch {
        value = null;
      }
    }
    if (!value?.token || Number(value.expiresAt || 0) <= Date.now()) {
      clear();
      return null;
    }
    return value;
  }

  function write(loginData) {
    const expiresIn = Math.max(0, Number(loginData?.expiresIn || 0));
    const value = {
      token: String(loginData?.token || ""),
      expiresAt: Date.now() + expiresIn * 1000,
      user: loginData?.user || null,
    };
    if (!value.token || !expiresIn) throw new Error("invalid_session_payload");
    memorySession = value;
    if (storage) {
      try {
        storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
      } catch {
        // The in-memory copy still keeps the current tab usable.
      }
    }
    return value;
  }

  function clear() {
    memorySession = null;
    if (storage) {
      try {
        storage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Ignore unavailable browser storage.
      }
    }
  }

  return Object.freeze({ read, write, clear });
}
