export function toggleCollapsedTaskGroup(collapsedGroups, groupName) {
  return collapsedGroups.includes(groupName)
    ? collapsedGroups.filter((name) => name !== groupName)
    : [...collapsedGroups, groupName];
}

export function expandSelectedTaskGroup(collapsedGroups, groupName) {
  return groupName === "전체"
    ? [...collapsedGroups]
    : collapsedGroups.filter((name) => name !== groupName);
}

export function disclosureChevronDirection(expanded) {
  return expanded ? "down" : "right";
}

export function disclosureChevronGlyph(expanded) {
  return expanded ? "⌄" : "›";
}
