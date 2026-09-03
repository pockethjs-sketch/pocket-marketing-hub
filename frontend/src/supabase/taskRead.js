import { HubApiError } from "../api/errors.js";

function projectArgument(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new HubApiError("프로젝트 식별자가 올바르지 않습니다.", {
      code: "invalid_supabase_id",
      action: "read_tasks",
      retriable: false,
    });
  }
  return normalized;
}

function readError(error = {}) {
  const status = Number(error.status || error.statusCode) || null;
  const rawCode = String(error.code || "supabase_rpc_error");
  const code = rawCode === "42501" ? "forbidden" : rawCode;
  return new HubApiError(
    code === "forbidden" ? "이 프로젝트의 업무를 조회할 권한이 없습니다." : "Supabase 업무를 불러오지 못했습니다.",
    {
      code,
      status,
      action: "read_tasks",
      retriable: status === null || [429, 500, 502, 503, 504].includes(status),
      cause: error,
    },
  );
}

export function taskReadRpcArguments(params = {}) {
  return Object.freeze({
    p_project_id: projectArgument(params.projectId),
    p_include_archived: params.includeArchived === true,
  });
}

export function createSupabaseTaskReader(client, options = {}) {
  if (!client || typeof client.rpc !== "function") {
    throw new TypeError("A Supabase client with rpc() is required");
  }
  const now = options.now || (() => new Date().toISOString());

  return async function readTasks(params = {}) {
    let request = client.rpc("read_task_workspace", taskReadRpcArguments(params));
    if (params.signal && typeof request?.abortSignal === "function") {
      request = request.abortSignal(params.signal);
    }
    const { data, error } = await request;
    if (error) throw readError(error);
    if (!data || !Array.isArray(data.items) || !Array.isArray(data.members) || !Array.isArray(data.issues)) {
      throw new HubApiError("Supabase 업무 응답 계약이 올바르지 않습니다.", {
        code: "invalid_contract",
        action: "read_tasks",
        retriable: false,
      });
    }
    return {
      ok: true,
      generatedAt: now(),
      data,
    };
  };
}
