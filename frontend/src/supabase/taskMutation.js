import { HubApiError } from "../api/errors.js";
import { createMutationId } from "../api/hubApi.js";

const TASK_OPERATIONS = new Set(["CREATE", "UPDATE", "ARCHIVE"]);

function bigintArgument(value, label, { optional = false } = {}) {
  if ((value === null || value === undefined || value === "") && optional) return null;
  const normalized = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new HubApiError(`${label} 식별자가 올바르지 않습니다.`, {
      code: "invalid_supabase_id",
      action: "mutate_task",
      retriable: false,
    });
  }
  return normalized;
}

export function taskMutationRpcArguments(input = {}) {
  const mutation = input.mutation || {};
  const entityType = String(mutation.entityType || mutation.entity || "").trim().toUpperCase();
  const operation = String(mutation.operation || "").trim().toUpperCase();
  const mutationId = String(input.mutationId || mutation.mutationId || "").trim();
  const fields = mutation.fields || mutation.values || {};

  if (entityType !== "TASK") {
    throw new HubApiError("Supabase 업무 저장에는 TASK 엔터티가 필요합니다.", {
      code: "unsupported_entity",
      action: "mutate_task",
      retriable: false,
    });
  }
  if (!TASK_OPERATIONS.has(operation)) {
    throw new HubApiError("지원하지 않는 업무 저장 작업입니다.", {
      code: "unsupported_operation",
      action: "mutate_task",
      retriable: false,
    });
  }
  if (mutationId.length < 8 || mutationId.length > 200) {
    throw new HubApiError("업무 저장 ID가 올바르지 않습니다.", {
      code: "invalid_mutation_id",
      action: "mutate_task",
      retriable: false,
    });
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new HubApiError("업무 저장값이 올바르지 않습니다.", {
      code: "invalid_fields",
      action: "mutate_task",
      retriable: false,
    });
  }

  const taskId = bigintArgument(mutation.id, "업무", { optional: operation === "CREATE" });
  const rowVersion = bigintArgument(
    input.expectedRowVersion ?? mutation.expectedRowVersion,
    "업무 버전",
    { optional: operation === "CREATE" }
  );

  return Object.freeze({
    p_mutation_id: mutationId,
    p_operation: operation,
    p_project_id: bigintArgument(input.projectId ?? mutation.projectId, "프로젝트"),
    p_task_id: taskId,
    p_expected_row_version: rowVersion,
    p_fields: { ...fields },
  });
}

function canonicalTaskRecord(item) {
  if (!item || typeof item !== "object") return null;
  return {
    ...item,
    task_id: item.task_id ?? item.id,
  };
}

function applicationErrorCode(code) {
  return code === "stale_row_version" ? "conflict" : code;
}

function databaseError(error = {}) {
  const rawCode = String(error.code || "supabase_rpc_error");
  const code = {
    "40001": "conflict",
    "42501": "forbidden",
    "P0002": "not_found",
    "22023": "invalid_input",
    "23502": "invalid_input",
    "23503": "invalid_reference",
    "23505": "duplicate_value",
    "23514": "invalid_input",
  }[rawCode] || rawCode;
  const message = {
    conflict: "다른 사용자가 먼저 수정했습니다. 최신값을 불러온 뒤 다시 저장해 주세요.",
    forbidden: "이 프로젝트의 해당 변경 권한이 없습니다.",
    not_found: "변경할 업무를 찾지 못했습니다.",
    invalid_input: "업무 입력값을 확인해 주세요.",
    invalid_reference: "연결된 프로젝트 또는 업무 정보가 올바르지 않습니다.",
    duplicate_value: "이미 등록된 업무 식별자입니다.",
  }[code] || "Supabase 업무 저장 요청에 실패했습니다.";
  return { code, message };
}

