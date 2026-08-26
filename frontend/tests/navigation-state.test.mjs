import assert from "node:assert/strict";
import test from "node:test";

import { getNavigationPresentation, nextDesktopNavigationLevel } from "../src/navigationState.js";

test("데스크톱 탐색은 메인 → 프로젝트 메뉴 → 전체 프로젝트 순서로 한 단계씩 열린다", () => {
  const mainOnly = getNavigationPresentation({ role: "client", desktopLevel: 0 });
  const projectOnly = getNavigationPresentation({ role: "client", desktopLevel: 1 });
  const allVisible = getNavigationPresentation({ role: "pocket", desktopLevel: 2 });

  assert.equal(mainOnly.usesDrawer, false);
  assert.equal(mainOnly.controlVisible, true);
  assert.equal(mainOnly.controlledIds, "project-navigation");
  assert.equal(mainOnly.actionLabel, "프로젝트 메뉴 열기");
  assert.equal(mainOnly.iconDirection, "right");
  assert.equal(mainOnly.clientRailVisible, false);
  assert.equal(mainOnly.projectSidebarVisible, false);
  assert.equal(projectOnly.controlVisible, true);
  assert.equal(projectOnly.controlledIds, "client-navigation");
  assert.equal(projectOnly.actionLabel, "전체 프로젝트 열기");
  assert.equal(projectOnly.iconDirection, "right");
  assert.equal(projectOnly.clientRailVisible, false);
  assert.equal(projectOnly.projectSidebarVisible, true);
  assert.equal(allVisible.clientRailVisible, true);
  assert.equal(allVisible.projectSidebarVisible, true);
  assert.equal(allVisible.actionLabel, "탐색 메뉴 닫기");
  assert.equal(allVisible.controlledIds, "client-navigation project-navigation");
  assert.equal(allVisible.iconDirection, "left");
  assert.equal(allVisible.shellCollapsed, false);
});

test("하나의 데스크톱 탐색 버튼은 세 단계를 순환한다", () => {
  assert.equal(nextDesktopNavigationLevel(0), 1);
  assert.equal(nextDesktopNavigationLevel(1), 2);
  assert.equal(nextDesktopNavigationLevel(2), 0);
});

test("작은 화면에서는 포켓·NS 계정도 임시 탐색 서랍을 사용한다", () => {
  const navigation = getNavigationPresentation({ role: "ns", compactViewport: true, drawerOpen: true });

  assert.equal(navigation.usesDrawer, true);
  assert.equal(navigation.isDrawerOpen, true);
  assert.equal(navigation.clientRailVisible, true);
  assert.equal(navigation.projectSidebarVisible, true);
});
