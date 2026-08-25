const PHASE_LABELS = {
  P0: "구축",
  M1: "운영 1개월차",
  M2: "운영 2개월차",
  M3: "운영 3개월차",
};

const STATUS_LABELS = {
  PREPARING: "준비",
  ACTIVE: "진행 중",
  PAUSED: "중지",
  COMPLETED: "완료",
  TODO: "할일",
  NOT_STARTED: "대기",
  IN_PROGRESS: "진행",
  INTERNAL_REVIEW: "검토",
  WAITING_CLIENT: "고객 확인",
  REVISION: "검토",
  DONE: "완료",
  BLOCKED: "차단",
  ON_HOLD: "보류",
  DRAFT: "초안",
  PLANNED: "예정",
  IDEA: "기획",
  PRODUCTION: "제작",
  READY: "게시예약",
  PUBLISHED: "완료",
};

const WORKSTREAM_LABELS = {
  MKT: "마케팅",
  DSN: "디자인",
  VID: "영상",
  COMMON: "공통",
  YOUTUBE: "유튜브",
  INSTAGRAM: "인스타그램",
  SEO: "SEO",
};

const CHANNEL_LABELS = {
  WEBSITE: "자사몰",
  YOUTUBE: "유튜브",
  INSTAGRAM: "인스타그램",
  NAVER_BLOG: "네이버 블로그",
  NAVER_SMARTSTORE: "스마트스토어",
  NAVER_SMARTPLACE: "스마트플레이스",
  NAVER_ADS: "네이버 광고",
  META_ADS: "메타 광고",
  GOOGLE_SEARCH: "구글 검색",
  GEO: "AI 검색",
};

const FORMAT_LABELS = {
  LONG_FORM: "롱폼",
  SHORT_FORM: "숏폼",
  FEED: "피드",
  REELS: "릴스",
  ARTICLE: "아티클",
};

const PRIORITY_LABELS = { LOW: "낮음", NORMAL: "보통", HIGH: "높음", CRITICAL: "긴급", URGENT: "긴급" };
// 화면의 대외 담당 주체는 포켓컴퍼니로 통일한다.
// 원장에 남아 있는 기존 NS 코드도 표시 단계에서는 포켓컴퍼니로 정규화한다.
const ORG_LABELS = { POCKET: "포켓컴퍼니", NS: "포켓컴퍼니", NS_MARKETING: "포켓컴퍼니", CLIENT: "고객사" };
const UNIT_LABELS = { COUNT: "건", PEOPLE: "명", KRW: "원", PERCENT: "%", RATE: "%", VIEW: "회" };

function ownerLabel(orgCode, assignee) {
  const mappedOrg = ORG_LABELS[String(orgCode || "").trim().toUpperCase()];
  if (mappedOrg) return mappedOrg;

  const rawAssignee = String(assignee || "").trim();
  const normalizedAssignee = rawAssignee.toUpperCase().replace(/[\s_-]/g, "");
  if (["NS", "NS마케팅", "NSMARKETING"].includes(normalizedAssignee)) return "포켓컴퍼니";
  return rawAssignee || "미지정";
}

function codeLabel(code, labels, fallback = "미지정") {
  const normalized = String(code || "").toUpperCase();
  return labels[normalized] || (normalized ? normalized.replaceAll("_", " ") : fallback);
}

