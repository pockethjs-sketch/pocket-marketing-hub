export function getNavigationPresentation({
  role,
  compactViewport = false,
  drawerOpen = false,
  desktopCollapsed = true,
}) {
  const normalizedRole = String(role || "").toUpperCase();
  const usesDrawer = Boolean(compactViewport);
  const isDrawerOpen = usesDrawer && Boolean(drawerOpen);

  if (usesDrawer) {
    return {
      actionLabel: isDrawerOpen ? "탐색 메뉴 닫기" : "탐색 메뉴 열기",
      controlVisible: true,
      controlledIds: "project-navigation-content",
      iconDirection: isDrawerOpen ? "left" : "right",
      isDrawerOpen,
      projectSidebarCollapsed: !isDrawerOpen,
      projectSidebarVisible: isDrawerOpen,
      shellCollapsed: true,
      usesDrawer,
    };
  }

  return {
    actionLabel: desktopCollapsed ? "프로젝트와 메뉴 펼치기" : "프로젝트와 메뉴 접기",
    controlVisible: true,
    controlledIds: "project-navigation-content",
    iconDirection: desktopCollapsed ? "right" : "left",
    isDrawerOpen: false,
    projectSidebarCollapsed: Boolean(desktopCollapsed),
    projectSidebarVisible: !desktopCollapsed,
    shellCollapsed: Boolean(desktopCollapsed),
    usesDrawer,
    viewerRole: normalizedRole === "CLIENT" || normalizedRole === "CLIENT_VIEWER",
  };
}
