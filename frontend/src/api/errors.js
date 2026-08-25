export class HubApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "HubApiError";
    this.code = options.code || "api_error";
    this.status = options.status ?? null;
    this.action = options.action || null;
    this.retriable = options.retriable ?? false;
    this.cause = options.cause;
  }
}

export class OfflineMutationError extends HubApiError {
  constructor() {
    super("데모 모드에서는 변경사항을 저장할 수 없습니다.", {
      code: "offline_mutation_blocked",
      action: "mutate",
      retriable: false,
    });
    this.name = "OfflineMutationError";
  }
}

export function publicApiError(error) {
  if (error instanceof HubApiError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      action: error.action,
      retriable: error.retriable,
    };
  }

  return {
    code: "unknown_error",
    message: "데이터를 불러오지 못했습니다.",
    status: null,
    action: null,
    retriable: true,
  };
}
