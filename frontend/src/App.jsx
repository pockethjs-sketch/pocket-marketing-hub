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
import { getNavigationPresentation, getNextDesktopNavigationState } from "./navigationState.js";

const navItems = [
  { id: "overview", label: "총괄 현황", icon: LayoutDashboard },
  { id: "tasks", label: "업무", icon: ClipboardCheck },
  { id: "content", label: "콘텐츠", icon: GalleryHorizontalEnd },
  { id: "performance", label: "성과", icon: BarChart3 },
  { id: "files", label: "자료·활동", icon: FolderOpen },
];

const statusClass = {
  할일: "status status-muted",
  완료: "status status-success",
  진행: "status status-active",
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

function ProjectSidebar({ project, activeView, onView, open, onClose, taskCount, sourceState, connectionReady, visible }) {
  return (
    <aside id="project-navigation" className={`project-sidebar ${open ? "is-open" : ""}`} aria-label="프로젝트 탐색" aria-hidden={!visible}>
      <div className="sidebar-header"><div><p className="eyebrow">{project.clientName}</p><h1>{project.name}</h1></div><button className="icon-button mobile-close" onClick={onClose} aria-label="메뉴 닫기"><X size={17} /></button></div>
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
  return <header className="topbar"><div className="topbar-leading"><button className="navigation-toggle" type="button" onClick={onToggleNavigation} aria-label={navigation.actionLabel} title={navigation.actionLabel} aria-expanded={navigation.anyVisible} aria-controls="client-navigation project-navigation"><NavigationIcon size={18} strokeWidth={2} /></button><div className="breadcrumb"><span>{project.clientName}</span><ArrowRight size={13} /><strong>{project.name}</strong></div></div><div className="topbar-actions"><label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="업무·콘텐츠 검색" /></label><ActorBadge actor={actor} onLogout={onLogout} live={live} /></div></header>;
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
    {entityType === "task" && <><FormSelect label="단계" value={fields.phase_code} onChange={(value) => setField("phase_code", value)} options={createFormOptions.phase} /><FormSelect label="업무 분야" value={fields.workstream_code} onChange={(value) => setField("workstream_code", value)} options={createFormOptions.stream} /><FormSelect label="상태" value={fields.status_code} onChange={(value) => setField("status_code", value)} options={[["NOT_STARTED", "할 일"], ["IN_PROGRESS", "진행"]]} /><FormSelect label="우선순위" value={fields.priority_code} onChange={(value) => setField("priority_code", value)} options={[["NORMAL", "보통"], ["HIGH", "높음"], ["CRITICAL", "긴급"]]} /><label className="create-field"><span>마감일</span><input type="date" value={fields.due_date} onChange={(event) => setField("due_date", event.target.value)} /></label></>}
    {entityType === "content" && <><FormSelect label="채널" value={fields.channel_code} onChange={(value) => setField("channel_code", value)} options={createFormOptions.channel} /><FormSelect label="형식" value={fields.format_code} onChange={(value) => setField("format_code", value)} options={createFormOptions.format} /><FormSelect label="상태" value={fields.status_code} onChange={(value) => setField("status_code", value)} options={[["DRAFT", "초안"], ["PLANNED", "예정"], ["IN_PROGRESS", "제작"]]} /><label className="create-field"><span>예정일</span><input type="date" value={fields.planned_date} onChange={(event) => setField("planned_date", event.target.value)} /></label></>}
    {entityType === "file" && <><label className="create-field is-wide"><span>HTTPS 자료 링크</span><input type="url" required pattern="https://.*" value={fields.url} onChange={(event) => setField("url", event.target.value)} placeholder="https://" /></label><label className="create-field is-wide"><span>메모</span><textarea rows="3" maxLength={1000} value={fields.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="자료 설명 또는 버전을 적어 주세요" /></label></>}
    {role === "pocket" && <FormSelect label="공개 범위" value={fields.visibility_code} onChange={(value) => setField("visibility_code", value)} options={[["PROJECT_TEAM", "프로젝트 팀"], ["CLIENT", "고객 공개"], ["POCKET_ONLY", "포켓 전용"]]} />}
    {error && <div className="form-error"><AlertCircle size={15} /><span>{error.message || "저장하지 못했습니다."}</span></div>}
    <footer><p>서버 저장 성공 이후에만 목록에 반영됩니다.</p><div><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>취소</button><button className="primary-button" type="submit" disabled={saving || !fields.title.trim()}>{saving ? <><LoaderCircle size={15} className="spin" /> 저장 중</> : "원장에 저장"}</button></div></footer>
  </form></section></div>;
}

function TasksView({ role, query, tasks, onCreate, canWrite }) {
  const [phase, setPhase] = useState("전체");
  const [stream, setStream] = useState("전체");
  const phases = ["전체", ...new Set(tasks.map((task) => task.phase))];
  const streams = ["전체", ...new Set(tasks.map((task) => task.stream))];
  const visibleTasks = useMemo(() => tasks.filter((task) => (phase === "전체" || task.phase === phase) && (stream === "전체" || task.stream === stream) && (!query || `${task.title} ${task.parent} ${task.owner}`.toLowerCase().includes(query.toLowerCase()))), [phase, stream, query, tasks]);
  return <div className="view-stack"><ViewHeader eyebrow="업무 관리" title="업무" description={role === "client" ? "공개된 업무의 일정과 상태를 확인합니다." : "Google Sheets 원장의 업무를 단계·분야별로 확인합니다."}><button className="secondary-button" disabled><CalendarDays size={15} /> 일정 보기</button>{role !== "client" && <CreateButton entityType="task" onOpen={onCreate} enabled={canWrite}>업무 추가</CreateButton>}</ViewHeader><div className="filter-bar"><ListFilter size={16} /><div className="segmented-control">{phases.map((item) => <button key={item} className={phase === item ? "is-active" : ""} onClick={() => setPhase(item)}>{item}</button>)}</div><select value={stream} onChange={(event) => setStream(event.target.value)}>{streams.map((item) => <option key={item}>{item}</option>)}</select><span className="result-count">{visibleTasks.length}건 표시</span></div><div className="data-table task-table"><div className="table-head"><span>업무</span><span>단계·분야</span><span>담당</span><span>마감</span><span>상태</span></div>{visibleTasks.map((task) => <div className="table-row" key={task.id}><span className="task-title"><small>{task.parent}</small><strong>{task.title}</strong></span><span><em>{task.phase}</em>{task.stream}</span><span>{role === "client" ? "포켓컴퍼니" : task.owner}</span><span>{task.due}</span><span><i className={statusClass[task.status] || "status status-muted"}>{task.status}</i></span></div>)}{!visibleTasks.length && <EmptyState title="조건에 맞는 업무가 없습니다" description="필터를 바꾸거나 원장에 업무를 등록해 주세요." />}</div></div>;
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

function AppContent({ view, project, role, search, setView, pageState, onRetry, onCreate, canWrite }) {
  if (pageState.status === "loading" && !pageState.data) return <LoadingState />;
  if (pageState.status === "error" && !pageState.data) return <ErrorState error={pageState.error} onRetry={onRetry} />;
  const data = pageState.data || {};
  if (view === "tasks") return <TasksView role={role} query={search} tasks={data.items || []} onCreate={onCreate} canWrite={canWrite} />;
  if (view === "content") return <ContentView role={role} query={search} contents={data.items || []} onCreate={onCreate} canWrite={canWrite} />;
  if (view === "performance") return <PerformanceView performance={data} />;
  if (view === "files") return <FilesView role={role} files={data.files?.items || []} activities={data.activities?.items || []} onCreate={onCreate} canWrite={canWrite} />;
  return <OverviewView project={data.project || project} role={role} activities={data.activities || []} onNavigate={setView} />;
}

const blankPage = { status: "idle", data: null, error: null, resource: null, projectId: null };

export function App() {
  const [{ source, error: configError }] = useState(sourceFactory);
  const [sourceState, setSourceState] = useState(() => source?.getState() || { mode: "live", phase: "error", error: configError });
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
  const [desktopNavigation, setDesktopNavigation] = useState({ stage: 0, direction: "collapse" });
  const [retryKey, setRetryKey] = useState(0);
  const [createEntity, setCreateEntity] = useState(null);
  const [saveNotice, setSaveNotice] = useState(null);
  const activeProjectIdRef = useRef(null);
  const bootstrapOverviewProjectRef = useRef(null);
  const live = Boolean(source);
  const compactViewport = useMediaQuery("(max-width: 900px)");
  const actorRole = bootstrapState.data?.actor?.role || "client";
  const navigation = getNavigationPresentation({
    role: actorRole,
    compactViewport,
    desktopStage: desktopNavigation.stage,
    desktopDirection: desktopNavigation.direction,
    drawerOpen: sidebarOpen,
  });

  useEffect(() => source?.subscribe(setSourceState), [source]);
  useEffect(() => {
    if (live && session && sourceState.user === null && sourceState.error?.code === "unauthorized") setSession(null);
  }, [live, session, sourceState.user, sourceState.error]);
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

  const loadBootstrap = useCallback(async (signal) => {
    if (!source || !source.getSession()) return;
    setBootstrapState({ status: "loading", data: null, error: null });
    try {
      const envelope = await source.bootstrap({ signal });
      if (signal?.aborted) return;
      const data = bootstrapViewModel(envelope);
      const currentProjectId = activeProjectIdRef.current;
      const nextProjectId = data.projects[currentProjectId]
        ? currentProjectId
        : data.clients[0]?.projectId || Object.keys(data.projects)[0] || null;
      setBootstrapState({ status: "ready", data, error: null });
      setActiveClient((current) => data.clients.some((item) => item.id === current) ? current : data.clients[0]?.id || null);
      setActiveProjectId(nextProjectId);
      activeProjectIdRef.current = nextProjectId;
      if (data.initialOverview?.projectId === nextProjectId && data.initialOverview?.data) {
        bootstrapOverviewProjectRef.current = nextProjectId;
        setOverviewState({
          status: "ready",
          data: overviewViewModel(
            { ...envelope, data: data.initialOverview.data },
            data.projects[nextProjectId],
          ),
          error: null,
          resource: "overview",
          projectId: nextProjectId,
        });
      } else {
        bootstrapOverviewProjectRef.current = null;
        setOverviewState(blankPage);
      }
      if (data.initialTasks?.projectId === nextProjectId && data.initialTasks?.data) {
        setResourceState({
          status: "ready",
          data: tasksViewModel({ ...envelope, data: data.initialTasks.data }),
          error: null,
          resource: "tasks",
          projectId: nextProjectId,
        });
      } else {
        setResourceState(blankPage);
      }
    } catch (error) {
      if (signal?.aborted) return;
      if (error.code === "unauthorized") setSession(null);
      setBootstrapState({ status: "error", data: null, error });
    }
  }, [source]);

  useEffect(() => {
    if (!session) return undefined;
    const controller = new AbortController();
    loadBootstrap(controller.signal);
    return () => controller.abort();
  }, [session, loadBootstrap, retryKey]);

  useEffect(() => {
    if (!source || !activeProjectId || bootstrapState.status !== "ready") return undefined;
    if (bootstrapOverviewProjectRef.current === activeProjectId) {
      bootstrapOverviewProjectRef.current = null;
      return undefined;
    }
    const controller = new AbortController();
    setOverviewState({ status: "loading", data: null, error: null, resource: "overview", projectId: activeProjectId });
    source.overview({ projectId: activeProjectId, signal: controller.signal }).then((envelope) => setOverviewState({ status: "ready", data: overviewViewModel(envelope, bootstrapState.data.projects[activeProjectId]), error: null, resource: "overview", projectId: activeProjectId })).catch((error) => { if (!controller.signal.aborted) { if (error.code === "unauthorized") setSession(null); setOverviewState({ status: "error", data: null, error, resource: "overview", projectId: activeProjectId }); } });
    return () => controller.abort();
  }, [source, activeProjectId, bootstrapState.status, bootstrapState.data, retryKey]);

  useEffect(() => {
    if (!source || !activeProjectId || view === "overview" || bootstrapState.status !== "ready") return undefined;
    if (view === "tasks" && resourceState.status === "ready" && resourceState.resource === "tasks" && resourceState.projectId === activeProjectId) {
      return undefined;
    }
    const controller = new AbortController();
    setResourceState({ status: "loading", data: null, error: null, resource: view, projectId: activeProjectId });
    const params = { projectId: activeProjectId, limit: 200, signal: controller.signal };
    let request;
    if (view === "tasks") request = source.tasks(params).then(tasksViewModel);
    if (view === "content") request = source.contents(params).then(contentsViewModel);
    if (view === "performance") request = source.performance(params).then(performanceViewModel);
    if (view === "files") request = Promise.all([source.files(params), source.activity(params)]).then(([files, activity]) => ({ files: filesViewModel(files), activities: activityListViewModel(activity) }));
    request.then((data) => setResourceState({ status: "ready", data, error: null, resource: view, projectId: activeProjectId })).catch((error) => { if (!controller.signal.aborted) { if (error.code === "unauthorized") setSession(null); setResourceState({ status: "error", data: null, error, resource: view, projectId: activeProjectId }); } });
    return () => controller.abort();
  }, [source, activeProjectId, view, bootstrapState.status, retryKey]);

  useEffect(() => { if (window.location.hash.slice(1) !== view) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${view}`); }, [view]);

  const handleLogin = async (credentials) => {
    setLoginError(null);
    try { await source.login(credentials); setSession(source.getSession()); } catch (error) { setLoginError(error); }
  };

  const logout = () => {
    source.logout();
    activeProjectIdRef.current = null;
    bootstrapOverviewProjectRef.current = null;
    setSession(null);
    setBootstrapState(blankPage);
    setOverviewState(blankPage);
    setResourceState(blankPage);
    setCreateEntity(null);
    setSaveNotice(null);
  };

  if (configError) return <ErrorState error={configError} title="연동 설정을 확인해 주세요." />;
  if (live && !session) return <LoginScreen onLogin={handleLogin} error={loginError} loading={sourceState.action === "login" && sourceState.phase === "loading"} configured={source.config.hasEndpoint} />;
  if (bootstrapState.status === "loading" || bootstrapState.status === "idle") return <LoadingState label="접근 가능한 프로젝트를 확인하는 중입니다." />;
  if (bootstrapState.status === "error") return <ErrorState error={bootstrapState.error} onRetry={() => setRetryKey((value) => value + 1)} title="프로젝트 목록을 불러오지 못했습니다." />;
  if (!bootstrapState.data?.clients.length || !activeProjectId) return <EmptyState title="배정된 프로젝트가 없습니다" description="관리자가 사용자 권한과 프로젝트 배정을 확인해야 합니다." />;

  const selectedClient = bootstrapState.data.clients.find((client) => client.id === activeClient) || bootstrapState.data.clients[0];
  const baseProject = bootstrapState.data.projects[activeProjectId] || bootstrapState.data.projects[selectedClient.projectId];
  const project = overviewState.projectId === activeProjectId ? overviewState.data?.project || baseProject : baseProject;
  const actor = bootstrapState.data.actor;
  const role = actor?.role || "client";
  const currentPage = view === "overview"
    ? overviewState.projectId === activeProjectId ? overviewState : { ...blankPage, status: "loading", resource: "overview", projectId: activeProjectId }
    : resourceState.resource === view && resourceState.projectId === activeProjectId ? resourceState : { ...blankPage, status: "loading", resource: view, projectId: activeProjectId };
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
    setRetryKey((value) => value + 1);
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
  };

  const toggleNavigation = () => {
    if (navigation.usesDrawer) {
      setSidebarOpen((current) => !current);
      return;
    }
    setDesktopNavigation((current) => getNextDesktopNavigationState(current));
  };

  return (
    <div className={`app-shell ${navigation.shellCollapsed ? "is-navigation-collapsed" : ""} ${navigation.clientRailCollapsed ? "is-client-rail-collapsed" : ""} ${navigation.projectSidebarCollapsed ? "is-project-sidebar-collapsed" : ""} ${navigation.isDrawerOpen ? "is-navigation-drawer-open" : ""} ${role === "client" ? "is-client-view" : ""}`}>
      <ClientRail clients={bootstrapState.data.clients} activeClient={selectedClient.id} onSelect={selectClient} visible={navigation.clientRailVisible} />
      <ProjectSidebar project={project} activeView={view} onView={setView} open={navigation.isDrawerOpen} onClose={() => setSidebarOpen(false)} taskCount={taskCount} sourceState={sourceState} connectionReady={connectionReady} visible={navigation.projectSidebarVisible} />
      {sidebarOpen && <button className="mobile-overlay" onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기" />}
      <div className="app-main"><Topbar project={project} actor={actor} onLogout={logout} live={live} search={search} setSearch={setSearch} navigation={navigation} onToggleNavigation={toggleNavigation} /><main className="content-canvas"><AppContent view={view} project={project} role={role} search={search} setView={setView} pageState={currentPage} onRetry={() => setRetryKey((value) => value + 1)} onCreate={setCreateEntity} canWrite={canWrite} /></main><footer className="app-footer"><span>{connectionReady ? "Google Sheets 연결됨" : "연결 확인 중"}</span><span>마지막 동기화 {formatSyncTime(sourceState.lastSuccessfulAt)}</span></footer></div>
      {createEntity && <CreateRecordModal entityType={createEntity} role={role} onClose={() => setCreateEntity(null)} onSubmit={createRecord} />}
      {saveNotice && <div className="save-toast" role="status"><Check size={16} />{saveNotice}</div>}
    </div>
  );
}
