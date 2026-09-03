// Both the legacy short codes and the current database enum use one label map.
export const WORKSTREAM_LABELS = Object.freeze({
  MKT: "마케팅", MARKETING: "마케팅",
  DSN: "디자인", DESIGN: "디자인",
  VID: "영상", VIDEO: "영상",
  COMMON: "공통", YOUTUBE: "유튜브", INSTAGRAM: "인스타그램", SEO: "검색최적화",
});

export function taskWorkstreamLabel(task = {}) {
  const candidates = [task.streamCode, task.workstreamCode, task.workstream_code, task.stream, task.category, task.parent];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    const label = WORKSTREAM_LABELS[value.toUpperCase()];
    if (label) return label;
    if (/[가-힣]/.test(value) && ["마케팅", "디자인", "영상", "공통", "검색최적화"].includes(value)) return value;
  }
  return "미분류";
}
