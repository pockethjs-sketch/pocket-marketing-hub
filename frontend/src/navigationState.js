export function getNavigationPresentation({
  role,
  compactViewport = false,
  desktopStage = 0,
  desktopDirection = "collapse",
  drawerOpen = false,
}) {
  const normalizedRole = String(role || "").toUpperCase();
  const usesDrawer = normalizedRole === "CLIENT" || normalizedRole === "CLIENT_VIEWER" || compactViewport;
  const isDrawerOpen = usesDrawer && Boolean(drawerOpen);
  const normalizedStage = Math.max(0, Math.min(2, Number(desktopStage) || 0));
  const normalizedDirection = desktopDirection === "expand" ? "expand" : "collapse";

  if (usesDrawer) {
    return {
      actionLabel: isDrawerOpen ? "탐색 메뉴 닫기" : "탐색 메뉴 열기",
      anyVisible: isDrawerOpen,
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

  const clientRailVisible = normalizedStage === 0;
  const projectSidebarVisible = normalizedStage < 2;
  const iconDirection = normalizedDirection === "collapse" ? "left" : "right";
  const actionLabel = normalizedDirection === "collapse"
    ? normalizedStage === 0 ? "고객사 메뉴 접기" : "프로젝트 메뉴 접기"
    : normalizedStage === 2 ? "프로젝트 메뉴 펼치기" : "고객사 메뉴 펼치기";

  return {
    actionLabel,
    anyVisible: clientRailVisible || projectSidebarVisible,
    clientRailCollapsed: !clientRailVisible,
    clientRailVisible,
    iconDirection,
    isDrawerOpen,
    projectSidebarCollapsed: !projectSidebarVisible,
    projectSidebarVisible,
    shellCollapsed: normalizedStage === 2,
    usesDrawer,
  };
}

export function getNextDesktopNavigationState({ stage = 0, direction = "collapse" } = {}) {
  const normalizedStage = Math.max(0, Math.min(2, Number(stage) || 0));
  const normalizedDirection = direction === "expand" ? "expand" : "collapse";

  if (normalizedDirection === "collapse") {
    const nextStage = Math.min(2, normalizedStage + 1);
    return { stage: nextStage, direction: nextStage === 2 ? "expand" : "collapse" };
  }

  const nextStage = Math.max(0, normalizedStage - 1);
  return { stage: nextStage, direction: nextStage === 0 ? "collapse" : "expand" };
}
