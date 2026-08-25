import assert from "node:assert/strict";
import test from "node:test";

import { getNavigationPresentation, getNextDesktopNavigationState } from "../src/navigationState.js";

test("고객 계정은 화면 크기와 무관하게 왼쪽 탐색을 임시 서랍으로 사용한다", () => {
  const closed = getNavigationPresentation({ role: "CLIENT_VIEWER", compactViewport: false, drawerOpen: false });
  const open = getNavigationPresentation({ role: "client", compactViewport: false, drawerOpen: true });

  assert.equal(closed.usesDrawer, true);
  assert.equal(closed.shellCollapsed, true);
  assert.equal(closed.clientRailVisible, false);
  assert.equal(closed.projectSidebarVisible, false);
  assert.equal(closed.actionLabel, "탐색 메뉴 열기");
  assert.equal(open.clientRailVisible, true);
  assert.equal(open.projectSidebarVisible, true);
  assert.equal(open.actionLabel, "탐색 메뉴 닫기");
});

test("포켓·NS 데스크톱 계정은 고객사 열과 프로젝트 메뉴를 한 단계씩 접는다", () => {
  const full = getNavigationPresentation({ role: "pocket", desktopStage: 0, desktopDirection: "collapse" });
  const projectOnly = getNavigationPresentation({ role: "ns", desktopStage: 1, desktopDirection: "collapse" });
  const collapsed = getNavigationPresentation({ role: "pocket", desktopStage: 2, desktopDirection: "expand" });

  assert.equal(full.usesDrawer, false);
  assert.equal(full.clientRailVisible, true);
  assert.equal(full.projectSidebarVisible, true);
  assert.equal(full.actionLabel, "고객사 메뉴 접기");
  assert.equal(projectOnly.clientRailVisible, false);
  assert.equal(projectOnly.projectSidebarVisible, true);
  assert.equal(projectOnly.actionLabel, "프로젝트 메뉴 접기");
  assert.equal(collapsed.shellCollapsed, true);
  assert.equal(collapsed.clientRailVisible, false);
  assert.equal(collapsed.projectSidebarVisible, false);
  assert.equal(collapsed.actionLabel, "프로젝트 메뉴 펼치기");
});

test("단일 화살표 버튼은 0→1→2→1→0 순서로 탐색 열을 전환한다", () => {
  const first = getNextDesktopNavigationState({ stage: 0, direction: "collapse" });
  const second = getNextDesktopNavigationState(first);
  const third = getNextDesktopNavigationState(second);
  const fourth = getNextDesktopNavigationState(third);

  assert.deepEqual(first, { stage: 1, direction: "collapse" });
  assert.deepEqual(second, { stage: 2, direction: "expand" });
  assert.deepEqual(third, { stage: 1, direction: "expand" });
  assert.deepEqual(fourth, { stage: 0, direction: "collapse" });
});

test("작은 화면에서는 포켓·NS 계정도 임시 탐색 서랍을 사용한다", () => {
  const navigation = getNavigationPresentation({ role: "ns", compactViewport: true, drawerOpen: true });

  assert.equal(navigation.usesDrawer, true);
  assert.equal(navigation.isDrawerOpen, true);
  assert.equal(navigation.clientRailVisible, true);
  assert.equal(navigation.projectSidebarVisible, true);
});
