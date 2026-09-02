import http from "node:http";

const port = Number(process.env.MOCK_HUB_PORT || 9876);
const generatedAt = "2026-09-02T20:00:00+09:00";
const projects = [
  { project_id: "PRJ-UND", client_id: "CLT-UND", project_name: "UND 통합 마케팅 운영", phase_code: "P0", status_code: "ACTIVE", start_date: "2026-08-25", end_date: "2026-09-30", row_version: 4, permission_code: "ADMIN", allowed_pages: ["overview", "plan", "tasks", "daily", "performance", "files"] },
  { project_id: "PRJ-MUGUK", client_id: "CLT-MUGUK", project_name: "무극 통합 마케팅 운영", phase_code: "M1", status_code: "ACTIVE", start_date: "2026-08-20", end_date: "2026-09-30", row_version: 3, permission_code: "ADMIN", allowed_pages: ["overview", "plan", "tasks", "daily", "performance", "files"] },
];

function date(day) {
  return `2026-09-${String(day).padStart(2, "0")}`;
}

function taskRows(projectId, count) {
  return Array.from({ length: count }, (_, index) => {
    const start = 1 + (index % 20);
    const end = Math.min(30, start + (index % 5));
    const media = ["YOUTUBE", "INSTAGRAM", "NAVER_BLOG", "SEO"][index % 4];
    const stream = ["MKT", "DESIGN", "VIDEO"][index % 3];
    return {
      task_id: `${projectId}-TSK-${index + 1}`,
      title: `${media} 운영 업무 ${index + 1}`,
      description: "실사용 규모 렌더링 검수용 업무",
      phase_code: index < 15 ? "P0" : "M1",
      workstream_code: stream,
      category_code: media,
      status_code: index % 7 === 0 ? "DONE" : index % 5 === 0 ? "IN_PROGRESS" : "NOT_STARTED",
      priority_code: "NORMAL",
      responsible_org_code: index % 6 === 0 ? "POCKET" : "NS",
      planned_start_date: date(start),
      due_date: date(end),
      schedule_dates_json: JSON.stringify(Array.from({ length: end - start + 1 }, (_, offset) => date(start + offset))),
      progress_percent: 0,
      sort_order: index + 1,
      visibility_code: "PROJECT_TEAM",
      row_version: 1,
    };
  });
}

const tasksByProject = {
  "PRJ-UND": taskRows("PRJ-UND", 78),
  "PRJ-MUGUK": taskRows("PRJ-MUGUK", 23),
};

function taskPayload(projectId) {
  const project = projects.find((item) => item.project_id === projectId) || projects[0];
  const items = tasksByProject[project.project_id] || [];
  return {
    project,
    members: [],
    publishing: { phases: [] },
    items,
    totalMatching: items.length,
    nextCursor: null,
  };
}

function bootstrap(initialView = "tasks") {
  const data = {
    currentUser: { userId: "USR-MOCK", displayName: "로컬 검수", role: "POCKET_MANAGER", organization: "POCKET" },
    clients: [
      { client_id: "CLT-UND", display_name: "UND", status_code: "ACTIVE", is_demo: false },
      { client_id: "CLT-MUGUK", display_name: "무극", status_code: "ACTIVE", is_demo: false },
    ],
    projects,
    channels: [],
  };
  if (initialView === "tasks") data.initial = { view: "tasks", projectId: "PRJ-UND", payload: taskPayload("PRJ-UND") };
  return data;
}

function response(action, body) {
  if (action === "previewBootstrap" || action === "preview_bootstrap") {
    return {
      session: { token: "mock-token", expiresIn: 3600, user: { userId: "USR-MOCK", displayName: "로컬 검수", role: "POCKET_MANAGER" } },
      bootstrap: bootstrap(body.initialView),
    };
  }
  if (action === "login") {
    return body.includeBootstrap === false
      ? { token: "mock-token", expiresIn: 3600, user: { userId: "USR-MOCK", displayName: "로컬 검수", role: "POCKET_MANAGER" } }
      : { session: { token: "mock-token", expiresIn: 3600, user: { userId: "USR-MOCK", displayName: "로컬 검수", role: "POCKET_MANAGER" } }, bootstrap: bootstrap(body.initialView) };
  }
  if (action === "bootstrap") return bootstrap(body.initialView);
  if (action === "tasks") return taskPayload(body.projectId);
  if (action === "activity") return { items: [], nextCursor: null };
  throw Object.assign(new Error("unsupported_action"), { status: 400 });
}

const server = http.createServer((request, result) => {
  result.setHeader("Access-Control-Allow-Origin", "*");
  result.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.method === "OPTIONS") {
    result.writeHead(204);
    result.end();
    return;
  }
  let raw = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { raw += chunk; });
  request.on("end", () => {
    try {
      const body = raw ? JSON.parse(raw) : {};
      const payload = JSON.stringify({ ok: true, generatedAt, data: response(body.action, body) });
      result.writeHead(200);
      result.end(payload);
    } catch (error) {
      result.writeHead(error.status || 500);
      result.end(JSON.stringify({ ok: false, error: { code: error.message || "mock_error", message: error.message || "mock_error" } }));
    }
  });
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`Mock hub API listening on ${port}\n`));
