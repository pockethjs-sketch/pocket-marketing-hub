import assert from "node:assert/strict";
import test from "node:test";

import { clearResourceSessionCache, readResourceSessionCache, writeResourceSessionCache } from "../src/resourceSessionCache.js";

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test("업무 캐시는 로그인 사용자와 프로젝트가 같을 때만 즉시 복원된다", () => {
  const storage = memoryStorage();
  const pocket = { user: { userId: "USR-POCKET" } };
  const ns = { user: { userId: "USR-NS" } };
  const cached = { state: { status: "ready", data: { items: [{ id: "TASK-1" }] } }, cachedAt: Date.now(), refreshKey: 0 };

  assert.equal(writeResourceSessionCache(pocket, "PRJ-1:tasks", cached, { storage }), true);
  assert.deepEqual(readResourceSessionCache(pocket, "PRJ-1:tasks", { storage }), cached);
  assert.equal(readResourceSessionCache(ns, "PRJ-1:tasks", { storage }), null);
  assert.equal(readResourceSessionCache(pocket, "PRJ-2:tasks", { storage }), null);
});

test("오래된 업무 캐시와 로그아웃 캐시는 재사용하지 않는다", () => {
  const storage = memoryStorage();
  const session = { user: { userId: "USR-POCKET" } };
  const stale = { state: { status: "ready", data: { items: [] } }, cachedAt: Date.now() - 60_000, refreshKey: 0 };

  writeResourceSessionCache(session, "PRJ-1:tasks", stale, { storage });
  assert.equal(readResourceSessionCache(session, "PRJ-1:tasks", { storage, maxAgeMs: 1_000 }), null);

  writeResourceSessionCache(session, "PRJ-1:tasks", { ...stale, cachedAt: Date.now() }, { storage });
  clearResourceSessionCache({ storage });
  assert.equal(readResourceSessionCache(session, "PRJ-1:tasks", { storage }), null);
});
