import assert from "node:assert/strict";
import test from "node:test";

import {
  clearResourceSessionCache,
  readResourceSessionCache,
  removeResourceSessionCache,
  scheduleResourceSessionCacheWrite,
  writeResourceSessionCache,
} from "../src/resourceSessionCache.js";

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

test("연속 업무 변경은 마지막 브라우저 캐시만 유휴 시간에 기록한다", () => {
  const storage = memoryStorage();
  const session = { user: { userId: "USR-POCKET" } };
  const jobs = [];
  const schedule = (callback) => {
    const job = { callback, cancelled: false };
    jobs.push(job);
    return () => { job.cancelled = true; };
  };
  const first = { state: { status: "ready", data: { items: [{ id: "TASK-1", title: "처음" }] } }, cachedAt: Date.now() };
  const last = { state: { status: "ready", data: { items: [{ id: "TASK-1", title: "마지막" }] } }, cachedAt: Date.now() };

  assert.equal(scheduleResourceSessionCacheWrite(session, "PRJ-1:tasks", first, { storage, schedule }), true);
  assert.equal(scheduleResourceSessionCacheWrite(session, "PRJ-1:tasks", last, { storage, schedule }), true);
  assert.equal(jobs[0].cancelled, true);
  jobs.forEach((job) => { if (!job.cancelled) job.callback(); });
  assert.equal(readResourceSessionCache(session, "PRJ-1:tasks", { storage }).state.data.items[0].title, "마지막");

  assert.equal(removeResourceSessionCache(session, "PRJ-1:tasks", { storage }), true);
  assert.equal(readResourceSessionCache(session, "PRJ-1:tasks", { storage }), null);
});
