import assert from "node:assert/strict";
import test from "node:test";

import { getNavigationPresentation } from "../src/navigationState.js";
import { parseViewLocation, viewLocationHash, viewResourceKey } from "../src/planNavigation.js";

test("데스크톱에서는 왼쪽 프로젝트 메뉴만 접기 버튼 없이 항상 표시한다", () => {
  const initial = getNavigationPresentation({ role: "pocket", desktopLevel: 0 });
  assert.equal(initial.usesDrawer, false);
  assert.equal(initial.controlVisible, false);
  assert.equal(initial.projectSidebarVisible, true);
  assert.equal(initial.projectSidebarCollapsed, false);
  assert.equal(initial.controlledIds, "project-navigation");
});

test("작은 화면에서는 포켓·NS 계정도 임시 탐색 서랍을 사용한다", () => {
  const navigation = getNavigationPresentation({ role: "ns", compactViewport: true, drawerOpen: true });

  assert.equal(navigation.usesDrawer, true);
  assert.equal(navigation.isDrawerOpen, true);
  assert.equal(navigation.projectSidebarVisible, true);
  assert.equal(navigation.controlledIds, "project-navigation");
});

test("실행계획 하위 화면은 URL과 캐시 키에서 서로 분리된다", () => {
  assert.deepEqual(parseViewLocation("#plan/client"), { view: "plan", planVariant: "client" });
  assert.deepEqual(parseViewLocation("#plan/internal"), { view: "plan", planVariant: "internal" });
  assert.deepEqual(parseViewLocation("#plan"), { view: "plan", planVariant: "client" });
  assert.deepEqual(parseViewLocation("#tasks/schedule"), { view: "schedule", planVariant: "client" });
  assert.deepEqual(parseViewLocation("#daily"), { view: "daily", planVariant: "client" });
  assert.equal(viewLocationHash("plan", "internal"), "plan/internal");
  assert.equal(viewLocationHash("schedule"), "tasks/schedule");
  assert.equal(viewResourceKey("schedule"), "tasks");
  assert.equal(viewResourceKey("plan", "client"), "plan-client");
  assert.equal(viewResourceKey("plan", "internal"), "plan-internal");
});
