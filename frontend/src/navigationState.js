export function getNavigationPresentation({
  role,
  compactViewport = false,
  desktopCollapsed = false,
  drawerOpen = false,
}) {
  const normalizedRole = String(role || "").toUpperCase();
  const usesDrawer = normalizedRole === "CLIENT" || normalizedRole === "CLIENT_VIEWER" || compactViewport;
  const isDrawerOpen = usesDrawer && Boolean(drawerOpen);
  const shellCollapsed = usesDrawer || Boolean(desktopCollapsed);
  const expanded = usesDrawer ? isDrawerOpen : !desktopCollapsed;

  let actionLabel = "왼쪽 메뉴 접기";
  if (usesDrawer) actionLabel = isDrawerOpen ? "탐색 메뉴 닫기" : "탐색 메뉴 열기";
  else if (desktopCollapsed) actionLabel = "왼쪽 메뉴 펼치기";

  return {
    actionLabel,
    expanded,
    isDrawerOpen,
    shellCollapsed,
    usesDrawer,
  };
}
