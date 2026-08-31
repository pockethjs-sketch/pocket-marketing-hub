import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  ClipboardCheck,
  FileText,
  FolderOpen,
  GalleryHorizontalEnd,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  MousePointerClick,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Trash2,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import {
  activityListViewModel,
  accessAdminViewModel,
  bootstrapViewModel,
  contentsViewModel,
  dailyMeetingsViewModel,
  createHubDataSource,
  filesViewModel,
  overviewViewModel,
  planViewModel,
  performanceTrackingViewModel,
  performanceViewModel,
  taskResponsibleOrganization,
  tasksViewModel,
} from "./api/index.js";
import { getNavigationPresentation, nextDesktopNavigationLevel } from "./navigationState.js";
import {
  DEFAULT_PLAN_VARIANT,
  PLAN_VARIANTS,
  parseViewLocation,
  viewLocationHash,
  viewResourceKey,
} from "./planNavigation.js";
import { TASK_RESPONSIBLE_ORG_OPTIONS, taskCreateInitialFields, taskCreateSubmissionFields } from "./taskForm.js";
import { disclosureChevronDirection, disclosureChevronGlyph, expandSelectedTaskGroup, toggleCollapsedTaskGroup } from "./taskGroupState.js";
import { buildTaskTimeline, withDisplayDeadline } from "./taskTimeline.js";
import { KPI_CHANNEL_OPTIONS, KPI_PERIOD_OPTIONS, KPI_UNIT_OPTIONS, kpiInitialFields, kpiSubmissionFields } from "./kpiForm.js";
import { ACCESS_PAGE_OPTIONS, accountSubmission, firstAllowedView, isViewAllowed, normalizeAllowedPages, removeAccessSubmission } from "./accessPermissions.js";
import { dailyMetricSeries, trackingFunnel, trackingSignals, TRACKING_METRICS } from "./performanceTracking.js";

const navItems = [
  { id: "overview", label: "총괄 현황", icon: LayoutDashboard },
  { id: "plan", label: "실행계획", icon: BookOpenText, children: Object.values(PLAN_VARIANTS) },
  { id: "tasks", label: "업무", icon: ClipboardCheck },
  { id: "schedule", label: "일정표", icon: CalendarDays, permissionId: "tasks", nested: true },
  { id: "daily", label: "데일리 회의록", icon: NotebookPen, permissionId: "tasks", nested: true },
  { id: "content", label: "콘텐츠", icon: GalleryHorizontalEnd },
  { id: "tracking", label: "성과 추적", icon: TrendingUp },
  { id: "performance", label: "성과", icon: BarChart3 },
  { id: "files", label: "자료·활동", icon: FolderOpen },
  { id: "permissions", label: "권한 관리", icon: ShieldCheck, pocketOnly: true },
];

const statusClass = {
  할일: "status status-muted",
  미착수: "status status-muted",
  완료: "status status-success",
  진행: "status status-active",
  진행중: "status status-active",
  검토: "status status-review",
  "고객 확인": "status status-waiting",
  대기: "status status-muted",
  기획: "status status-active",
  제작: "status status-review",
  게시예약: "status status-success",
  차단: "status status-waiting",
  보류: "status status-muted",
  초안: "status status-muted",
  예정: "status status-active",
};

function sourceFactory() {
  try {
    return { source: createHubDataSource(), error: null };
  } catch (error) {
    return { source: null, error };
  }
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

function formatSyncTime(value) {
  if (!value) return "동기화 전";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function ProgressBar({ value, color = "var(--accent)" }) {
  if (value === null || value === undefined) return null;
  return <div className="progress-track" aria-label={`${value}% 진행`}><div className="progress-fill" style={{ width: `${Math.max(0, Math.min(value, 100))}%`, background: color }} /></div>;
}

function EmptyState({ title, description }) {
  return <div className="empty-state"><FolderOpen size={22} strokeWidth={1.7} /><strong>{title}</strong><span>{description}</span></div>;
}

function LoadingState({ label = "Google Sheets 데이터를 불러오는 중입니다." }) {
  return <div className="state-panel is-loading" role="status"><LoaderCircle size={22} className="spin" /><strong>{label}</strong><span>창을 닫지 않아도 됩니다.</span></div>;
}

function ErrorState({ error, onRetry, title = "데이터를 불러오지 못했습니다." }) {
  return <div className="state-panel is-error" role="alert"><AlertCircle size={22} /><strong>{title}</strong><span>{error?.message || "연결 상태를 확인한 뒤 다시 시도해 주세요."}</span>{onRetry && <button className="secondary-button" onClick={onRetry}><RefreshCw size={15} /> 다시 시도</button>}</div>;
}

function LoginScreen({ onLogin, error, loading, configured }) {
  const [account, setAccount] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!account.trim() || !accessCode) return;
    await onLogin({ account: account.trim(), accessCode });
  };
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-mark"><LockKeyhole size={20} /></div>
        <div className="login-heading"><span>포켓컴퍼니</span><h1>마케팅 프로젝트 허브</h1><p>배정된 고객사와 프로젝트만 표시됩니다.</p></div>
        <form onSubmit={submit}>
          <label><span>아이디</span><input type="text" autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="아이디 입력" disabled={loading || !configured} /></label>
          <label><span>비밀번호</span><input type="password" autoComplete="current-password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="비밀번호 입력" disabled={loading || !configured} /></label>
          {error && <div className="login-error"><AlertCircle size={15} />{error.message}</div>}
          {!configured && <div className="login-error"><WifiOff size={15} />운영 API 주소가 설정되지 않았습니다.</div>}
          <button className="primary-button login-submit" disabled={loading || !configured || !account.trim() || !accessCode}>{loading ? <><LoaderCircle size={16} className="spin" /> 확인 중</> : "로그인"}</button>
        </form>
        <footer><ShieldCheck size={14} /> 비밀번호는 브라우저에 저장하지 않고, 발급된 세션만 현재 탭에 보관합니다.</footer>
      </section>
    </main>
  );
}

function ClientRail({ clients, activeClient, onSelect, visible }) {
  return (
    <aside id="client-navigation" className="client-rail" aria-label="고객사 선택" aria-hidden={!visible}>
      <div className="rail-top">{clients.map((client) => <button key={client.id} className={`client-button ${activeClient === client.id ? "is-active" : ""}`} onClick={() => onSelect(client.id)} title={`${client.name} · ${client.descriptor}`}><span className="client-name">{client.name}</span><i className={`presence ${client.status}`} /></button>)}</div>
    </aside>
  );
}

function ProjectSidebar({ project, role, activeView, activePlanVariant, onView, open, onClose, taskCount, sourceState, connectionReady, visible }) {
  const [planExpanded, setPlanExpanded] = useState(activeView === "plan");

  useEffect(() => {
    if (activeView === "plan") setPlanExpanded(true);
  }, [activeView]);

  const visiblePlanChildren = role === "client" ? [PLAN_VARIANTS.client] : Object.values(PLAN_VARIANTS);
  const visibleNavItems = navItems.filter((item) => {
    if (item.pocketOnly) return role === "pocket";
    if (role !== "client") return true;
    return isViewAllowed(item.permissionId || item.id, project.allowedPages);
  });

  return (
    <aside id="project-navigation" className={`project-sidebar ${open ? "is-open" : ""}`} aria-label="프로젝트 탐색" aria-hidden={!visible}>
      <div className="sidebar-header"><div><p className="eyebrow">{project.clientName}</p><h1>{project.name}</h1></div><div className="sidebar-header-actions"><button className="icon-button mobile-close" onClick={onClose} aria-label="메뉴 닫기"><X size={17} /></button></div></div>
      <div className="project-switcher"><div><span className="project-dot" /><strong>{project.status}</strong></div><ChevronDown size={15} /></div>
      <nav className="project-nav"><p className="nav-label">프로젝트</p>{visibleNavItems.map((item) => {
        const Icon = item.icon;
        if (item.id !== "plan") return <button key={item.id} className={`${activeView === item.id || (item.id === "tasks" && activeView === "schedule") ? "is-active" : ""} ${item.nested ? "is-nested" : ""}`} onClick={() => { onView(item.id); onClose(); }}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "tasks" && taskCount > 0 && <em>{taskCount}</em>}</button>;
        return <div key={item.id} className={`project-nav-tree ${planExpanded ? "is-expanded" : ""}`}>
          <button type="button" className={activeView === "plan" ? "is-active" : ""} onClick={() => {
            if (activeView !== "plan") onView("plan", DEFAULT_PLAN_VARIANT);
            setPlanExpanded((current) => activeView === "plan" ? !current : true);
          }} aria-expanded={planExpanded}>
            <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span><ChevronDown className="nav-tree-chevron" size={14} />
          </button>
          {planExpanded && <div className="project-nav-children">
            {visiblePlanChildren.map((child) => {
              return <button key={child.id} type="button" className={activeView === "plan" && activePlanVariant === child.id ? "is-active" : ""} onClick={() => { onView("plan", child.id); onClose(); }} aria-current={activeView === "plan" && activePlanVariant === child.id ? "page" : undefined}><span className="nav-child-branch" aria-hidden="true" /><span>{child.label}</span></button>;
            })}
          </div>}
        </div>;
      })}</nav>
      <div className="sidebar-section"><p className="nav-label">현재 단계</p><div className="phase-brief"><div className="phase-number">{project.phase?.slice(0, 2) || "-"}</div><div><strong>{project.phase}</strong><span>{project.period}</span></div></div></div>
      <div className="sidebar-footer"><div><strong>{connectionReady ? "Google Sheets 연결됨" : "연결 확인 중"}</strong><span>{formatSyncTime(sourceState.lastSuccessfulAt)}</span></div></div>
    </aside>
  );
}

function ActorBadge({ actor, onLogout, live }) {
  return <div className="actor-badge"><span><strong>{actor?.name || "사용자"}</strong><small>{actor?.role === "client" ? "고객 조회" : actor?.role === "ns" ? "실행사 편집" : "포켓 운영"}</small></span>{live && <button className="icon-button" onClick={onLogout} aria-label="로그아웃" title="로그아웃"><LogOut size={16} /></button>}</div>;
}

function Topbar({ project, actor, onLogout, live, search, setSearch, navigation, onToggleNavigation }) {
  const NavigationIcon = navigation.iconDirection === "left" ? ChevronsLeft : ChevronsRight;
  return <header className="topbar"><div className="topbar-leading">{navigation.controlVisible && <button className="navigation-toggle" type="button" onClick={onToggleNavigation} aria-label={navigation.actionLabel} title={navigation.actionLabel} aria-expanded={navigation.usesDrawer ? navigation.isDrawerOpen : undefined} aria-controls={navigation.controlledIds} data-navigation-level={navigation.usesDrawer ? (navigation.isDrawerOpen ? "drawer-open" : "drawer-closed") : navigation.desktopLevel}><NavigationIcon size={18} strokeWidth={2} /></button>}<div className="breadcrumb"><span>{project.clientName}</span><ArrowRight size={13} /><strong>{project.name}</strong></div></div><div className="topbar-actions"><label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="업무·콘텐츠 검색" /></label><ActorBadge actor={actor} onLogout={onLogout} live={live} /></div></header>;
}

function MetricCard({ metric, onOpen }) {
  return <button className={`metric-card tone-${metric.tone}`} onClick={onOpen}><div className="metric-topline"><span>{metric.label}</span><ArrowRight size={14} /></div><strong>{metric.value}</strong><small>{metric.helper}</small><ProgressBar value={metric.progress} color={`var(--tone-${metric.tone})`} /></button>;
}

function OverviewView({ project, role, activities, onNavigate }) {
  const isClient = role === "client";
  return (
    <div className="view-stack">
      <section className="project-hero"><div><p className="editorial-kicker">{project.label}</p><div className="hero-title-row"><h2>{project.name}</h2><span className="project-status"><CircleDot size={13} />{project.status}</span></div><p>{project.objective}</p></div><dl className="hero-meta"><div><dt>현재 단계</dt><dd>{project.phase}</dd></div><div><dt>프로젝트 기간</dt><dd>{project.period}</dd></div><div><dt>최근 업데이트</dt><dd>{project.updatedAt}</dd></div></dl></section>
      <section className="metric-grid" aria-label="핵심 현황">{project.metrics.map((metric, index) => <MetricCard key={metric.label} metric={metric} onOpen={() => onNavigate(index === 2 ? "content" : "tasks")} />)}</section>
      <section className="overview-grid">
        <div className="panel phase-panel"><div className="panel-heading"><div><h3>단계별 업무</h3></div><button className="text-button" onClick={() => onNavigate("tasks")}>업무 전체 보기 <ArrowRight size={14} /></button></div>{project.phases.length ? <div className="phase-timeline">{project.phases.map((phase) => <article key={phase.id} className={phase.state === "current" ? "is-current" : ""}><div className="phase-head"><span>{phase.code}</span><small>{phase.state === "current" ? "현재" : "등록"}</small></div><h4>{phase.label}</h4><div className="phase-stats"><span>업무 {phase.tasks}</span><span>{phase.output}</span></div><ProgressBar value={phase.progress} /></article>)}</div> : <EmptyState title="등록된 단계가 없습니다" description="업무에 단계가 배정되면 자동으로 집계됩니다." />}</div>
        <div className="panel attention-panel"><div className="panel-heading"><div><h3>{isClient ? "이번 주 확인" : "우선 확인할 일"}</h3></div><AlertCircle size={17} /></div>{project.attention.length ? <div className="attention-list">{project.attention.map((item) => <article key={item.id}><div className="attention-title"><span>{item.level}</span><strong>{item.title}</strong></div><p>{item.detail}</p><footer><span>{item.owner}</span><time>{item.due}</time></footer></article>)}</div> : <EmptyState title="확인할 항목이 없습니다" description="승인 대기 항목이 생기면 표시됩니다." />}</div>
      </section>
      <section className="overview-grid lower-grid">
        <div className="panel workstream-panel"><div className="panel-heading"><div><h3>분야별 업무</h3></div><span className="panel-note">원장 등록 기준</span></div>{project.workstreams.length ? <div className="workstream-list">{project.workstreams.map((stream) => <article key={stream.id}><div className="stream-icon" style={{ color: stream.color }}><BarChart3 size={17} /></div><div className="stream-body"><div><strong>{stream.name}</strong><span>{stream.summary}</span></div><ProgressBar value={stream.progress} color={stream.color} /></div><strong className="stream-score">{stream.count}<small>건</small></strong></article>)}</div> : <EmptyState title="분야별 업무가 없습니다" description="업무 분야가 등록되면 집계됩니다." />}</div>
        <div className="panel activity-panel"><div className="panel-heading"><div><h3>최근 업데이트</h3></div><button className="icon-button" onClick={() => onNavigate("files")} aria-label="활동 전체 보기"><MoreHorizontal size={17} /></button></div>{activities.length ? <div className="activity-list">{activities.slice(0, 4).map((item) => <article key={item.id}><span className={`activity-icon type-${item.type}`}>{item.type === "task" ? <Check size={14} /> : item.type === "content" ? <Video size={14} /> : item.type === "schedule" ? <CalendarDays size={14} /> : <BarChart3 size={14} />}</span><div><strong>{item.title}</strong><span>{item.meta}{!isClient && item.internalMeta ? ` · ${item.internalMeta}` : ""}</span></div></article>)}</div> : <EmptyState title="최근 활동이 없습니다" description="원장 변경 이력이 이곳에 표시됩니다." />}</div>
      </section>
    </div>
  );
}

function ViewHeader({ eyebrow, title, description, children }) {
  return <div className="view-header"><div><p className="editorial-kicker">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>{children && <div className="view-actions">{children}</div>}</div>;
}

function CreateButton({ children, entityType, onOpen, enabled }) {
  return <button className="primary-button" onClick={() => onOpen(entityType)} disabled={!enabled} title={enabled ? `${children} 폼 열기` : "운영 Google Sheets 연결에서만 등록할 수 있습니다."}>{children}</button>;
}

