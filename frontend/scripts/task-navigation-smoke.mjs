import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.APP_URL || "http://127.0.0.1:8767/pocket-marketing-hub/#tasks";
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = Number(process.env.CDP_PORT || 9341);
const profileDir = await mkdtemp(path.join(tmpdir(), "pocket-task-nav-"));
const timeoutMs = Number(process.env.SMOKE_READY_TIMEOUT || 30000);
const expectActivity = process.env.SMOKE_EXPECT_ACTIVITY !== "false";
const expectedTasksMin = Number(process.env.SMOKE_EXPECT_TASKS_MIN || 0);
const expectedCompanies = String(process.env.SMOKE_EXPECT_COMPANIES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--window-size=1440,1000",
  "about:blank",
], { stdio: "ignore", windowsHide: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function waitForDebugger() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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
  const pending = new Map();
  const events = [];
  let counter = 0;
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    events.push(message);
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
    close: () => socket.close(),
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

async function waitFor(client, expression, timeout = timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(client, expression)) return true;
    await delay(120);
  }
  return false;
}

const clickTab = (label) => `(() => {
  const button = Array.from(document.querySelectorAll('.task-workspace-tabs button')).find((item) => item.textContent.trim() === ${JSON.stringify(label)});
  if (!button) return false;
  button.click();
  return true;
})()`;

