import assert from "node:assert/strict";
import test from "node:test";

import { createHubDataSource } from "../src/api/dataSource.js";
import { HubApiError } from "../src/api/errors.js";

const sheetsConfig = {
  endpoint: "https://example.invalid/api",
  mode: "live",
  timeoutMs: 60000,
  credentials: "omit",
  hasEndpoint: true,
  loginEnabled: true,
};

test("storage flag defaults to Sheets and preserves the existing live adapter", async () => {
  const live = { bootstrap: async () => ({ ok: true, data: {}, generatedAt: "2026-09-03T02:00:00Z" }) };
  const source = createHubDataSource({ config: sheetsConfig, live, env: {} });

  assert.equal(source.config.dataBackend, "sheets");
  assert.equal((await source.bootstrap()).ok, true);
});

test("Supabase mode fails closed when public configuration is missing", () => {
  assert.throws(
    () => createHubDataSource({
      env: { VITE_POCKET_DATA_BACKEND: "supabase" },
    }),
    (error) => error instanceof HubApiError && error.code === "missing_supabase_config",
  );
});

test("Supabase mode selects the built-in staged adapter instead of a Sheets live override", () => {
  const source = createHubDataSource({
    config: sheetsConfig,
    live: { bootstrap: async () => ({ ok: true, data: {} }) },
    supabaseClient: {
      auth: { getSession() {}, setSession() {}, signOut() {} },
      rpc() {},
      from() {},
    },
    env: {
      VITE_POCKET_DATA_BACKEND: "supabase",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
    },
  });

  assert.equal(source.config.dataBackend, "supabase");
  assert.equal(source.config.hasEndpoint, true);
});

test("a verified Supabase live adapter is selected explicitly", async () => {
  const supabaseLive = {
    getSession: () => ({ user: { userId: "USR-1" } }),
    bootstrap: async () => ({ ok: true, data: { clients: [] }, generatedAt: "2026-09-03T02:00:00Z" }),
  };
  const source = createHubDataSource({
    supabaseLive,
    env: {
      VITE_POCKET_DATA_BACKEND: "supabase",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
    },
  });

  assert.equal(source.config.dataBackend, "supabase");
  assert.equal(source.config.hasEndpoint, true);
  assert.equal((await source.bootstrap()).ok, true);
});
