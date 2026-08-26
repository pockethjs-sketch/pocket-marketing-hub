export function getNavigationPresentation({
  role,
  compactViewport = false,
  desktopLevel = 0,
  drawerOpen = false,
}) {
  const normalizedRole = String(role || "").toUpperCase();
  const usesDrawer = Boolean(compactViewport);
  const isDrawerOpen = usesDrawer && Boolean(drawerOpen);
  const normalizedLevel = Math.max(0, Math.min(2, Number(desktopLevel) || 0));

  if (usesDrawer) {
    return {
      actionLabel: isDrawerOpen ? "탐색 메뉴 닫기" : "탐색 메뉴 열기",
      anyVisible: isDrawerOpen,
      clientRailCollapsed: !isDrawerOpen,
      clientRailVisible: isDrawerOpen,
      iconDirection: isDrawerOpen ? "left" : "right",
      isDrawerOpen,
      mainRevealVisible: true,
      projectSidebarCollapsed: !isDrawerOpen,
      projectSidebarVisible: isDrawerOpen,
      shellCollapsed: true,
      usesDrawer,
    };
  }

  const clientRailVisible = normalizedLevel >= 2;
  const projectSidebarVisible = normalizedLevel >= 1;

  return {
    actionLabel: "프로젝트 메뉴 펼치기",
    anyVisible: clientRailVisible || projectSidebarVisible,
    clientRailCollapsed: !clientRailVisible,
    clientRailVisible,
    iconDirection: "right",
    isDrawerOpen: false,
    mainRevealVisible: normalizedLevel === 0,
    projectSidebarCollapsed: !projectSidebarVisible,
    projectSidebarVisible,
    shellCollapsed: false,
    usesDrawer,
    viewerRole: normalizedRole === "CLIENT" || normalizedRole === "CLIENT_VIEWER",
  };
}
