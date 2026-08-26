import assert from "node:assert/strict";
import test from "node:test";

import { getNavigationPresentation } from "../src/navigationState.js";

test("데스크톱 탐색은 메인 → 프로젝트 메뉴 → 전체 프로젝트 순서로 한 단계씩 열린다", () => {
  const mainOnly = getNavigationPresentation({ role: "client", desktopLevel: 0 });
  const projectOnly = getNavigationPresentation({ role: "client", desktopLevel: 1 });
  const allVisible = getNavigationPresentation({ role: "pocket", desktopLevel: 2 });

  assert.equal(mainOnly.usesDrawer, false);
  assert.equal(mainOnly.mainRevealVisible, true);
  assert.equal(mainOnly.clientRailVisible, false);
  assert.equal(mainOnly.projectSidebarVisible, false);
  assert.equal(projectOnly.mainRevealVisible, false);
  assert.equal(projectOnly.clientRailVisible, false);
  assert.equal(projectOnly.projectSidebarVisible, true);
  assert.equal(allVisible.clientRailVisible, true);
  assert.equal(allVisible.projectSidebarVisible, true);
  assert.equal(allVisible.shellCollapsed, false);
});

test("작은 화면에서는 포켓·NS 계정도 임시 탐색 서랍을 사용한다", () => {
  const navigation = getNavigationPresentation({ role: "ns", compactViewport: true, drawerOpen: true });

  assert.equal(navigation.usesDrawer, true);
  assert.equal(navigation.isDrawerOpen, true);
  assert.equal(navigation.clientRailVisible, true);
  assert.equal(navigation.projectSidebarVisible, true);
});