function dateOnly(value) {
  if (!value) return "미정";
  const day = String(value).slice(0, 10);
  const match = day.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}.${match[2]}` : day;
}

function period(start, end) {
  if (!start && !end) return "일정 미정";
  return `${start ? String(start).slice(0, 10).replaceAll("-", ".") : "미정"} — ${end ? String(end).slice(0, 10).replaceAll("-", ".") : "미정"}`;
}

function relativeTimestamp(value) {
  if (!value) return "업데이트 기록 없음";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function actorRole(roleCode) {
  if (String(roleCode).toUpperCase() === "CLIENT_VIEWER") return "client";
  if (String(roleCode).toUpperCase() === "EXECUTOR_EDITOR") return "ns";
  return "pocket";
}

function projectShell(row, clientsById = {}, generatedAt = null) {
  return {
    id: row.project_id,
    clientId: row.client_id,
    clientName: clientsById[row.client_id]?.name || row.client_id || "고객사",
    name: row.project_name || "프로젝트",
    label: codeLabel(row.service_type_code, { CONTENT_MARKETING: "콘텐츠 마케팅" }, "마케팅 프로젝트"),
    phase: codeLabel(row.phase_code, PHASE_LABELS),
    status: codeLabel(row.status_code, STATUS_LABELS),
    permissionCode: String(row.permission_code || "READ_ONLY").toUpperCase(),
    period: period(row.start_date, row.end_date),
    updatedAt: relativeTimestamp(generatedAt),
    objective: row.objective || "등록된 프로젝트 목표가 없습니다.",
    metrics: [],
    phases: [],
    workstreams: [],
    attention: [],
  };
}

export function bootstrapViewModel(envelope) {
  const data = envelope?.data || {};
  const clientRows = (Array.isArray(data.clients) ? data.clients : []).filter((row) => !Boolean(row.is_demo));
  const visibleClientIds = new Set(clientRows.map((row) => row.client_id));
  const projectRows = (Array.isArray(data.projects) ? data.projects : []).filter((row) => visibleClientIds.has(row.client_id));
  const clients = clientRows.map((row) => ({
    id: row.client_id,
    name: row.display_name || row.client_id,
    descriptor: "마케팅 운영",
    projectId: projectRows.find((project) => project.client_id === row.client_id)?.project_id || null,
    status: row.status_code === "ACTIVE" ? "active" : "planned",
  }));
  const clientsById = Object.fromEntries(clients.map((client) => [client.id, client]));
  const projects = Object.fromEntries(projectRows.map((row) => [
    row.project_id,
    projectShell(row, clientsById, envelope?.generatedAt),
  ]));
  const currentUser = data.currentUser || envelope?.actor || null;

  return {
    clients: clients.filter((client) => client.projectId),
    projects,
    channels: Array.isArray(data.channels) ? data.channels : [],
    actor: currentUser ? {
      id: currentUser.userId,
      name: currentUser.displayName || "사용자",
      roleCode: currentUser.role,
      role: actorRole(currentUser.role),
      organization: currentUser.organization || null,
    } : null,
    generatedAt: envelope?.generatedAt || null,
    initialOverview: data.initialOverview || null,
    initialTasks: data.initialTasks || null,
  };
}

function activityViewModel(row) {
  const entity = String(row.entity_type || "").toLowerCase();
  const type = entity === "content" ? "content" : entity === "approval" ? "schedule" : entity === "task" ? "task" : "metric";
  return {
    id: row.event_id || row.id,
    type,
    title: row.summary || "프로젝트 항목이 변경됨",
    meta: relativeTimestamp(row.created_at),
    internalMeta: "Google Sheets 활동로그",
  };
}

function overviewKpi(row) {
  return {
    id: row.kpi_id,
    name: row.metric_name || codeLabel(row.metric_code, {}),
    value: Number(row.actual_value || 0),
    target: Number(row.target_value || 0),
    unit: codeLabel(row.unit_code, UNIT_LABELS, ""),
    source: codeLabel(row.channel_code, CHANNEL_LABELS, "원장 집계"),
    state: row.actual_value === null || row.actual_value === undefined ? "데이터 없음" : "측정 중",
  };
}

export function overviewViewModel(envelope, fallbackProject) {
  const data = envelope?.data || {};
  const summary = data.summary || {};
  const taskSummary = summary.tasks || {};
  const contentSummary = summary.contents || {};
  const approvalSummary = summary.approvals || {};
  const base = fallbackProject || {};
  const project = {
    ...base,
    ...(data.project ? projectShell(data.project, { [data.project.client_id]: { name: base.clientName } }, envelope?.generatedAt) : {}),
  };

  project.metrics = [
    { label: "전체 업무", value: `${taskSummary.total || 0}건`, helper: `완료 ${taskSummary.done || 0}건`, progress: taskSummary.total ? Math.round((taskSummary.done || 0) / taskSummary.total * 100) : 0, tone: "blue" },
    { label: "진행 업무", value: `${taskSummary.inProgress || 0}건`, helper: taskSummary.blocked ? `차단 ${taskSummary.blocked}건` : "현재 진행 중", progress: null, tone: "warning" },
    { label: "발행 콘텐츠", value: `${contentSummary.published || 0} / ${contentSummary.total || 0}`, helper: `검수 ${contentSummary.inReview || 0}건`, progress: contentSummary.total ? Math.round((contentSummary.published || 0) / contentSummary.total * 100) : 0, tone: "success" },
    { label: "승인 대기", value: `${approvalSummary.pending || 0}건`, helper: `승인 ${approvalSummary.approved || 0}건`, progress: null, tone: "blue" },
  ];
  project.phases = (data.phases || []).map((item) => ({
    id: item.code,
    code: codeLabel(item.code, PHASE_LABELS),
    label: "등록 업무",
    tasks: `${item.count}건`,
    output: "원장 기준",
    progress: null,
    state: item.code === data.project?.phase_code ? "current" : "listed",
  }));
  project.workstreams = (data.workstreams || []).map((item) => ({
    id: String(item.code || "").toLowerCase(),
    name: codeLabel(item.code, WORKSTREAM_LABELS),
    summary: "등록 업무",
    count: Number(item.count || 0),
    progress: null,
    color: "#2563eb",
  }));
  project.attention = approvalSummary.pending ? [{
    id: "approval-pending",
    title: `검수 대기 ${approvalSummary.pending}건`,
    detail: "고객 확인이 필요한 콘텐츠 또는 업무가 있습니다.",
    owner: "프로젝트 담당자",
    due: "확인 필요",
    level: "검수 대기",
  }] : [];

  return {
    project,
    kpis: (data.kpis || []).map(overviewKpi),
    activities: (data.recentActivity || []).map(activityViewModel),
    generatedAt: envelope?.generatedAt || null,
  };
}

export function tasksViewModel(envelope) {
  const data = envelope?.data || {};
  return {
    items: (data.items || []).map((row) => ({
      id: row.task_id,
      phase: codeLabel(row.phase_code, PHASE_LABELS),
      stream: codeLabel(row.workstream_code, WORKSTREAM_LABELS),
      title: row.title || "제목 없는 업무",
      status: codeLabel(row.status_code, STATUS_LABELS),
      priority: codeLabel(row.priority_code, PRIORITY_LABELS),
      owner: ownerLabel(row.responsible_org_code, row.assignee_user_id),
      due: dateOnly(row.due_date),
      clientVisible: true,
      parent: row.category_code ? codeLabel(row.category_code, {}) : "업무",
      rowVersion: row.row_version,
    })),
    total: Number(data.totalMatching || 0),
    nextCursor: data.nextCursor || null,
    generatedAt: envelope?.generatedAt || null,
  };
}

export function contentsViewModel(envelope) {
  const data = envelope?.data || {};
  return {
    items: (data.items || []).map((row) => ({
      id: row.content_id,
      channel: codeLabel(row.channel_code, CHANNEL_LABELS),
      format: codeLabel(row.format_code, FORMAT_LABELS),
      title: row.title || "제목 없는 콘텐츠",
      status: codeLabel(row.status_code, STATUS_LABELS),
      date: dateOnly(row.publish_due_date || row.planned_date || row.published_at),
      owner: row.assignee_user_id || "담당자 미정",
      visible: true,
      url: row.publish_url || null,
      rowVersion: row.row_version,
    })),
    total: Number(data.totalMatching || 0),
    nextCursor: data.nextCursor || null,
    range: data.range || null,
    generatedAt: envelope?.generatedAt || null,
  };
}

export function performanceViewModel(envelope) {
  const data = envelope?.data || {};
  const latest = {};
  (data.actuals || []).forEach((row) => {
    const current = latest[row.kpi_id];
    if (!current || String(row.period_end || "") > String(current.period_end || "")) latest[row.kpi_id] = row;
  });
  const items = (data.definitions || []).map((row) => {
    const actual = latest[row.kpi_id];
    return {
      id: row.kpi_id,
      name: row.metric_name || codeLabel(row.metric_code, {}),
      weight: 0,
      value: Number(actual?.actual_value || 0),
      target: Number(row.target_value || 0),
      unit: codeLabel(row.unit_code, UNIT_LABELS, ""),
      source: actual?.source_code || codeLabel(row.channel_code, CHANNEL_LABELS, "원장 집계"),
      state: actual ? "측정 중" : "데이터 없음",
    };
  });
  return {
    items,
    channels: Array.isArray(data.channels) ? data.channels : [],
    daily: Array.isArray(data.daily) ? data.daily : [],
    range: data.range || null,
    generatedAt: envelope?.generatedAt || null,
  };
}

export function filesViewModel(envelope) {
  const data = envelope?.data || {};
  return {
    items: (data.items || []).map((row) => ({
      id: row.file_id,
      type: codeLabel(row.file_type_code, {}),
      title: row.title || row.source_filename || "자료",
      date: relativeTimestamp(row.updated_at || row.created_at),
      visibility: codeLabel(row.visibility_code, { CLIENT: "고객 공개", PROJECT_TEAM: "프로젝트 팀", POCKET_ONLY: "포켓 전용" }, "프로젝트 팀"),
      url: row.url || null,
    })),
    total: Number(data.totalMatching || 0),
    nextCursor: data.nextCursor || null,
    generatedAt: envelope?.generatedAt || null,
  };
}

export function activityListViewModel(envelope) {
  const data = envelope?.data || {};
  return {
    items: (data.items || []).map(activityViewModel),
    nextCursor: data.nextCursor || null,
    generatedAt: envelope?.generatedAt || null,
  };
}
