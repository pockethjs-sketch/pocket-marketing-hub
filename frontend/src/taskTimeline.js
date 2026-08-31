const DAY_MS = 86_400_000;

function dateOnly(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(value) {
  if (!value) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dayDiff(left, right) {
  return Math.round((right.getTime() - left.getTime()) / DAY_MS);
}

export function buildTaskTimeline(tasks = [], project = {}, todayValue = new Date()) {
  const candidates = tasks.map((task) => {
    const start = dateOnly(task.plannedStartDate || task.dueDate);
    const end = dateOnly(task.dueDate || task.plannedStartDate);
    return start && end ? { task, start, end: end < start ? start : end } : null;
  }).filter(Boolean);
  const projectStart = dateOnly(project.startDate);
  const projectEnd = dateOnly(project.endDate);
  const starts = candidates.map((item) => item.start).concat(projectStart ? [projectStart] : []);
  const ends = candidates.map((item) => item.end).concat(projectEnd ? [projectEnd] : []);
  if (!starts.length || !ends.length) return { start: null, end: null, dayCount: 0, rows: [], ticks: [], todayLeft: null };

  const start = new Date(Math.min(...starts.map((item) => item.getTime())));
  const end = new Date(Math.max(...ends.map((item) => item.getTime())));
  const dayCount = Math.max(1, dayDiff(start, end) + 1);
  const denominator = Math.max(1, dayCount - 1);
  const tickStep = Math.max(1, Math.ceil(dayCount / 8));
  const ticks = [];
  for (let offset = 0; offset < dayCount; offset += tickStep) {
    const date = new Date(start);
    date.setDate(date.getDate() + offset);
    ticks.push({ date: isoDate(date), label: `${date.getMonth() + 1}.${date.getDate()}`, left: offset / denominator * 100 });
  }
  if (ticks[ticks.length - 1]?.date !== isoDate(end)) ticks.push({ date: isoDate(end), label: `${end.getMonth() + 1}.${end.getDate()}`, left: 100 });

  const today = dateOnly(todayValue);
  const todayOffset = today ? dayDiff(start, today) : -1;
  const todayLeft = todayOffset >= 0 && todayOffset < dayCount ? todayOffset / denominator * 100 : null;
  const rows = candidates.map(({ task, start: rowStart, end: rowEnd }) => {
    const startOffset = Math.max(0, dayDiff(start, rowStart));
    const duration = Math.max(1, dayDiff(rowStart, rowEnd) + 1);
    return {
      task,
      startDate: isoDate(rowStart),
      endDate: isoDate(rowEnd),
      left: startOffset / denominator * 100,
      width: Math.max(1.2, Math.min(100 - startOffset / denominator * 100, duration / dayCount * 100)),
    };
  });
  return { start: isoDate(start), end: isoDate(end), dayCount, rows, ticks, todayLeft };
}

export function withDisplayDeadline(task, displayDeadline) {
  return displayDeadline ? { ...task, due: displayDeadline } : task;
}
