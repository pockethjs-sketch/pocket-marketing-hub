import assert from "node:assert/strict";
import test from "node:test";

import { getNavigationPresentation } from "../src/navigationState.js";

test("고객 계정은 화면 크기와 무관하게 왼쪽 탐색을 임시 서랍으로 사용한다", () => {
  const closed = getNavigationPresentation({ role: "CLIENT_VIEWER", compactViewport: false, drawerOpen: false });
  const open = getNavigationPresentation({ role: "client", compactViewport: false, drawerOpen: true });

  assert.equal(closed.usesDrawer, true);
  assert.equal(closed.shellCollapsed, true);
  assert.equal(closed.expanded, false);
  assert.equal(closed.actionLabel, "탐색 메뉴 열기");
  assert.equal(open.expanded, true);
  assert.equal(open.actionLabel, "탐색 메뉴 닫기");
});

test("포켓·NS 데스크톱 계정은 왼쪽 탐색을 고정 상태로 접고 펼친다", () => {
  const expanded = getNavigationPresentation({ role: "pocket", desktopCollapsed: false });
  const collapsed = getNavigationPresentation({ role: "ns", desktopCollapsed: true });

  assert.equal(expanded.usesDrawer, false);
  assert.equal(expanded.shellCollapsed, false);
  assert.equal(expanded.actionLabel, "왼쪽 메뉴 접기");
  assert.equal(collapsed.shellCollapsed, true);
  assert.equal(collapsed.expanded, false);
  assert.equal(collapsed.actionLabel, "왼쪽 메뉴 펼치기");
});

test("작은 화면에서는 포켓·NS 계정도 임시 탐색 서랍을 사용한다", () => {
  const navigation = getNavigationPresentation({ role: "ns", compactViewport: true, drawerOpen: true });

  assert.equal(navigation.usesDrawer, true);
  assert.equal(navigation.isDrawerOpen, true);
  assert.equal(navigation.expanded, true);
});
