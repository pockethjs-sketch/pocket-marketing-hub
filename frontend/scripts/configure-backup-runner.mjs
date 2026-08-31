import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sodium from "libsodium-wrappers";

const repo = "pockethjs-sketch/pocket-marketing-hub";
const root = path.resolve(import.meta.dirname, "../..");
const localSecrets = JSON.parse(await readFile(path.join(root, "apps-script/.local-secrets.json"), "utf8"));
const apiUrl = String(localSecrets.web_app_url || "").trim();
const pocketAccessCode = String(process.env.POCKET_ACCESS_CODE || "");
if (!apiUrl || !pocketAccessCode) throw new Error("API URL 또는 POCKET_ACCESS_CODE가 없습니다.");

const credentialText = execFileSync("git", ["credential", "fill"], {
  cwd: root,
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
  windowsHide: true,
});
const credential = Object.fromEntries(
  credentialText.split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }),
);
if (!credential.password) throw new Error("GitHub 저장 자격 증명을 찾지 못했습니다.");

const githubHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${credential.password}`,
  "X-GitHub-Api-Version": "2022-11-28",
};
const publicKeyResponse = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, {
  headers: githubHeaders,
});
if (!publicKeyResponse.ok) throw new Error(`GitHub public key 조회 실패: ${publicKeyResponse.status}`);
const publicKey = await publicKeyResponse.json();

await sodium.ready;
const runnerSecret = crypto.randomBytes(48).toString("base64url");
const encrypted = sodium.crypto_box_seal(
  sodium.from_string(runnerSecret),
  sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL),
);
const secretResponse = await fetch(
  `https://api.github.com/repos/${repo}/actions/secrets/BACKUP_RUNNER_SECRET`,
  {
    method: "PUT",
    headers: { ...githubHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      encrypted_value: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL),
      key_id: publicKey.key_id,
    }),
  },
);
if (!secretResponse.ok) throw new Error(`GitHub Actions secret 저장 실패: ${secretResponse.status}`);

async function githubJson(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...githubHeaders, "Content-Type": "application/json", ...(options.headers || {}) },
  });
}
const variableUrl = `https://api.github.com/repos/${repo}/actions/variables/POCKET_API_URL`;
const existingVariable = await githubJson(variableUrl);
const variableResponse = existingVariable.ok
  ? await githubJson(variableUrl, { method: "PATCH", body: JSON.stringify({ name: "POCKET_API_URL", value: apiUrl }) })
  : await githubJson(`https://api.github.com/repos/${repo}/actions/variables`, {
      method: "POST",
      body: JSON.stringify({ name: "POCKET_API_URL", value: apiUrl }),
    });
if (!variableResponse.ok) throw new Error(`GitHub Actions variable 저장 실패: ${variableResponse.status}`);

async function appsScriptRequest(body) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!payload.ok) throw new Error(`${body.action}/${body.operation || ""}: ${payload.error?.code || "unknown_error"}`);
  return payload.data;
}

const login = await appsScriptRequest({
  action: "login",
  account: "pocket",
  accessCode: pocketAccessCode,
  includeBootstrap: false,
});
const auth = { sessionToken: login.token };
const configured = await appsScriptRequest({
  action: "ops_maintenance",
  auth,
  operation: "configure_backup_runner",
  runnerSecret,
});
const backup = await appsScriptRequest({ action: "scheduled_backup", runnerSecret });
const verified = await appsScriptRequest({
  action: "ops_maintenance",
  auth,
  operation: "verify_backup",
});

process.stdout.write(JSON.stringify({
  githubSecretConfigured: secretResponse.status === 201 || secretResponse.status === 204,
  githubVariableConfigured: variableResponse.ok,
  runnerConfigured: configured.runnerConfigured === true,
  backup: { ok: backup.ok, skipped: backup.skipped, fileName: backup.fileName || null },
  verification: { ok: verified.ok, fileName: verified.fileName || null, missingSheets: verified.missingSheets || [] },
}, null, 2));
