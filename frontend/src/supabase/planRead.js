import { HubApiError } from "../api/errors.js";

const PLAN_SOURCES = Object.freeze({
  CLIENT_SHARE: "CLIENT_APPROVED_PLAN",
  INTERNAL: "INTERNAL_EXECUTION_PLAN",
});

function positiveId(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new HubApiError("프로젝트 식별자가 올바르지 않습니다.", {
      code: "invalid_supabase_id",
      action: "read_project_plan",
      retriable: false,
    });
  }
  return normalized;
}

function normalizePlanType(value) {
  const normalized = String(value || "CLIENT_SHARE").trim().toUpperCase();
  const planType = normalized === "CLIENT" ? "CLIENT_SHARE" : normalized;
  if (!PLAN_SOURCES[planType]) {
    throw new HubApiError("실행계획 유형이 올바르지 않습니다.", {
      code: "invalid_plan_type",
      action: "read_project_plan",
      retriable: false,
    });
  }
  return planType;
}

function planReadError(error) {
  const status = Number(error?.status || error?.statusCode) || null;
  const code = String(error?.code || "supabase_plan_read_failed");
  return new HubApiError("실행계획을 불러오지 못했습니다.", {
    code: code === "42501" ? "forbidden" : code,
    status,
    action: "read_project_plan",
    retriable: status === null || [429, 500, 502, 503, 504].includes(status),
    cause: error,
  });
}

function withSignal(request, signal) {
  return signal && typeof request?.abortSignal === "function" ? request.abortSignal(signal) : request;
}

export function createSupabasePlanReader(client, options = {}) {
  if (!client || typeof client.from !== "function") throw new TypeError("A Supabase client with from() is required");
  const now = options.now || (() => new Date().toISOString());

  return async function readProjectPlan(params = {}) {
    const projectId = positiveId(params.projectId);
    const planType = normalizePlanType(params.planType);
    let planRequest = client
      .from("plans")
      .select("id,legacy_id,version_label,title,summary,build_weeks,operation_months,monthly_output_target,initial_output_target,primary_goal,status_code,effective_at,updated_at,row_version")
      .eq("project_id", projectId)
      .eq("source_code", PLAN_SOURCES[planType])
      .eq("status_code", "PUBLISHED")
      .is("archived_at", null)
      .order("effective_at", { ascending: false, nullsFirst: false })
      .order("row_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    planRequest = withSignal(planRequest, params.signal);
    const { data: plan, error: planError } = await planRequest;
    if (planError) throw planReadError(planError);

    if (!plan) {
      return {
        ok: true,
        generatedAt: now(),
        data: { project: null, planType, plan: null, sections: [] },
      };
    }

    let sectionRequest = client
      .from("plan_sections")
      .select("id,legacy_id,section_code,nav_label,title,body_html,sort_order,updated_at")
      .eq("project_id", projectId)
      .eq("plan_id", plan.id)
      .eq("status_code", "PUBLISHED")
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    sectionRequest = withSignal(sectionRequest, params.signal);
    const { data: sections, error: sectionError } = await sectionRequest;
    if (sectionError) throw planReadError(sectionError);

    return {
      ok: true,
      generatedAt: now(),
      data: {
        project: null,
        planType,
        plan: { ...plan, plan_id: plan.legacy_id || plan.id, plan_type_code: planType },
        sections: (sections || []).map((section) => ({
          ...section,
          plan_section_id: section.legacy_id || section.id,
        })),
      },
    };
  };
}

