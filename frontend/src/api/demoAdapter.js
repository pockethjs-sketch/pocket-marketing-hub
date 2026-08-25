import {
  activities,
  clients,
  contents,
  kpis,
  projects,
  roleOptions,
  tasks,
} from "../data/demoData.js";
import { OfflineMutationError } from "./errors.js";

function projectFor(params = {}) {
  if (params.projectId && projects[params.projectId]) return projects[params.projectId];
  const client = clients.find((item) => item.id === params.clientId) || clients[0];
  return projects[client.projectId];
}

function clientSafe(items, params = {}) {
  return params.role === "client" ? items.filter((item) => item.clientVisible ?? item.visible ?? true) : items;
}

function page(items, params = {}) {
  const limit = Math.max(1, Math.min(Number(params.limit) || 100, 100));
  return { items: items.slice(0, limit), total: items.length, nextCursor: null };
}

function envelope(resource, params, data) {
  const project = projectFor(params);
  return {
    ok: true,
    contractVersion: "demo-read-v1",
    schemaVersion: "2026-08-25-v1",
    revision: "demo",
    generatedAt: new Date().toISOString(),
    requestId: `demo_${resource}`,
    scope: {
      clientId: project.clientId,
      projectId: Object.keys(projects).find((key) => projects[key] === project),
      visibility: params.role === "client" ? "CLIENT" : "POCKET_ONLY",
    },
    data,
  };
}

export function createDemoAdapter() {
  return Object.freeze({
    bootstrap(params = {}) {
      return Promise.resolve(envelope("bootstrap", params, { clients, projects, roleOptions }));
    },
    overview(params = {}) {
      const project = projectFor(params);
      const isSeedProject = project.clientId === "und";
      return Promise.resolve(envelope("overview", params, {
        project,
        tasks: isSeedProject ? clientSafe(tasks, params) : [],
        contents: isSeedProject ? clientSafe(contents, params) : [],
        performance: isSeedProject ? kpis : [],
        activity: isSeedProject ? activities.slice(0, 5) : [],
      }));
    },
    tasks(params = {}) {
      const items = projectFor(params).clientId === "und" ? clientSafe(tasks, params) : [];
      return Promise.resolve(envelope("tasks", params, page(items, params)));
    },
    contents(params = {}) {
      const items = projectFor(params).clientId === "und" ? clientSafe(contents, params) : [];
      return Promise.resolve(envelope("contents", params, page(items, params)));
    },
    performance(params = {}) {
      const items = projectFor(params).clientId === "und" ? kpis : [];
      return Promise.resolve(envelope("performance", params, { items }));
    },
    files(params = {}) {
      return Promise.resolve(envelope("files", params, { items: [], total: 0, nextCursor: null }));
    },
    activity(params = {}) {
      const items = projectFor(params).clientId === "und" ? activities : [];
      return Promise.resolve(envelope("activity", params, page(items, params)));
    },
    mutate() {
      return Promise.reject(new OfflineMutationError());
    },
  });
}
