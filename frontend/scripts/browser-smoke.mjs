import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.APP_URL || "http://127.0.0.1:8766/pocket-marketing-hub/";
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9334;
const profileDir = await mkdtemp(path.join(tmpdir(), "pocket-hub-cdp-"));
const auditDir = process.env.AUDIT_DIR || "";
const readyTimeout = Number(process.env.SMOKE_READY_TIMEOUT || 12000);
const smokeStartedAt = Date.now();

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

function countApiAction(events, action) {
  return events.filter((event) => {
    if (event.method !== "Network.requestWillBeSent") return false;
    const postData = event.params?.request?.postData;
    if (!postData) return false;
    try {
      return JSON.parse(postData).action === action;
    } catch {
      return false;
    }
  }).length;
}

async function waitFor(client, expression, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(client, expression)) return true;
    await delay(150);
  }
  return false;
}

async function capture(client, filename) {
  if (!auditDir) return;
  await mkdir(auditDir, { recursive: true });
  const result = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(auditDir, filename), Buffer.from(result.data, "base64"));
}

try {
  await waitForDebugger();
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  const target = await response.json();
  const client = createClient(target.webSocketDebuggerUrl);
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Log.enable");
  await client.send("Network.enable");
  const overviewReady = await waitFor(client, "document.querySelectorAll('.metric-card').length === 4", readyTimeout);
  if (!overviewReady) {
    console.error(await evaluate(client, "document.body.innerText.slice(0, 1200)"));
    console.error(JSON.stringify(client.events.filter((event) => event.method === "Runtime.exceptionThrown" || event.method === "Log.entryAdded").slice(-8), null, 2));
    console.error(JSON.stringify(client.events.filter((event) => {
      if (!event.method?.startsWith("Network.")) return false;
      const url = event.params?.request?.url || event.params?.response?.url || "";
      return url.includes("script.google") || event.method === "Network.loadingFailed";
    }).slice(-12).map((event) => ({
      method: event.method,
      host: (() => {
        const url = event.params?.request?.url || event.params?.response?.url || "";
        try { return new URL(url).host; } catch { return ""; }
      })(),
      status: event.params?.response?.status || null,
      error: event.params?.errorText || null,
    })), null, 2));
  }
  assert(overviewReady, "Overview metrics did not render");
  console.log(`Overview ready in ${Date.now() - smokeStartedAt}ms`);
  await delay(100);
  assert(countApiAction(client.events, "project_snapshot") === 1, "Project workspace snapshot must be prefetched exactly once");
  await capture(client, "01-main-only.png");
  const clientLabels = await evaluate(client, "Array.from(document.querySelectorAll('.client-button')).map((button) => button.textContent.trim())");
  assert(clientLabels.length > 0 && clientLabels.every((label) => label.length >= 2), "Client rail must show full client names");

  assert(await evaluate(client, "Boolean(document.querySelector('.navigation-toggle'))") === true, "Main navigation reveal did not render");
  assert(await evaluate(client, "document.querySelectorAll('.navigation-toggle, .client-list-toggle, .project-sidebar-toggle').length") === 1, "Desktop navigation must expose exactly one toggle");
  assert(await evaluate(client, "getComputedStyle(document.querySelector('.project-sidebar')).display") === "none", "Project menu must start collapsed");
  assert(await evaluate(client, "getComputedStyle(document.querySelector('.client-rail')).display") === "none", "All-project rail must start collapsed");
  await evaluate(client, "document.querySelector('.navigation-toggle').click()");
  await delay(100);
  assert(await evaluate(client, "getComputedStyle(document.querySelector('.project-sidebar')).display") !== "none", "First reveal did not open the current project menu");
  assert(await evaluate(client, "getComputedStyle(document.querySelector('.client-rail')).display") === "none", "First reveal opened the all-project rail too early");
  assert(await evaluate(client, "document.querySelector('.navigation-toggle').getAttribute('aria-label')") === "전체 프로젝트 열기", "Single navigation toggle did not expose the next-stage action");
  await capture(client, "02-project-menu.png");
  await evaluate(client, "document.querySelector('.navigation-toggle').click()");
  await delay(100);
  assert(await evaluate(client, "getComputedStyle(document.querySelector('.client-rail')).display") !== "none", "Second reveal did not open the all-project rail");
  await capture(client, "03-all-projects.png");

  await evaluate(client, "Array.from(document.querySelectorAll('.project-nav button')).find((button) => button.textContent.includes('실행계획')).click()")
  assert(await waitFor(client, "document.querySelectorAll('.plan-section-nav button').length === 10 && document.querySelector('.plan-document-body')?.innerText.trim().length > 0", readyTimeout), "Client execution plan did not render");
  assert(countApiAction(client.events, "project_plan") <= 1, "Execution plan issued duplicate fallback requests");
  await evaluate(client, "document.querySelectorAll('.plan-section-nav button')[9].click()")
  assert(await evaluate(client, "document.querySelector('.plan-document header h3').textContent.includes('미팅 기록')"), "Execution plan section navigation failed");
  await capture(client, "04-execution-plan.png");

  await evaluate(client, "Array.from(document.querySelectorAll('.project-nav button')).find((button) => button.textContent.includes('업무')).click()")
  assert(await evaluate(client, "location.hash") === "#tasks", "Task navigation did not update the view");
  assert(await waitFor(client, "document.querySelectorAll('.tracker-task-group article').length > 0", readyTimeout), "Task rows did not render after task-tab entry");
  const taskRequestsAfterInitialLoad = countApiAction(client.events, "tasks");
  assert(await evaluate(client, "Boolean(document.querySelector('.tracker-schedule'))"), "90-day task schedule did not render");
  assert(await evaluate(client, "document.querySelectorAll('.tracker-alert-grid button').length === 4"), "Task alert summary did not render");
  assert(await evaluate(client, "document.querySelectorAll('.tracker-phase-grid button').length >= 4"), "Phase progress cards did not render");
  assert(await evaluate(client, "Boolean(document.querySelector('.tracker-publishing'))"), "Publishing summary did not render");
  assert(await evaluate(client, "Boolean(document.querySelector('.tracker-inline-search'))"), "Task-local search did not render");
  assert(await evaluate(client, "document.querySelector('.tracker-start-date-editor') === null"), "Client view exposed project start-date editing");
  const firstTaskTitle = await evaluate(client, "document.querySelector('.tracker-task-copy strong').textContent.trim()");
  await evaluate(client, `(() => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    const globalInput = document.querySelector(".global-search input");
    const localInput = document.querySelector(".tracker-inline-search input");
    setValue.call(globalInput, ${JSON.stringify(firstTaskTitle)});
    globalInput.dispatchEvent(new Event("input", { bubbles: true }));
    setValue.call(localInput, ${JSON.stringify(firstTaskTitle)});
    localInput.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(100);
  assert(await evaluate(client, "document.querySelectorAll('.tracker-task-group article').length >= 1"), "Global and local task searches were not applied independently");
  await evaluate(client, `(() => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    const globalInput = document.querySelector(".global-search input");
    const localInput = document.querySelector(".tracker-inline-search input");
    setValue.call(globalInput, "");
    globalInput.dispatchEvent(new Event("input", { bubbles: true }));
    setValue.call(localInput, "");
    localInput.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(100);
  await evaluate(client, "document.querySelector('.tracker-task-main').click()");
  assert(await evaluate(client, "Boolean(document.querySelector('.tracker-task-detail'))"), "Inline task details did not open");
  assert(await evaluate(client, "document.querySelector('.tracker-task-edit') === null"), "Client view exposed internal task editing controls");

  assert(await evaluate(client, "Boolean(document.querySelector('.actor-badge'))") === true, "Server actor badge did not render");
  assert(await evaluate(client, "document.querySelector('.role-trigger') === null") === true, "Demo role switcher must not render");
  assert(await evaluate(client, "document.querySelector('.brand-mark') === null") === true, "Removed Pocket P logo returned");
  assert(await evaluate(client, "document.querySelector('.sidebar-footer .icon-button') === null") === true, "Removed sidebar footer icon returned");
  await evaluate(client, "document.querySelector('.navigation-toggle').click()");
  await delay(100);
  assert(await evaluate(client, "getComputedStyle(document.querySelector('.project-sidebar')).display") === "none", "Single navigation toggle did not return to the main-only screen");
  assert(await evaluate(client, "getComputedStyle(document.querySelector('.client-rail')).display") === "none", "Single navigation toggle left the all-project rail visible");
  await evaluate(client, "document.querySelector('.navigation-toggle').click()");
  await delay(100);
  await evaluate(client, "document.querySelector('.navigation-toggle').click()");
  await delay(100);

  await evaluate(client, "Array.from(document.querySelectorAll('.project-nav button')).find((button) => button.textContent.includes('콘텐츠')).click()")
  assert(await waitFor(client, "Boolean(document.querySelector('.content-summary')) && !document.querySelector('.state-panel.is-loading')", readyTimeout), "Content view did not render");

  await evaluate(client, "Array.from(document.querySelectorAll('.project-nav button')).find((button) => button.textContent.includes('성과')).click()")
  await waitFor(client, "Boolean(document.querySelector('.performance-intro')) && !document.querySelector('.state-panel.is-loading')", readyTimeout);
  const kpiCount = await evaluate(client, "document.querySelectorAll('.kpi-card').length");
  if (!await evaluate(client, "Boolean(document.querySelector('.performance-intro'))")) {
    const performanceText = await evaluate(client, "document.querySelector('.content-canvas')?.innerText || ''");
    console.error(`Performance debug (${kpiCount} cards): ${performanceText.slice(0, 800)}`);
    console.error(JSON.stringify(client.events.filter((event) => event.method === "Runtime.exceptionThrown" || event.method === "Log.entryAdded").slice(-5), null, 2));
  }
  assert(await evaluate(client, "Boolean(document.querySelector('.performance-intro'))"), "Performance view did not render");

  await evaluate(client, "Array.from(document.querySelectorAll('.project-nav button')).find((button) => button.textContent.includes('업무')).click()")
  assert(await waitFor(client, "document.querySelectorAll('.tracker-task-group article').length > 0", 1000), "Cached task view did not render immediately");
  await delay(250);
  assert(countApiAction(client.events, "tasks") === taskRequestsAfterInitialLoad, "Task-tab revisit issued a duplicate API request inside the cache window");
  assert(countApiAction(client.events, "project_snapshot") === 1, "Tab navigation issued a duplicate workspace snapshot request");

  if (clientLabels.length > 1) {
    await evaluate(client, "document.querySelectorAll('.client-button')[1].click()")
    await delay(100);
    assert((await evaluate(client, "document.querySelector('.sidebar-header h1').textContent")).length > 0, "Client switching failed");
  }

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await client.send("Page.reload", { ignoreCache: true });
  await delay(350);
  assert(await waitFor(client, "Boolean(document.querySelector('.navigation-toggle'))", readyTimeout), "Mobile app shell did not reload");
  assert(await evaluate(client, "getComputedStyle(document.querySelector('.navigation-toggle')).display !== 'none'") === true, "Mobile menu trigger is hidden");
  await evaluate(client, "document.querySelector('.navigation-toggle').click()");
  await delay(100);
  assert(await evaluate(client, "document.querySelector('.app-shell').classList.contains('is-navigation-drawer-open')") === true, "Mobile navigation drawer did not open");
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
