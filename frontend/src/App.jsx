import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
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
  Link2,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import {
  activityListViewModel,
  bootstrapViewModel,
  contentsViewModel,
  createHubDataSource,
  filesViewModel,
  overviewViewModel,
  performanceViewModel,
  tasksViewModel,
} from "./api/index.js";
import { getNavigationPresentation } from "./navigationState.js";

const navItems = [
  { id: "overview", label: "총괄 현황", icon: LayoutDashboard },
  { id: "tasks", label: "업무", icon: ClipboardCheck },
  { id: "content", label: "콘텐츠", icon: GalleryHorizontalEnd },
  { id: "performance", label: "성과", icon: BarChart3 },
  { id: "files", label: "자료·활동", icon: FolderOpen },
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
          <label><span>계정</span><input type="email" autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="name@company.com" disabled={loading || !configured} /></label>
          <label><span>접속 코드</span><input type="password" autoComplete="current-password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="접속 코드를 입력하세요" disabled={loading || !configured} /></label>
          {error && <div className="login-error"><AlertCircle size={15} />{error.message}</div>}
          {!configured && <div className="login-error"><WifiOff size={15} />운영 API 주소가 설정되지 않았습니다.</div>}
          <button className="primary-button login-submit" disabled={loading || !configured || !account.trim() || !accessCode}>{loading ? <><LoaderCircle size={16} className="spin" /> 확인 중</> : "로그인"}</button>
        </form>
        <footer><ShieldCheck size={14} /> 접속 코드는 저장하지 않고, 발급된 세션만 현재 탭에 보관합니다.</footer>
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

function ProjectSidebar({ project, activeView, onView, open, onClose, taskCount, sourceState, connectionReady, visible, stagedDesktop, clientRailVisible, onToggleClientRail }) {
  return (
    <aside id="project-navigation" className={`project-sidebar ${open ? "is-open" : ""}`} aria-label="프로젝트 탐색" aria-hidden={!visible}>
      <div className="sidebar-header"><div><p className="eyebrow">{project.clientName}</p><h1>{project.name}</h1></div><div className="sidebar-header-actions">{stagedDesktop && <button className="client-list-toggle" type="button" onClick={onToggleClientRail} aria-label={clientRailVisible ? "전체 프로젝트 숨기기" : "전체 프로젝트 펼치기"} title={clientRailVisible ? "전체 프로젝트 숨기기" : "전체 프로젝트 펼치기"} aria-expanded={clientRailVisible} aria-controls="client-navigation">{clientRailVisible ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}</button>}<button className="icon-button mobile-close" onClick={onClose} aria-label="메뉴 닫기"><X size={17} /></button></div></div>
      <div className="project-switcher"><div><span className="project-dot" /><strong>{project.status}</strong></div><ChevronDown size={15} /></div>
      <nav className="project-nav"><p className="nav-label">프로젝트</p>{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={activeView === item.id ? "is-active" : ""} onClick={() => { onView(item.id); onClose(); }}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "tasks" && taskCount > 0 && <em>{taskCount}</em>}</button>; })}</nav>
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
  return <header className="topbar"><div className="topbar-leading">{(navigation.usesDrawer || navigation.mainRevealVisible) && <button className="navigation-toggle" type="button" onClick={onToggleNavigation} aria-label={navigation.actionLabel} title={navigation.actionLabel} aria-expanded={navigation.anyVisible} aria-controls="client-navigation project-navigation"><NavigationIcon size={18} strokeWidth={2} /></button>}<div className="breadcrumb"><span>{project.clientName}</span><ArrowRight size={13} /><strong>{project.name}</strong></div></div><div className="topbar-actions"><label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="업무·콘텐츠 검색" /></label><ActorBadge actor={actor} onLogout={onLogout} live={live} /></div></header>;
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
  stream: [["YOUTUBE", "유튜브"], ["INSTAGRAM", "인스타그램"], ["SEO", "SEO"], ["COMMON", "공통"]],
  channel: [["YOUTUBE", "유튜브"], ["INSTAGRAM", "인스타그램"], ["NAVER_BLOG", "네이버 블로그"], ["WEBSITE", "자사몰"]],
  format: [["LONG_FORM", "롱폼"], ["SHORT_FORM", "숏폼"], ["FEED", "피드"], ["REELS", "릴스"], ["ARTICLE", "아티클"]],
};

function FormSelect({ label, value, onChange, options }) {
  return <label className="create-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></label>;
}

