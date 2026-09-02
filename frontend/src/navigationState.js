export function getNavigationPresentation({
  role,
  compactViewport = false,
  drawerOpen = false,
}) {
  const normalizedRole = String(role || "").toUpperCase();
  const usesDrawer = Boolean(compactViewport);
  const isDrawerOpen = usesDrawer && Boolean(drawerOpen);

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

  return {
    actionLabel: "",
    controlVisible: false,
    controlledIds: "client-navigation project-navigation",
    clientRailCollapsed: false,
    clientRailVisible: true,
    desktopLevel: 2,
    iconDirection: null,
    isDrawerOpen: false,
    projectSidebarCollapsed: false,
    projectSidebarVisible: true,
    shellCollapsed: false,
    usesDrawer,
    viewerRole: normalizedRole === "CLIENT" || normalizedRole === "CLIENT_VIEWER",
  };
}