try {
  await waitForDebugger();
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  const target = await response.json();
  const client = createClient(target.webSocketDebuggerUrl);
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Log.enable");
  await delay(250);

  await waitFor(client, "Boolean(document.querySelector('.login-shell, .campaign-schedule-board, .state-panel'))", 5000);

  if (await evaluate(client, "Boolean(document.querySelector('.login-shell'))")) {
    const account = process.env.SMOKE_ACCOUNT || "";
    const accessCode = process.env.SMOKE_ACCESS_CODE || "";
    assert(account && accessCode, "Authenticated smoke test credentials are required");
    await delay(500);
    const fillLogin = `(() => {
      const inputs = document.querySelectorAll('.login-card input');
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setValue.call(inputs[0], ${JSON.stringify(account)});
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      setValue.call(inputs[1], ${JSON.stringify(accessCode)});
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    })()`;
    await evaluate(client, fillLogin);
    await delay(100);
    assert(await evaluate(client, "document.querySelector('.login-submit')?.disabled === false"), "Login form did not accept smoke credentials");
    await evaluate(client, "document.querySelector('.login-submit')?.click(); true");
    await delay(400);
    if (!await evaluate(client, "!document.querySelector('.login-shell') || document.querySelector('.login-submit')?.disabled === true")) {
      await evaluate(client, fillLogin);
      await evaluate(client, "document.querySelector('.login-card form')?.requestSubmit(); true");
    }
  }

  if (!await waitFor(client, "Boolean(document.querySelector('.campaign-schedule-board'))")) {
    const diagnostic = await evaluate(client, `({
      text: document.body.innerText.slice(0, 900),
      loginError: document.querySelector('.login-error')?.textContent || '',
      loading: document.querySelector('.state-panel.is-loading')?.textContent || '',
      hash: location.hash
    })`);
    const serious = client.events.filter((event) => event.method === "Runtime.exceptionThrown" || event.method === "Log.entryAdded").slice(-5);
    throw new Error(`Task schedule did not render: ${JSON.stringify(diagnostic)} events=${JSON.stringify(serious)}`);
  }
  const labels = await evaluate(client, "Array.from(document.querySelectorAll('.task-workspace-tabs button')).map((item) => item.textContent.trim())");
  const expectedLabels = expectActivity ? ["일정표", "간트", "업무 로그"] : ["일정표", "간트"];
  assert(JSON.stringify(labels) === JSON.stringify(expectedLabels), `Unexpected task tabs: ${labels.join(",")}`);
  const selectedTabStyle = await evaluate(client, `(() => {
    const selected = document.querySelector('.task-workspace-tabs button[aria-selected="true"]');
    const unselected = document.querySelector('.task-workspace-tabs button[aria-selected="false"]');
    return {
      background: selected ? getComputedStyle(selected).backgroundColor : '',
      color: selected ? getComputedStyle(selected).color : '',
      hasCheck: Boolean(selected?.querySelector('.task-workspace-tab-check')),
      unselectedBackground: unselected ? getComputedStyle(unselected).backgroundColor : '',
    };
  })()`);
  assert(selectedTabStyle.background === "rgb(7, 26, 68)" && selectedTabStyle.color === "rgb(255, 255, 255)", `Selected task tab is not visually distinct: ${JSON.stringify(selectedTabStyle)}`);
  assert(selectedTabStyle.hasCheck, "Selected task tab is missing its check indicator");
  assert(selectedTabStyle.unselectedBackground !== selectedTabStyle.background, "Selected and unselected task tabs use the same background");
  if (expectedTasksMin > 0) {
    const renderedTasks = await evaluate(client, "document.querySelectorAll('.task-schedule-row').length");
    assert(renderedTasks >= expectedTasksMin, `Expected at least ${expectedTasksMin} task rows, received ${renderedTasks}`);
  }
  const scheduleGrouping = await evaluate(client, `(() => {
    const rows = Array.from(document.querySelectorAll('.reference-task-row'));
    const labels = rows.map((row) => row.querySelector('.reference-task-media span')?.textContent.trim() || '');
    return {
      rowCount: rows.length,
      groupStarts: rows.filter((row) => row.classList.contains('is-media-group-start')).length,
      visibleLabels: labels.filter(Boolean),
      repeatedAdjacentLabels: labels.some((label, index) => label && labels[index - 1] === label),
      tableWidth: getComputedStyle(document.querySelector('.reference-task-table')).width,
      tableLayout: getComputedStyle(document.querySelector('.reference-task-table')).tableLayout,
      firstRowHeight: rows[0] ? getComputedStyle(rows[0]).height : '',
      dateRangeCells: document.querySelectorAll('.task-inline-date-range').length,
      firstCellHeights: rows[0] ? Array.from(rows[0].cells).map((cell) => { const style = getComputedStyle(cell); return { className: cell.className, width: cell.getBoundingClientRect().width, cssWidth: style.width, minWidth: style.minWidth, maxWidth: style.maxWidth, cell: cell.getBoundingClientRect().height, child: cell.firstElementChild?.getBoundingClientRect().height || 0 }; }) : [],
      detailMetrics: rows[0] ? (() => { const el = rows[0].querySelector('.reference-task-detail textarea'); const style = getComputedStyle(el); return { value: el.value, width: style.width, clientWidth: el.clientWidth, height: style.height, lineHeight: style.lineHeight, fieldSizing: style.fieldSizing, scrollHeight: el.scrollHeight }; })() : null,
    };
  })()`);
  assert(scheduleGrouping.visibleLabels.length === scheduleGrouping.rowCount && scheduleGrouping.repeatedAdjacentLabels, `Every schedule row must repeat its media label: ${JSON.stringify(scheduleGrouping)}`);
  assert(scheduleGrouping.dateRangeCells === scheduleGrouping.rowCount, `Schedule dates are not grouped into one compact cell: ${JSON.stringify(scheduleGrouping)}`);
  assert(scheduleGrouping.tableWidth === "1244px" && parseFloat(scheduleGrouping.firstRowHeight) <= 36, `Schedule density drifted: ${JSON.stringify(scheduleGrouping)}`);
  await evaluate(client, `(() => {
    const textarea = document.querySelector('.reference-task-detail .task-inline-textarea');
    window.__scheduleSmokeDetail = textarea.value;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setValue.call(textarea, '긴 세부내용은 별도 펼치기 없이 셀 너비에 맞춰 여러 줄로 자동 줄바꿈되어야 합니다. 일정표에서 전체 내용을 바로 확인할 수 있어야 합니다.');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await delay(100);
  const detailGrowth = await evaluate(client, `(() => {
    const textarea = document.querySelector('.reference-task-detail .task-inline-textarea');
    return { clientHeight: textarea.clientHeight, scrollHeight: textarea.scrollHeight, rowHeight: textarea.closest('tr').getBoundingClientRect().height };
  })()`);
  assert(detailGrowth.clientHeight >= detailGrowth.scrollHeight - 1 && detailGrowth.rowHeight > 36, `Long task detail did not expand its row: ${JSON.stringify(detailGrowth)}`);
  await evaluate(client, `(() => {
    const textarea = document.querySelector('.reference-task-detail .task-inline-textarea');
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setValue.call(textarea, window.__scheduleSmokeDetail || '');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const desktopNavigation = await evaluate(client, `({
    companyTabs: document.querySelectorAll('.topbar-company-tabs button').length,
    clientRailPresent: Boolean(document.querySelector('.client-rail')),
    projectSidebar: getComputedStyle(document.querySelector('.project-sidebar')).display,
    toggleCount: document.querySelectorAll('.navigation-toggle').length,
  })`);
  assert(desktopNavigation.companyTabs > 0 && !desktopNavigation.clientRailPresent, "Company selection did not move exclusively to the top bar");
  assert(desktopNavigation.projectSidebar !== "none", "Desktop left menu is not persistently visible");
  assert(desktopNavigation.toggleCount === 0, "Desktop still exposes a chevron navigation toggle");
  if (expectedCompanies.length) {
    const companyLabels = await evaluate(client, "Array.from(document.querySelectorAll('.topbar-company-tabs button')).map((button) => button.textContent.trim())");
    assert(expectedCompanies.every((name) => companyLabels.includes(name)), `Missing company tabs: expected ${expectedCompanies.join(',')}, received ${companyLabels.join(',')}`);
  }

  assert(await evaluate(client, clickTab("간트")), "Gantt tab was not clickable");
  assert(await waitFor(client, "document.querySelector('.task-workspace-tabs button[aria-selected=\"true\"]')?.textContent.trim() === '간트'"), "Gantt tab did not activate");
  const ganttFrame = await evaluate(client, `(() => {
    const cell = document.querySelector('.reference-gantt .g-row .g-c[data-gantt-task-id]');
    const row = document.querySelector('.reference-gantt .g-row');
    const label = document.querySelector('.reference-gantt .g-row .g-lbl');
    return {
      cellClass: cell?.className || '',
      cellWidth: cell ? getComputedStyle(cell).width : '',
      cellBoxWidth: cell ? cell.getBoundingClientRect().width : 0,
      cellHeight: cell ? getComputedStyle(cell).height : '',
      rowHeight: row ? getComputedStyle(row).height : '',
      labelWidth: label ? getComputedStyle(label).width : '',
      labelBoxWidth: label ? label.getBoundingClientRect().width : 0,
      groups: Array.from(document.querySelectorAll('.reference-gantt .g-grow .nm')).map((item) => item.textContent.trim()),
    };
  })()`);
  assert(ganttFrame.cellClass && !ganttFrame.cellClass.includes("task-schedule-cell"), `Legacy schedule-cell skin still affects Gantt: ${ganttFrame.cellClass}`);
  assert(ganttFrame.cellWidth === "28px" && ganttFrame.cellHeight === "32px", `Gantt cell is not the reference 28x32 frame: ${ganttFrame.cellWidth}x${ganttFrame.cellHeight}`);
  assert(Math.abs(ganttFrame.cellBoxWidth - 28) < 0.1, `Gantt day column expanded beyond the fixed reference width: ${ganttFrame.cellBoxWidth}`);
  assert(ganttFrame.rowHeight === "33px" && ganttFrame.labelWidth === "280px", `Gantt row/label geometry drifted: ${ganttFrame.rowHeight}/${ganttFrame.labelWidth}`);
  assert(Math.abs(ganttFrame.labelBoxWidth - 280) < 0.1, `Gantt label column expanded beyond the fixed reference width: ${ganttFrame.labelBoxWidth}`);
  assert(ganttFrame.groups.some((label) => label === "YouTube"), `Gantt is not grouped by source media: ${ganttFrame.groups.join(",")}`);
  const scheduleMediaGroups = scheduleGrouping.visibleLabels.filter((label, index, labels) => index === 0 || label !== labels[index - 1]);
  assert(JSON.stringify(ganttFrame.groups) === JSON.stringify(scheduleMediaGroups), `Schedule/Gantt media order differs: ${scheduleMediaGroups.join(",")} / ${ganttFrame.groups.join(",")}`);

  if (expectActivity) {
    assert(await evaluate(client, clickTab("업무 로그")), "Activity tab was not clickable");
    assert(await waitFor(client, "Boolean(document.querySelector('.campaign-schedule-board .task-change-log.is-embedded'))"), "Activity content did not render inside the schedule board");
    assert(await waitFor(client, "!document.querySelector('.campaign-schedule-board .task-change-log .state-panel.is-loading')"), "Activity request did not settle");
    assert(await evaluate(client, "document.querySelectorAll('.campaign-schedule-board .task-workspace-tabs button').length === 3"), "Task tabs disappeared in activity view");
    assert(await evaluate(client, "document.querySelector('.campaign-schedule-board .task-workspace-tabs button[aria-selected=\"true\"]')?.textContent.trim() === '업무 로그'"), "Activity tab did not remain selected");
    assert(await evaluate(client, "Boolean(document.querySelector('.campaign-schedule-board .campaign-board-progress') && document.querySelector('.campaign-schedule-board .reference-toolbar') && document.querySelector('.campaign-schedule-board .reference-schedule-panel')) && !document.querySelector('.task-activity-view')"), "Activity view replaced the shared schedule/Gantt frame");

    assert(await evaluate(client, clickTab("간트")), "Gantt return tab was not clickable");
    assert(await waitFor(client, "Boolean(document.querySelector('.campaign-schedule-board')) && document.querySelector('.task-workspace-tabs button[aria-selected=\"true\"]')?.textContent.trim() === '간트'"), "Activity-to-Gantt return failed");

    assert(await evaluate(client, clickTab("업무 로그")), "Second activity entry failed");
    assert(await waitFor(client, "Boolean(document.querySelector('.campaign-schedule-board .task-change-log.is-embedded'))"), "Second activity view did not render");
    assert(await evaluate(client, "!document.querySelector('.campaign-schedule-board .task-change-log .state-panel.is-loading')"), "Activity revisit discarded the loaded log state");
    assert(await evaluate(client, clickTab("일정표")), "Schedule return tab was not clickable");
    assert(await waitFor(client, "Boolean(document.querySelector('.campaign-schedule-board')) && document.querySelector('.task-workspace-tabs button[aria-selected=\"true\"]')?.textContent.trim() === '일정표'"), "Activity-to-schedule return failed");
  } else {
    assert(!labels.includes("업무 로그"), "Client task view exposed the internal activity tab");
    assert(await evaluate(client, clickTab("일정표")), "Client schedule tab was not clickable");
    assert(await waitFor(client, "document.querySelector('.task-workspace-tabs button[aria-selected=\"true\"]')?.textContent.trim() === '일정표'"), "Client Gantt-to-schedule return failed");
  }

  const clientCount = await evaluate(client, "document.querySelectorAll('.topbar-company-tabs button').length");
  if (clientCount > 1) {
    await evaluate(client, "document.querySelectorAll('.topbar-company-tabs button')[1].click()");
    assert(await waitFor(client, "Boolean(document.querySelector('.campaign-schedule-board')) && document.querySelector('.task-workspace-tabs button[aria-selected=\"true\"]')?.textContent.trim() === '일정표'"), "Project switch did not restore the task schedule navigation");
    if (expectedTasksMin > 0) {
      const switchedTasks = await evaluate(client, "document.querySelectorAll('.task-schedule-row').length");
      assert(switchedTasks >= expectedTasksMin, `Switched project rendered only ${switchedTasks} task rows`);
    }
  }

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await client.send("Page.reload", { ignoreCache: true });
  await delay(500);
  assert(await waitFor(client, "document.readyState === 'complete'"), "Mobile reload did not complete");
  const mobileReady = await waitFor(client, "Boolean(document.querySelector('.campaign-schedule-board'))");
  if (!mobileReady) {
    const mobileDiagnostic = await evaluate(client, `({
      text: document.body.innerText.slice(0, 900),
      hash: location.hash,
      session: Boolean(sessionStorage.getItem('pocket_marketing_hub_session_v1')),
      bootstrap: Boolean(sessionStorage.getItem('pocket-marketing-hub.bootstrap.v2')),
    })`);
    throw new Error(`Mobile task schedule did not render: ${JSON.stringify(mobileDiagnostic)}`);
  }
  assert(await evaluate(client, "document.querySelectorAll('.navigation-toggle').length === 1"), "Mobile navigation menu button is missing");
  const mobileLabels = await evaluate(client, "Array.from(document.querySelectorAll('.task-workspace-tabs button')).map((item) => item.textContent.trim())");
  assert(JSON.stringify(mobileLabels) === JSON.stringify(expectedLabels), `Mobile task tabs were lost: ${mobileLabels.join(',')}`);
  assert(await evaluate(client, "document.documentElement.scrollWidth <= window.innerWidth"), "Mobile task navigation caused page-level horizontal overflow");
  if (expectActivity) {
    assert(await evaluate(client, clickTab("업무 로그")), "Mobile activity tab was not clickable");
    assert(await waitFor(client, "Boolean(document.querySelector('.campaign-schedule-board .task-change-log.is-embedded') && document.querySelector('.campaign-schedule-board .task-workspace-tabs'))"), "Mobile activity view lost the shared task frame");
    assert(await evaluate(client, clickTab("일정표")), "Mobile schedule return tab was not clickable");
    assert(await waitFor(client, "Boolean(document.querySelector('.campaign-schedule-board'))"), "Mobile activity-to-schedule return failed");
  }

  const seriousEvents = client.events.filter((event) =>
    event.method === "Runtime.exceptionThrown" ||
    (event.method === "Log.entryAdded" && ["error", "warning"].includes(event.params?.entry?.level)),
  );
  assert(seriousEvents.length === 0, `Browser console contains ${seriousEvents.length} error/warning events`);
  client.close();
  console.log(expectActivity
    ? "Task navigation smoke passed: schedule -> gantt -> activity -> gantt/activity -> schedule, including project switch."
    : "Client task navigation smoke passed: schedule <-> gantt with activity hidden.");
} finally {
  chrome.kill();
}
