import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";

const source = await readFile(new URL("../../supabase/functions/hub-auth-bridge/index.ts", import.meta.url), "utf8");
const { code } = await transform(source.replace(/^import .*;\r?\n/m, ""), { loader: "ts", target: "es2022" });
const context = { Deno: { env: { get: () => "" }, serve() {} }, URL };
runInNewContext(`${code}\nglobalThis.syncForTest = syncIdentity;`, context);
const payload = { data: { session: { user: { userId: "USR-TEST" } }, bootstrap: {} } };
const admin = {
  from(table) {
    assert.equal(table, "profiles");
    return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { id: "existing-user" } }; } };
  },
  auth: { admin: { updateUserById() { assert.fail("Existing credentials must never be replaced from Sheets"); } } },
};

test("migrated legacy login requires the current Auth password and returns without profile writes", async () => {
  const session = { marker: "current-session" };
  const client = { auth: { async signInWithPassword(input) {
    assert.equal(input.email, "test@hub.local");
    return { data: { user: { id: "existing-user" }, session } };
  } } };
  assert.equal(await context.syncForTest(admin, client, "test@hub.local", "test-only", payload), session);
});

test("old Sheets password cannot overwrite a migrated password", async () => {
  const client = { auth: { async signInWithPassword() { return { error: { code: "invalid_credentials" } }; } } };
  await assert.rejects(context.syncForTest(admin, client, "test@hub.local", "old-test-only", payload), error => error.message === "invalid_credentials" && error.status === 401);
});

test("legacy bridge rejects a different Auth identity without modifying memberships", async () => {
  const client = { auth: { async signInWithPassword() { return { data: { user: { id: "other-user" }, session: {} } }; } } };
  await assert.rejects(context.syncForTest(admin, client, "test@hub.local", "test-only", payload), /invalid_credentials/);
});
