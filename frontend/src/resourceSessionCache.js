const CACHE_PREFIX = "pocket-marketing-hub.resource.v1";
export const RESOURCE_SESSION_CACHE_MAX_AGE_MS = 30 * 60_000;

function browserStorage(candidate) {
  if (candidate) return candidate;
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function userId(session) {
  return String(session?.user?.userId || "").trim();
}

function cacheStorageKey(session, cacheKey) {
  const owner = userId(session);
  if (!owner || !cacheKey) return null;
  return `${CACHE_PREFIX}:${encodeURIComponent(owner)}:${encodeURIComponent(cacheKey)}`;
}

export function readResourceSessionCache(session, cacheKey, options = {}) {
  const storage = browserStorage(options.storage);
  const key = cacheStorageKey(session, cacheKey);
  if (!storage || !key) return null;
  try {
    const cached = JSON.parse(storage.getItem(key) || "null");
    const maxAgeMs = Number(options.maxAgeMs || RESOURCE_SESSION_CACHE_MAX_AGE_MS);
    if (!cached?.state?.data || cached.state.status !== "ready" || Date.now() - Number(cached.cachedAt || 0) > maxAgeMs) {
      storage.removeItem(key);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

export function writeResourceSessionCache(session, cacheKey, cached, options = {}) {
  const storage = browserStorage(options.storage);
  const key = cacheStorageKey(session, cacheKey);
  if (!storage || !key || !cached?.state?.data || cached.state.status !== "ready") return false;
  try {
    storage.setItem(key, JSON.stringify(cached));
    return true;
  } catch {
    return false;
  }
}

export function clearResourceSessionCache(options = {}) {
  const storage = browserStorage(options.storage);
  if (!storage) return;
  try {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(`${CACHE_PREFIX}:`)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Cache cleanup must not block logout.
  }
}
