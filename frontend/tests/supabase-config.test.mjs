import assert from "node:assert/strict";
import test from "node:test";

import { getSupabaseClient, readSupabaseConfig } from "../src/supabase/client.js";

test("Sheets remains the default storage backend", () => {
  const config = readSupabaseConfig({});
  assert.equal(config.backend, "sheets");
  assert.equal(config.enabled, false);
  assert.equal(getSupabaseClient({}), null);
});

test("Supabase mode requires public runtime configuration", () => {
  const config = readSupabaseConfig({ VITE_POCKET_DATA_BACKEND: "supabase" });
  assert.equal(config.enabled, true);
  assert.equal(config.configured, false);
  assert.throws(
    () => getSupabaseClient({ VITE_POCKET_DATA_BACKEND: "supabase" }),
    /URL과 publishable key/
  );
});

test("Supabase URL is normalized before client creation", () => {
  const config = readSupabaseConfig({
    VITE_POCKET_DATA_BACKEND: "supabase",
    VITE_SUPABASE_URL: "https://example.supabase.co///",
    VITE_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  });
  assert.equal(config.url, "https://example.supabase.co");
  assert.equal(config.configured, true);
});

test("Supabase browser configuration rejects insecure URLs and privileged keys", () => {
  assert.throws(
    () => readSupabaseConfig({
      VITE_POCKET_DATA_BACKEND: "supabase",
      VITE_SUPABASE_URL: "http://project.example.com",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
    }),
    /HTTPS/,
  );
  assert.throws(
    () => readSupabaseConfig({
      VITE_POCKET_DATA_BACKEND: "supabase",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_must_not_ship",
    }),
    /secret\/service-role/,
  );

  const servicePayload = globalThis.btoa(JSON.stringify({ role: "service_role" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  assert.throws(
    () => readSupabaseConfig({
      VITE_POCKET_DATA_BACKEND: "supabase",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: `header.${servicePayload}.signature`,
    }),
    /secret\/service-role/,
  );
});

test("unused Supabase values do not disturb the Sheets default", () => {
  const config = readSupabaseConfig({
    VITE_POCKET_DATA_BACKEND: "sheets",
    VITE_SUPABASE_URL: "not-a-url",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_unused",
  });
  assert.equal(config.backend, "sheets");
  assert.equal(config.url, "");
  assert.equal(config.publishableKey, "");
});