function CreateRecordModal({ entityType, role, onClose, onSubmit }) {
  const [fields, setFields] = useState(() => entityType === "task" ? {
    title: "", phase_code: "M1", workstream_code: "COMMON", status_code: "NOT_STARTED", priority_code: "NORMAL", due_date: "", visibility_code: "PROJECT_TEAM",
  } : entityType === "content" ? {
    title: "", channel_code: "INSTAGRAM", format_code: "FEED", status_code: "DRAFT", planned_date: "", visibility_code: "PROJECT_TEAM",
  } : {
    title: "", url: "", file_type_code: "LINK", storage_provider_code: "LINK", visibility_code: "PROJECT_TEAM", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const entityLabel = entityType === "task" ? "업무" : entityType === "content" ? "콘텐츠" : "자료";
  const setField = (name, value) => setFields((current) => ({ ...current, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const cleaned = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ""));
      if (entityType === "task") {
        cleaned.responsible_org_code = role === "ns" ? "NS" : "POCKET";
        cleaned.reviewer_org_code = "POCKET";
      }
      if (entityType === "content") cleaned.current_version_no = 1;
      await onSubmit(entityType, cleaned);
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-record-title"><header><div><p className="editorial-kicker">Google Sheets 원장 등록</p><h2 id="create-record-title">{entityLabel} 추가</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="닫기"><X size={18} /></button></header><form onSubmit={submit}>
    <label className="create-field is-wide"><span>{entityLabel} 제목</span><input autoFocus required maxLength={200} value={fields.title} onChange={(event) => setField("title", event.target.value)} placeholder={`${entityLabel} 제목을 입력하세요`} /></label>
    {entityType === "task" && <><FormSelect label="단계" value={fields.phase_code} onChange={(value) => setField("phase_code", value)} options={createFormOptions.phase} /><FormSelect label="업무 분야" value={fields.workstream_code} onChange={(value) => setField("workstream_code", value)} options={createFormOptions.stream} /><FormSelect label="상태" value={fields.status_code} onChange={(value) => setField("status_code", value)} options={[["NOT_STARTED", "미착수"], ["IN_PROGRESS", "진행"]]} /><FormSelect label="우선순위" value={fields.priority_code} onChange={(value) => setField("priority_code", value)} options={[["NORMAL", "보통"], ["HIGH", "높음"], ["CRITICAL", "긴급"]]} /><label className="create-field"><span>마감일</span><input type="date" value={fields.due_date} onChange={(event) => setField("due_date", event.target.value)} /></label></>}
    {entityType === "content" && <><FormSelect label="채널" value={fields.channel_code} onChange={(value) => setField("channel_code", value)} options={createFormOptions.channel} /><FormSelect label="형식" value={fields.format_code} onChange={(value) => setField("format_code", value)} options={createFormOptions.format} /><FormSelect label="상태" value={fields.status_code} onChange={(value) => setField("status_code", value)} options={[["DRAFT", "초안"], ["PLANNED", "예정"], ["IN_PROGRESS", "제작"]]} /><label className="create-field"><span>예정일</span><input type="date" value={fields.planned_date} onChange={(event) => setField("planned_date", event.target.value)} /></label></>}
    {entityType === "file" && <><label className="create-field is-wide"><span>HTTPS 자료 링크</span><input type="url" required pattern="https://.*" value={fields.url} onChange={(event) => setField("url", event.target.value)} placeholder="https://" /></label><label className="create-field is-wide"><span>메모</span><textarea rows="3" maxLength={1000} value={fields.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="자료 설명 또는 버전을 적어 주세요" /></label></>}
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

function TrackerTaskRow({ task, role, canWrite, onUpdate, isDone, memberOptions }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(task.description || "");
  const [assignee, setAssignee] = useState(task.assignee || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setNote(task.description || ""), [task.description]);
  useEffect(() => setAssignee(task.assignee || ""), [task.assignee]);

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

  return <article className={`${isDone ? "is-done" : ""} ${expanded ? "is-expanded" : ""}`}>
    <div className="tracker-task-main" role="button" tabIndex={0} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpanded((current) => !current); } }}>
      <button className="tracker-check" type="button" onClick={toggleDone} disabled={!canWrite || saving} aria-label={isDone ? `${task.title} 완료 취소` : `${task.title} 완료 처리`}>{isDone && <Check size={13} strokeWidth={2.5} />}</button>
      <div className="tracker-task-copy"><strong>{task.title}</strong><small>{task.parent}{task.planWeek ? ` · ${task.planWeek}주차` : ""}{task.contractLinked ? " · 계약 연계" : ""}</small></div>
      <span className="tracker-task-phase">{task.phase}</span>
      <span className="tracker-task-owner">{role === "client" ? "포켓컴퍼니" : task.assigneeName || task.owner}</span>
      <span className="tracker-task-due">{task.due}</span>
      <i className={statusClass[task.status] || "status status-muted"}>{task.status}</i>
      <ChevronDown className="tracker-row-chevron" size={15} />
    </div>
    {expanded && <div className="tracker-task-detail">
      <div className="tracker-detail-meta">
        <span><strong>업무 ID</strong>{task.sourceTaskId || task.id}</span>
        <span><strong>구분</strong>{task.parent}</span>
        <span><strong>마감</strong>{task.due}</span>
        {task.contractLinked && <span className="is-contract"><Link2 size={13} /><strong>계약 연계</strong></span>}
      </div>
      {role !== "client" && task.planNote && <div className="tracker-plan-note"><strong>계획 기준</strong><p>{task.planNote}</p></div>}
      {role === "client" && task.customerStatus && <div className="tracker-client-status"><strong>공유 진행 메모</strong><p>{task.customerStatus}</p></div>}
      {role !== "client" && <div className="tracker-task-edit">
        <div><span>상태</span><div className="tracker-status-actions">{trackerStatusOptions.map(([code, label]) => <button key={code} type="button" disabled={!canWrite || saving} className={task.statusCode === code || (code === "DONE" && task.statusCode === "COMPLETED") ? "is-active" : ""} onClick={() => saveFields({ status_code: code })}>{label}</button>)}</div></div>
        <label className="tracker-owner-edit"><span>담당자</span><select value={assignee} disabled={!canWrite || saving} onChange={(event) => setAssignee(event.target.value)}><option value="">담당자 미정</option>{assignee && !memberOptions.some((member) => member.userId === assignee) && <option value={assignee}>{task.assigneeName || assignee} · 비활성</option>}{memberOptions.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}{member.organization ? ` · ${member.organization}` : ""}</option>)}</select></label>
        <label><span>업무 메모</span><textarea rows="3" value={note} disabled={!canWrite || saving} onChange={(event) => setNote(event.target.value)} placeholder="진행 내용이나 다음 액션을 기록하세요" /></label>
        <div className="tracker-edit-footer">{error ? <span className="tracker-save-error"><AlertCircle size={14} />{error.message || "저장하지 못했습니다."}</span> : <span>{canWrite ? "저장 시 Google Sheets 업무 원장에 반영됩니다." : "읽기 전용입니다."}</span>}<button className="primary-button" type="button" disabled={!canWrite || saving || (note === (task.description || "") && assignee === (task.assignee || ""))} onClick={() => { const fields = { description: note }; if (assignee !== (task.assignee || "")) fields.assignee_user_id = assignee; saveFields(fields); }}>{saving ? <><LoaderCircle size={14} className="spin" /> 저장 중</> : "변경 저장"}</button></div>
      </div>}
    </div>}
  </article>;
}

