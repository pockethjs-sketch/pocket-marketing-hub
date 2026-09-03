import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("업무 화면은 중복 운영 보드 없이 일정표·간트·업무 로그로 구성한다", () => {
  assert.match(appSource, /initialSection = "schedule"/);
  assert.match(appSource, /function TaskWorkspaceTabs/);
  assert.match(appSource, /activityMode \? <TaskActivityLog/);
  assert.match(appSource, /onViewChange=\{selectTaskView\}/);
  assert.doesNotMatch(appSource, />운영 보드<\/button>/);
  assert.doesNotMatch(appSource, /onSectionChange\?\.\("list"\)/);
  assert.match(appSource, /initialSection="schedule"/);
});

test("일정표와 간트는 같은 원장 행을 두 가지 표시 방식으로 전환한다", () => {
  assert.match(appSource, /const \[displayMode, setDisplayMode\] = useState\(initialSection === "activity" \? "activity" : "table"\)/);
  assert.match(appSource, /aria-selected=\{activeView === "table"\}/);
  assert.match(appSource, /aria-selected=\{activeView === "gantt"\}/);
  assert.match(appSource, /is-table-view is-detailed/);
  assert.match(appSource, /className="gantt reference-gantt"/);
  assert.match(appSource, /className="g-hrow"/);
  assert.match(appSource, /className="g-grow"/);
  assert.match(appSource, /className="task-workspace-tab-check"/);
  assert.match(styleSource, /\.campaign-schedule-board \.reference-toolbar \.task-workspace-tabs button\[aria-selected="true"\][\s\S]*background:\s*#071a44/);
});

test("간트 프레임은 제공된 캠페인 HTML의 toolbar·panel·scroll 계층을 유지한다", () => {
  assert.match(appSource, /className="campaign-schedule-toolbar reference-toolbar toolbar"/);
  assert.match(appSource, /className="campaign-schedule-table-heading panel-head reference-panel-head"/);
  assert.match(appSource, /className="reference-gantt-scroll scroll"/);
  assert.match(appSource, />매체 · 업무<\/span>/);
  assert.match(styleSource, /\.reference-schedule-panel[\s\S]*border-radius:\s*8px/);
  assert.match(styleSource, /\.reference-gantt-scroll[\s\S]*max-height:\s*calc\(100vh - 250px\)/);
});

test("간트는 사각형 드래그로 일정 추가와 삭제를 구분하고 원장 저장으로 연결한다", () => {
  assert.match(appSource, /paintGanttRectangle/);
  assert.match(appSource, /mode: active \? "erase" : "paint"/);
  assert.match(appSource, /schedule_dates_json: serializeScheduleDates\(dates\)/);
  assert.doesNotMatch(appSource, /\.\.\.taskUpdateSubmissionFields\(taskUpdateInitialFields\(row\.task\)\)/);
  assert.match(appSource, /await onBatchUpdate\(batch\)/);
  assert.match(appSource, /offset \+= 40/);
  assert.match(appSource, /window\.addEventListener\("pointermove"/);
  assert.match(styleSource, /\.g-c\.on::before/);
  assert.match(styleSource, /\.g-track\.paint \.g-c:hover::after/);
});

test("간트 드래그 행은 카테고리로 묶인 실제 화면 순서와 동일하다", () => {
  assert.match(appSource, /const ganttTasks = useMemo\(\(\) => ganttGroups\.flatMap\(\(group\) => group\.tasks\), \[ganttGroups\]\)/);
  assert.match(appSource, /ganttTasksRef\.current = ganttTasks/);
  assert.match(appSource, /const rows = ganttTasksRef\.current\.map/);
  assert.match(appSource, /const rowIndex = ganttRowIndexById\.get\(task\.id\)/);
  assert.doesNotMatch(appSource, /filteredTasks\.findIndex\(\(item\) => item\.id === task\.id\)/);
});

test("참고 캠페인 일정 화면이 업무 화면의 최상위 구조이며 로그는 툴바에서 연다", () => {
  assert.match(appSource, /className="campaign-schedule-board"/);
  assert.match(appSource, /className="campaign-board-progress"/);
  assert.match(appSource, /onClick=\{\(\) => onChange\("activity"\)\}/);
  assert.match(appSource, /<TaskScheduleInlineTable tasks=\{filteredTasks\}/);
});

test("일정표는 참고 HTML 열 구조를 유지하며 셀 직접 수정과 상태·담당 클릭 저장을 제공한다", () => {
  assert.match(appSource, /<th>매체<\/th><th>업무<\/th><th>세부내용<\/th><th>시작일<\/th><th>종료일<\/th><th>기간<\/th><th>진행률<\/th><th>상태<\/th><th>담당<\/th><th>완료링크<\/th><th>비고<\/th>/);
  assert.match(appSource, /function TaskScheduleInlineRow/);
  assert.match(appSource, /onBlur=\{\(event\) => void commitField\("description"/);
  assert.match(appSource, /onBlur=\{\(event\) => void commitField\("completion_url"/);
  assert.match(appSource, /onClick=\{cycleStatus\}/);
  assert.match(appSource, /onClick=\{cycleOwner\}/);
  assert.match(appSource, /schedule_dates_json: start && end \? serializeScheduleDates\(scheduleDateRange\(start, end\)\) : null/);
  assert.match(styleSource, /\.campaign-schedule-surface \.reference-task-table[\s\S]*min-width:\s*1450px/);
});

test("업무 로그에서도 일정표·간트·업무 로그 탭을 유지하고 양방향으로 전환한다", () => {
  assert.match(appSource, /<TaskWorkspaceTabs activeView=\{displayMode\}/);
  assert.match(appSource, /nextView === "gantt" \|\| nextView === "activity"/);
  assert.match(appSource, /activityMode \? "업무 로그"/);
  assert.match(appSource, /className="task-change-log is-embedded"/);
  assert.doesNotMatch(appSource, /className="task-activity-navigation"/);
  assert.doesNotMatch(appSource, /className="view-stack tracker-view task-activity-view"/);
  assert.match(styleSource, /\.task-workspace-tabs button\[aria-selected="true"\]/);
});

test("프로젝트 선택과 기존 총괄 진입은 일정 권한이 있으면 일정표로 전환한다", () => {
  assert.match(appSource, /view !== "overview"/);
  assert.match(appSource, /isViewAllowed\("schedule", allowedPages\)/);
  assert.match(appSource, /\? "schedule" : firstAllowedView/);
  assert.match(appSource, /NAVIGATION_PAGE_OPTIONS\.filter\(\(page\) => page\.id !== "overview"\)/);
});

test("일정표 URL로 새로고침해도 서버 초기 업무 코드로 정규화한다", () => {
  assert.match(appSource, /return view === "schedule" \? "tasks" : view/);
  assert.match(appSource, /source\.bootstrap\(\{ initialView: serverInitialView\(view\) \}\)/);
  assert.match(appSource, /source\.login\(\{ \.\.\.credentials, initialView: serverInitialView\(view\) \}\)/);
});

test("업무 일정은 상태·카테고리·주간 필터를 한 화면에서 제공한다", () => {
  assert.match(appSource, /scheduleStatusFilters/);
  assert.match(appSource, /scheduleCategoryFilters/);
  assert.match(appSource, /scheduleWeekFilters/);
  assert.match(appSource, /taskResponsibleOrgLabel\(task\.responsibleOrgCode, project\.clientName/);
});

test("진행률은 날짜 계산 없이 원장 입력값만 사용한다", () => {
  assert.match(appSource, /task\.progressPercent \?\? 0/);
  assert.doesNotMatch(appSource, /progressOf\(/);
});

test("생성 후 24시간 업무는 일정표·간트와 우측 상단 알림 센터에서 같은 신규 상태를 사용한다", () => {
  assert.match(appSource, /isNewTask\(task, freshnessNow\)/);
  assert.match(appSource, /function TaskNotificationCenter/);
  assert.match(appSource, /className="notification-center"/);
  assert.match(appSource, /className="notification-popover"/);
  assert.match(appSource, /notificationTasks=\{notificationTasks\}/);
  assert.match(appSource, /className="task-new-badge"/);
  assert.match(appSource, /className="g-new-badge"/);
  assert.match(appSource, /sessionStorage\?\.setItem\(storageKey, JSON\.stringify\(next\)\)/);
  assert.match(styleSource, /\.task-schedule-row\.is-new-task/);
  assert.match(styleSource, /\.g-row\.is-new-task/);
  assert.match(styleSource, /\.notification-trigger/);
  assert.match(styleSource, /\.notification-count/);
});

test("업무표는 고정 헤더와 고정 업무명 열을 제공한다", () => {
  assert.match(styleSource, /\.task-schedule-matrix thead th[\s\S]*position:\s*sticky/);
  assert.match(styleSource, /\.task-schedule-matrix thead tr:first-child > th:first-child,[\s\S]*position:\s*sticky/);
});

test("고객사와 프로젝트 메뉴는 데스크톱 왼쪽에 항상 나열한다", () => {
  assert.match(appSource, /<ClientRail clients=\{bootstrapState\.data\.clients\}/);
  assert.match(appSource, /<ProjectSidebar project=\{project\}/);
  assert.match(appSource, /navigation\.usesDrawer && <button className="navigation-toggle"/);
  assert.doesNotMatch(appSource, /setDesktopNavigationLevel/);
});

test("왼쪽 프로젝트 메뉴는 기존 화면과 실행계획 하위 화면을 연결한다", () => {
  assert.match(appSource, /function ProjectSidebar/);
  assert.match(appSource, /visibleNavItems\.map/);
  assert.match(appSource, /visiblePlanChildren\.map/);
  assert.match(appSource, /onView\("plan", child\.id\)/);
});
