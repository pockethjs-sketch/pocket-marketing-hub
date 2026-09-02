import { HubApiError } from "../api/errors.js";

function positiveId(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new HubApiError("프로젝트 식별자가 올바르지 않습니다.", {
      code: "invalid_supabase_id",
      action: "read_task_activity",
      retriable: false,
    });
  }
  return normalized;
}

export function createSupabaseTaskActivityReader(client) {
  if (!client || typeof client.rpc !== "function") {
    throw new TypeError("A Supabase client with rpc() is required");
  }
  return async function readTaskActivity(params = {}) {
    let request = client.rpc("read_task_activity", {
      p_project_id: positiveId(params.projectId),
      p_limit: Math.max(1, Math.min(Number(params.limit) || 100, 200)),
    });
    if (params.signal && typeof request?.abortSignal === "function") {
      request = request.abortSignal(params.signal);
    }
    const { data, error } = await request;
    if (error) {
      const status = Number(error.status || error.statusCode) || null;
      throw new HubApiError(
        error.code === "42501" ? "업무 로그를 볼 권한이 없습니다." : "업무 로그를 불러오지 못했습니다.",
        {
          code: error.code === "42501" ? "forbidden" : String(error.code || "supabase_rpc_error"),
          status,
          action: "read_task_activity",
          retriable: status === null || [429, 500, 502, 503, 504].includes(status),
          cause: error,
        },
      );
    }
    if (!data || !Array.isArray(data.items)) {
      throw new HubApiError("Supabase 업무 로그 응답 계약이 올바르지 않습니다.", {
        code: "invalid_contract",
        action: "read_task_activity",
        retriable: false,
      });
    }
    return { ok: true, generatedAt: new Date().toISOString(), data };
  };
}