function TasksView({ role, query, taskPage, onCreate, canWrite, onUpdate, onProjectUpdate }) {
  const editable = Boolean(canWrite && role !== "client");
  const canEditProject = Boolean(canWrite && role === "pocket");
  const memberOptions = taskPage.members || [];
  const memberNameById = Object.fromEntries(memberOptions.map((member) => [member.userId, member.displayName]));
  const schedule = trackerSchedule(taskPage.project?.startDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const currentSchedule = trackerCurrentSchedule(schedule, taskPage.project?.startDate, taskPage.project?.phaseCode, now);
  const currentPhaseLabel = currentSchedule?.label || "전체";
  const tasks = (taskPage.items || []).map((task) => {
    const calculatedDue = trackerTaskDue(task, schedule);
    const withAssignee = { ...task, assigneeName: memberNameById[task.assignee] || task.assignee || "" };
    return calculatedDue ? { ...withAssignee, dueDate: `${calculatedDue.getFullYear()}-${String(calculatedDue.getMonth() + 1).padStart(2, "0")}-${String(calculatedDue.getDate()).padStart(2, "0")}`, due: `${trackerTaskDueLabel(calculatedDue)} · ${trackerDdayLabel(calculatedDue)}` } : withAssignee;
  });
  const [phase, setPhase] = useState(currentPhaseLabel);
  const [stream, setStream] = useState("전체");
  const [category, setCategory] = useState("전체");
  const [hideDone, setHideDone] = useState(false);
  const [localQuery, setLocalQuery] = useState("");
  const [alertFilter, setAlertFilter] = useState("전체");
  const [startDateDraft, setStartDateDraft] = useState(taskPage.project?.startDate || "");
  const [startDateSaving, setStartDateSaving] = useState(false);
  const [startDateError, setStartDateError] = useState("");
  useEffect(() => setStartDateDraft(taskPage.project?.startDate || ""), [taskPage.project?.startDate]);
  useEffect(() => setPhase(currentPhaseLabel), [taskPage.project?.id, taskPage.project?.startDate, currentPhaseLabel]);
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
  const isInProgress = (task) => ["IN_PROGRESS", "INTERNAL_REVIEW", "WAITING_CLIENT", "REVISION"].includes(task.statusCode);
  const isOnHold = (task) => ["ON_HOLD", "BLOCKED"].includes(task.statusCode);
  const completion = (items) => items.length ? Math.round(items.filter(isDone).length / items.length * 100) : 0;
  const publishingByPhase = Object.fromEntries((taskPage.publishing?.phases || []).map((item) => [item.phaseCode, item]));
  const phaseStats = phases.slice(1).map((name) => {
    const items = tasks.filter((task) => task.phase === name);
    const definition = trackerPhaseDefinitions.find((item) => item.label === name);
    const phaseSchedule = schedule.find((item) => item.label === name);
    const output = publishingByPhase[definition?.code];
    const outputProgress = output?.target?.total ? Math.min(100, Math.round(output.actual.total / output.target.total * 100)) : null;
    return { code: definition?.code || name, name, total: items.length, done: items.filter(isDone).length, progress: completion(items), period: phaseSchedule?.period || "일정 미정", output, outputProgress };
  });
  const streamStats = streams.slice(1).map((name) => {
    const items = tasks.filter((task) => task.stream === name);
    return { name, total: items.length, done: items.filter(isDone).length, progress: completion(items) };
  });
  const alertMatches = (task, key) => {
    if (key === "전체") return true;
    if (key === "보류") return isOnHold(task);
    if (key === "계약") return task.contractLinked && !isDone(task);
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
    { key: "계약", label: "계약 연계 미완료", count: tasks.filter((task) => alertMatches(task, "계약")).length, detail: "검수 기준 포함" },
  ];
  const globalNeedle = String(query || "").trim().toLowerCase();
  const localNeedle = localQuery.trim().toLowerCase();
  const visibleTasks = useMemo(() => tasks.filter((task) => (phase === "전체" || task.phase === phase)
    && (stream === "전체" || task.stream === stream)
    && (category === "전체" || task.parent === category)
    && (!hideDone || !isDone(task))
    && alertMatches(task, alertFilter)
    && (!globalNeedle || `${task.title} ${task.parent} ${task.owner} ${task.assigneeName} ${task.sourceTaskId || ""}`.toLowerCase().includes(globalNeedle))
    && (!localNeedle || `${task.title} ${task.parent} ${task.owner} ${task.assigneeName} ${task.sourceTaskId || ""}`.toLowerCase().includes(localNeedle))), [phase, stream, category, hideDone, alertFilter, globalNeedle, localNeedle, tasks]);
  const groupedTasks = streamStats.map((item) => ({
    ...item,
    tasks: visibleTasks.filter((task) => task.stream === item.name),
  })).filter((item) => item.tasks.length);
  const overallDone = tasks.filter(isDone).length;
  const overallInProgress = tasks.filter(isInProgress).length;
  const overallOnHold = tasks.filter(isOnHold).length;
  const overallWaiting = Math.max(0, tasks.length - overallDone - overallInProgress - overallOnHold);
  const overallProgress = completion(tasks);
  const streamColor = { 마케팅: "#22bc7e", 디자인: "#3b82f6", 영상: "#7c9a32", 공통: "#77837d", 유튜브: "#ff4d4f", 인스타그램: "#d946ef", SEO: "#f59e0b" };
  const phaseDay = currentSchedule?.end ? Math.ceil((currentSchedule.end.getTime() - now.getTime()) / 86400000) : null;
  const resetFilters = () => { setPhase("전체"); setStream("전체"); setCategory("전체"); setHideDone(false); setLocalQuery(""); setAlertFilter("전체"); };
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
    <ViewHeader eyebrow="업무 관리" title="업무" description={role === "client" ? "공개된 업무의 일정과 진행 상태를 확인합니다." : "프로젝트 업무를 단계와 담당 분야별로 추적합니다."}>
      {role !== "client" && <CreateButton entityType="task" onOpen={onCreate} enabled={editable}>업무 추가</CreateButton>}
    </ViewHeader>

    <section className="tracker-schedule panel" aria-label="90일 운영 일정">
      <div className="tracker-schedule-intro"><span>90일 운영 일정</span>{canEditProject ? <div className="tracker-start-date-editor"><label><span>착수일</span><input type="date" value={startDateDraft} disabled={startDateSaving} onChange={(event) => { setStartDateDraft(event.target.value); setStartDateError(""); }} /></label><button type="button" disabled={startDateSaving || !startDateDraft || startDateDraft === (taskPage.project?.startDate || "")} onClick={saveProjectStartDate}>{startDateSaving ? "저장 중" : "저장"}</button></div> : <strong>{taskPage.project?.startDate ? `${trackerDateLabel(taskPage.project.startDate)} 시작` : "착수일 미설정"}</strong>}{phaseDay !== null && <em>{phaseDay > 0 ? `D-${phaseDay}` : phaseDay === 0 ? "D-DAY" : `D+${Math.abs(phaseDay)}`}</em>}{startDateError && <small className="tracker-start-date-error" role="alert">{startDateError}</small>}</div>
      <div className="tracker-schedule-phases">{schedule.map((item) => <button type="button" key={item.code} className={phase === item.label || (phase === "전체" && currentSchedule?.code === item.code) ? "is-active" : ""} onClick={() => setPhase(phase === item.label ? "전체" : item.label)}><span>{item.code}</span><strong>{item.label}</strong><small>{item.period}</small></button>)}</div>
    </section>

    <section className="tracker-progress panel" aria-label="전체 업무 진척률">
      <div className="tracker-progress-value"><strong>{overallProgress}</strong><span>%</span></div>
      <div className="tracker-progress-body">
        <div><span>전체 업무 진척률</span><strong>{overallDone} / {tasks.length} 완료</strong></div>
        <div className="tracker-stacked-progress" aria-label={`완료 ${overallDone}, 진행 ${overallInProgress}, 보류 ${overallOnHold}, 미착수 ${overallWaiting}`}><i className="is-done" style={{ width: `${tasks.length ? overallDone / tasks.length * 100 : 0}%` }} /><i className="is-progress" style={{ width: `${tasks.length ? overallInProgress / tasks.length * 100 : 0}%` }} /><i className="is-hold" style={{ width: `${tasks.length ? overallOnHold / tasks.length * 100 : 0}%` }} /></div>
        <div className="tracker-status-counts"><span><i className="is-done" />완료 <strong>{overallDone}</strong></span><span><i className="is-progress" />진행 <strong>{overallInProgress}</strong></span><span><i className="is-hold" />보류 <strong>{overallOnHold}</strong></span><span><i className="is-wait" />미착수 <strong>{overallWaiting}</strong></span><em>업데이트 {formatSyncTime(taskPage.generatedAt)}</em></div>
      </div>
    </section>

    <section className="tracker-alert-grid" aria-label="확인 필요 업무">{alerts.map((item) => <button type="button" key={item.key} className={alertFilter === item.key ? "is-active" : ""} onClick={() => setAlertFilter(alertFilter === item.key ? "전체" : item.key)}><span>{item.label}</span><strong>{item.count}</strong><small>{item.detail}</small></button>)}</section>

    <section className="tracker-phase-grid" aria-label="단계별 업무 진척률">
      {phaseStats.map((item) => <button key={item.name} type="button" className={phase === item.name ? "is-active" : ""} onClick={() => setPhase(phase === item.name ? "전체" : item.name)}>
        <div><strong>{item.name}</strong><span>{item.progress}%</span></div><p>{item.period}</p>
        <ProgressBar value={item.progress} color="var(--accent)" />
        <small>업무 {item.done} / {item.total}{item.outputProgress !== null ? ` · 산출물 ${item.output?.actual?.total || 0} / ${item.output?.target?.total || 0}` : " · 산출물 연결 전"}</small>
      </button>)}
    </section>

    <section className="tracker-team-grid" aria-label="분야별 업무 진척률">
      {streamStats.map((item) => <button key={item.name} type="button" className={stream === item.name ? "is-active" : ""} onClick={() => setStream(stream === item.name ? "전체" : item.name)} style={{ "--team-color": streamColor[item.name] || "var(--accent)" }}>
        <div className="tracker-team-title"><span /><strong>{item.name}</strong><em>{item.progress}%</em></div>
        <ProgressBar value={item.progress} color={streamColor[item.name] || "var(--accent)"} />
        <small>{item.done} / {item.total} 완료</small>
      </button>)}
    </section>

    <section className="tracker-publishing panel" aria-label="단계별 콘텐츠 발행 현황"><div className="panel-heading"><div><h3>콘텐츠 발행 현황</h3><p>콘텐츠 원장의 게시 완료 건을 단계별 계획과 비교합니다.</p></div><span className="panel-note">자동 집계</span></div>{taskPage.publishing?.phases?.length ? <div className="tracker-publishing-grid">{taskPage.publishing.phases.map((item) => <article key={item.phaseCode}><header><strong>{item.phase}</strong><span>{item.actual.total} / {item.target.total}</span></header><ProgressBar value={item.target.total ? Math.min(100, Math.round(item.actual.total / item.target.total * 100)) : 0} color="var(--accent)" /><div><span>롱폼 {item.actual.longForm}/{item.target.longForm}</span><span>숏폼 {item.actual.shortForm}/{item.target.shortForm}</span><span>인스타 {item.actual.instagram}/{item.target.instagram}</span><span>블로그 {item.actual.blog}/{item.target.blog}</span></div></article>)}</div> : <div className="tracker-publishing-empty">콘텐츠 원장 집계가 연결되면 단계별 발행량이 표시됩니다.</div>}</section>

    <div className="filter-bar tracker-filter"><ListFilter size={16} /><div className="segmented-control">{phases.map((item) => <button key={item} className={phase === item ? "is-active" : ""} onClick={() => setPhase(item)}>{item}</button>)}</div><select aria-label="업무 분야" value={stream} onChange={(event) => setStream(event.target.value)}>{streams.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="업무 구분" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><label className="tracker-inline-search"><Search size={14} /><input value={localQuery} onChange={(event) => setLocalQuery(event.target.value)} placeholder="업무 검색" /></label><label className="tracker-hide-done"><input type="checkbox" checked={hideDone} onChange={(event) => setHideDone(event.target.checked)} />완료 숨김</label><button className="tracker-filter-reset" type="button" onClick={resetFilters}>초기화</button><span className="result-count">{visibleTasks.length}건 표시</span></div>

    {groupedTasks.length ? <div className="tracker-task-groups">{groupedTasks.map((group) => <section className="tracker-task-group panel" key={group.name} style={{ "--team-color": streamColor[group.name] || "var(--accent)" }}>
      <header><div><span className="tracker-team-dot" /><h3>{group.name}</h3></div><strong>{group.tasks.filter(isDone).length} / {group.tasks.length}</strong></header>
      <div>{group.tasks.map((task) => <TrackerTaskRow key={task.id} task={task} role={role} canWrite={editable} onUpdate={onUpdate} isDone={isDone(task)} memberOptions={memberOptions} />)}</div>
    </section>)}</div> : <EmptyState title="조건에 맞는 업무가 없습니다" description="필터를 바꾸거나 원장에 업무를 등록해 주세요." />}
  </div>;
}

function ContentView({ role, query, contents, onCreate, canWrite }) {
  const [channel, setChannel] = useState("전체");
  const channels = ["전체", ...new Set(contents.map((item) => item.channel))];
  const visibleContents = contents.filter((content) => (channel === "전체" || content.channel === channel) && (!query || `${content.title} ${content.channel}`.toLowerCase().includes(query.toLowerCase())));
  const published = contents.filter((item) => item.status === "완료").length;
  return <div className="view-stack"><ViewHeader eyebrow="콘텐츠 관리" title="콘텐츠" description="채널별 콘텐츠의 기획·검수·게시 상태를 확인합니다.">{role !== "client" && <CreateButton entityType="content" onOpen={onCreate} enabled={canWrite}>콘텐츠 추가</CreateButton>}</ViewHeader><section className="content-summary"><div className="content-summary-title"><span>현재 조회</span><strong>{published} / {contents.length}</strong><small>발행 완료 / 전체 콘텐츠</small></div></section><div className="filter-bar"><ListFilter size={16} /><div className="segmented-control">{channels.map((item) => <button key={item} className={channel === item ? "is-active" : ""} onClick={() => setChannel(item)}>{item}</button>)}</div><span className="result-count">{visibleContents.length}건 표시</span></div>{visibleContents.length ? <div className="content-grid">{visibleContents.map((content) => <article className="content-card" key={content.id}><header><span>{content.channel}</span><i className={statusClass[content.status] || "status status-muted"}>{content.status}</i></header><p>{content.format}</p><h3>{content.title}</h3><footer><span><CalendarDays size={14} /> {content.date}</span><span>{role === "client" ? "포켓컴퍼니" : content.owner}</span></footer></article>)}</div> : <EmptyState title="등록된 콘텐츠가 없습니다" description="선택한 조건에 해당하는 콘텐츠가 없습니다." />}</div>;
}

function PerformanceView({ performance }) {
  const kpis = performance.items || [];
  const attained = kpis.filter((item) => item.target > 0).map((item) => Math.min(100, item.value / item.target * 100));
  const average = attained.length ? Math.round(attained.reduce((sum, value) => sum + value, 0) / attained.length) : 0;
  const channelTotals = (performance.channels || []).reduce((total, item) => ({ impressions: total.impressions + Number(item.impressions || 0), engagements: total.engagements + Number(item.engagements || 0), clicks: total.clicks + Number(item.clicks || 0), inquiries: total.inquiries + Number(item.inquiries || 0) }), { impressions: 0, engagements: 0, clicks: 0, inquiries: 0 });
  return <div className="view-stack"><ViewHeader eyebrow="성과 요약" title="성과" description="Google Sheets에 기록된 채널 성과를 목표 대비로 확인합니다."><button className="secondary-button" disabled><CalendarDays size={15} /> {performance.range ? `${performance.range.start} — ${performance.range.end}` : "최근 31일"}</button></ViewHeader><section className="performance-intro panel"><div><h3>핵심 KPI</h3><p>값이 없는 KPI는 0이 아니라 ‘데이터 없음’으로 구분됩니다.</p></div><div className="performance-score"><strong>{average}<small>%</small></strong><span>평균 달성률</span></div></section>{kpis.length ? <section className="kpi-grid">{kpis.map((kpi) => { const percent = kpi.target ? Math.min(100, Math.round(kpi.value / kpi.target * 100)) : 0; return <article key={kpi.id} className="kpi-card"><header><span>{kpi.state}</span></header><h3>{kpi.name}</h3><div className="kpi-value"><strong>{kpi.value.toLocaleString()}</strong><small>{kpi.unit}</small><span>/ 목표 {kpi.target.toLocaleString()}</span></div><ProgressBar value={percent} color={percent >= 70 ? "var(--success)" : "var(--accent)"} /><footer><span>{percent}% 달성</span><span>{kpi.source}</span></footer></article>; })}</section> : <EmptyState title="성과 데이터가 없습니다" description="KPI 정의와 실적이 원장에 입력되면 표시됩니다." />}{(performance.channels || []).length > 0 && <section className="panel funnel-panel"><div className="panel-heading"><div><h3>채널 반응 흐름</h3></div><span className="panel-note">선택 기간 합계</span></div><div className="funnel-flow">{[{ label: "노출", value: channelTotals.impressions }, { label: "반응", value: channelTotals.engagements }, { label: "클릭", value: channelTotals.clicks }, { label: "문의", value: channelTotals.inquiries }].map((item, index) => <article key={item.label}><strong>{item.value.toLocaleString()}</strong><small>{item.label}</small>{index < 3 && <ArrowRight size={17} />}</article>)}</div></section>}</div>;
}

function FilesView({ role, files, activities, onCreate, canWrite }) {
  return <div className="view-stack"><ViewHeader eyebrow="자료 관리" title="자료·활동" description="공유 자료와 Google Sheets 변경 이력을 확인합니다.">{role !== "client" && <CreateButton entityType="file" onOpen={onCreate} enabled={canWrite}>자료 등록</CreateButton>}</ViewHeader><section className="overview-grid file-grid"><div className="panel"><div className="panel-heading"><div><h3>최근 자료</h3></div><FileText size={17} /></div>{files.length ? <div className="file-list">{files.map((file) => <a key={file.id} href={file.url || undefined} target={file.url ? "_blank" : undefined} rel="noreferrer" className={!file.url ? "is-disabled" : ""}><span className="file-icon"><FileText size={17} /></span><span><strong>{file.title}</strong><small>{file.type} · {file.date}</small></span><i>{file.visibility}</i><ArrowRight size={14} /></a>)}</div> : <EmptyState title="등록된 자료가 없습니다" description="파일 링크가 원장에 등록되면 표시됩니다." />}</div><div className="panel"><div className="panel-heading"><div><h3>활동 기록</h3></div><Activity size={17} /></div>{activities.length ? <div className="activity-timeline">{activities.map((item) => <article key={item.id}><span /><div><strong>{item.title}</strong><p>{item.meta}</p>{role !== "client" && item.internalMeta && <small>{item.internalMeta}</small>}</div></article>)}</div> : <EmptyState title="활동 기록이 없습니다" description="웹과 원장의 변경 이력이 표시됩니다." />}</div></section></div>;
}

function AppContent({ view, project, role, search, setView, pageState, onRetry, onCreate, onTaskUpdate, onProjectUpdate, canWrite }) {
  if (pageState.status === "loading" && !pageState.data) return <LoadingState />;
  if (pageState.status === "error" && !pageState.data) return <ErrorState error={pageState.error} onRetry={onRetry} />;
  const data = pageState.data || {};
  if (view === "tasks") return <TasksView role={role} query={search} taskPage={{ ...data, project: data.project || { id: project.id, phaseCode: project.phaseCode, phase: project.phase, startDate: project.startDate, endDate: project.endDate, rowVersion: project.rowVersion } }} onCreate={onCreate} onUpdate={onTaskUpdate} onProjectUpdate={onProjectUpdate} canWrite={canWrite} />;
  if (view === "content") return <ContentView role={role} query={search} contents={data.items || []} onCreate={onCreate} canWrite={canWrite} />;
  if (view === "performance") return <PerformanceView performance={data} />;
  if (view === "files") return <FilesView role={role} files={data.files?.items || []} activities={data.activities?.items || []} onCreate={onCreate} canWrite={canWrite} />;
  return <OverviewView project={data.project || project} role={role} activities={data.activities || []} onNavigate={setView} />;
}

const blankPage = { status: "idle", data: null, error: null, resource: null, projectId: null };
const RESOURCE_CACHE_TTL_MS = 60_000;

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
  const [activeClient, setActiveClient] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const initialView = typeof window !== "undefined" && navItems.some((item) => item.id === window.location.hash.slice(1)) ? window.location.hash.slice(1) : "overview";
  const [view, setView] = useState(initialView);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopNavigationLevel, setDesktopNavigationLevel] = useState(0);
  const [bootstrapRetryKey, setBootstrapRetryKey] = useState(0);
  const [pageRefreshKey, setPageRefreshKey] = useState(0);
  const [createEntity, setCreateEntity] = useState(null);
  const [saveNotice, setSaveNotice] = useState(null);
  const activeProjectIdRef = useRef(null);
  const initializationRequestRef = useRef(null);
  const resourceCacheRef = useRef(new Map());
  const resourceRequestRef = useRef(new Map());
  const resourceCacheEpochRef = useRef(0);
  const live = Boolean(source);
  const compactViewport = useMediaQuery("(max-width: 900px)");
  const actorRole = bootstrapState.data?.actor?.role || "client";
  const navigation = getNavigationPresentation({
    role: actorRole,
    compactViewport,
    desktopLevel: desktopNavigationLevel,
    drawerOpen: sidebarOpen,
  });

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

  const applyBootstrapEnvelope = useCallback((envelope) => {
    const data = bootstrapViewModel(envelope);
    const currentProjectId = activeProjectIdRef.current;
    const nextProjectId = data.projects[currentProjectId]
      ? currentProjectId
      : data.clients[0]?.projectId || Object.keys(data.projects)[0] || null;
    setBootstrapState({ status: "ready", data, error: null });
    setActiveClient((current) => data.clients.some((item) => item.id === current) ? current : data.clients[0]?.id || null);
    setActiveProjectId(nextProjectId);
    activeProjectIdRef.current = nextProjectId;

    // Overview and task rows are intentionally excluded from bootstrap. They
    // are fetched by the view-specific effects below so navigation can render
    // as soon as the small client/project envelope arrives.
    setOverviewState(blankPage);
    setResourceState(blankPage);
    resourceCacheEpochRef.current += 1;
    resourceCacheRef.current.clear();
    resourceRequestRef.current.clear();
    return data;
  }, []);

  const loadBootstrap = useCallback(async (signal) => {
    if (!source || !source.getSession()) return;
    setBootstrapState({ status: "loading", data: null, error: null });
    try {
      const envelope = await source.bootstrap({ signal });
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
  }, [source, applyBootstrapEnvelope]);

  useEffect(() => {
    if (!source) return undefined;
    let active = true;
    const initialize = async () => {
      const storedSession = source.getSession();
      if (!storedSession && source.config.loginEnabled) return;
      const requestKey = `${bootstrapRetryKey}:${storedSession ? "session" : "preview"}`;
      if (!initializationRequestRef.current || initializationRequestRef.current.key !== requestKey) {
        setLoginError(null);
        setBootstrapState({ status: "loading", data: null, error: null });
        initializationRequestRef.current = {
          key: requestKey,
          promise: storedSession
            ? source.bootstrap().catch((error) => {
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
    const cacheKey = `${activeProjectId}:${view}`;
    const cached = resourceCacheRef.current.get(cacheKey) || null;
    const cachedState = cached?.state || null;
    const cacheIsFresh = Boolean(
      cached &&
      cached.refreshKey === pageRefreshKey &&
      Date.now() - cached.cachedAt < RESOURCE_CACHE_TTL_MS
    );
    if (cachedState) setResourceState(cachedState);
    if (cacheIsFresh) return undefined;
    if (!cachedState) setResourceState({ status: "loading", data: null, error: null, resource: view, projectId: activeProjectId, refreshKey: pageRefreshKey });
    const params = { projectId: activeProjectId, limit: 200 };
    const requestKey = `${cacheKey}:${pageRefreshKey}`;
    const requestEpoch = resourceCacheEpochRef.current;
    let request = resourceRequestRef.current.get(requestKey);
    if (!request) {
      if (view === "tasks") request = source.tasks(params).then(tasksViewModel);
      if (view === "content") request = source.contents(params).then(contentsViewModel);
      if (view === "performance") request = source.performance(params).then(performanceViewModel);
      if (view === "files") request = Promise.all([source.files(params), source.activity(params)]).then(([files, activity]) => ({ files: filesViewModel(files), activities: activityListViewModel(activity) }));
      resourceRequestRef.current.set(requestKey, request);
      request.finally(() => {
        if (resourceRequestRef.current.get(requestKey) === request) resourceRequestRef.current.delete(requestKey);
      }).catch(() => {});
    }
    let active = true;
    request.then((data) => {
      const nextState = { status: "ready", data, error: null, resource: view, projectId: activeProjectId, refreshKey: pageRefreshKey };
      const currentCache = resourceCacheRef.current.get(cacheKey);
      if (resourceCacheEpochRef.current === requestEpoch && (!currentCache || currentCache.refreshKey <= pageRefreshKey)) {
        resourceCacheRef.current.set(cacheKey, { state: nextState, cachedAt: Date.now(), refreshKey: pageRefreshKey });
      }
      if (active) setResourceState(nextState);
    }).catch((error) => {
      if (!active) return;
      if (error.code === "unauthorized") setSession(null);
      if (!cachedState) setResourceState({ status: "error", data: null, error, resource: view, projectId: activeProjectId, refreshKey: pageRefreshKey });
    });
    return () => { active = false; };
  }, [source, activeProjectId, view, bootstrapState.status, pageRefreshKey]);

  useEffect(() => { if (window.location.hash.slice(1) !== view) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${view}`); }, [view]);

  const handleLogin = async (credentials) => {
    setLoginError(null);
    try {
      await source.login(credentials);
      setSession(source.getSession());
      await loadBootstrap();
    } catch (error) { setLoginError(error); }
  };

  const logout = () => {
    source.logout();
    activeProjectIdRef.current = null;
    setSession(null);
    setBootstrapState(blankPage);
    setOverviewState(blankPage);
    setResourceState(blankPage);
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
    : resourceCacheRef.current.get(`${activeProjectId}:${view}`)?.state || null;
  const currentPage = view === "overview"
    ? overviewState.projectId === activeProjectId ? overviewState : { ...blankPage, status: "loading", resource: "overview", projectId: activeProjectId }
    : resourceState.resource === view && resourceState.projectId === activeProjectId
      ? resourceState
      : cachedPageForView || { ...blankPage, status: "loading", resource: view, projectId: activeProjectId };
  const taskCount = view === "tasks" && resourceState.resource === "tasks" ? Number(resourceState.data?.total || 0) : Number(project.metrics?.[0]?.value?.replace?.(/\D/g, "") || 0);
  const canWrite = live && ["ADMIN", "EDIT"].includes(project.permissionCode);
  const connectionReady = live && Boolean(sourceState.lastSuccessfulAt);

  const createRecord = async (entityType, fields) => {
    const nextFields = entityType === "file" ? { ...fields, entity_type: "PROJECT", entity_id: activeProjectId } : fields;
    await source.mutate({
      projectId: activeProjectId,
      mutation: { entityType, operation: "CREATE", fields: nextFields },
    });
    let activitySynced = true;
    try {
      await source.activity({ projectId: activeProjectId, limit: 20 });
    } catch (error) {
      activitySynced = false;
    }
    setSaveNotice(activitySynced ? "Google Sheets 원장에 저장했습니다." : "원장 저장은 완료됐지만 활동 목록 새로고침은 재시도가 필요합니다.");
    setPageRefreshKey((value) => value + 1);
  };

  const updateTask = async (task, fields) => {
    if (!canWrite || role === "client") {
      const readOnlyError = new Error("이 계정은 업무를 수정할 권한이 없습니다.");
      readOnlyError.code = "forbidden";
      throw readOnlyError;
    }
    await source.mutate({
      projectId: activeProjectId,
      mutation: {
        entityType: "task",
        operation: "UPDATE",
        id: task.id,
        expectedRowVersion: task.rowVersion,
        fields,
      },
    });
    setSaveNotice("업무 변경사항을 Google Sheets 원장에 저장했습니다.");
    setPageRefreshKey((value) => value + 1);
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

  const selectClient = (clientId) => {
    const client = bootstrapState.data.clients.find((item) => item.id === clientId);
    if (!client) return;
    setActiveClient(clientId);
    setActiveProjectId(client.projectId);
    activeProjectIdRef.current = client.projectId;
    setOverviewState({ ...blankPage, status: "loading", resource: "overview", projectId: client.projectId });
    setResourceState(blankPage);
    setView("overview");
    setSearch("");
    if (!navigation.usesDrawer) setDesktopNavigationLevel(2);
  };

  const toggleNavigation = () => {
    if (navigation.usesDrawer) {
      setSidebarOpen((current) => !current);
      return;
    }
    setDesktopNavigationLevel(1);
  };

  return (
    <div className={`app-shell ${navigation.shellCollapsed ? "is-navigation-collapsed" : ""} ${navigation.clientRailCollapsed ? "is-client-rail-collapsed" : ""} ${navigation.projectSidebarCollapsed ? "is-project-sidebar-collapsed" : ""} ${navigation.isDrawerOpen ? "is-navigation-drawer-open" : ""} ${role === "client" ? "is-client-view" : ""}`}>
      <ClientRail clients={bootstrapState.data.clients} activeClient={selectedClient.id} onSelect={selectClient} visible={navigation.clientRailVisible} />
      <ProjectSidebar project={project} activeView={view} onView={setView} open={navigation.isDrawerOpen} onClose={() => setSidebarOpen(false)} taskCount={taskCount} sourceState={sourceState} connectionReady={connectionReady} visible={navigation.projectSidebarVisible} stagedDesktop={!navigation.usesDrawer} clientRailVisible={navigation.clientRailVisible} onToggleClientRail={() => setDesktopNavigationLevel((level) => level >= 2 ? 1 : 2)} />
      {!navigation.usesDrawer && navigation.projectSidebarVisible && <button className="navigation-boundary-toggle project-sidebar-toggle" type="button" onClick={() => setDesktopNavigationLevel(0)} aria-label="프로젝트 메뉴 접기" title="프로젝트 메뉴 접기" aria-expanded="true" aria-controls="project-navigation"><ChevronsLeft size={16} /></button>}
      {navigation.isDrawerOpen && <button className="mobile-overlay" onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기" />}
      <div className="app-main"><Topbar project={project} actor={actor} onLogout={logout} live={live && source.config.loginEnabled} search={search} setSearch={setSearch} navigation={navigation} onToggleNavigation={toggleNavigation} /><main className="content-canvas"><AppContent view={view} project={project} role={role} search={search} setView={setView} pageState={currentPage} onRetry={() => setPageRefreshKey((value) => value + 1)} onCreate={setCreateEntity} onTaskUpdate={updateTask} onProjectUpdate={updateProjectStartDate} canWrite={canWrite} /></main><footer className="app-footer"><span>{connectionReady ? "Google Sheets 연결됨" : "연결 확인 중"}</span><span>마지막 동기화 {formatSyncTime(sourceState.lastSuccessfulAt)}</span></footer></div>
      {createEntity && <CreateRecordModal entityType={createEntity} role={role} onClose={() => setCreateEntity(null)} onSubmit={createRecord} />}
      {saveNotice && <div className="save-toast" role="status"><Check size={16} />{saveNotice}</div>}
    </div>
  );
}