export function createSupabaseTaskMutator(client, options = {}) {
  if (!client || typeof client.rpc !== "function") {
    throw new TypeError("A Supabase client with rpc() is required");
  }

  return async function mutateTask(input = {}) {
    const mutationId = input.mutationId || input.mutation?.mutationId || (options.createMutationId || createMutationId)();
    const args = taskMutationRpcArguments({ ...input, mutationId });
    let request = client.rpc("mutate_task", args);
    if (input.signal && typeof request?.abortSignal === "function") {
      request = request.abortSignal(input.signal);
    }
    const { data, error } = await request;

    if (error) {
      const status = Number(error.status || error.statusCode) || null;
      const publicError = databaseError(error);
      throw new HubApiError(publicError.message, {
        code: publicError.code,
        status,
        action: "mutate_task",
        retriable: status === null || [429, 500, 502, 503, 504].includes(status),
        cause: error,
      });
    }
    if (!data?.ok) {
      const code = applicationErrorCode(data?.error?.code || "supabase_mutation_failed");
      throw new HubApiError(data?.error?.message || "업무를 저장하지 못했습니다.", {
        code,
        action: "mutate_task",
        retriable: code === "mutation_in_progress",
      });
    }

    const record = canonicalTaskRecord(data.data?.record || data.data?.item);

    return {
      ok: true,
      generatedAt: data.generatedAt || new Date().toISOString(),
      data: {
        ...(data.data || {}),
        ...(record ? { record } : {}),
      },
    };
  };
}

export function taskBatchMutationRpcArguments(input = {}) {
  const mutations = Array.isArray(input.mutations) ? input.mutations : [];
  if (!mutations.length || mutations.length > 40) {
    throw new HubApiError("한 번에 저장할 업무 변경은 1~40건이어야 합니다.", {
      code: "invalid_batch_size",
      action: "mutate_tasks_batch",
      retriable: false,
    });
  }
  const projectId = bigintArgument(input.projectId, "프로젝트");
  return Object.freeze({
    p_project_id: projectId,
    p_mutations: mutations.map((mutation) => {
      const args = taskMutationRpcArguments({
        projectId,
        mutationId: mutation.mutationId || createMutationId(),
        expectedRowVersion: mutation.expectedRowVersion,
        mutation,
      });
      return {
        mutation_id: args.p_mutation_id,
        operation: args.p_operation,
        project_id: args.p_project_id,
        task_id: args.p_task_id,
        expected_row_version: args.p_expected_row_version,
        fields: args.p_fields,
      };
    }),
  });
}

export function createSupabaseTaskBatchMutator(client) {
  if (!client || typeof client.rpc !== "function") {
    throw new TypeError("A Supabase client with rpc() is required");
  }

  return async function mutateTasksBatch(input = {}) {
    const args = taskBatchMutationRpcArguments(input);
    let request = client.rpc("mutate_tasks_batch", args);
    if (input.signal && typeof request?.abortSignal === "function") {
      request = request.abortSignal(input.signal);
    }
    const { data, error } = await request;
    if (error) {
      const status = Number(error.status || error.statusCode) || null;
      const publicError = databaseError(error);
      throw new HubApiError(publicError.message, {
        code: publicError.code,
        status,
        action: "mutate_tasks_batch",
        retriable: status === null || [429, 500, 502, 503, 504].includes(status),
        cause: error,
      });
    }
    if (!data?.ok) {
      const code = applicationErrorCode(data?.error?.code || "supabase_mutation_failed");
      throw new HubApiError(data?.error?.message || "업무 변경 묶음을 저장하지 못했습니다.", {
        code,
        action: "mutate_tasks_batch",
        retriable: code === "mutation_in_progress",
      });
    }

    const results = (data.data?.results || []).map((item) => ({
      ...item,
      record: canonicalTaskRecord(item?.record || item?.item),
    }));
    return {
      ok: true,
      generatedAt: data.generatedAt || new Date().toISOString(),
      data: { batch: true, results },
    };
  };
}
