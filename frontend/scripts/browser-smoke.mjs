import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.APP_URL || "http://127.0.0.1:8766/pocket-marketing-hub/";
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9334;
const profileDir = await mkdtemp(path.join(tmpdir(), "pocket-hub-cdp-"));

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--window-size=1440,1000",
  "about:blank",
], { stdio: "ignore", windowsHide: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Chrome debugging endpoint did not start");
}

function createClient(socketUrl) {
  const socket = new WebSocket(socketUrl);
  let counter = 0;
  const pending = new Map();
  const events = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    events.push(message);
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    events,
    async send(method, params = {}) {
      await opened;
      const id = ++counter;
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Evaluation failed");
  return result.result.value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await waitForDebugger();
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  const target = await response.json();
  const client = createClient(target.webSocketDebuggerUrl);
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Log.enable");
  await delay(1200);

  assert(await evaluate(client, "document.querySelectorAll('.metric-card').length") === 4, "Overview metrics did not render");
  const clientLabels = await evaluate(client, "Array.from(document.querySelectorAll('.client-button')).map((button) => button.textContent.trim())");
  assert(JSON.stringify(clientLabels) === JSON.stringify(["UND", "무극"]), "Client rail must show full client names");

  await evaluate(client, "Array.from(document.querySelectorAll('.project-nav button')).find((button) => button.textContent.includes('업무')).click()")
  await delay(120);
  assert(await evaluate(client, "location.hash") === "#tasks", "Task navigation did not update the view");
  assert(await evaluate(client, "document.querySelectorAll('.table-row').length") === 8, "Pocket task list count is incorrect");

  assert(await evaluate(client, "Boolean(document.querySelector('.actor-badge'))") === true, "Server actor badge did not render");
  assert(await evaluate(client, "document.querySelector('.role-trigger') === null") === true, "Demo role switcher must not render");
  assert(await evaluate(client, "document.querySelector('.brand-mark') === null") === true, "Removed Pocket P logo returned");
  assert(await evaluate(client, "document.querySelector('.sidebar-footer .icon-button') === null") === true, "Removed sidebar footer icon returned");

  await evaluate(client, "Array.from(document.querySelectorAll('.project-nav button')).find((button) => button.textContent.includes('콘텐츠')).click()")
  await delay(150);
  assert(await evaluate(client, "document.querySelectorAll('.content-card').length") === 6, "Content records did not render");

  await evaluate(client, "Array.from(document.querySelectorAll('.project-nav button')).find((button) => button.textContent.includes('성과')).click()")
  await delay(350);
  const kpiCount = await evaluate(client, "document.querySelectorAll('.kpi-card').length");
  if (kpiCount !== 6) {
    const performanceText = await evaluate(client, "document.querySelector('.content-canvas')?.innerText || ''");
    console.error(`Performance debug (${kpiCount} cards): ${performanceText.slice(0, 800)}`);
    console.error(JSON.stringify(client.events.filter((event) => event.method === "Runtime.exceptionThrown" || event.method === "Log.entryAdded").slice(-5), null, 2));
  }
  assert(kpiCount === 6, "Performance KPI cards did not render");

  await evaluate(client, "document.querySelectorAll('.client-button')[1].click()")
  await delay(100);
  assert((await evaluate(client, "document.querySelector('.sidebar-header h1').textContent")).includes("콘텐츠 채널"), "Client switching failed");

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await client.send("Page.reload", { ignoreCache: true });
  await delay(700);
  assert(await evaluate(client, "getComputedStyle(document.querySelector('.mobile-menu-button')).display !== 'none'") === true, "Mobile menu trigger is hidden");
  const mobileOverflow = await evaluate(client, "document.documentElement.scrollWidth > window.innerWidth");
  assert(mobileOverflow === false, "Mobile view has horizontal overflow");

  const seriousEvents = client.events.filter((event) =>
    event.method === "Runtime.exceptionThrown" ||
    (event.method === "Log.entryAdded" && ["error", "warning"].includes(event.params?.entry?.level)),
  );
  if (seriousEvents.length) {
    const summary = seriousEvents.map((event) => ({
      method: event.method,
      level: event.params?.entry?.level,
      text: event.params?.entry?.text || event.params?.exceptionDetails?.text || "Unknown browser error",
      url: event.params?.entry?.url || event.params?.exceptionDetails?.url || "",
    }));
    console.error(JSON.stringify(summary, null, 2));
  }
  assert(seriousEvents.length === 0, `Browser console contains ${seriousEvents.length} error/warning events`);

  client.close();
  console.log("UI smoke test passed: data adapter, navigation, fixed actor role, filters, KPI, client switch, mobile overflow, console.");
} finally {
  chrome.kill();
}
