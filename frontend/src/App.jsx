import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  FileText,
  FolderOpen,
  GalleryHorizontalEnd,
  LayoutDashboard,
  ListFilter,
  Menu,
  MoreHorizontal,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  activities,
  clients,
  contents,
  kpis,
  projects,
  roleOptions,
  tasks,
} from "./data/demoData.js";

const navItems = [
  { id: "overview", label: "총괄 현황", icon: LayoutDashboard },
  { id: "tasks", label: "업무", icon: ClipboardCheck },
  { id: "content", label: "콘텐츠", icon: GalleryHorizontalEnd },
  { id: "performance", label: "성과", icon: BarChart3 },
  { id: "files", label: "자료·활동", icon: FolderOpen },
];

const statusClass = {
  완료: "status status-success",
  진행: "status status-active",
  검토: "status status-review",
  "고객 확인": "status status-waiting",
  대기: "status status-muted",
  기획: "status status-active",
  제작: "status status-review",
  아이디어: "status status-muted",
  게시예약: "status status-success",
};

function LogoMark() {
  return <div className="brand-mark" aria-label="Pocket Company">P</div>;
}

function ProgressBar({ value, color = "var(--accent)" }) {
  return (
    <div className="progress-track" aria-label={`${value}% 진행`}>
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(value, 100))}%`, background: color }} />
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <FolderOpen size={22} strokeWidth={1.7} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function ClientRail({ activeClient, onSelect, onOpenMobile }) {
  return (
    <aside className="client-rail" aria-label="고객사 선택">
      <div className="rail-top">
        <LogoMark />
        <span className="rail-separator" />
        {clients.map((client) => (
          <button
            key={client.id}
            className={`client-button ${activeClient === client.id ? "is-active" : ""}`}
            onClick={() => onSelect(client.id)}
            title={`${client.name} · ${client.descriptor}`}
          >
            <span>{client.initials}</span>
            <i className={`presence ${client.status}`} />
          </button>
        ))}
      </div>
      <button className="rail-button mobile-menu-button" onClick={onOpenMobile} aria-label="메뉴 열기">
        <Menu size={18} />
      </button>
      <button className="rail-button" aria-label="환경 설정" title="환경 설정은 다음 단계에서 연결됩니다">
        <Settings2 size={18} />
      </button>
    </aside>
  );
}

function ProjectSidebar({ project, activeView, onView, open, onClose }) {
  return (
    <aside className={`project-sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar-header">
        <div>
          <p className="eyebrow">{project.clientName}</p>
          <h1>{project.name}</h1>
        </div>
        <button className="icon-button mobile-close" onClick={onClose} aria-label="메뉴 닫기"><X size={17} /></button>
      </div>

      <div className="project-switcher">
        <div>
          <span className="project-dot" />
          <strong>{project.status}</strong>
        </div>
        <ChevronDown size={15} />
      </div>

      <nav className="project-nav">
        <p className="nav-label">프로젝트</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={activeView === item.id ? "is-active" : ""}
              onClick={() => {
                onView(item.id);
                onClose();
              }}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.id === "tasks" && <em>103</em>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-section">
        <p className="nav-label">현재 단계</p>
        <div className="phase-brief">
          <div className="phase-number">P0</div>
          <div>
            <strong>구축 3주</strong>
            <span>9월 1일 — 9월 21일</span>
          </div>
        </div>
        <ProgressBar value={32} />
      </div>

      <div className="sidebar-footer">
        <ShieldCheck size={16} />
        <div>
          <strong>비식별 데모 데이터</strong>
          <span>실제 Google Sheet 미연결</span>
        </div>
      </div>
    </aside>
  );
}

