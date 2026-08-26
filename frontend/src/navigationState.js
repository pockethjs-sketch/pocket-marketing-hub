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
      controlVisible: true,
      controlledIds: "client-navigation project-navigation",
      clientRailCollapsed: !isDrawerOpen,
      clientRailVisible: isDrawerOpen,
      iconDirection: isDrawerOpen ? "left" : "right",
      isDrawerOpen,
      projectSidebarCollapsed: !isDrawerOpen,
      projectSidebarVisible: isDrawerOpen,
      shellCollapsed: true,
      usesDrawer,
    };
  }

  const clientRailVisible = normalizedLevel >= 2;
  const projectSidebarVisible = normalizedLevel >= 1;

  return {
    actionLabel: normalizedLevel === 0
      ? "프로젝트 메뉴 열기"
      : normalizedLevel === 1
        ? "전체 프로젝트 열기"
        : "탐색 메뉴 닫기",
    controlVisible: true,
    controlledIds: normalizedLevel === 0
      ? "project-navigation"
      : normalizedLevel === 1
        ? "client-navigation"
        : "client-navigation project-navigation",
    clientRailCollapsed: !clientRailVisible,
    clientRailVisible,
    desktopLevel: normalizedLevel,
    iconDirection: normalizedLevel >= 2 ? "left" : "right",
    isDrawerOpen: false,
    projectSidebarCollapsed: !projectSidebarVisible,
    projectSidebarVisible,
    shellCollapsed: false,
    usesDrawer,
    viewerRole: normalizedRole === "CLIENT" || normalizedRole === "CLIENT_VIEWER",
  };
}

export function nextDesktopNavigationLevel(desktopLevel = 0) {
  const normalizedLevel = Math.max(0, Math.min(2, Number(desktopLevel) || 0));
  return normalizedLevel >= 2 ? 0 : normalizedLevel + 1;
}