const createFormOptions = {
  phase: [["P0", "구축"], ["M1", "운영 1개월차"], ["M2", "운영 2개월차"], ["M3", "운영 3개월차"]],
  stream: [["MKT", "마케팅"], ["DSN", "디자인"], ["VID", "영상"]],
  channel: [["YOUTUBE", "유튜브"], ["INSTAGRAM", "인스타그램"], ["NAVER_BLOG", "네이버 블로그"], ["WEBSITE", "자사몰"]],
  format: [["LONG_FORM", "롱폼"], ["SHORT_FORM", "숏폼"], ["FEED", "피드"], ["REELS", "릴스"], ["ARTICLE", "아티클"]],
};

function FormSelect({ label, value, onChange, options }) {
  return <label className="create-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></label>;
}

function DisclosureChevron({ expanded, className, size = 16 }) {
  const direction = disclosureChevronDirection(expanded);
  return <span className={`disclosure-chevron ${className || ""}`} data-direction={direction} style={{ "--chevron-size": `${size + 3}px` }} aria-hidden="true">{disclosureChevronGlyph(expanded)}</span>;
}

function CreateRecordModal({ entityType, role, onClose, onSubmit }) {
  const completedTaskMode = entityType === "task-completed";
  const recordType = completedTaskMode ? "task" : entityType;
  const [fields, setFields] = useState(() => recordType === "task" ? taskCreateInitialFields(role, completedTaskMode ? "completed" : "default") : recordType === "content" ? {
    title: "", channel_code: "INSTAGRAM", format_code: "FEED", status_code: "DRAFT", planned_date: "", visibility_code: "PROJECT_TEAM",
  } : {
    title: "", url: "", file_type_code: "LINK", storage_provider_code: "LINK", visibility_code: "PROJECT_TEAM", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const entityLabel = completedTaskMode ? "완료 업무" : recordType === "task" ? "업무" : recordType === "content" ? "콘텐츠" : "자료";
  const setField = (name, value) => setFields((current) => ({ ...current, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const cleaned = recordType === "task"
        ? taskCreateSubmissionFields(fields)
        : Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ""));
      if (recordType === "content") cleaned.current_version_no = 1;
      await onSubmit(recordType, cleaned);
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-record-title"><header><div><p className="editorial-kicker">Google Sheets 원장 등록</p><h2 id="create-record-title">{entityLabel} 추가</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="닫기"><X size={18} /></button></header><form onSubmit={submit}>
    <label className="create-field is-wide"><span>{entityLabel} 제목</span><input autoFocus required maxLength={200} value={fields.title} onChange={(event) => setField("title", event.target.value)} placeholder={`${entityLabel} 제목을 입력하세요`} /></label>
    {recordType === "task" && <><FormSelect label="단계" value={fields.phase_code} onChange={(value) => setField("phase_code", value)} options={createFormOptions.phase} /><FormSelect label="업무 분야" value={fields.workstream_code} onChange={(value) => setField("workstream_code", value)} options={createFormOptions.stream} /><FormSelect label="담당" value={fields.responsible_org_code} onChange={(value) => setField("responsible_org_code", value)} options={TASK_RESPONSIBLE_ORG_OPTIONS} />{completedTaskMode ? <div className="completed-task-lock"><Check size={16} /><div><strong>완료 상태로 바로 등록</strong><span>담당자는 직접 선택할 수 있습니다.</span></div></div> : <FormSelect label="상태" value={fields.status_code} onChange={(value) => setField("status_code", value)} options={[["NOT_STARTED", "미착수"], ["IN_PROGRESS", "진행"]]} />}<FormSelect label="우선순위" value={fields.priority_code} onChange={(value) => setField("priority_code", value)} options={[["NORMAL", "보통"], ["HIGH", "높음"], ["CRITICAL", "긴급"]]} /><label className="create-field is-wide"><span>세부내용</span><textarea rows="3" maxLength={10000} value={fields.description} onChange={(event) => setField("description", event.target.value)} placeholder="업무 범위와 산출물을 적어 주세요" /></label><label className="create-field"><span>시작일</span><input type="date" value={fields.planned_start_date} onChange={(event) => setField("planned_start_date", event.target.value)} /></label><label className="create-field"><span>종료일</span><input type="date" value={fields.due_date} onChange={(event) => setField("due_date", event.target.value)} /></label><label className="create-field"><span>진행률 (%)</span><input type="number" min="0" max="100" value={fields.progress_percent} onChange={(event) => setField("progress_percent", event.target.value)} /></label><label className="create-field is-wide"><span>완료링크</span><input type="url" pattern="https://.*" value={fields.completion_url} onChange={(event) => setField("completion_url", event.target.value)} placeholder="https://" /></label><label className="create-field is-wide"><span>비고</span><textarea rows="2" maxLength={10000} value={fields.remarks} onChange={(event) => setField("remarks", event.target.value)} placeholder="일정 이슈나 참고사항을 적어 주세요" /></label></>}
    {recordType === "content" && <><FormSelect label="채널" value={fields.channel_code} onChange={(value) => setField("channel_code", value)} options={createFormOptions.channel} /><FormSelect label="형식" value={fields.format_code} onChange={(value) => setField("format_code", value)} options={createFormOptions.format} /><FormSelect label="상태" value={fields.status_code} onChange={(value) => setField("status_code", value)} options={[["DRAFT", "초안"], ["PLANNED", "예정"], ["IN_PROGRESS", "제작"]]} /><label className="create-field"><span>예정일</span><input type="date" value={fields.planned_date} onChange={(event) => setField("planned_date", event.target.value)} /></label></>}
    {recordType === "file" && <><label className="create-field is-wide"><span>HTTPS 자료 링크</span><input type="url" required pattern="https://.*" value={fields.url} onChange={(event) => setField("url", event.target.value)} placeholder="https://" /></label><label className="create-field is-wide"><span>메모</span><textarea rows="3" maxLength={1000} value={fields.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="자료 설명 또는 버전을 적어 주세요" /></label></>}
    {role === "pocket" && <FormSelect label="공개 범위" value={fields.visibility_code} onChange={(value) => setField("visibility_code", value)} options={[["PROJECT_TEAM", "프로젝트 팀"], ["CLIENT", "고객 공개"], ["POCKET_ONLY", "포켓 전용"]]} />}
    {error && <div className="form-error"><AlertCircle size={15} /><span>{error.message || "저장하지 못했습니다."}</span></div>}
    <footer><p>서버 저장 성공 이후에만 목록에 반영됩니다.</p><div><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>취소</button><button className="primary-button" type="submit" disabled={saving || !fields.title.trim()}>{saving ? <><LoaderCircle size={15} className="spin" /> 저장 중</> : "원장에 저장"}</button></div></footer>
  </form></section></div>;
}

const trackerPhaseDefinitions = [
  { code: "P0", label: "구축" },
  { code: "M1", label: "운영 1개월차" },
  { code: "M2", label: "운영 2개월차" },
  { code: "M3", label: "운영 3개월차" },
];

const trackerStatusOptions = [
  ["NOT_STARTED", "미착수"],
  ["IN_PROGRESS", "진행"],
  ["DONE", "완료"],
  ["ON_HOLD", "보류"],
];

const trackerStatusLabels = {
  TODO: "미착수",
  NOT_STARTED: "미착수",
  IN_PROGRESS: "진행",
  INTERNAL_REVIEW: "검토",
  WAITING_CLIENT: "고객 확인",
  REVISION: "검토",
  BLOCKED: "차단",
  ON_HOLD: "보류",
  DONE: "완료",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

const trackerPriorityLabels = { LOW: "낮음", NORMAL: "보통", HIGH: "높음", CRITICAL: "긴급", URGENT: "긴급" };

function taskWithMutationFields(task, fields = {}) {
  const next = { ...task };
  if (Object.prototype.hasOwnProperty.call(fields, "status_code")) {
    next.statusCode = String(fields.status_code || "NOT_STARTED").toUpperCase();
    next.status = trackerStatusLabels[next.statusCode] || next.statusCode;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "title")) next.title = fields.title || "제목 없는 업무";
  if (Object.prototype.hasOwnProperty.call(fields, "description")) next.description = fields.description || "";
  if (Object.prototype.hasOwnProperty.call(fields, "planned_start_date")) next.plannedStartDate = fields.planned_start_date || null;
  if (Object.prototype.hasOwnProperty.call(fields, "due_date")) {
    next.dueDate = fields.due_date ? String(fields.due_date).slice(0, 10) : null;
    next.due = next.dueDate || "미정";
  }
  if (Object.prototype.hasOwnProperty.call(fields, "priority_code")) {
    next.priorityCode = String(fields.priority_code || "NORMAL").toUpperCase();
    next.priority = trackerPriorityLabels[next.priorityCode] || next.priorityCode;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "progress_percent")) next.progressPercent = Number(fields.progress_percent || 0);
  if (Object.prototype.hasOwnProperty.call(fields, "completion_url")) next.completionUrl = fields.completion_url || "";
  if (Object.prototype.hasOwnProperty.call(fields, "remarks")) next.remarks = fields.remarks || "";
  if (Object.prototype.hasOwnProperty.call(fields, "responsible_org_code")) {
    const organization = taskResponsibleOrganization(fields.responsible_org_code);
    next.responsibleOrgCode = organization.code;
    next.responsibleOrg = organization.label;
  }
  return next;
}

function trackerDate(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function trackerDateLabel(value) {
  const parsed = value instanceof Date ? value : trackerDate(value);
  if (!parsed) return "미정";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(parsed);
}

function addTrackerDays(value, amount) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function addTrackerMonths(value, amount) {
  const next = new Date(value);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function trackerForward(value) {
  const next = new Date(value);
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  return next;
}

function trackerBack(value) {
  const next = new Date(value);
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() - 1);
  return next;
}

function addTrackerBusinessDays(value, businessDays) {
  const next = new Date(value);
  let counted = 0;
  while (counted < businessDays) {
    next.setDate(next.getDate() + 1);
    if (next.getDay() !== 0 && next.getDay() !== 6) counted += 1;
  }
  return next;
}

function trackerSchedule(startDate) {
  const start = trackerDate(startDate);
  if (!start) return trackerPhaseDefinitions.map((phase) => ({ ...phase, start: null, end: null, period: "일정 미정" }));
  const p0Start = trackerForward(start);
  const p0End = addTrackerBusinessDays(p0Start, 14);
  const ranges = [{ start: p0Start, end: p0End }];
  let cursor = addTrackerBusinessDays(p0End, 1);
  for (let index = 0; index < 3; index += 1) {
    const monthStart = trackerForward(cursor);
    const monthEnd = trackerBack(addTrackerDays(addTrackerMonths(monthStart, 1), -1));
    ranges.push({ start: monthStart, end: monthEnd });
    cursor = addTrackerDays(monthEnd, 1);
  }
  return trackerPhaseDefinitions.map((phase, index) => ({
    ...phase,
    ...ranges[index],
    period: `${trackerDateLabel(ranges[index].start)} — ${trackerDateLabel(ranges[index].end)}`,
  }));
}

function trackerCurrentSchedule(schedule, startDate, fallbackPhaseCode, referenceDate = new Date()) {
  if (trackerDate(startDate)) {
    const today = new Date(referenceDate);
    today.setHours(0, 0, 0, 0);
    const dated = schedule.filter((item) => item.start && item.end);
    return dated.find((item) => today.getTime() <= item.end.getTime()) || dated[dated.length - 1] || null;
  }
  return schedule.find((item) => item.code === fallbackPhaseCode) || null;
}

function trackerTaskDue(task, schedule) {
  const explicit = trackerDate(task.dueDate);
  if (explicit) return explicit;
  const phase = schedule.find((item) => item.code === task.phaseCode);
  if (!phase?.start || !phase.end || !task.planWeek) return null;
  if (task.phaseCode === "P0") return addTrackerBusinessDays(phase.start, task.planWeek * 5 - 1);
  if (task.planWeek >= 5) return addTrackerBusinessDays(phase.end, 5);
  let due = addTrackerDays(phase.start, task.planWeek * 7 - 1);
  if (due.getTime() > phase.end.getTime()) due = new Date(phase.end);
  return trackerBack(due);
}

function trackerTaskDueLabel(value) {
  if (!value) return "미정";
  return `${String(value.getMonth() + 1).padStart(2, "0")}.${String(value.getDate()).padStart(2, "0")}`;
}

function trackerDdayLabel(value) {
  if (!value) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(value);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `D+${Math.abs(days)}`;
  if (days === 0) return "D-DAY";
  return `D-${days}`;
}

function TrackerTaskRow({ task, role, canWrite, onUpdate, isDone }) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(task.title || "");
  const [note, setNote] = useState(task.description || "");
  const [startDate, setStartDate] = useState(task.plannedStartDate || "");
  const [responsibleOrg, setResponsibleOrg] = useState(task.responsibleOrgCode || "POCKET");
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [progressPercent, setProgressPercent] = useState(task.progressPercent ?? 0);
  const [completionUrl, setCompletionUrl] = useState(task.completionUrl || "");
  const [remarks, setRemarks] = useState(task.remarks || "");
  const [priority, setPriority] = useState(task.priorityCode || "NORMAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setTitle(task.title || ""), [task.title]);
  useEffect(() => setNote(task.description || ""), [task.description]);
  useEffect(() => setStartDate(task.plannedStartDate || ""), [task.plannedStartDate]);
  useEffect(() => setResponsibleOrg(task.responsibleOrgCode || "POCKET"), [task.responsibleOrgCode]);
  useEffect(() => setDueDate(task.dueDate || ""), [task.dueDate]);
  useEffect(() => setProgressPercent(task.progressPercent ?? 0), [task.progressPercent]);
  useEffect(() => setCompletionUrl(task.completionUrl || ""), [task.completionUrl]);
  useEffect(() => setRemarks(task.remarks || ""), [task.remarks]);
  useEffect(() => setPriority(task.priorityCode || "NORMAL"), [task.priorityCode]);

  const saveFields = async (fields) => {
    if (!canWrite || !onUpdate) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(task, fields);
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = (event) => {
    event.stopPropagation();
    if (!canWrite || saving) return;
    saveFields({ status_code: isDone ? "NOT_STARTED" : "DONE" });
  };

  return <article className={`${isDone ? "is-done" : ""} ${expanded ? "is-expanded" : ""} ${saving ? "is-saving" : ""}`}>
    <div className="tracker-task-main" role="button" tabIndex={0} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpanded((current) => !current); } }}>
      <button className="tracker-check" type="button" onClick={toggleDone} disabled={!canWrite || saving} aria-label={isDone ? `${task.title} 완료 취소` : `${task.title} 완료 처리`}>{isDone && <Check size={13} strokeWidth={2.5} />}</button>
      <div className="tracker-task-copy"><strong>{task.title}</strong></div>
      <div className="tracker-task-state"><i className={statusClass[task.status] || "status status-muted"}>{task.status}</i>{saving && <span className="tracker-row-saving" role="status"><LoaderCircle size={11} className="spin" />저장 중</span>}</div>
      <DisclosureChevron expanded={expanded} className="tracker-row-chevron" size={16} />
      <div className="tracker-task-meta">
        <span><small>구분</small><strong>{task.parent}{task.planWeek ? ` · ${task.planWeek}주차` : ""}{task.contractLinked ? " · 계획 연계" : ""}</strong></span>
        <span><small>담당</small><strong>{role === "client" ? "포켓컴퍼니" : task.responsibleOrg || task.owner}</strong></span>
        <span><small>마감</small><strong>{task.due}</strong></span>
      </div>
    </div>
    {error && !expanded && <div className="tracker-row-error" role="alert"><AlertCircle size={13} /><span>{error.message || "변경사항을 저장하지 못해 이전 상태로 되돌렸습니다."}</span><button type="button" onClick={() => setError(null)} aria-label="오류 닫기"><X size={12} /></button></div>}
    {expanded && <div className="tracker-task-detail">
      {role !== "client" && task.planNote && <div className="tracker-plan-note"><strong>계획 기준</strong><p>{task.planNote}</p></div>}
      {role === "client" && task.customerStatus && <div className="tracker-client-status"><strong>공유 진행 메모</strong><p>{task.customerStatus}</p></div>}
      {canWrite && <div className="tracker-task-edit">
        <div><span>상태</span><div className="tracker-status-actions">{trackerStatusOptions.map(([code, label]) => <button key={code} type="button" disabled={!canWrite || saving} className={task.statusCode === code || (code === "DONE" && task.statusCode === "COMPLETED") ? "is-active" : ""} onClick={() => saveFields({ status_code: code })}>{label}</button>)}</div></div>
        <label className="tracker-owner-edit"><span>업무명</span><input value={title} disabled={saving} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="tracker-owner-edit"><span>시작일</span><input type="date" value={startDate} disabled={saving} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="tracker-owner-edit"><span>종료일</span><input type="date" value={dueDate} disabled={saving} onChange={(event) => setDueDate(event.target.value)} /></label>
        <label className="tracker-owner-edit"><span>진행률 (%)</span><input type="number" min="0" max="100" value={progressPercent} disabled={saving} onChange={(event) => setProgressPercent(event.target.value)} /></label>
        <label className="tracker-owner-edit"><span>우선순위</span><select value={priority} disabled={saving} onChange={(event) => setPriority(event.target.value)}><option value="LOW">낮음</option><option value="NORMAL">보통</option><option value="HIGH">높음</option><option value="CRITICAL">긴급</option></select></label>
        <label className="tracker-owner-edit"><span>담당</span><select value={responsibleOrg} disabled={!canWrite || saving} onChange={(event) => setResponsibleOrg(event.target.value)}><option value="POCKET">포켓</option><option value="NS">NS</option><option value="CLIENT">UND</option></select></label>
        <label><span>세부내용</span><textarea rows="3" value={note} disabled={!canWrite || saving} onChange={(event) => setNote(event.target.value)} placeholder="업무 범위와 산출물을 적어 주세요" /></label>
        <label><span>완료링크</span><input type="url" pattern="https://.*" value={completionUrl} disabled={!canWrite || saving} onChange={(event) => setCompletionUrl(event.target.value)} placeholder="https://" /></label>
        <label><span>비고</span><textarea rows="2" value={remarks} disabled={!canWrite || saving} onChange={(event) => setRemarks(event.target.value)} placeholder="일정 이슈나 참고사항을 적어 주세요" /></label>
        <div className="tracker-edit-footer">{error ? <span className="tracker-save-error"><AlertCircle size={14} />{error.message || "저장하지 못했습니다."}</span> : <span>저장 시 Google Sheets 업무 원장에 반영됩니다.</span>}<button className="primary-button" type="button" disabled={saving || !title.trim() || (title === (task.title || "") && note === (task.description || "") && startDate === (task.plannedStartDate || "") && responsibleOrg === (task.responsibleOrgCode || "POCKET") && dueDate === (task.dueDate || "") && Number(progressPercent) === Number(task.progressPercent ?? 0) && completionUrl === (task.completionUrl || "") && remarks === (task.remarks || "") && priority === (task.priorityCode || "NORMAL"))} onClick={() => { const fields = { title, description: note, planned_start_date: startDate, due_date: dueDate, progress_percent: Number(progressPercent), completion_url: completionUrl, remarks, priority_code: priority }; if (responsibleOrg !== (task.responsibleOrgCode || "POCKET")) fields.responsible_org_code = responsibleOrg; saveFields(fields); }}>{saving ? <><LoaderCircle size={14} className="spin" /> 저장 중</> : "변경 저장"}</button></div>
      </div>}
    </div>}
  </article>;
}

function taskActivityValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function TaskActivityLog({ state, onRefresh }) {
  const data = state?.data || null;
  const items = data?.items || [];
  const loading = state?.status === "loading";

  if (loading && !data) return <LoadingState label="업무 로그를 불러오는 중입니다." />;
  if (state?.status === "error" && !data) return <ErrorState error={state.error} onRetry={onRefresh} title="업무 로그를 불러오지 못했습니다." />;

  return <section className="task-change-log panel" aria-label="업무 로그" aria-busy={loading}>
    <header className="task-change-log-header"><div><span>Google Sheets 활동로그</span><h3>업무 로그</h3><p>확정된 업무 생성·수정 이력을 최신순으로 표시합니다.</p></div><button className="secondary-button" type="button" onClick={onRefresh} disabled={loading}>{loading ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} 새로고침</button></header>
    {state?.status === "error" && data && <div className="task-change-log-warning" role="alert"><AlertCircle size={14} />{state.error?.message || "새로고침하지 못해 이전 로그를 표시합니다."}</div>}
    {items.length ? <div className="task-change-log-list">{items.map((item) => <article key={item.id} className="task-change-log-row">
      <time dateTime={item.createdAt || undefined}>{formatSyncTime(item.createdAt)}</time>
      <div className="task-change-log-task"><strong>{item.taskTitle || item.entityId || "제목 없는 업무"}</strong><small>{item.entityId || "업무 ID 없음"}</small></div>
      <span className={`task-change-log-action is-${String(item.actionCode || "changed").toLowerCase()}`}>{item.action}</span>
      <div className="task-change-log-changes">{item.changes.length ? item.changes.map((change) => <div key={`${item.id}-${change.field}`}><strong>{change.label}</strong><span>{taskActivityValue(change.before)}</span><ArrowRight size={12} /><em>{taskActivityValue(change.after)}</em></div>) : <span className="task-change-log-no-detail">변경값 상세 없음</span>}</div>
      <div className="task-change-log-actor"><small>변경자</small><strong>{item.actor}</strong></div>
    </article>)}</div> : <EmptyState title="업무 로그가 없습니다" description="웹에서 업무를 생성하거나 수정하면 확정된 이력이 표시됩니다." />}
  </section>;
}

function taskDurationDays(startValue, endValue) {
  const start = trackerDate(startValue);
  const end = trackerDate(endValue);
  if (!start || !end || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function TaskScheduleTimeline({ tasks, project }) {
  const [showDetails, setShowDetails] = useState(false);
  const timeline = buildTaskTimeline(tasks, project);
  const done = tasks.filter((task) => task.status === "완료").length;
  const inProgress = tasks.filter((task) => ["IN_PROGRESS", "INTERNAL_REVIEW", "WAITING_CLIENT", "REVISION"].includes(task.statusCode)).length;
  const onHold = tasks.filter((task) => ["ON_HOLD", "BLOCKED"].includes(task.statusCode)).length;
  const missingSchedule = tasks.filter((task) => !task.plannedStartDate || !task.dueDate).length;
  const datedRows = new Map(timeline.rows.map((row) => [row.task.id, row]));
  const days = [];
  if (timeline.start && timeline.end) {
    const cursor = trackerDate(timeline.start);
    const end = trackerDate(timeline.end);
    while (cursor && end && cursor <= end) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      days.push({ iso, day: cursor.getDate(), weekday: ["일", "월", "화", "수", "목", "금", "토"][cursor.getDay()], monthKey: iso.slice(0, 7), weekend: cursor.getDay() === 0 || cursor.getDay() === 6 });
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const months = days.reduce((items, day) => {
    const last = items[items.length - 1];
    if (last?.key === day.monthKey) last.count += 1;
    else items.push({ key: day.monthKey, label: `${Number(day.monthKey.slice(0, 4))}년 ${Number(day.monthKey.slice(5, 7))}월`, count: 1 });
    return items;
  }, []);
  const today = localDateValue();
  const scheduleClass = (task) => {
    if (task.statusCode === "DONE") return "is-done";
    if (["ON_HOLD", "BLOCKED"].includes(task.statusCode)) return "is-hold";
    if (task.streamCode === "YOUTUBE") return "is-youtube";
    if (task.streamCode === "INSTAGRAM") return "is-instagram";
    if (task.streamCode === "SEO") return "is-seo";
    return "is-active";
  };
  return <section className="task-timeline panel" aria-label="업무 일정">
    <header className="task-timeline-summary"><div><span>프로젝트 일정표</span><h3>{timeline.start ? `${trackerDateLabel(timeline.start)} — ${trackerDateLabel(timeline.end)}` : "일정 미정"}</h3><p>업무 정보와 일자별 실행 기간을 같은 행에서 확인합니다.</p></div><div><span><i className="is-done" />완료 <strong>{done}</strong></span><span><i className="is-progress" />진행 <strong>{inProgress}</strong></span><span><i className="is-hold" />보류 <strong>{onHold}</strong></span>{missingSchedule > 0 && <span className="is-warning">일정 미등록 <strong>{missingSchedule}</strong></span>}{days.length > 0 && <button type="button" className="secondary-button task-schedule-detail-toggle" aria-pressed={showDetails} onClick={() => setShowDetails((value) => !value)}>{showDetails ? "일정 우선" : "상세 열 보기"}</button>}</div></header>
    {days.length ? <div className="task-schedule-matrix-scroll"><table className={`task-schedule-matrix${showDetails ? " is-detailed" : " is-compact"}`}><thead><tr><th rowSpan="2">업무</th><th rowSpan="2">세부내용</th><th rowSpan="2">시작일</th><th rowSpan="2">종료일</th><th rowSpan="2">기간(일)</th><th rowSpan="2">진행률</th><th rowSpan="2">상태</th><th rowSpan="2">완료링크</th><th rowSpan="2">비고</th>{months.map((month) => <th className="task-schedule-month" colSpan={month.count} key={month.key}>{month.label}</th>)}</tr><tr>{days.map((day) => <th key={day.iso} className={`task-schedule-day-head ${day.weekend ? "is-weekend" : ""} ${day.iso === today ? "is-today" : ""}`}><strong>{day.day}</strong><small>{day.weekday}</small></th>)}</tr></thead><tbody>{tasks.map((task) => {
      const row = datedRows.get(task.id);
      const duration = taskDurationDays(task.plannedStartDate, task.dueDate);
      const progress = task.progressPercent ?? 0;
      return <tr key={task.id}><td><strong>{task.title}</strong><small>{task.parent || task.stream}</small></td><td>{task.description || "-"}</td><td>{task.plannedStartDate || "-"}</td><td>{task.dueDate || "-"}</td><td>{duration ?? "-"}</td><td>{progress === null ? "-" : <span className="task-sheet-progress"><i><b style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></i><em>{progress}%</em></span>}</td><td><span className={statusClass[task.status] || "status status-muted"}>{task.status}</span></td><td>{task.completionUrl ? <a href={task.completionUrl} target="_blank" rel="noreferrer">열기</a> : "-"}</td><td>{task.remarks || "-"}</td>{days.map((day) => { const active = row && day.iso >= row.startDate && day.iso <= row.endDate; return <td key={`${task.id}-${day.iso}`} className={`task-schedule-cell ${day.weekend ? "is-weekend" : ""} ${day.iso === today ? "is-today" : ""} ${active ? `has-schedule ${scheduleClass(task)}` : ""}`} title={active ? `${task.title} · ${row.startDate}~${row.endDate}` : day.iso}>{active ? <i /> : null}</td>; })}</tr>;
    })}</tbody></table></div> : <EmptyState title={`일정 미등록 ${missingSchedule}건`} description="시작일과 종료일이 없어 일정표를 만들 수 없습니다. 업무 수정에서 두 날짜를 입력해 주세요." />}
  </section>;
}

function TasksView({ role, query, taskPage, activityState, onLoadActivity, onCreate, canWrite, onUpdate, onProjectUpdate, initialSection = "list" }) {
  const editable = Boolean(canWrite);
  const canEditProject = Boolean(canWrite && role === "pocket");
  const schedule = trackerSchedule(taskPage.project?.startDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const currentSchedule = trackerCurrentSchedule(schedule, taskPage.project?.startDate, taskPage.project?.phaseCode, now);
  const currentPhaseLabel = currentSchedule?.label || "전체";
  const tasks = (taskPage.items || []).map((task) => {
    const calculatedDue = trackerTaskDue(task, schedule);
    const normalizedTask = { ...task, status: task.statusCode === "CANCELLED" ? "취소" : task.status };
    // A phase-derived deadline is display-only. Keeping dueDate untouched
    // prevents an unrelated edit from persisting a calculated date as user input.
    return withDisplayDeadline(normalizedTask, calculatedDue ? `${trackerTaskDueLabel(calculatedDue)} · ${trackerDdayLabel(calculatedDue)}` : "");
  });
  const [phase, setPhase] = useState(currentPhaseLabel);
  const [stream, setStream] = useState("전체");
  const [category, setCategory] = useState("전체");
  const [hideDone, setHideDone] = useState(false);
  const [completedOnly, setCompletedOnly] = useState(false);
  const [localQuery, setLocalQuery] = useState("");
  const [alertFilter, setAlertFilter] = useState("전체");
  const [collapsedTaskGroups, setCollapsedTaskGroups] = useState([]);
  const [taskSection, setTaskSection] = useState(initialSection);
  const [startDateDraft, setStartDateDraft] = useState(taskPage.project?.startDate || "");
  const [startDateSaving, setStartDateSaving] = useState(false);
  const [startDateError, setStartDateError] = useState("");
  useEffect(() => setStartDateDraft(taskPage.project?.startDate || ""), [taskPage.project?.startDate]);
  useEffect(() => setPhase(currentPhaseLabel), [taskPage.project?.id, taskPage.project?.startDate, currentPhaseLabel]);
  useEffect(() => setTaskSection(initialSection), [taskPage.project?.id, initialSection]);
  useEffect(() => setCollapsedTaskGroups([]), [taskPage.project?.id]);
  useEffect(() => {
    if (taskSection === "activity" && activityState?.status === "idle") onLoadActivity?.();
  }, [taskSection, activityState?.status, onLoadActivity]);
  const phaseOrder = ["구축", "운영 1개월차", "운영 2개월차", "운영 3개월차"];
  const streamOrder = ["마케팅", "디자인", "영상", "공통", "유튜브", "인스타그램", "SEO"];
  const orderedValues = (values, order) => [...new Set(values)].sort((a, b) => {
    const aIndex = order.indexOf(a);
    const bIndex = order.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b, "ko");
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  const phases = ["전체", ...orderedValues([...phaseOrder, ...tasks.map((task) => task.phase)], phaseOrder)];
  const streams = ["전체", ...orderedValues(tasks.map((task) => task.stream), streamOrder)];
  const categories = ["전체", ...orderedValues(tasks.map((task) => task.parent), [])];
  const isDone = (task) => task.status === "완료";
  const isCancelled = (task) => task.statusCode === "CANCELLED";
  const isInProgress = (task) => ["IN_PROGRESS", "INTERNAL_REVIEW", "WAITING_CLIENT", "REVISION"].includes(task.statusCode);
  const isOnHold = (task) => ["ON_HOLD", "BLOCKED"].includes(task.statusCode);
  const countableTasks = (items) => items.filter((task) => !isCancelled(task));
  const completion = (items) => {
    const countable = countableTasks(items);
    return countable.length ? Math.round(countable.filter(isDone).length / countable.length * 100) : 0;
  };
  const streamGroup = (task) => ["MKT", "YOUTUBE", "INSTAGRAM", "SEO"].includes(task.streamCode) ? "마케팅" : task.streamCode === "DSN" ? "디자인" : task.streamCode === "VID" ? "영상" : task.stream;
  const publishingByPhase = Object.fromEntries((taskPage.publishing?.phases || []).map((item) => [item.phaseCode, item]));
  const phaseStats = phases.slice(1).map((name) => {
    const items = tasks.filter((task) => task.phase === name);
    const countable = countableTasks(items);
    const definition = trackerPhaseDefinitions.find((item) => item.label === name);
    const phaseSchedule = schedule.find((item) => item.label === name);
    const output = publishingByPhase[definition?.code];
    const outputProgress = output?.target?.total ? Math.min(100, Math.round(output.actual.total / output.target.total * 100)) : null;
    return { code: definition?.code || name, name, total: countable.length, done: countable.filter(isDone).length, progress: completion(items), period: phaseSchedule?.period || "일정 미정", output, outputProgress };
  });
  const streamStats = streams.slice(1).map((name) => {
    const items = tasks.filter((task) => task.stream === name);
    const countable = countableTasks(items);
    return { name, total: countable.length, done: countable.filter(isDone).length, progress: completion(items) };
  });
  const primaryStreamStats = ["마케팅", "디자인", "영상"].map((name) => {
    const items = tasks.filter((task) => streamGroup(task) === name);
    const countable = countableTasks(items);
    return { name, total: countable.length, done: countable.filter(isDone).length, progress: completion(items) };
  });
  const alertMatches = (task, key) => {
    if (key === "전체") return true;
    if (isCancelled(task)) return false;
    if (key === "보류") return isOnHold(task);
    const due = trackerDate(task.dueDate);
    if (!due || isDone(task)) return false;
    const days = Math.ceil((due.getTime() - now.getTime()) / 86400000);
    if (key === "지연") return days < 0;
    if (key === "임박") return days >= 0 && days <= 3;
    return true;
  };
  const alerts = [
    { key: "지연", label: "기한 지연", count: tasks.filter((task) => alertMatches(task, "지연")).length, detail: "마감일 경과" },
    { key: "임박", label: "3일 내 마감", count: tasks.filter((task) => alertMatches(task, "임박")).length, detail: "우선 확인" },
    { key: "보류", label: "보류·차단", count: tasks.filter((task) => alertMatches(task, "보류")).length, detail: "진행 조건 확인" },
  ];
  const visibleAlerts = alerts.filter((item) => item.count > 0);
  const globalNeedle = String(query || "").trim().toLowerCase();
  const localNeedle = localQuery.trim().toLowerCase();
  const visibleTasks = useMemo(() => tasks.filter((task) => (phase === "전체" || task.phase === phase)
    && (stream === "전체" || streamGroup(task) === stream)
    && (category === "전체" || task.parent === category)
    && (completedOnly ? isDone(task) : (!hideDone || !isDone(task)))
    && alertMatches(task, alertFilter)
    && (!globalNeedle || `${task.title} ${task.parent} ${task.owner} ${task.responsibleOrg || ""} ${task.sourceTaskId || ""}`.toLowerCase().includes(globalNeedle))
    && (!localNeedle || `${task.title} ${task.parent} ${task.owner} ${task.responsibleOrg || ""} ${task.sourceTaskId || ""}`.toLowerCase().includes(localNeedle))), [phase, stream, category, hideDone, completedOnly, alertFilter, globalNeedle, localNeedle, tasks]);
  const groupedTasks = streamStats.map((item) => ({
    ...item,
    tasks: visibleTasks.filter((task) => task.stream === item.name),
  })).filter((item) => item.tasks.length);
  const overallDone = tasks.filter(isDone).length;
  const overallCancelled = tasks.filter(isCancelled).length;
  const overallCountable = tasks.length - overallCancelled;
  const overallInProgress = tasks.filter((task) => !isCancelled(task) && isInProgress(task)).length;
  const overallOnHold = tasks.filter((task) => !isCancelled(task) && isOnHold(task)).length;
  const overallWaiting = Math.max(0, overallCountable - overallDone - overallInProgress - overallOnHold);
  const overallProgress = completion(tasks);
  const hasPartialTaskData = Number(taskPage.total || 0) > tasks.length;
  const streamColor = { 마케팅: "#22bc7e", 디자인: "#3b82f6", 영상: "#7c9a32", 공통: "#77837d", 유튜브: "#ff4d4f", 인스타그램: "#d946ef", SEO: "#f59e0b" };
  const phaseDay = currentSchedule?.end ? Math.ceil((currentSchedule.end.getTime() - now.getTime()) / 86400000) : null;
  const selectStream = (value) => {
    setStream(value);
    setCompletedOnly(false);
    setCollapsedTaskGroups((current) => expandSelectedTaskGroup(current, value));
  };
  const toggleCompletedOnly = () => {
    const next = !completedOnly;
    setCompletedOnly(next);
    if (next) {
      setStream("전체");
      setHideDone(false);
      setAlertFilter("전체");
    }
  };
  const saveProjectStartDate = async () => {
    if (!canEditProject || !onProjectUpdate || !startDateDraft) return;
    setStartDateSaving(true);
    setStartDateError("");
    try {
      await onProjectUpdate(taskPage.project, startDateDraft);
    } catch (error) {
      setStartDateError(error.code === "conflict" ? "다른 사용자가 먼저 변경했습니다. 최신 값으로 다시 불러왔습니다." : error.message || "착수일을 저장하지 못했습니다.");
    } finally {
      setStartDateSaving(false);
    }
  };

  return <div className="view-stack tracker-view">
    <ViewHeader eyebrow="업무 관리" title="업무" description="90일 진행 흐름과 실행 항목을 한 화면에서 관리합니다.">
      <CreateButton entityType="task-completed" onOpen={onCreate} enabled={editable}>완료 업무 추가</CreateButton>
      <CreateButton entityType="task" onOpen={onCreate} enabled={editable}>업무 추가</CreateButton>
    </ViewHeader>

    <div className="task-section-switch" role="group" aria-label="업무 화면 선택"><button type="button" className={taskSection === "list" ? "is-active" : ""} aria-pressed={taskSection === "list"} onClick={() => setTaskSection("list")}>업무 목록</button><button type="button" className={taskSection === "schedule" ? "is-active" : ""} aria-pressed={taskSection === "schedule"} onClick={() => setTaskSection("schedule")}>일정표</button>{role !== "client" && <button type="button" className={taskSection === "activity" ? "is-active" : ""} aria-pressed={taskSection === "activity"} onClick={() => setTaskSection("activity")}>업무 로그</button>}</div>

    {taskSection === "activity" ? <TaskActivityLog state={activityState} onRefresh={onLoadActivity} /> : taskSection === "schedule" ? <TaskScheduleTimeline tasks={tasks} project={taskPage.project || {}} /> : <>

    <section className="tracker-control-panel panel" aria-label="업무 요약 및 90일 진행 흐름">
      <div className="tracker-control-top">
        <div className="tracker-overall-summary">
          <span>전체 진척</span>
          <strong>{overallProgress}<small>%</small></strong>
          <p>{overallDone} / {overallCountable} 완료</p>
        </div>
        <div className="tracker-overall-body">
          <div className="tracker-stacked-progress" aria-label={`완료 ${overallDone}, 진행 ${overallInProgress}, 보류 ${overallOnHold}, 미착수 ${overallWaiting}`}><i className="is-done" style={{ width: `${overallCountable ? overallDone / overallCountable * 100 : 0}%` }} /><i className="is-progress" style={{ width: `${overallCountable ? overallInProgress / overallCountable * 100 : 0}%` }} /><i className="is-hold" style={{ width: `${overallCountable ? overallOnHold / overallCountable * 100 : 0}%` }} /></div>
          <div className="tracker-status-counts"><span><i className="is-done" />완료 <strong>{overallDone}</strong></span><span><i className="is-progress" />진행 <strong>{overallInProgress}</strong></span><span><i className="is-hold" />보류 <strong>{overallOnHold}</strong></span><span><i className="is-wait" />미착수 <strong>{overallWaiting}</strong></span>{overallCancelled > 0 && <span><i className="is-cancelled" />취소 <strong>{overallCancelled}</strong></span>}<em>업데이트 {formatSyncTime(taskPage.generatedAt)}</em></div>
          {visibleAlerts.length > 0 && <div className="tracker-alert-chips" aria-label="확인 필요 업무">{visibleAlerts.map((item) => <button type="button" key={item.key} className={alertFilter === item.key ? "is-active" : ""} onClick={() => setAlertFilter(alertFilter === item.key ? "전체" : item.key)}><span>{item.label}</span><strong>{item.count}</strong></button>)}</div>}
          {hasPartialTaskData && <div className="tracker-data-warning"><AlertCircle size={13} />전체 {taskPage.total}건 중 {tasks.length}건만 불러왔습니다.</div>}
        </div>
        <div className="tracker-schedule-intro">
          <span>90일 운영</span>
          {canEditProject ? <div className="tracker-start-date-editor"><label><span>착수일</span><input type="date" value={startDateDraft} disabled={startDateSaving} onChange={(event) => { setStartDateDraft(event.target.value); setStartDateError(""); }} /></label><button type="button" disabled={startDateSaving || !startDateDraft || startDateDraft === (taskPage.project?.startDate || "")} onClick={saveProjectStartDate}>{startDateSaving ? "저장 중" : "저장"}</button></div> : <strong>{taskPage.project?.startDate ? `${trackerDateLabel(taskPage.project.startDate)} 시작` : "착수일 미설정"}</strong>}
          {phaseDay !== null && <em>{phaseDay > 0 ? `D-${phaseDay}` : phaseDay === 0 ? "D-DAY" : `D+${Math.abs(phaseDay)}`}</em>}
          {startDateError && <small className="tracker-start-date-error" role="alert">{startDateError}</small>}
        </div>
      </div>
      <div className="tracker-flow-heading"><span>진행 흐름</span><small>단계를 누르면 실행 목록이 필터됩니다.</small></div>
      <div className="tracker-schedule-phases">{phaseStats.map((item) => <button type="button" key={item.code} className={phase === item.name ? "is-active" : phase === "전체" && currentSchedule?.code === item.code ? "is-current" : ""} onClick={() => setPhase(phase === item.name ? "전체" : item.name)}>
        <span>{item.code}<em>{item.progress}%</em></span><strong>{item.name}</strong><small>{item.period}</small>
        <ProgressBar value={item.progress} color="var(--accent)" />
        <small>{item.done} / {item.total} 완료{item.outputProgress !== null ? ` · 산출물 ${item.output?.actual?.total || 0}/${item.output?.target?.total || 0}` : ""}</small>
      </button>)}</div>
    </section>

    <section className="tracker-execution" aria-label="실행 업무 목록">
      <div className="tracker-list-toolbar panel">
        <div className="tracker-stream-tabs" aria-label="업무 분야 필터">
          <button type="button" className={!completedOnly && stream === "전체" ? "is-active" : ""} onClick={() => selectStream("전체")}><span>전체</span><strong>{overallCountable}</strong></button>
          {primaryStreamStats.map((item) => <button type="button" key={item.name} className={!completedOnly && stream === item.name ? "is-active" : ""} onClick={() => selectStream(item.name)} style={{ "--team-color": streamColor[item.name] || "var(--accent)" }}><span>{item.name}</span><strong>{item.done}/{item.total}</strong></button>)}
          <button type="button" className={completedOnly ? "is-active" : ""} aria-pressed={completedOnly} onClick={toggleCompletedOnly} style={{ "--team-color": "#0d9f6e" }}><Check size={12} /><span>완료된 작업</span><strong>{overallDone}</strong></button>
        </div>
        <div className="tracker-filter"><ListFilter size={15} /><select aria-label="업무 구분" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><label className="tracker-inline-search"><Search size={14} /><input value={localQuery} onChange={(event) => setLocalQuery(event.target.value)} placeholder="업무 검색" /></label><label className="tracker-hide-done"><input type="checkbox" checked={hideDone} onChange={(event) => { setHideDone(event.target.checked); if (event.target.checked) setCompletedOnly(false); }} />완료 숨김</label><span className="result-count">{visibleTasks.length}건</span></div>
      </div>

      {groupedTasks.length ? <div className="tracker-task-groups">{groupedTasks.map((group, index) => {
        const collapsed = collapsedTaskGroups.includes(group.name);
        const panelId = `task-group-${taskPage.project?.id || "project"}-${index}`;
        return <section className={`tracker-task-group panel${collapsed ? " is-collapsed" : ""}`} key={group.name} style={{ "--team-color": streamColor[group.name] || "var(--accent)" }}>
          <header><button className="tracker-task-group-toggle" type="button" aria-expanded={!collapsed} aria-controls={panelId} onClick={() => setCollapsedTaskGroups((current) => toggleCollapsedTaskGroup(current, group.name))}><div><span className="tracker-team-dot" /><h3>{group.name}</h3></div><span className="tracker-task-group-summary"><strong>{group.tasks.filter(isDone).length} / {group.tasks.length}</strong><DisclosureChevron expanded={!collapsed} className="tracker-group-chevron" size={17} /></span></button></header>
          {!collapsed && <div className="tracker-task-grid" id={panelId}>{group.tasks.map((task) => <TrackerTaskRow key={task.id} task={task} role={role} canWrite={editable} onUpdate={onUpdate} isDone={isDone(task)} />)}</div>}
        </section>;
      })}</div> : <EmptyState title="조건에 맞는 업무가 없습니다" description="필터를 바꾸거나 원장에 업무를 등록해 주세요." />}
    </section>

    <section className="tracker-publishing panel" aria-label="단계별 콘텐츠 발행 현황"><div className="panel-heading"><div><h3>콘텐츠 발행 현황</h3></div><span className="panel-note">자동 집계</span></div>{taskPage.publishing?.phases?.length ? <div className="tracker-publishing-grid">{taskPage.publishing.phases.map((item) => <article key={item.phaseCode}><header><strong>{item.phase}</strong><span>{item.actual.total} / {item.target.total}</span></header><ProgressBar value={item.target.total ? Math.min(100, Math.round(item.actual.total / item.target.total * 100)) : 0} color="var(--accent)" /><div><span>롱폼 {item.actual.longForm}/{item.target.longForm}</span><span>숏폼 {item.actual.shortForm}/{item.target.shortForm}</span><span>인스타 {item.actual.instagram}/{item.target.instagram}</span><span>블로그 {item.actual.blog}/{item.target.blog}</span></div></article>)}</div> : <div className="tracker-publishing-empty">콘텐츠 원장 집계가 연결되면 표시됩니다.</div>}</section>
    </>}
  </div>;
}

function localDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function DailyMeetingModal({ meeting, role, onClose, onSave }) {
  const [fields, setFields] = useState(() => ({
    meeting_date: meeting?.date || localDateValue(),
    title: meeting?.title || "데일리 미팅",
    attendees_text: meeting?.attendees || "",
    discussion_text: meeting?.discussion || "",
    decisions_text: meeting?.decisions || "",
    action_items_text: meeting?.actionItems || "",
    visibility_code: meeting?.visibilityCode || "PROJECT_TEAM",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const setField = (name, value) => setFields((current) => ({ ...current, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(meeting || null, fields);
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="create-modal daily-meeting-modal" role="dialog" aria-modal="true" aria-labelledby="daily-meeting-title"><header><div><p className="editorial-kicker">Google Sheets 데일리 기록</p><h2 id="daily-meeting-title">{meeting ? "회의록 수정" : "회의록 작성"}</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="닫기"><X size={18} /></button></header><form onSubmit={submit}>
    <label className="create-field"><span>회의 날짜</span><input type="date" required value={fields.meeting_date} onChange={(event) => setField("meeting_date", event.target.value)} /></label>
    <label className="create-field"><span>회의 제목</span><input required maxLength={200} value={fields.title} onChange={(event) => setField("title", event.target.value)} /></label>
    <label className="create-field is-wide"><span>참석자</span><input maxLength={500} value={fields.attendees_text} onChange={(event) => setField("attendees_text", event.target.value)} placeholder="예: 포켓 김OO, NS 이OO" /></label>
    <label className="create-field is-wide"><span>회의 내용</span><textarea required rows="6" maxLength={10000} value={fields.discussion_text} onChange={(event) => setField("discussion_text", event.target.value)} placeholder="논의한 내용을 항목별로 정리하세요" /></label>
    <label className="create-field is-wide"><span>결정사항</span><textarea rows="4" maxLength={10000} value={fields.decisions_text} onChange={(event) => setField("decisions_text", event.target.value)} placeholder="확정된 내용과 기준을 적어 주세요" /></label>
    <label className="create-field is-wide"><span>후속 업무</span><textarea rows="4" maxLength={10000} value={fields.action_items_text} onChange={(event) => setField("action_items_text", event.target.value)} placeholder="담당자와 기한을 함께 적어 주세요" /></label>
    {role === "pocket" && <FormSelect label="공개 범위" value={fields.visibility_code} onChange={(value) => setField("visibility_code", value)} options={[["PROJECT_TEAM", "프로젝트 팀"], ["CLIENT", "고객 공개"], ["POCKET_ONLY", "포켓 전용"]]} />}
    {error && <div className="form-error"><AlertCircle size={15} /><span>{error.message || "저장하지 못했습니다."}</span></div>}
    <footer><p>저장·수정 내역은 활동로그에도 기록됩니다.</p><div><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>취소</button><button className="primary-button" type="submit" disabled={saving || !fields.meeting_date || !fields.title.trim() || !fields.discussion_text.trim()}>{saving ? <><LoaderCircle size={15} className="spin" /> 저장 중</> : "회의록 저장"}</button></div></footer>
  </form></section></div>;
}

function DailyMeetingsView({ role, meetings, canWrite, onSave }) {
  const [editing, setEditing] = useState(undefined);
  const visibilityLabel = { CLIENT: "고객 공개", PROJECT_TEAM: "프로젝트 팀", POCKET_ONLY: "포켓 전용" };
  return <div className="view-stack daily-meeting-view"><ViewHeader eyebrow="업무 기록" title="데일리 회의록" description="날짜별 논의 내용, 결정사항과 후속 업무를 한곳에 남깁니다.">{canWrite && <button className="primary-button" type="button" onClick={() => setEditing(null)}><Plus size={15} /> 회의록 작성</button>}</ViewHeader>
    <section className="daily-meeting-summary"><article><span>전체 회의록</span><strong>{meetings.length}</strong><small>Google Sheets 저장 건수</small></article><article><span>최근 기록</span><strong>{meetings[0]?.date || "-"}</strong><small>{meetings[0]?.authorName || "기록 없음"}</small></article></section>
    {meetings.length ? <section className="daily-meeting-list">{meetings.map((meeting) => <article className="daily-meeting-card panel" key={meeting.id}><header><div className="daily-meeting-date"><CalendarDays size={17} /><span>{meeting.date}</span></div><div><span className="daily-meeting-visibility">{visibilityLabel[meeting.visibilityCode] || meeting.visibilityCode}</span>{canWrite && <button className="icon-button" type="button" onClick={() => setEditing(meeting)} aria-label={`${meeting.title} 수정`}><Pencil size={15} /></button>}</div></header><div className="daily-meeting-title"><h3>{meeting.title}</h3><span>{meeting.authorName}{meeting.attendees ? ` · 참석 ${meeting.attendees}` : ""}</span></div><div className="daily-meeting-sections"><section><h4>회의 내용</h4><p>{meeting.discussion}</p></section>{meeting.decisions && <section><h4>결정사항</h4><p>{meeting.decisions}</p></section>}{meeting.actionItems && <section className="is-action"><h4>후속 업무</h4><p>{meeting.actionItems}</p></section>}</div></article>)}</section> : <EmptyState title="작성된 회의록이 없습니다" description={canWrite ? "오늘 회의 내용을 첫 기록으로 남겨 주세요." : "운영팀이 회의록을 작성하면 이곳에 표시됩니다."} />}
    {editing !== undefined && <DailyMeetingModal meeting={editing} role={role} onClose={() => setEditing(undefined)} onSave={onSave} />}
  </div>;
}

function ContentView({ role, query, contents, onCreate, canWrite }) {
  const [channel, setChannel] = useState("전체");
  const channels = ["전체", ...new Set(contents.map((item) => item.channel))];
  const visibleContents = contents.filter((content) => (channel === "전체" || content.channel === channel) && (!query || `${content.title} ${content.channel}`.toLowerCase().includes(query.toLowerCase())));
  const published = contents.filter((item) => item.status === "완료").length;
  return <div className="view-stack"><ViewHeader eyebrow="콘텐츠 관리" title="콘텐츠" description="채널별 콘텐츠의 기획·검수·게시 상태를 확인합니다.">{role !== "client" && <CreateButton entityType="content" onOpen={onCreate} enabled={canWrite}>콘텐츠 추가</CreateButton>}</ViewHeader><section className="content-summary"><div className="content-summary-title"><span>현재 조회</span><strong>{published} / {contents.length}</strong><small>발행 완료 / 전체 콘텐츠</small></div></section><div className="filter-bar"><ListFilter size={16} /><div className="segmented-control">{channels.map((item) => <button key={item} className={channel === item ? "is-active" : ""} onClick={() => setChannel(item)}>{item}</button>)}</div><span className="result-count">{visibleContents.length}건 표시</span></div>{visibleContents.length ? <div className="content-grid">{visibleContents.map((content) => <article className="content-card" key={content.id}><header><span>{content.channel}</span><i className={statusClass[content.status] || "status status-muted"}>{content.status}</i></header><p>{content.format}</p><h3>{content.title}</h3><footer><span><CalendarDays size={14} /> {content.date}</span><span>{role === "client" ? "포켓컴퍼니" : content.owner}</span></footer></article>)}</div> : <EmptyState title="등록된 콘텐츠가 없습니다" description="선택한 조건에 해당하는 콘텐츠가 없습니다." />}</div>;
}

function KpiSettingsModal({ kpis, onClose, onSave, onArchive }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = kpis.find((item) => item.id === selectedId) || null;
  const [fields, setFields] = useState(() => kpiInitialFields());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const selectKpi = (kpi) => {
    setSelectedId(kpi?.id || null);
    setFields(kpiInitialFields(kpi));
    setError(null);
  };
  const setField = (name, value) => setFields((current) => ({ ...current, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const nextFields = kpiSubmissionFields(fields);
      if (!nextFields.metric_name) throw new Error("KPI 이름을 입력해 주세요.");
      await onSave(selected, nextFields);
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };
  const archive = async () => {
    if (!selected || !window.confirm(`‘${selected.name}’ KPI를 보관할까요?`)) return;
    setError(null);
    setSaving(true);
    try {
      await onArchive(selected);
      onClose();
    } catch (archiveError) {
      setError(archiveError);
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="create-modal kpi-settings-modal" role="dialog" aria-modal="true" aria-labelledby="kpi-settings-title"><header><div><p className="editorial-kicker">Google Sheets KPI 정의</p><h2 id="kpi-settings-title">핵심 KPI 설정</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="닫기"><X size={18} /></button></header><div className="kpi-settings-layout"><aside><button type="button" className={!selected ? "is-active" : ""} onClick={() => selectKpi(null)}><Plus size={15} /> 새 KPI</button>{kpis.map((kpi) => <button type="button" key={kpi.id} className={selected?.id === kpi.id ? "is-active" : ""} onClick={() => selectKpi(kpi)}><span><strong>{kpi.name}</strong><small>목표 {kpi.target.toLocaleString()}{kpi.unit}</small></span><Pencil size={14} /></button>)}</aside><form onSubmit={submit}>
    <label className="create-field is-wide"><span>KPI 이름</span><input autoFocus required maxLength={100} value={fields.metric_name} onChange={(event) => setField("metric_name", event.target.value)} placeholder="예: 쇼룸 방문 예약" /></label>
    <label className="create-field"><span>목표값</span><input type="number" min="0" step="any" required value={fields.target_value} onChange={(event) => setField("target_value", event.target.value)} placeholder="0" /></label>
    <FormSelect label="단위" value={fields.unit_code} onChange={(value) => setField("unit_code", value)} options={KPI_UNIT_OPTIONS} />
    <FormSelect label="측정 주기" value={fields.period_type_code} onChange={(value) => setField("period_type_code", value)} options={KPI_PERIOD_OPTIONS} />
    <FormSelect label="적용 채널" value={fields.channel_code} onChange={(value) => setField("channel_code", value)} options={KPI_CHANNEL_OPTIONS} />
    <label className="kpi-visibility-field is-wide"><input type="checkbox" checked={fields.customer_visible} onChange={(event) => setField("customer_visible", event.target.checked)} /><span><strong>고객사 화면에 공개</strong><small>끄면 포켓·NS 운영 계정에만 표시됩니다.</small></span></label>
    {error && <div className="form-error"><AlertCircle size={15} /><span>{error.message || "저장하지 못했습니다."}</span></div>}
    <footer>{selected ? <button className="danger-button" type="button" onClick={archive} disabled={saving}><Trash2 size={14} /> 보관</button> : <p>프로젝트별 KPI로 저장됩니다.</p>}<div><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>취소</button><button className="primary-button" type="submit" disabled={saving || !fields.metric_name.trim() || fields.target_value === ""}>{saving ? <><LoaderCircle size={15} className="spin" /> 저장 중</> : selected ? "변경 저장" : "KPI 추가"}</button></div></footer>
  </form></div></section></div>;
}

function PerformanceView({ performance, canWrite, onKpiSave, onKpiArchive }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const kpis = performance.items || [];
  const attained = kpis.filter((item) => item.target > 0).map((item) => Math.min(100, item.value / item.target * 100));
  const average = attained.length ? Math.round(attained.reduce((sum, value) => sum + value, 0) / attained.length) : 0;
  const channelTotals = (performance.channels || []).reduce((total, item) => ({ impressions: total.impressions + Number(item.impressions || 0), engagements: total.engagements + Number(item.engagements || 0), clicks: total.clicks + Number(item.clicks || 0), inquiries: total.inquiries + Number(item.inquiries || 0) }), { impressions: 0, engagements: 0, clicks: 0, inquiries: 0 });
  return <div className="view-stack"><ViewHeader eyebrow="성과 요약" title="성과" description="Google Sheets에 기록된 채널 성과를 목표 대비로 확인합니다."><button className="secondary-button" disabled><CalendarDays size={15} /> {performance.range ? `${performance.range.start} — ${performance.range.end}` : "최근 31일"}</button>{canWrite && <button className="primary-button" type="button" onClick={() => setSettingsOpen(true)}><Settings2 size={15} /> KPI 설정</button>}</ViewHeader><section className="performance-intro panel"><div><h3>핵심 KPI</h3><p>값이 없는 KPI는 0이 아니라 ‘데이터 없음’으로 구분됩니다.</p></div><div className="performance-score"><strong>{average}<small>%</small></strong><span>평균 달성률</span></div></section>{kpis.length ? <section className="kpi-grid">{kpis.map((kpi) => { const percent = kpi.target ? Math.min(100, Math.round(kpi.value / kpi.target * 100)) : 0; return <article key={kpi.id} className="kpi-card"><header><span>{kpi.state}</span></header><h3>{kpi.name}</h3><div className="kpi-value"><strong>{kpi.value.toLocaleString()}</strong><small>{kpi.unit}</small><span>/ 목표 {kpi.target.toLocaleString()}</span></div><ProgressBar value={percent} color={percent >= 70 ? "var(--success)" : "var(--accent)"} /><footer><span>{percent}% 달성</span><span>{kpi.source}</span></footer></article>; })}</section> : <EmptyState title="설정된 KPI가 없습니다" description={canWrite ? "KPI 설정에서 이 프로젝트의 핵심 목표를 추가해 주세요." : "운영팀이 KPI를 설정하면 이곳에 표시됩니다."} />}{(performance.channels || []).length > 0 && <section className="panel funnel-panel"><div className="panel-heading"><div><h3>채널 반응 흐름</h3></div><span className="panel-note">선택 기간 합계</span></div><div className="funnel-flow">{[{ label: "노출", value: channelTotals.impressions }, { label: "반응", value: channelTotals.engagements }, { label: "클릭", value: channelTotals.clicks }, { label: "문의", value: channelTotals.inquiries }].map((item, index) => <article key={item.label}><strong>{item.value.toLocaleString()}</strong><small>{item.label}</small>{index < 3 && <ArrowRight size={17} />}</article>)}</div></section>}{settingsOpen && <KpiSettingsModal kpis={kpis} onClose={() => setSettingsOpen(false)} onSave={onKpiSave} onArchive={onKpiArchive} />}</div>;
}

function TrackingTrendChart({ rows, metric }) {
  const series = dailyMetricSeries(rows, metric);
  if (!series.length) return <EmptyState title="추이 데이터가 없습니다" description="12_성과일별 원장에 날짜별 성과를 입력하면 선 그래프가 표시됩니다." />;
  const width = 760;
  const height = 230;
  const horizontalPadding = 24;
  const verticalPadding = 28;
  const maximum = Math.max(...series.map((item) => item.value), 1);
  const points = series.map((item, index) => ({
    ...item,
    x: horizontalPadding + (series.length === 1 ? (width - horizontalPadding * 2) / 2 : index / (series.length - 1) * (width - horizontalPadding * 2)),
    y: height - verticalPadding - item.value / maximum * (height - verticalPadding * 2),
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const labels = points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 5)) === 0);
  return <div className="tracking-chart-wrap"><svg className="tracking-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${TRACKING_METRICS.find((item) => item.id === metric)?.label || metric} 일별 추이`}><line x1={horizontalPadding} y1={height - verticalPadding} x2={width - horizontalPadding} y2={height - verticalPadding} className="tracking-chart-axis" /><polyline points={line} className="tracking-chart-line" />{points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="3.5" className="tracking-chart-point"><title>{point.date} · {point.value.toLocaleString()}</title></circle>)}{labels.map((point) => <text key={`label-${point.date}`} x={point.x} y={height - 6} textAnchor="middle">{point.date.slice(5).replace("-", ".")}</text>)}</svg><div className="tracking-chart-scale"><strong>{maximum.toLocaleString()}</strong><span>0</span></div></div>;
}

function TrackingView({ tracking }) {
  const [metric, setMetric] = useState("impressions");
  const totals = tracking.totals || {};
  const funnel = trackingFunnel(totals);
  const signals = trackingSignals({ totals, channels: tracking.channels || [] });
  const firstStage = funnel[0]?.value || 0;
  const latestPerformanceDate = (tracking.daily || []).at(-1)?.date || null;
  const dataAvailable = tracking.dataAvailable !== false && (tracking.daily || []).length > 0;
  const metricValue = (value, suffix = "") => dataAvailable ? `${Number(value || 0).toLocaleString()}${suffix}` : "—";
  const formatMoney = (value) => `${Math.round(Number(value || 0)).toLocaleString()}원`;
  return <div className="view-stack tracking-view"><ViewHeader eyebrow="Outcome tracking" title="성과 추적" description="실행이 콘텐츠 발행과 실제 반응·문의로 이어지는지 확인합니다."><button className="secondary-button" disabled><CalendarDays size={15} /> {tracking.range ? `${tracking.range.start} — ${tracking.range.end}` : "최근 90일"}</button></ViewHeader>
    <section className={`tracking-source-notice ${dataAvailable ? "is-ready" : "is-empty"}`}><span /><div><strong>{dataAvailable ? "Google Sheets 성과 원장 연결됨" : "Google Sheets 연결됨 · 성과 데이터 0건"}</strong><p>{dataAvailable ? `${tracking.source || "12_성과일별"}에서 ${tracking.daily.length}일·${tracking.channels.length}개 채널을 집계했습니다.` : `${tracking.source || "12_성과일별"}에 현재 프로젝트의 일별 성과 행이 없습니다. 값이 입력되면 이 화면에 바로 집계됩니다.`}</p></div></section>
    <section className="tracking-score-grid">
      <article><span className="tracking-score-icon"><BarChart3 size={17} /></span><div><small>총 광고비</small><strong>{dataAvailable ? formatMoney(totals.spend) : "—"}</strong><p>{dataAvailable ? "선택 기간 합계" : "데이터 없음"}</p></div></article>
      <article><span className="tracking-score-icon is-purple"><Activity size={17} /></span><div><small>총 노출</small><strong>{metricValue(totals.impressions)}</strong><p>{dataAvailable ? "매체 일별 원장 합계" : "데이터 없음"}</p></div></article>
      <article><span className="tracking-score-icon is-cyan"><MousePointerClick size={17} /></span><div><small>클릭</small><strong>{metricValue(totals.clicks)}</strong><p>{dataAvailable ? "선택 기간 합계" : "데이터 없음"}</p></div></article>
      <article><span className="tracking-score-icon is-green"><TrendingUp size={17} /></span><div><small>문의·전환</small><strong>{dataAvailable ? <>{metricValue(totals.inquiries)}<em> / {metricValue(totals.conversions)}</em></> : "—"}</strong><p>{dataAvailable ? "문의 / 최종 전환" : "데이터 없음"}</p></div></article>
    </section>
    <section className="tracking-main-grid">
      <article className="panel tracking-funnel-panel"><div className="panel-heading"><div><h3>성과 흐름</h3><p>각 단계는 직전 단계 대비 전환율입니다.</p></div><span className="panel-note">12_성과일별 합계</span></div>{firstStage > 0 ? <div className="tracking-funnel-list">{funnel.map((stage, index) => <div className="tracking-funnel-stage" key={stage.id}><div className="tracking-funnel-label"><span>{index + 1}</span><strong>{stage.label}</strong><b>{stage.value.toLocaleString()}</b></div><div className="tracking-funnel-bar"><i style={{ width: `${Math.max(3, stage.value / firstStage * 100)}%` }} /></div><div className="tracking-funnel-rate">{stage.conversionRate === null ? "시작 단계" : `${stage.conversionRate.toFixed(1)}% 전환`}</div></div>)}</div> : <EmptyState title="성과 흐름 데이터가 없습니다" description="노출·반응·클릭·문의가 기록되면 단계별 전환을 계산합니다." />}</article>
      <article className="panel tracking-signal-panel"><div className="panel-heading"><div><h3>현재 성과 신호</h3><p>고정 문구가 아닌 선택 기간의 원장값으로 판정합니다.</p></div></div>{signals.length ? <div className="tracking-signal-list">{signals.map((signal) => <div key={signal.id} className={`tracking-signal is-${signal.tone}`}><span /><div><small>{signal.label}</small><strong>{signal.value}</strong><p>{signal.detail}</p></div></div>)}</div> : <EmptyState title="판정할 데이터가 없습니다" description="성과와 실행 데이터가 쌓이면 병목과 기여 채널을 표시합니다." />}</article>
    </section>
    <section className="panel tracking-trend-panel"><div className="panel-heading"><div><h3>일별 성과 추이</h3><p>급증·하락이 발생한 날짜를 확인합니다.</p></div><div className="tracking-metric-tabs">{TRACKING_METRICS.map((item) => <button type="button" key={item.id} className={metric === item.id ? "is-active" : ""} onClick={() => setMetric(item.id)}>{item.label}</button>)}</div></div><TrackingTrendChart rows={tracking.daily || []} metric={metric} /></section>
    <section className="tracking-bottom-grid"><article className="panel tracking-channel-panel"><div className="panel-heading"><div><h3>채널별 성과 기여</h3><p>비용과 문의 성과를 같은 기준으로 비교합니다.</p></div></div>{(tracking.channels || []).length ? <div className="tracking-table-scroll"><table className="tracking-channel-table"><thead><tr><th>채널</th><th>광고비</th><th>노출</th><th>반응</th><th>클릭</th><th>CTR</th><th>문의</th><th>문의당 비용</th></tr></thead><tbody>{tracking.channels.map((channel) => { const ctr = channel.impressions ? channel.clicks / channel.impressions * 100 : null; const cpl = channel.inquiries ? channel.spend / channel.inquiries : null; return <tr key={channel.channelCode}><td><span className="tracking-channel-dot" />{channel.label}</td><td>{formatMoney(channel.spend)}</td><td>{channel.impressions.toLocaleString()}</td><td>{channel.engagements.toLocaleString()}</td><td>{channel.clicks.toLocaleString()}</td><td>{ctr === null ? "-" : `${ctr.toFixed(2)}%`}</td><td><strong>{channel.inquiries.toLocaleString()}</strong></td><td>{cpl === null ? "-" : formatMoney(cpl)}</td></tr>; })}</tbody></table></div> : <EmptyState title="채널별 데이터가 없습니다" description="성과일별 원장에 채널 코드와 실적을 입력하면 비교표가 표시됩니다." />}</article>
      <article className="panel tracking-goal-panel"><div className="panel-heading"><div><h3>데이터 상태</h3><p>화면에 사용된 Google Sheets 원장 범위입니다.</p></div></div><div className="tracking-data-state"><div><span>원장</span><strong>12_성과일별</strong></div><div><span>최신 실적일</span><strong>{latestPerformanceDate || "데이터 없음"}</strong></div><div><span>기록 일수</span><strong>{(tracking.daily || []).length.toLocaleString()}일</strong></div><div><span>집계 채널</span><strong>{(tracking.channels || []).length.toLocaleString()}개</strong></div></div></article></section>
  </div>;
}

function AccessAccountModal({ account, projects, onClose, onSave }) {
  const firstAccess = account?.accesses?.[0] || null;
  const [fields, setFields] = useState(() => ({
    account: account?.account || "",
    displayName: account?.displayName || "",
    accessCode: "",
    projectId: firstAccess?.projectId || projects[0]?.id || "",
    membershipId: firstAccess?.id || "",
    allowedPages: normalizeAllowedPages(firstAccess?.allowedPages?.length ? firstAccess.allowedPages : ["overview", "plan", "tasks", "content", "tracking", "performance", "files"]),
    enabled: account?.enabled !== false,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const setField = (key, value) => setFields((current) => ({ ...current, [key]: value }));
  const togglePage = (page) => setFields((current) => ({
    ...current,
    allowedPages: current.allowedPages.includes(page)
      ? current.allowedPages.filter((item) => item !== page)
      : normalizeAllowedPages([...current.allowedPages, page]),
  }));
  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!account && !fields.accessCode) return setError(new Error("신규 계정의 임시 비밀번호를 입력해 주세요."));
    if (!fields.allowedPages.length) return setError(new Error("접근 가능한 페이지를 하나 이상 선택해 주세요."));
    setSaving(true);
    try {
      await onSave(accountSubmission(fields));
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };
  const disable = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...accountSubmission(fields), operation: "DISABLE", enabled: false });
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };
  const removeAccess = async (access) => {
    if (!window.confirm(`${access.projectName} 접근 권한을 제거할까요? 계정의 다른 프로젝트 권한은 유지됩니다.`)) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(removeAccessSubmission(fields, access));
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="create-modal access-account-modal" role="dialog" aria-modal="true" aria-labelledby="access-account-title"><header><div><p className="editorial-kicker">Google Sheets 계정·권한 원장</p><h2 id="access-account-title">{account ? "고객사 계정 관리" : "고객사 계정 생성"}</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="닫기"><X size={18} /></button></header><form onSubmit={submit}>
    <div className="access-form-grid"><label className="create-field"><span>로그인 아이디</span><input value={fields.account} onChange={(event) => setField("account", event.target.value)} placeholder="예: und-client" disabled={Boolean(account)} required /></label><label className="create-field"><span>표시 이름</span><input value={fields.displayName} onChange={(event) => setField("displayName", event.target.value)} placeholder="예: UND 담당자" required /></label><label className="create-field"><span>{account ? "새 비밀번호 · 변경할 때만" : "임시 비밀번호"}</span><input type="password" autoComplete="new-password" value={fields.accessCode} onChange={(event) => setField("accessCode", event.target.value)} placeholder="8자 이상" required={!account} /></label><FormSelect label="계정 상태" value={fields.enabled ? "ACTIVE" : "DISABLED"} onChange={(value) => setField("enabled", value === "ACTIVE")} options={[["ACTIVE", "사용 중"], ["DISABLED", "사용 중지"]]} /><FormSelect label="접근 프로젝트" value={fields.projectId} onChange={(value) => setField("projectId", value)} options={projects.map((project) => [project.id, project.name])} /></div>
    <fieldset className="access-page-fieldset"><legend>접근 가능한 페이지</legend><p>체크하지 않은 페이지는 메뉴에서 숨기고 서버 조회도 차단합니다.</p><div>{ACCESS_PAGE_OPTIONS.map((page) => <label key={page.id}><input type="checkbox" checked={fields.allowedPages.includes(page.id)} onChange={() => togglePage(page.id)} /><span>{page.label}</span></label>)}</div></fieldset>
    {account?.accesses?.length > 0 && <section className="access-current-projects"><strong>현재 프로젝트 권한</strong><div>{account.accesses.map((access) => <article key={access.id}><span><b>{access.projectName}</b><small>{access.allowedPages.length}개 페이지</small></span><button type="button" className="danger-button" disabled={saving} onClick={() => removeAccess(access)}>이 프로젝트 권한 제거</button></article>)}</div></section>}
    {error && <div className="form-error"><AlertCircle size={14} />{error.message}</div>}
    <footer>{account && <button type="button" className="danger-button" onClick={disable} disabled={saving || !fields.projectId}>계정 비활성화</button>}<span /><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>취소</button><button className="primary-button" type="submit" disabled={saving || !fields.account.trim() || !fields.displayName.trim() || !fields.projectId || !fields.allowedPages.length}>{saving ? <><LoaderCircle size={15} className="spin" /> 저장 중</> : "권한 저장"}</button></footer>
  </form></section></div>;
}

function PermissionsView({ access, onSave }) {
  const [editing, setEditing] = useState(undefined);
  const accounts = access.accounts || [];
  const pageLabel = Object.fromEntries(ACCESS_PAGE_OPTIONS.map((page) => [page.id, page.label]));
  const activeCount = accounts.filter((account) => account.enabled).length;
  return <div className="view-stack"><ViewHeader eyebrow="고객 계정 관리" title="권한 관리" description="고객사 계정을 만들고 프로젝트별로 볼 수 있는 페이지를 지정합니다."><button className="primary-button" type="button" onClick={() => setEditing(null)}><Plus size={15} /> 고객사 계정 생성</button></ViewHeader><section className="access-summary"><article><span>고객 계정</span><strong>{accounts.length}</strong></article><article><span>활성 계정</span><strong>{activeCount}</strong></article><article><span>배정 프로젝트</span><strong>{access.projects?.length || 0}</strong></article></section><section className="panel access-panel"><div className="panel-heading"><div><h3>계정별 접근 범위</h3><p>비밀번호 원문은 저장하거나 다시 표시하지 않습니다.</p></div></div>{accounts.length ? <div className="access-account-list">{accounts.map((account) => {
    const primaryAccess = account.accesses?.[0];
    return <button type="button" key={account.id} className="access-account-row" onClick={() => setEditing(account)}><span className={`access-account-state ${account.enabled ? "is-active" : ""}`}><ShieldCheck size={16} /></span><span className="access-account-identity"><strong>{account.displayName}</strong><small>{account.account}</small></span><span className="access-account-project"><small>프로젝트</small><strong>{primaryAccess?.projectName || "미배정"}</strong></span><span className="access-page-badges">{(primaryAccess?.allowedPages || []).map((page) => <i key={page}>{pageLabel[page] || page}</i>)}</span><span className={`status ${account.enabled ? "status-success" : "status-muted"}`}>{account.enabled ? "사용 중" : "중지"}</span><Pencil size={15} /></button>;
  })}</div> : <EmptyState title="등록된 고객사 계정이 없습니다" description="고객사 계정 생성 버튼에서 첫 계정을 추가하세요." />}</section>{editing !== undefined && <AccessAccountModal account={editing} projects={access.projects || []} onClose={() => setEditing(undefined)} onSave={onSave} />}</div>;
}

function FilesView({ role, files, activities, onCreate, canWrite }) {
  return <div className="view-stack"><ViewHeader eyebrow="자료 관리" title="자료·활동" description="공유 자료와 Google Sheets 변경 이력을 확인합니다.">{role !== "client" && <CreateButton entityType="file" onOpen={onCreate} enabled={canWrite}>자료 등록</CreateButton>}</ViewHeader><section className="overview-grid file-grid"><div className="panel"><div className="panel-heading"><div><h3>최근 자료</h3></div><FileText size={17} /></div>{files.length ? <div className="file-list">{files.map((file) => <a key={file.id} href={file.url || undefined} target={file.url ? "_blank" : undefined} rel="noreferrer" className={!file.url ? "is-disabled" : ""}><span className="file-icon"><FileText size={17} /></span><span><strong>{file.title}</strong><small>{file.type} · {file.date}</small></span><i>{file.visibility}</i><ArrowRight size={14} /></a>)}</div> : <EmptyState title="등록된 자료가 없습니다" description="파일 링크가 원장에 등록되면 표시됩니다." />}</div><div className="panel"><div className="panel-heading"><div><h3>활동 기록</h3></div><Activity size={17} /></div>{activities.length ? <div className="activity-timeline">{activities.map((item) => <article key={item.id}><span /><div><strong>{item.title}</strong><p>{item.meta}</p>{role !== "client" && item.internalMeta && <small>{item.internalMeta}</small>}</div></article>)}</div> : <EmptyState title="활동 기록이 없습니다" description="웹과 원장의 변경 이력이 표시됩니다." />}</div></section></div>;
}

const PLAN_ALLOWED_TAGS = new Set([
  "a", "article", "b", "blockquote", "br", "dd", "div", "dl", "dt", "em", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "li", "ol", "p", "section", "small", "span",
  "strong", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);
const PLAN_BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "option", "svg", "math"]);

function sanitizePlanHtml(value) {
  if (!value || typeof window === "undefined" || typeof window.DOMParser !== "function") return "";
  const documentNode = new window.DOMParser().parseFromString(`<div>${String(value)}</div>`, "text/html");
  const root = documentNode.body.firstElementChild;
  if (!root) return "";

  Array.from(root.querySelectorAll("*")).forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (PLAN_BLOCKED_TAGS.has(tagName)) {
      element.remove();
      return;
    }
    if (!PLAN_ALLOWED_TAGS.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const allowedTableAttribute = ["colspan", "rowspan", "scope"].includes(name);
      if (tagName === "a" && name === "href") {
        const href = attribute.value.trim();
        if (!/^(https?:|mailto:|#)/i.test(href)) element.removeAttribute(attribute.name);
        return;
      }
      if (tagName === "a" && name === "target") {
        if (attribute.value !== "_blank") element.removeAttribute(attribute.name);
        return;
      }
      if (!allowedTableAttribute) element.removeAttribute(attribute.name);
    });
    if (tagName === "a" && element.getAttribute("target") === "_blank") element.setAttribute("rel", "noopener noreferrer");
  });

  return root.innerHTML;
}

function isRecentPlanSection(value, now = Date.now()) {
  if (!value) return false;
  const updatedAt = new Date(value).getTime();
  if (!Number.isFinite(updatedAt)) return false;
  const age = now - updatedAt;
  return age >= 0 && age <= 24 * 60 * 60 * 1000;
}

function PlanView({ plan, project, planVariant }) {
  const sections = plan.sections || [];
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id || "");

  useEffect(() => {
    if (!sections.some((section) => section.id === activeSectionId)) setActiveSectionId(sections[0]?.id || "");
  }, [sections, activeSectionId]);

  const activeSection = sections.find((section) => section.id === activeSectionId) || sections[0] || null;
  const activeSectionIsNew = isRecentPlanSection(activeSection?.updatedAt);
  const safeBodyHtml = useMemo(() => sanitizePlanHtml(activeSection?.bodyHtml), [activeSection?.bodyHtml]);
  const planProjectName = plan.title || plan.project?.project_name || plan.project?.projectName || plan.project?.name || project.name;

  const isInternal = planVariant === "internal";

  return <div className="view-stack plan-view">
    <section className="plan-summary panel">
      <div className="plan-summary-copy"><span>{isInternal ? "내부 실행계획" : "클라이언트 공유용"}</span><h2>{planProjectName}</h2><p>{plan.summary || (isInternal ? "실행 담당자가 사용하는 세부 범위와 단계별 계획을 확인합니다." : "고객사와 합의한 실행 범위와 단계별 계획을 확인합니다.")}</p></div>
      <dl><div><dt>계획 구간</dt><dd>{sections.length}개 섹션</dd></div><div><dt>기준 버전</dt><dd>{plan.sourceVersion || "현재 승인본"}</dd></div><div><dt>최근 반영</dt><dd>{plan.updatedAtLabel}</dd></div></dl>
    </section>
    {sections.length ? <section className="plan-layout">
      <nav className="plan-section-nav panel" aria-label="실행계획 목차">
        <span>목차</span>
        {sections.map((section) => <button key={section.id} type="button" className={section.id === activeSection?.id ? "is-active" : ""} onClick={() => setActiveSectionId(section.id)} aria-current={section.id === activeSection?.id ? "page" : undefined}><strong>{section.title}</strong>{isRecentPlanSection(section.updatedAt) && <span className="plan-new-badge" title="24시간 이내 변경된 섹션">신규</span>}</button>)}
      </nav>
      <article className="plan-document panel">
        <header><div><span>{activeSection?.code || "실행계획"}</span><h3>{activeSection?.title}{activeSectionIsNew && <span className="plan-new-badge" title="24시간 이내 변경된 섹션">신규</span>}</h3></div><small>{sections.findIndex((section) => section.id === activeSection?.id) + 1} / {sections.length}</small></header>
        <div className="plan-document-body" dangerouslySetInnerHTML={{ __html: safeBodyHtml }} />
      </article>
    </section> : <EmptyState title={isInternal ? "등록된 내부 실행계획이 없습니다" : "공유된 실행계획이 없습니다"} description={isInternal ? "내부 실행계획이 등록되면 이곳에 표시됩니다." : "클라이언트 공유용 승인본이 등록되면 이곳에 표시됩니다."} />}
  </div>;
}

function AppContent({ view, planVariant, project, role, search, setView, pageState, taskActivityState, onLoadTaskActivity, onRetry, onCreate, onTaskUpdate, onProjectUpdate, onDailyMeetingSave, onKpiSave, onKpiArchive, onAccessSave, canWrite }) {
  if (pageState.status === "loading" && !pageState.data) return <LoadingState />;
  if (pageState.status === "error" && !pageState.data) return <ErrorState error={pageState.error} onRetry={onRetry} />;
  const data = pageState.data || {};
  if (view === "plan") return <PlanView plan={data} project={project} planVariant={planVariant} />;
  if (view === "tasks" || view === "schedule") return <TasksView role={role} query={search} taskPage={{ ...data, project: data.project || { id: project.id, phaseCode: project.phaseCode, phase: project.phase, startDate: project.startDate, endDate: project.endDate, rowVersion: project.rowVersion } }} activityState={taskActivityState} onLoadActivity={onLoadTaskActivity} onCreate={onCreate} onUpdate={onTaskUpdate} onProjectUpdate={onProjectUpdate} canWrite={canWrite} initialSection={view === "schedule" ? "schedule" : "list"} />;
  if (view === "daily") return <DailyMeetingsView role={role} meetings={data.items || []} canWrite={canWrite && role !== "client"} onSave={onDailyMeetingSave} />;
  if (view === "content") return <ContentView role={role} query={search} contents={data.items || []} onCreate={onCreate} canWrite={canWrite} />;
  if (view === "tracking") return <TrackingView tracking={data} />;
  if (view === "performance") return <PerformanceView performance={data} canWrite={canWrite && role !== "client"} onKpiSave={onKpiSave} onKpiArchive={onKpiArchive} />;
  if (view === "permissions") return role === "pocket" ? <PermissionsView access={data} onSave={onAccessSave} /> : <ErrorState error={new Error("포켓 운영 계정만 접근할 수 있습니다.")} />;
  if (view === "files") return <FilesView role={role} files={data.files?.items || []} activities={data.activities?.items || []} onCreate={onCreate} canWrite={canWrite} />;
  return <OverviewView project={data.project || project} role={role} activities={data.activities || []} onNavigate={setView} />;
}

const blankPage = { status: "idle", data: null, error: null, resource: null, projectId: null };
const blankTaskActivity = { status: "idle", data: null, error: null, projectId: null };
const RESOURCE_CACHE_TTL_MS = 10 * 60_000;
const BOOTSTRAP_SESSION_CACHE_KEY = "pocket-marketing-hub.bootstrap.v1";

function readBootstrapSessionCache(session) {
  try {
    const raw = globalThis.sessionStorage?.getItem(BOOTSTRAP_SESSION_CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    if (!cached?.envelope || !cached?.userId || cached.userId !== session?.user?.userId) return null;
    if (Date.now() - Number(cached.cachedAt || 0) > RESOURCE_CACHE_TTL_MS) return null;
    return cached.envelope;
  } catch {
    return null;
  }
}

function writeBootstrapSessionCache(session, envelope) {
  try {
    if (!session?.user?.userId || !envelope) return;
    globalThis.sessionStorage?.setItem(BOOTSTRAP_SESSION_CACHE_KEY, JSON.stringify({
      userId: session.user.userId,
      cachedAt: Date.now(),
      envelope,
    }));
  } catch {}
}

function clearBootstrapSessionCache() {
  try { globalThis.sessionStorage?.removeItem(BOOTSTRAP_SESSION_CACHE_KEY); } catch {}
}

export function App() {
  const [{ source, error: configError }] = useState(sourceFactory);
  const [sourceState, setSourceState] = useState(() => source?.getState() || { mode: "live", phase: "error", error: configError });
  // A valid server-issued preview session is safe to reuse. The backend still
  // revalidates its project scope on every read, while the browser avoids an
  // unnecessary session round trip on each refresh.
  const [session, setSession] = useState(() => source?.getSession() || null);
  const [loginError, setLoginError] = useState(null);
  const [bootstrapState, setBootstrapState] = useState(blankPage);
  const [overviewState, setOverviewState] = useState(blankPage);
  const [resourceState, setResourceState] = useState(blankPage);
  const [taskActivityState, setTaskActivityState] = useState(blankTaskActivity);
  const [activeClient, setActiveClient] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const initialLocation = typeof window !== "undefined" ? parseViewLocation(window.location.hash) : { view: "overview", planVariant: DEFAULT_PLAN_VARIANT };
  const [view, setView] = useState(initialLocation.view);
  const [planVariant, setPlanVariant] = useState(initialLocation.planVariant);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopNavigationLevel, setDesktopNavigationLevel] = useState(0);
  const [bootstrapRetryKey, setBootstrapRetryKey] = useState(0);
  const [pageRefreshKey, setPageRefreshKey] = useState(0);
  const [createEntity, setCreateEntity] = useState(null);
  const [saveNotice, setSaveNotice] = useState(null);
  const activeProjectIdRef = useRef(null);
  const pageRefreshKeyRef = useRef(pageRefreshKey);
  const initializationRequestRef = useRef(null);
  const resourceCacheRef = useRef(new Map());
  const resourceRequestRef = useRef(new Map());
  const resourceCacheEpochRef = useRef(0);
  const taskActivityRequestRef = useRef(null);
  const live = Boolean(source);
  const compactViewport = useMediaQuery("(max-width: 900px)");
  const actorRole = bootstrapState.data?.actor?.role || "client";
  const navigation = getNavigationPresentation({
    role: actorRole,
    compactViewport,
    desktopLevel: desktopNavigationLevel,
    drawerOpen: sidebarOpen,
  });
  const authorizedPlanVariant = planVariant;
  const activeResource = viewResourceKey(view, authorizedPlanVariant);
  pageRefreshKeyRef.current = pageRefreshKey;

  useEffect(() => source?.subscribe(setSourceState), [source]);
  useEffect(() => {
    if (live && session && sourceState.user === null && sourceState.error?.code === "unauthorized" && source.config.loginEnabled) {
      setSession(null);
    }
  }, [live, session, source, sourceState.user, sourceState.error]);
  useEffect(() => {
    if (!saveNotice) return undefined;
    const timeout = window.setTimeout(() => setSaveNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);
  useEffect(() => {
    if (!navigation.usesDrawer && sidebarOpen) setSidebarOpen(false);
  }, [navigation.usesDrawer, sidebarOpen]);
  useEffect(() => {
    if (!navigation.isDrawerOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navigation.isDrawerOpen]);
  useEffect(() => {
    if (bootstrapState.status !== "ready" || actorRole !== "client" || !activeProjectId) return;
    const allowedPages = bootstrapState.data?.projects?.[activeProjectId]?.allowedPages || [];
    if (isViewAllowed(view, allowedPages)) return;
    const fallbackView = firstAllowedView(allowedPages);
    setView(fallbackView);
    setPlanVariant(DEFAULT_PLAN_VARIANT);
  }, [bootstrapState.status, bootstrapState.data, actorRole, activeProjectId, view]);

  const applyBootstrapEnvelope = useCallback((envelope) => {
    const data = bootstrapViewModel(envelope);
    writeBootstrapSessionCache(source?.getSession(), envelope);
    const currentProjectId = activeProjectIdRef.current;
    const nextProjectId = data.projects[currentProjectId]
      ? currentProjectId
      : data.clients[0]?.projectId || Object.keys(data.projects)[0] || null;
    setBootstrapState({ status: "ready", data, error: null });
    setActiveClient((current) => data.clients.some((item) => item.id === current) ? current : data.clients[0]?.id || null);
    setActiveProjectId(nextProjectId);
    activeProjectIdRef.current = nextProjectId;

    setOverviewState(blankPage);
    setResourceState(blankPage);
    setTaskActivityState(blankTaskActivity);
    taskActivityRequestRef.current = null;
    resourceCacheEpochRef.current += 1;
    resourceCacheRef.current.clear();
    resourceRequestRef.current.clear();
    if (data.initial?.projectId === nextProjectId) {
      const initialState = {
        status: "ready",
        data: data.initial.data,
        error: null,
        resource: data.initial.view,
        projectId: nextProjectId,
        refreshKey: pageRefreshKeyRef.current,
      };
      if (data.initial.view === "overview") {
        setOverviewState(initialState);
      } else {
        resourceCacheRef.current.set(`${nextProjectId}:${data.initial.view}`, {
          state: initialState,
          cachedAt: Date.now(),
          refreshKey: pageRefreshKeyRef.current,
        });
        setResourceState(initialState);
      }
    }
    return data;
  }, [source]);

  const loadBootstrap = useCallback(async (signal) => {
    if (!source || !source.getSession()) return;
    setBootstrapState({ status: "loading", data: null, error: null });
    try {
      const envelope = await source.bootstrap({ signal, initialView: view });
      if (signal?.aborted) return;
      applyBootstrapEnvelope(envelope);
    } catch (error) {
      if (signal?.aborted) return;
      if (error.code === "unauthorized") {
        if (!source.config.loginEnabled) setLoginError(error);
        setSession(null);
      }
      setBootstrapState({ status: "error", data: null, error });
    }
  }, [source, applyBootstrapEnvelope, view]);

  useEffect(() => {
    if (!source) return undefined;
    let active = true;
    const initialize = async () => {
      const storedSession = source.getSession();
      if (!storedSession && source.config.loginEnabled) return;
      const cachedBootstrap = storedSession ? readBootstrapSessionCache(storedSession) : null;
      if (cachedBootstrap) {
        applyBootstrapEnvelope(cachedBootstrap);
        setSession(storedSession);
      }
      const requestKey = `${bootstrapRetryKey}:${storedSession ? "session" : "preview"}`;
      if (!initializationRequestRef.current || initializationRequestRef.current.key !== requestKey) {
        setLoginError(null);
        if (!cachedBootstrap) setBootstrapState({ status: "loading", data: null, error: null });
        initializationRequestRef.current = {
          key: requestKey,
          promise: storedSession
            ? source.bootstrap({ initialView: view }).catch((error) => {
              if (source.config.loginEnabled || error.code !== "unauthorized") throw error;
              source.logout();
              return Promise.all([
                source.previewBootstrap(),
                view === "overview" ? source.previewOverview().catch(() => null) : Promise.resolve(null),
              ]).then(([bootstrap, overview]) => ({ bootstrap, overview }));
            })
            : Promise.all([
              source.previewBootstrap(),
              view === "overview" ? source.previewOverview().catch(() => null) : Promise.resolve(null),
            ]).then(([bootstrap, overview]) => ({ bootstrap, overview })),
        };
      }
      try {
        const result = await initializationRequestRef.current.promise;
        if (!active) return;
        const envelope = result?.bootstrap || result;
        setSession(source.getSession());
        const bootstrapData = applyBootstrapEnvelope(envelope);
        if (result?.overview) {
          const overviewProjectId = result.overview.scope?.projectId || result.overview.data?.project?.project_id || null;
          const baseProject = bootstrapData.projects[overviewProjectId] || null;
          setOverviewState({
            status: "ready",
            data: overviewViewModel(result.overview, baseProject),
            error: null,
            resource: "overview",
            projectId: overviewProjectId,
            refreshKey: pageRefreshKey,
          });
        }
      } catch (error) {
        if (!active) return;
        initializationRequestRef.current = null;
        setLoginError(error);
        setBootstrapState({ status: "error", data: null, error });
      }
    };
    initialize();
    // React StrictMode replays effects in local development. Keep the single
    // server request alive and let the replay subscribe to the same promise;
    // aborting here makes Apps Script continue working while the browser starts
    // an identical second request.
    return () => { active = false; };
  }, [source, applyBootstrapEnvelope, bootstrapRetryKey]);

  useEffect(() => {
    if (!source || !activeProjectId || view !== "overview" || bootstrapState.status !== "ready") return undefined;
    if (overviewState.status === "ready" && overviewState.projectId === activeProjectId && overviewState.refreshKey === pageRefreshKey) return undefined;
    const controller = new AbortController();
    setOverviewState({ status: "loading", data: null, error: null, resource: "overview", projectId: activeProjectId });
    source.overview({ projectId: activeProjectId, signal: controller.signal }).then((envelope) => setOverviewState({ status: "ready", data: overviewViewModel(envelope, bootstrapState.data.projects[activeProjectId]), error: null, resource: "overview", projectId: activeProjectId, refreshKey: pageRefreshKey })).catch((error) => { if (!controller.signal.aborted) { if (error.code === "unauthorized") setSession(null); setOverviewState({ status: "error", data: null, error, resource: "overview", projectId: activeProjectId, refreshKey: pageRefreshKey }); } });
    return () => controller.abort();
  }, [source, activeProjectId, view, bootstrapState.status, bootstrapState.data, overviewState.status, overviewState.projectId, pageRefreshKey]);

  useEffect(() => {
    if (!source || !activeProjectId || view === "overview" || bootstrapState.status !== "ready") return undefined;
    const cacheKey = `${activeProjectId}:${activeResource}`;
    const cached = resourceCacheRef.current.get(cacheKey) || null;
    const cachedState = cached?.state || null;
    const cacheIsFresh = Boolean(
      cached &&
      cached.refreshKey === pageRefreshKey &&
      Date.now() - cached.cachedAt < RESOURCE_CACHE_TTL_MS
    );
    if (cachedState) setResourceState(cachedState);
    if (cacheIsFresh) return undefined;
    if (!cachedState) setResourceState({ status: "loading", data: null, error: null, resource: activeResource, projectId: activeProjectId, refreshKey: pageRefreshKey });
    const params = { projectId: activeProjectId, limit: 200 };
    const requestKey = `${cacheKey}:${pageRefreshKey}`;
    const requestEpoch = resourceCacheEpochRef.current;
    let request = resourceRequestRef.current.get(requestKey);
    if (!request) {
      const fallback = () => {
        if (view === "plan") return source.plan({ ...params, planType: PLAN_VARIANTS[authorizedPlanVariant].apiValue }).then(planViewModel);
        if (view === "tasks" || view === "schedule") return source.tasks(params).then(tasksViewModel);
        if (view === "daily") return source.dailyMeetings({ ...params, limit: 100 }).then(dailyMeetingsViewModel);
        if (view === "content") return source.contents(params).then(contentsViewModel);
        if (view === "tracking") return source.tracking(params).then(performanceTrackingViewModel);
        if (view === "performance") return source.performance(params).then(performanceViewModel);
        if (view === "files") return Promise.all([source.files(params), source.activity(params)]).then(([files, activity]) => ({ files: filesViewModel(files), activities: activityListViewModel(activity) }));
        if (view === "permissions") return source.permissions().then(accessAdminViewModel);
        return Promise.reject(new Error(`Unsupported resource: ${view}`));
      };
      // Focused endpoints keep each tab payload bounded and avoid an expensive
      // all-tab project snapshot before the requested screen is usable.
      request = fallback();
      resourceRequestRef.current.set(requestKey, request);
      request.finally(() => {
        if (resourceRequestRef.current.get(requestKey) === request) resourceRequestRef.current.delete(requestKey);
      }).catch(() => {});
    }
    let active = true;
    request.then((data) => {
      if (resourceCacheEpochRef.current !== requestEpoch) return;
      const nextState = { status: "ready", data, error: null, resource: activeResource, projectId: activeProjectId, refreshKey: pageRefreshKey };
      const currentCache = resourceCacheRef.current.get(cacheKey);
      if (!currentCache || currentCache.refreshKey <= pageRefreshKey) {
        resourceCacheRef.current.set(cacheKey, { state: nextState, cachedAt: Date.now(), refreshKey: pageRefreshKey });
      }
      if (active) setResourceState(nextState);
    }).catch((error) => {
      if (!active) return;
      if (error.code === "unauthorized") setSession(null);
      if (!cachedState) setResourceState({ status: "error", data: null, error, resource: activeResource, projectId: activeProjectId, refreshKey: pageRefreshKey });
    });
    return () => { active = false; };
  }, [source, activeProjectId, view, authorizedPlanVariant, activeResource, bootstrapState.status, pageRefreshKey]);

  useEffect(() => {
    const nextHash = viewLocationHash(view, planVariant);
    if (window.location.hash.slice(1) !== nextHash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${nextHash}`);
  }, [view, planVariant]);

  const handleLogin = async (credentials) => {
    setLoginError(null);
    try {
      const result = await source.login({ ...credentials, initialView: view });
      if (result.bootstrap) applyBootstrapEnvelope(result.bootstrap);
      setSession(source.getSession());
      if (!result.bootstrap) await loadBootstrap();
    } catch (error) { setLoginError(error); }
  };

  const logout = () => {
    source.logout();
    clearBootstrapSessionCache();
    activeProjectIdRef.current = null;
    setSession(null);
    setBootstrapState(blankPage);
    setOverviewState(blankPage);
    setResourceState(blankPage);
    setTaskActivityState(blankTaskActivity);
    taskActivityRequestRef.current = null;
    resourceCacheEpochRef.current += 1;
    resourceCacheRef.current.clear();
    resourceRequestRef.current.clear();
    setCreateEntity(null);
    setSaveNotice(null);
  };

  if (configError) return <ErrorState error={configError} title="연동 설정을 확인해 주세요." />;
  if (live && !session) {
    if (!source.config.loginEnabled) {
      if (loginError) return <ErrorState error={loginError} onRetry={() => {
        setLoginError(null);
        initializationRequestRef.current = null;
        setBootstrapRetryKey((value) => value + 1);
      }} title="공개 조회 화면을 연결하지 못했습니다." />;
      return <LoadingState label="프로젝트 화면을 연결하는 중입니다." />;
    }
    return <LoginScreen onLogin={handleLogin} error={loginError} loading={sourceState.action === "login" && sourceState.phase === "loading"} configured={source.config.hasEndpoint} />;
  }
  if (bootstrapState.status === "loading" || bootstrapState.status === "idle") return <LoadingState label="접근 가능한 프로젝트를 확인하는 중입니다." />;
  if (bootstrapState.status === "error") return <ErrorState error={bootstrapState.error} onRetry={() => {
    initializationRequestRef.current = null;
    setBootstrapRetryKey((value) => value + 1);
  }} title="프로젝트 목록을 불러오지 못했습니다." />;
  if (!bootstrapState.data?.clients.length || !activeProjectId) return <EmptyState title="배정된 프로젝트가 없습니다" description="관리자가 사용자 권한과 프로젝트 배정을 확인해야 합니다." />;

  const selectedClient = bootstrapState.data.clients.find((client) => client.id === activeClient) || bootstrapState.data.clients[0];
  const baseProject = bootstrapState.data.projects[activeProjectId] || bootstrapState.data.projects[selectedClient.projectId];
  const project = overviewState.projectId === activeProjectId ? overviewState.data?.project || baseProject : baseProject;
  const actor = bootstrapState.data.actor;
  const role = actor?.role || "client";
  const cachedPageForView = view === "overview"
    ? null
    : resourceCacheRef.current.get(`${activeProjectId}:${activeResource}`)?.state || null;
  const currentPage = view === "overview"
    ? overviewState.projectId === activeProjectId ? overviewState : { ...blankPage, status: "loading", resource: "overview", projectId: activeProjectId }
    : resourceState.resource === activeResource && resourceState.projectId === activeProjectId
      ? resourceState
      : cachedPageForView || { ...blankPage, status: "loading", resource: activeResource, projectId: activeProjectId };
  const taskCount = view === "tasks" && resourceState.resource === "tasks" ? Number(resourceState.data?.total || 0) : Number(project.metrics?.[0]?.value?.replace?.(/\D/g, "") || 0);
  const canWrite = live && ["ADMIN", "EDIT"].includes(project.permissionCode);
  const canWriteTasks = canWrite || (live && source.config.loginEnabled === false);
  const connectionReady = live && Boolean(sourceState.lastSuccessfulAt);

  const loadTaskActivity = async () => {
    const projectId = activeProjectId;
    if (!source || !projectId) return null;
    const requestKey = projectId;
    if (taskActivityRequestRef.current?.key === requestKey) return taskActivityRequestRef.current.promise;

    setTaskActivityState((current) => ({
      status: "loading",
      data: current.projectId === projectId ? current.data : null,
      error: null,
      projectId,
    }));
    const request = source.activity({ projectId, entityType: "TASK", limit: 100 })
      .then((envelope) => {
        if (activeProjectIdRef.current !== projectId) return null;
        const data = activityListViewModel(envelope);
        setTaskActivityState({ status: "ready", data, error: null, projectId });
        return data;
      })
      .catch((error) => {
        if (activeProjectIdRef.current !== projectId) return null;
        if (error.code === "unauthorized") setSession(null);
        setTaskActivityState((current) => ({
          status: "error",
          data: current.projectId === projectId ? current.data : null,
          error,
          projectId,
        }));
        return null;
      })
      .finally(() => {
        if (taskActivityRequestRef.current?.promise === request) taskActivityRequestRef.current = null;
      });
    taskActivityRequestRef.current = { key: requestKey, promise: request };
    return request;
  };

  const createRecord = async (entityType, fields) => {
    const nextFields = entityType === "file" ? { ...fields, entity_type: "PROJECT", entity_id: activeProjectId } : fields;
    const result = await source.mutate({
      projectId: activeProjectId,
      mutation: { entityType, operation: "CREATE", fields: nextFields },
    });
    // The canonical mutation response is the save acknowledgement. Activity
    // refresh is secondary and must not keep the create modal blocked.
    setSaveNotice("Google Sheets 원장에 저장했습니다.");
    if (entityType === "task") setTaskActivityState({ ...blankTaskActivity, projectId: activeProjectId });
    setPageRefreshKey((value) => value + 1);
    source.activity({ projectId: activeProjectId, limit: 20 }).catch(() => {});
    return result;
  };

  const patchTaskResource = (projectId, taskId, updater) => {
    const patchState = (state) => {
      if (state.resource !== "tasks" || state.projectId !== projectId || !state.data?.items) return state;
      let matched = false;
      const items = state.data.items.map((item) => {
        if (item.id !== taskId) return item;
        matched = true;
        return updater(item);
      });
      return matched ? { ...state, data: { ...state.data, items } } : state;
    };

    setResourceState(patchState);
    const cacheKey = `${projectId}:tasks`;
    const cached = resourceCacheRef.current.get(cacheKey);
    if (!cached?.state) return;
    const nextState = patchState(cached.state);
    if (nextState !== cached.state) {
      resourceCacheRef.current.set(cacheKey, { ...cached, state: nextState, cachedAt: Date.now() });
    }
  };

  const updateTask = async (task, fields) => {
    if (!canWriteTasks) {
      const readOnlyError = new Error("이 계정은 업무를 수정할 권한이 없습니다.");
      readOnlyError.code = "forbidden";
      throw readOnlyError;
    }
    const projectId = activeProjectId;
    const previousTask = { ...task };
    // A task write must not be overwritten by a slower workspace/read request
    // that started before the click.
    resourceCacheEpochRef.current += 1;
    patchTaskResource(projectId, task.id, (current) => taskWithMutationFields(current, fields));
    try {
      const result = await source.mutate({
        projectId,
        mutation: {
          entityType: "task",
          operation: "UPDATE",
          id: task.id,
          expectedRowVersion: task.rowVersion,
          fields,
        },
      });
      const canonicalRecord = result?.data?.record;
      const canonicalTask = canonicalRecord
        ? tasksViewModel({ data: { items: [canonicalRecord], totalMatching: 1 }, generatedAt: result.generatedAt }).items[0]
        : null;
      patchTaskResource(projectId, task.id, (current) => canonicalTask
        ? { ...current, ...canonicalTask }
        : { ...taskWithMutationFields(current, fields), rowVersion: Number(current.rowVersion || 0) + 1 });
      setTaskActivityState({ ...blankTaskActivity, projectId });
      setSaveNotice("업무 변경사항을 Google Sheets 원장에 저장했습니다.");
      setPageRefreshKey((value) => value + 1);
      return canonicalTask;
    } catch (error) {
      patchTaskResource(projectId, task.id, () => previousTask);
      if (error.code === "conflict") setPageRefreshKey((value) => value + 1);
      throw error;
    }
  };

  const updateProjectStartDate = async (projectRow, startDate) => {
    if (!canWrite || role !== "pocket") {
      const readOnlyError = new Error("이 계정은 프로젝트 착수일을 수정할 권한이 없습니다.");
      readOnlyError.code = "forbidden";
      throw readOnlyError;
    }
    if (!projectRow?.rowVersion) {
      const staleError = new Error("프로젝트 최신 정보를 다시 불러온 뒤 저장해 주세요.");
      staleError.code = "conflict";
      setPageRefreshKey((value) => value + 1);
      throw staleError;
    }
    try {
      await source.mutate({
        projectId: activeProjectId,
        mutation: {
          entityType: "project",
          operation: "UPDATE",
          id: projectRow.id || activeProjectId,
          expectedRowVersion: projectRow.rowVersion,
          fields: { start_date: startDate },
        },
      });
    } catch (error) {
      if (error.code === "conflict") setPageRefreshKey((value) => value + 1);
      throw error;
    }
    setSaveNotice("프로젝트 착수일을 Google Sheets 원장에 저장했습니다.");
    setPageRefreshKey((value) => value + 1);
  };

  const saveDailyMeeting = async (meeting, fields) => {
    if (!canWriteTasks || role === "client") {
      const readOnlyError = new Error("이 계정은 회의록을 저장할 권한이 없습니다.");
      readOnlyError.code = "forbidden";
      throw readOnlyError;
    }
    const mutation = meeting ? {
      entityType: "daily_meeting",
      operation: "UPDATE",
      id: meeting.id,
      expectedRowVersion: meeting.rowVersion,
      fields,
    } : {
      entityType: "daily_meeting",
      operation: "CREATE",
      fields,
    };
    try {
      await source.mutate({ projectId: activeProjectId, mutation });
    } catch (error) {
      if (error.code === "conflict") setPageRefreshKey((value) => value + 1);
      throw error;
    }
    resourceCacheEpochRef.current += 1;
    resourceCacheRef.current.delete(`${activeProjectId}:daily`);
    setSaveNotice(meeting ? "회의록을 Google Sheets 원장에 수정했습니다." : "회의록을 Google Sheets 원장에 저장했습니다.");
    setPageRefreshKey((value) => value + 1);
  };

  const saveKpiDefinition = async (kpi, fields) => {
    if (!canWrite || role === "client") {
      const readOnlyError = new Error("이 계정은 KPI를 설정할 권한이 없습니다.");
      readOnlyError.code = "forbidden";
      throw readOnlyError;
    }
    const mutation = kpi ? {
      entityType: "kpi_definition",
      operation: "UPDATE",
      id: kpi.id,
      expectedRowVersion: kpi.rowVersion,
      fields,
    } : {
      entityType: "kpi_definition",
      operation: "CREATE",
      fields,
    };
    try {
      await source.mutate({ projectId: activeProjectId, mutation });
    } catch (error) {
      if (error.code === "conflict") setPageRefreshKey((value) => value + 1);
      throw error;
    }
    resourceCacheEpochRef.current += 1;
    resourceCacheRef.current.delete(`${activeProjectId}:performance`);
    setSaveNotice(kpi ? "KPI 목표를 Google Sheets 원장에 수정했습니다." : "새 KPI를 Google Sheets 원장에 추가했습니다.");
    setPageRefreshKey((value) => value + 1);
  };

  const archiveKpiDefinition = async (kpi) => {
    if (!canWrite || role === "client") {
      const readOnlyError = new Error("이 계정은 KPI를 보관할 권한이 없습니다.");
      readOnlyError.code = "forbidden";
      throw readOnlyError;
    }
    try {
      await source.mutate({
        projectId: activeProjectId,
        mutation: {
          entityType: "kpi_definition",
          operation: "ARCHIVE",
          id: kpi.id,
          expectedRowVersion: kpi.rowVersion,
          fields: {},
        },
      });
    } catch (error) {
      if (error.code === "conflict") setPageRefreshKey((value) => value + 1);
      throw error;
    }
    resourceCacheEpochRef.current += 1;
    resourceCacheRef.current.delete(`${activeProjectId}:performance`);
    setSaveNotice("KPI를 보관했습니다.");
    setPageRefreshKey((value) => value + 1);
  };

  const saveAccessAccount = async (account) => {
    if (role !== "pocket") {
      const forbidden = new Error("포켓 운영 계정만 고객 권한을 관리할 수 있습니다.");
      forbidden.code = "forbidden";
      throw forbidden;
    }
    await source.accessAdminMutate({ operation: account.operation, account });
    resourceCacheEpochRef.current += 1;
    resourceCacheRef.current.delete(`${activeProjectId}:permissions`);
    setSaveNotice(account.operation === "DISABLE" ? "고객사 계정을 비활성화했습니다." : account.operation === "REMOVE_ACCESS" ? "선택한 프로젝트 권한을 제거했습니다." : "고객사 계정과 페이지 권한을 저장했습니다.");
    setPageRefreshKey((value) => value + 1);
  };

  const selectClient = (clientId) => {
    const client = bootstrapState.data.clients.find((item) => item.id === clientId);
    if (!client) return;
    setActiveClient(clientId);
    setActiveProjectId(client.projectId);
    activeProjectIdRef.current = client.projectId;
    setOverviewState({ ...blankPage, status: "loading", resource: "overview", projectId: client.projectId });
    setResourceState(blankPage);
    setTaskActivityState({ ...blankTaskActivity, projectId: client.projectId });
    taskActivityRequestRef.current = null;
    setView("overview");
    setSearch("");
    if (!navigation.usesDrawer) setDesktopNavigationLevel(2);
  };

  const navigateToView = (nextView, nextPlanVariant = planVariant) => {
    if (role === "client" && !isViewAllowed(nextView, project.allowedPages)) return;
    if (nextView === "permissions" && role !== "pocket") return;
    if (nextView === "plan") setPlanVariant(nextPlanVariant);
    setView(nextView);
  };

  const toggleNavigation = () => {
    if (navigation.usesDrawer) {
      setSidebarOpen((current) => !current);
      return;
    }
    setDesktopNavigationLevel((level) => nextDesktopNavigationLevel(level));
  };

  return (
    <div className={`app-shell ${navigation.shellCollapsed ? "is-navigation-collapsed" : ""} ${navigation.clientRailCollapsed ? "is-client-rail-collapsed" : ""} ${navigation.projectSidebarCollapsed ? "is-project-sidebar-collapsed" : ""} ${navigation.isDrawerOpen ? "is-navigation-drawer-open" : ""} ${role === "client" ? "is-client-view" : ""}`}>
      <ClientRail clients={bootstrapState.data.clients} activeClient={selectedClient.id} onSelect={selectClient} visible={navigation.clientRailVisible} />
      <ProjectSidebar project={project} role={role} activeView={view} activePlanVariant={authorizedPlanVariant} onView={navigateToView} open={navigation.isDrawerOpen} onClose={() => setSidebarOpen(false)} taskCount={taskCount} sourceState={sourceState} connectionReady={connectionReady} visible={navigation.projectSidebarVisible} />
      {navigation.isDrawerOpen && <button className="mobile-overlay" onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기" />}
      <div className="app-main"><Topbar project={project} actor={actor} onLogout={logout} live={live && source.config.loginEnabled} search={search} setSearch={setSearch} navigation={navigation} onToggleNavigation={toggleNavigation} /><main className="content-canvas"><AppContent view={view} planVariant={authorizedPlanVariant} project={project} role={role} search={search} setView={navigateToView} pageState={currentPage} taskActivityState={taskActivityState} onLoadTaskActivity={loadTaskActivity} onRetry={() => setPageRefreshKey((value) => value + 1)} onCreate={setCreateEntity} onTaskUpdate={updateTask} onProjectUpdate={updateProjectStartDate} onDailyMeetingSave={saveDailyMeeting} onKpiSave={saveKpiDefinition} onKpiArchive={archiveKpiDefinition} onAccessSave={saveAccessAccount} canWrite={(view === "tasks" || view === "schedule" || view === "daily") ? canWriteTasks : canWrite} /></main><footer className="app-footer"><span>{connectionReady ? "Google Sheets 연결됨" : "연결 확인 중"}</span><span>마지막 동기화 {formatSyncTime(sourceState.lastSuccessfulAt)}</span></footer></div>
      {createEntity && <CreateRecordModal entityType={createEntity} role={role} onClose={() => setCreateEntity(null)} onSubmit={createRecord} />}
      {saveNotice && <div className="save-toast" role="status"><Check size={16} />{saveNotice}</div>}
    </div>
  );
}