function RoleSwitcher({ role, setRole }) {
  const [open, setOpen] = useState(false);
  const selected = roleOptions.find((item) => item.id === role);
  return (
    <div className="role-switcher">
      <button className="role-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <div className="avatar"><Users size={15} /></div>
        <span><strong>{selected.label}</strong><small>{selected.detail}</small></span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="role-menu">
          <p>데모 권한 전환</p>
          {roleOptions.map((item) => (
            <button
              key={item.id}
              className={role === item.id ? "is-active" : ""}
              onClick={() => {
                setRole(item.id);
                setOpen(false);
              }}
            >
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              {role === item.id && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Topbar({ project, role, setRole, search, setSearch }) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>{project.clientName}</span>
        <ArrowRight size={13} />
        <strong>{project.name}</strong>
      </div>
      <div className="topbar-actions">
        <label className="global-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="업무·콘텐츠 검색" />
        </label>
        <RoleSwitcher role={role} setRole={setRole} />
      </div>
    </header>
  );
}

function MetricCard({ metric, index, onOpen }) {
  return (
    <button className={`metric-card tone-${metric.tone}`} onClick={onOpen}>
      <div className="metric-topline">
        <span>{metric.label}</span>
        <ArrowRight size={14} />
      </div>
      <strong>{metric.value}</strong>
      <small>{metric.helper}</small>
      {metric.progress !== null && <ProgressBar value={metric.progress} color={`var(--tone-${metric.tone})`} />}
      <i>0{index + 1}</i>
    </button>
  );
}

function OverviewView({ project, role, onNavigate }) {
  const isClient = role === "client";
  return (
    <div className="view-stack">
      <section className="project-hero">
        <div>
          <p className="editorial-kicker">{project.label}</p>
          <div className="hero-title-row">
            <h2>{project.name}</h2>
            <span className="project-status"><CircleDot size={13} />{project.status}</span>
          </div>
          <p>{project.objective}</p>
        </div>
        <dl className="hero-meta">
          <div><dt>현재 단계</dt><dd>{project.phase}</dd></div>
          <div><dt>프로젝트 기간</dt><dd>{project.period}</dd></div>
          <div><dt>최근 업데이트</dt><dd>{project.updatedAt}</dd></div>
        </dl>
      </section>

      <section className="metric-grid" aria-label="핵심 현황">
        {project.metrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            metric={metric}
            index={index}
            onOpen={() => onNavigate(index === 2 ? "content" : "tasks")}
          />
        ))}
      </section>

      <section className="overview-grid">
        <div className="panel phase-panel">
          <div className="panel-heading">
            <div><span className="section-number">01</span><h3>90일 진행 흐름</h3></div>
            <button className="text-button" onClick={() => onNavigate("tasks")}>업무 전체 보기 <ArrowRight size={14} /></button>
          </div>
          <div className="phase-timeline">
            {project.phases.map((phase, index) => (
              <article key={phase.id} className={phase.state === "current" ? "is-current" : ""}>
                <div className="phase-head">
                  <span>{phase.code}</span>
                  <small>{phase.state === "current" ? "현재" : `${index + 1}단계`}</small>
                </div>
                <h4>{phase.label}</h4>
                <div className="phase-stats"><span>업무 {phase.tasks}</span><span>발행 {phase.output}</span></div>
                <ProgressBar value={phase.progress} color={phase.state === "current" ? "var(--accent)" : "var(--rule-dark)"} />
                <strong>{phase.progress}%</strong>
              </article>
            ))}
          </div>
        </div>

        <div className="panel attention-panel">
          <div className="panel-heading">
            <div><span className="section-number">02</span><h3>{isClient ? "이번 주 확인" : "우선 확인할 일"}</h3></div>
            <AlertCircle size={17} />
          </div>
          {project.attention.length ? (
            <div className="attention-list">
              {project.attention.map((item) => (
                <article key={item.id}>
                  <div className="attention-title"><span>{item.level}</span><strong>{item.title}</strong></div>
                  <p>{item.detail}</p>
                  <footer><span>{isClient ? "포켓컴퍼니" : item.owner}</span><time>{item.due}</time></footer>
                </article>
              ))}
            </div>
          ) : <EmptyState title="확인할 항목이 없습니다" description="프로젝트가 시작되면 중요 항목이 표시됩니다." />}
        </div>
      </section>

      <section className="overview-grid lower-grid">
        <div className="panel workstream-panel">
          <div className="panel-heading">
            <div><span className="section-number">03</span><h3>분야별 진행</h3></div>
            <span className="panel-note">완료 업무 기준</span>
          </div>
          <div className="workstream-list">
            {project.workstreams.map((stream) => {
              const percent = Math.round((stream.done / stream.total) * 100) || 0;
              return (
                <article key={stream.id}>
                  <div className="stream-icon" style={{ color: stream.color }}>
                    {stream.id === "video" ? <Video size={17} /> : stream.id === "design" ? <Sparkles size={17} /> : <BarChart3 size={17} />}
                  </div>
                  <div className="stream-body">
                    <div><strong>{stream.name}</strong><span>{stream.summary}</span></div>
                    <ProgressBar value={percent} color={stream.color} />
                  </div>
                  <strong className="stream-score">{stream.done}<small>/{stream.total}</small></strong>
                </article>
              );
            })}
          </div>
        </div>

        <div className="panel activity-panel">
          <div className="panel-heading">
            <div><span className="section-number">04</span><h3>최근 업데이트</h3></div>
            <button className="icon-button" onClick={() => onNavigate("files")} aria-label="활동 전체 보기"><MoreHorizontal size={17} /></button>
          </div>
          <div className="activity-list">
            {activities.slice(0, 4).map((item) => (
              <article key={item.id}>
                <span className={`activity-icon type-${item.type}`}>
                  {item.type === "task" ? <Check size={14} /> : item.type === "content" ? <Video size={14} /> : item.type === "schedule" ? <CalendarDays size={14} /> : <BarChart3 size={14} />}
                </span>
                <div><strong>{item.title}</strong><span>{item.meta}{!isClient && ` · ${item.internalMeta}`}</span></div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ViewHeader({ eyebrow, title, description, children }) {
  return (
    <div className="view-header">
      <div>
        <p className="editorial-kicker">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children && <div className="view-actions">{children}</div>}
    </div>
  );
}

function TasksView({ role, query }) {
  const [phase, setPhase] = useState("전체");
  const [stream, setStream] = useState("전체");
  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (role === "client" && !task.clientVisible) return false;
    if (phase !== "전체" && task.phase !== phase) return false;
    if (stream !== "전체" && task.stream !== stream) return false;
    if (query && !`${task.title} ${task.parent} ${task.owner}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [phase, stream, role, query]);

  return (
    <div className="view-stack">
      <ViewHeader eyebrow="EXECUTION BOARD" title="업무" description={role === "client" ? "고객 공개 업무의 일정과 완료 결과를 확인합니다." : "103개 업무를 단계·분야·상태별로 관리합니다."}>
        <button className="secondary-button"><CalendarDays size={15} /> 일정 보기</button>
        {role !== "client" && <button className="primary-button">업무 추가</button>}
      </ViewHeader>
      <div className="filter-bar">
        <ListFilter size={16} />
        <div className="segmented-control">
          {["전체", "P0", "M1", "M2", "M3"].map((item) => <button key={item} className={phase === item ? "is-active" : ""} onClick={() => setPhase(item)}>{item}</button>)}
        </div>
        <select value={stream} onChange={(event) => setStream(event.target.value)}>
          <option>전체</option><option>전략·마케팅</option><option>디자인</option><option>영상</option>
        </select>
        <span className="result-count">{visibleTasks.length}건 표시</span>
      </div>
      <div className="data-table task-table">
        <div className="table-head"><span>업무</span><span>단계·분야</span><span>담당</span><span>마감</span><span>상태</span></div>
        {visibleTasks.map((task) => (
          <button className="table-row" key={task.id}>
            <span className="task-title"><small>{task.parent}</small><strong>{task.title}</strong></span>
            <span><em>{task.phase}</em>{task.stream}</span>
            <span>{role === "client" ? "포켓컴퍼니" : task.owner}</span>
            <span>{task.due}</span>
            <span><i className={statusClass[task.status] || "status status-muted"}>{task.status}</i><ArrowRight size={14} /></span>
          </button>
        ))}
        {!visibleTasks.length && <EmptyState title="조건에 맞는 업무가 없습니다" description="단계나 분야 필터를 바꿔보세요." />}
      </div>
    </div>
  );
}

function ContentView({ role, query }) {
  const [channel, setChannel] = useState("전체");
  const [mode, setMode] = useState("list");
  const visibleContents = contents.filter((content) => {
    if (role === "client" && !content.visible) return false;
    if (channel !== "전체" && content.channel !== channel) return false;
    if (query && !`${content.title} ${content.channel}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const channelSummary = [
    { label: "유튜브 롱폼", value: 2, total: 2 },
    { label: "유튜브 숏폼", value: 3, total: 10 },
    { label: "인스타 피드", value: 2, total: 10 },
    { label: "네이버 블로그", value: 1, total: 10 },
  ];
  return (
    <div className="view-stack">
      <ViewHeader eyebrow="CONTENT OPERATIONS" title="콘텐츠" description="콘텐츠는 업무와 분리해 기획부터 게시까지 하나의 원장으로 관리합니다.">
        <div className="segmented-control compact"><button className={mode === "list" ? "is-active" : ""} onClick={() => setMode("list")}>목록</button><button className={mode === "calendar" ? "is-active" : ""} onClick={() => setMode("calendar")}>캘린더</button></div>
        {role !== "client" && <button className="primary-button">콘텐츠 추가</button>}
      </ViewHeader>
      <section className="content-summary">
        <div className="content-summary-title"><span>구축 P0</span><strong>8 / 32</strong><small>초기 콘텐츠 발행</small></div>
        {channelSummary.map((item) => (
          <div key={item.label} className="content-quota"><span>{item.label}</span><strong>{item.value}<small>/{item.total}</small></strong><ProgressBar value={(item.value / item.total) * 100} /></div>
        ))}
      </section>
      <div className="filter-bar">
        <ListFilter size={16} />
        <div className="segmented-control">
          {["전체", "유튜브", "인스타그램", "네이버 블로그"].map((item) => <button key={item} className={channel === item ? "is-active" : ""} onClick={() => setChannel(item)}>{item}</button>)}
        </div>
        <span className="result-count">{visibleContents.length}건 표시</span>
      </div>
      {mode === "list" ? (
        <div className="content-grid">
          {visibleContents.map((content) => (
            <article className="content-card" key={content.id}>
              <header><span>{content.channel}</span><i className={statusClass[content.status] || "status status-muted"}>{content.status}</i></header>
              <p>{content.format}</p><h3>{content.title}</h3>
              <footer><span><CalendarDays size={14} /> {content.date}</span><span>{role === "client" ? "포켓컴퍼니" : content.owner}</span></footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="calendar-board">
          {["월 7", "화 8", "수 9", "목 10", "금 11"].map((day, index) => (
            <div key={day}><strong>{day}</strong>{visibleContents.filter((_, contentIndex) => contentIndex % 5 === index).map((content) => <article key={content.id}><small>{content.channel}</small><span>{content.title}</span><i>{content.status}</i></article>)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function PerformanceView() {
  return (
    <div className="view-stack">
      <ViewHeader eyebrow="PERFORMANCE" title="성과" description="산출물 이행과 실제 고객 행동을 분리해 판단합니다.">
        <button className="secondary-button"><CalendarDays size={15} /> 9월</button>
      </ViewHeader>
      <section className="performance-intro panel">
        <div><span className="section-number">01</span><h3>핵심 KPI</h3><p>문서에 정의된 6개 지표를 목표 대비로 봅니다. 현재 수치는 비식별 샘플입니다.</p></div>
        <div className="performance-score"><strong>42<small>%</small></strong><span>가중 달성률</span></div>
      </section>
      <section className="kpi-grid">
        {kpis.map((kpi, index) => {
          const percent = Math.min(100, Math.round((kpi.value / kpi.target) * 100));
          return (
            <article key={kpi.id} className="kpi-card">
              <header><span>0{index + 1}</span><i>{kpi.weight}%</i></header>
              <h3>{kpi.name}</h3>
              <div className="kpi-value"><strong>{kpi.value.toLocaleString()}</strong><small>{kpi.unit}</small><span>/ 목표 {kpi.target.toLocaleString()}</span></div>
              <ProgressBar value={percent} color={percent >= 70 ? "var(--olive)" : "var(--accent)"} />
              <footer><span>{percent}% 달성</span><span>{kpi.source}</span></footer>
            </article>
          );
        })}
      </section>
      <section className="panel funnel-panel">
        <div className="panel-heading"><div><span className="section-number">02</span><h3>자사몰 행동 흐름</h3></div><span className="panel-note">샘플 데이터</span></div>
        <div className="funnel-flow">
          {[{label:"방문",value:"1,240"},{label:"상세 조회",value:"678"},{label:"문의",value:"14"},{label:"쇼룸 예약",value:"8"}].map((item, index) => <article key={item.label}><span>0{index + 1}</span><strong>{item.value}</strong><small>{item.label}</small>{index < 3 && <ArrowRight size={17} />}</article>)}
        </div>
      </section>
    </div>
  );
}

function FilesView({ role }) {
  const files = [
    { type: "실행계획", title: "UND 90일 실행계획 · 고객 공유용", date: "8월 25일", visibility: "고객 공개" },
    { type: "트래커", title: "UND 90일 팀 트래커", date: "8월 25일", visibility: role === "client" ? "고객 공개" : "프로젝트팀" },
    { type: "리포트", title: "8월 채널 기초 측정", date: "8월 31일", visibility: "고객 공개" },
  ];
  return (
    <div className="view-stack">
      <ViewHeader eyebrow="FILES & ACTIVITY" title="자료·활동" description="산출물 근거와 최근 변경 흐름을 한곳에서 확인합니다.">
        {role !== "client" && <button className="primary-button">자료 등록</button>}
      </ViewHeader>
      <section className="overview-grid file-grid">
        <div className="panel">
          <div className="panel-heading"><div><span className="section-number">01</span><h3>최근 자료</h3></div><FileText size={17} /></div>
          <div className="file-list">
            {files.map((file) => (
              <button key={file.title}><span className="file-icon"><FileText size={17} /></span><span><strong>{file.title}</strong><small>{file.type} · {file.date}</small></span><i>{file.visibility}</i><ArrowRight size={14} /></button>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading"><div><span className="section-number">02</span><h3>활동 기록</h3></div><Activity size={17} /></div>
          <div className="activity-timeline">
            {activities.map((item) => <article key={item.id}><span /><div><strong>{item.title}</strong><p>{item.meta}</p>{role !== "client" && <small>{item.internalMeta}</small>}</div></article>)}
          </div>
        </div>
      </section>
    </div>
  );
}

function AppContent({ view, project, role, search, setView }) {
  if (view === "tasks") return <TasksView role={role} query={search} />;
  if (view === "content") return <ContentView role={role} query={search} />;
  if (view === "performance") return <PerformanceView />;
  if (view === "files") return <FilesView role={role} />;
  return <OverviewView project={project} role={role} onNavigate={setView} />;
}

export function App() {
  const [activeClient, setActiveClient] = useState("und");
  const initialView = typeof window !== "undefined" && navItems.some((item) => item.id === window.location.hash.slice(1))
    ? window.location.hash.slice(1)
    : "overview";
  const initialRole = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("role")
    : "pocket";
  const [view, setView] = useState(initialView);
  const [role, setRole] = useState(roleOptions.some((item) => item.id === initialRole) ? initialRole : "pocket");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const selectedClient = clients.find((client) => client.id === activeClient);
  const project = projects[selectedClient.projectId];

  useEffect(() => {
    if (window.location.hash.slice(1) !== view) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${view}`);
    }
  }, [view]);

  const selectClient = (clientId) => {
    setActiveClient(clientId);
    setView("overview");
    setSearch("");
  };

  return (
    <div className="app-shell">
      <ClientRail activeClient={activeClient} onSelect={selectClient} onOpenMobile={() => setSidebarOpen(true)} />
      <ProjectSidebar project={project} activeView={view} onView={setView} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && <button className="mobile-overlay" onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기" />}
      <div className="app-main">
        <Topbar project={project} role={role} setRole={setRole} search={search} setSearch={setSearch} />
        <main className="content-canvas">
          <AppContent view={view} project={project} role={role} search={search} setView={setView} />
        </main>
        <footer className="app-footer">
          <span><ShieldCheck size={14} /> 비식별 데모 · 실제 원장 미연결</span>
          <span>Schema 2026-08-25-v1</span>
        </footer>
      </div>
    </div>
  );
}
