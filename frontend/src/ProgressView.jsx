import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, MessageSquare, Plus, RefreshCw, X } from "lucide-react";
import { dailyMeetingsViewModel } from "./api/viewModel.js";
import { isViewAllowed } from "./accessPermissions.js";
import { appendBriefReply, briefRequestFields, latestBriefMeeting, progressBriefTasks, publicHttpLink } from "./progressBrief.js";
import "./progressView.css";

const shortDate = value => value ? String(value).slice(5, 10).replace("-", ".") : "미정";
const statusLabels = { NOT_STARTED: "미착수", IN_PROGRESS: "진행 중", DONE: "완료", REVIEW: "검토 중", BLOCKED: "차단", ON_HOLD: "보류" };
function Tag({ code, children }) {
  return <span className={`pb-tag ${code === "DONE" ? "is-done" : ["ON_HOLD", "BLOCKED"].includes(code) ? "is-wait" : ""}`}>{children || statusLabels[code] || code}</span>;
}
function Empty({ children }) { return <p className="pb-empty">{children}</p>; }
function Link({ value, children = "자료 열기" }) {
  const href = publicHttpLink(value);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={13} /></a> : null;
}
function TaskColumn({ title, subtitle, items, planned, client, onTasks }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 5);
  return <section className="pb-panel"><header><div><h2>{title}</h2><small>{subtitle} · {items.length}건</small></div><button onClick={onTasks}>업무 보기 <ArrowUpRight size={13} /></button></header>
    {items.length ? <div className="pb-task-list">{visible.map(task => <article key={task.id} className="pb-task">
      {planned ? <span className="pb-date">{shortDate(task.plannedStartDate || task.dueDate)}</span> : <Tag code={task.statusCode} />}
      <div><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<small>{client ? "포켓컴퍼니" : task.responsibleOrg || task.owner || "담당 미정"} · {planned ? `마감 ${shortDate(task.dueDate)}` : task.updatedAt ? `갱신 ${shortDate(task.updatedAt)}` : "갱신일 미등록"}</small>
      <Link value={task.completionUrl}>완료 자료</Link></div></article>)}</div> : <Empty>{planned ? "이번 주에 일정이 등록된 미완료 업무가 없습니다." : "진행되거나 완료된 업무가 없습니다."}</Empty>}
    {items.length > 5 && <button className="pb-more" onClick={() => setExpanded(value => !value)}>{expanded ? "간단히 보기" : `전체 ${items.length}건 펼치기`}</button>}
  </section>;
}
function RequestForm({ owners, onCreate, onClose }) {
  const [fields, setFields] = useState({ title: "", body: "", owner: owners[0], kind: "콘텐츠 검토", link: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const field = (name, value) => setFields(current => ({ ...current, [name]: value }));
  const submit = async event => {
    event.preventDefault(); setSaving(true); setError("");
    try { await onCreate(briefRequestFields(fields)); onClose(); }
    catch (err) { setError(err.message || "요청을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };
  return <form className="pb-request-form" onSubmit={submit}>
    <div className="pb-form-row"><label>확인할 사람<select value={fields.owner} onChange={e => field("owner", e.target.value)}>{owners.map(owner => <option key={owner}>{owner}</option>)}</select></label><label>유형<select value={fields.kind} onChange={e => field("kind", e.target.value)}>{["콘텐츠 검토", "자료 요청", "내용 확인"].map(kind => <option key={kind}>{kind}</option>)}</select></label></div>
    <label>제목<input autoFocus required maxLength={500} value={fields.title} onChange={e => field("title", e.target.value)} placeholder="확인이 필요한 내용을 적어 주세요" /></label>
    <label>내용<textarea required maxLength={20000} rows={3} value={fields.body} onChange={e => field("body", e.target.value)} /></label>
    <label>콘텐츠·자료 링크<input type="url" maxLength={2048} value={fields.link} onChange={e => field("link", e.target.value)} placeholder="https://…" /></label>
    {error && <p className="pb-error" role="alert">{error}</p>}
    <footer><small>고객에게 공유되는 요청입니다. 작성 이력은 로그인 계정으로 기록됩니다.</small><button type="button" onClick={onClose} disabled={saving}>취소</button><button className="pb-primary" disabled={saving}>{saving ? "저장 중…" : "요청 등록"}</button></footer>
  </form>;
}
function RequestCard({ issue, canWrite, actorName, onUpdate }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const done = issue.statusCode === "DONE";
  const save = async fields => {
    setSaving(true); setError("");
    try { await onUpdate(issue, fields); return true; }
    catch (err) { setError(err.code === "conflict" ? "다른 사용자가 먼저 변경했습니다. 최신 내용으로 갱신한 뒤 다시 저장해 주세요. 입력한 답변은 유지됩니다." : err.message || "저장하지 못했습니다."); return false; }
    finally { setSaving(false); }
  };
  const submitReply = async event => {
    event.preventDefault();
    try {
      if (await save(appendBriefReply(issue, reply, actorName))) { setReply(""); setReplyOpen(false); }
    } catch (err) { setError(err.message); }
  };
  return <article className="pb-request"><div className="pb-request-meta"><span>{issue.kind || "확인 요청"} · 확인 담당 {issue.owner || "미지정"} · {shortDate(issue.date)}</span><Tag code={done ? "DONE" : "ON_HOLD"}>{done ? "확인 완료" : "확인 필요"}</Tag></div>
    <h3>{issue.relatedTask || "확인 요청"}</h3><p>{issue.body || "등록된 내용이 없습니다."}</p><Link value={issue.completionUrl} />
    {issue.remarks && <details className="pb-replies"><summary>답변·추가 메모 보기</summary><p>{issue.remarks}</p></details>}
    {canWrite && <div className="pb-request-actions"><button disabled={saving} onClick={() => setReplyOpen(!replyOpen)}><MessageSquare size={13} />답변 작성</button><button disabled={saving} onClick={() => save({ status_code: done ? "IN_PROGRESS" : "DONE" })}><Check size={13} />{done ? "다시 확인 요청" : "확인 완료"}</button></div>}
    {replyOpen && <form className="pb-reply-form" onSubmit={submitReply}><label>답변<textarea required maxLength={4000} rows={3} value={reply} onChange={e => setReply(e.target.value)} /></label><button disabled={saving}>{saving ? "저장 중…" : "답변 저장"}</button></form>}
    {error && <p className="pb-error" role="alert">{error}</p>}
  </article>;
}
export function ProgressView({ project, role, taskPage, source, actorName, canWrite, onIssueCreate, onIssueUpdate, onNavigate }) {
  const [now, setNow] = useState(() => new Date());
  const [meetingState, setMeetingState] = useState({ status: "loading", items: [] });
  const [meetingRetry, setMeetingRetry] = useState(0);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("open");
  const [allRequests, setAllRequests] = useState(false);
  const client = role === "client";
  const canReadMeetings = !client || isViewAllowed("daily", project.allowedPages);
  const canWriteIssues = !client && canWrite && taskPage.issueCanWrite === true;
  const { week, progressed, planned } = useMemo(() => progressBriefTasks(taskPage.items || [], now), [taskPage.items, now]);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!canReadMeetings) { setMeetingState({ status: "forbidden", items: [] }); return; }
    const controller = new AbortController();
    setMeetingState({ status: "loading", items: [] });
    source.dailyMeetings({ projectId: project.id, limit: 100, signal: controller.signal })
      .then(envelope => { if (!controller.signal.aborted) setMeetingState({ status: "ready", items: dailyMeetingsViewModel(envelope).items }); })
      .catch(error => { if (!controller.signal.aborted) setMeetingState({ status: error.code === "forbidden" ? "forbidden" : "error", items: [], error }); });
    return () => controller.abort();
  }, [source, project.id, canReadMeetings, meetingRetry, taskPage.generatedAt]);
  const latest = latestBriefMeeting(meetingState.items, { client, today: week.today });
  const issues = taskPage.issues || [];
  const requests = issues.filter(issue => filter === "all" || (filter === "done" ? issue.statusCode === "DONE" : issue.statusCode !== "DONE"));
  const owners = [...new Set([project.clientName || "고객사", "포켓컴퍼니", "NS"])];
  return <div className="progress-brief">
    <div className="pb-heading"><div><small>업무 / 진행사항</small><h1>{project.name} · 진행사항</h1><p>진행된 업무와 이번 주 계획, 지난 회의와 확인할 내용을 공유합니다.</p></div><span>{shortDate(week.start)} — {shortDate(week.end)} · 이번 주</span></div>
    <div className="pb-work-grid">
      <TaskColumn title="진행된 업무" subtitle="실제 상태 기준 · 최근 갱신순" items={progressed} client={client} onTasks={() => onNavigate("tasks")} />
      <TaskColumn title="이번 주 진행 예정 업무" subtitle="월요일–일요일 · 등록 일정 기준" items={planned} planned client={client} onTasks={() => onNavigate("tasks")} />
    </div>
    <div className="pb-collab-grid">
      <section className="pb-panel"><header><h2>지난 회의 내용</h2>{canReadMeetings && <button onClick={() => onNavigate("daily")}>회의록 보기 <ArrowUpRight size={13} /></button>}</header>
        {meetingState.status === "loading" ? <Empty>회의 내용을 불러오는 중입니다.</Empty>
        : meetingState.status === "forbidden" ? <Empty>회의록 조회 권한이 필요합니다. 관리자에게 공개 범위를 확인해 주세요.</Empty>
        : meetingState.status === "error" ? <div className="pb-empty" role="alert">회의 내용을 불러오지 못했습니다.<button onClick={() => setMeetingRetry(value => value + 1)}><RefreshCw size={13} />다시 시도</button></div>
        : !latest ? <Empty>{client ? "공개된 지난 회의가 없습니다." : "등록된 지난 회의가 없습니다."}</Empty>
        : <div className="pb-meeting"><small>{latest.date} · {latest.visibilityCode === "CLIENT" ? "고객 공개" : latest.visibilityCode === "POCKET_ONLY" ? "포켓 전용" : "프로젝트 팀"}</small><h3>{latest.title}</h3>{latest.attendees && <p className="pb-attendees">참석 · {latest.attendees}</p>}<h4>논의한 내용</h4><p>{latest.discussion || "등록된 내용 없음"}</p><h4>결정된 내용</h4><p>{latest.decisions || "등록된 결정사항 없음"}</p><h4>후속 업무</h4><p>{latest.actionItems || "등록된 후속 업무 없음"}</p></div>}
      </section>
      <section className="pb-panel"><header><div><h2>서로 확인할 콘텐츠·내용</h2><small>확인 필요 {issues.filter(issue => issue.statusCode !== "DONE").length}건</small></div>{canWriteIssues && <button onClick={() => setAdding(!adding)}>{adding ? <X size={14} /> : <Plus size={14} />}{adding ? "닫기" : "확인 요청 올리기"}</button>}</header>
        <div className="pb-review-toolbar"><span>{canWriteIssues ? "업무의 이슈·추가요청과 같은 기록을 사용합니다." : "공유된 요청을 조회합니다. 등록·답변은 운영 담당자가 처리합니다."}</span><select aria-label="확인 요청 상태" value={filter} onChange={e => { setFilter(e.target.value); setAllRequests(false); }}><option value="open">확인 필요</option><option value="done">확인 완료</option><option value="all">전체</option></select></div>
        {adding && canWriteIssues && <RequestForm owners={owners} onCreate={async fields => { await onIssueCreate(fields); setFilter("open"); }} onClose={() => setAdding(false)} />}
        {requests.length ? (allRequests ? requests : requests.slice(0, 5)).map(issue => <RequestCard key={issue.id} issue={issue} canWrite={canWriteIssues} actorName={actorName} onUpdate={onIssueUpdate} />) : <Empty>해당 상태의 확인 요청이 없습니다.</Empty>}
        {requests.length > 5 && <button className="pb-more" onClick={() => setAllRequests(value => !value)}>{allRequests ? "간단히 보기" : `전체 ${requests.length}건 펼치기`}</button>}
      </section>
    </div>
  </div>;
}
