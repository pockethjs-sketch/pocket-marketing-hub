export const TRACKING_METRICS = Object.freeze([
  Object.freeze({ id: "impressions", label: "노출" }),
  Object.freeze({ id: "engagements", label: "반응" }),
  Object.freeze({ id: "clicks", label: "클릭" }),
  Object.freeze({ id: "inquiries", label: "문의" }),
]);

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function trackingRate(numerator, denominator) {
  const base = numberValue(denominator);
  if (base <= 0) return null;
  return numberValue(numerator) / base * 100;
}

export function trackingFunnel(totals = {}) {
  return TRACKING_METRICS.map((metric, index, metrics) => {
    const value = numberValue(totals[metric.id]);
    const previous = index ? numberValue(totals[metrics[index - 1].id]) : null;
    const conversionRate = index ? trackingRate(value, previous) : null;
    return {
      ...metric,
      value,
      conversionRate,
      dropRate: conversionRate === null ? null : Math.max(0, 100 - conversionRate),
    };
  });
}

export function dailyMetricSeries(rows = [], metric = "impressions") {
  const byDate = new Map();
  rows.forEach((row) => {
    const date = String(row.date || row.performance_date || "").slice(0, 10);
    if (!date) return;
    byDate.set(date, (byDate.get(date) || 0) + numberValue(row[metric]));
  });
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, value }));
}

export function trackingSignals({ totals = {}, channels = [], execution = {}, publishing = {} } = {}) {
  const funnel = trackingFunnel(totals);
  const transitions = funnel.slice(1).filter((stage) => stage.conversionRate !== null);
  const bottleneck = transitions.sort((left, right) => right.dropRate - left.dropRate)[0] || null;
  const rankedChannels = channels.slice().sort((left, right) => {
    const inquiryGap = numberValue(right.inquiries) - numberValue(left.inquiries);
    return inquiryGap || numberValue(right.clicks) - numberValue(left.clicks);
  });
  const topChannel = rankedChannels[0] || null;
  const signals = [];
  if (bottleneck) signals.push({
    id: "bottleneck",
    tone: "warning",
    label: "최대 이탈 구간",
    value: `${funnel[funnel.findIndex((stage) => stage.id === bottleneck.id) - 1]?.label || "이전 단계"} → ${bottleneck.label}`,
    detail: `${bottleneck.conversionRate.toFixed(1)}% 전환`,
  });
  if (topChannel) signals.push({
    id: "top-channel",
    tone: "success",
    label: "문의 기여 채널",
    value: topChannel.label || topChannel.channelCode || "채널 미지정",
    detail: `${numberValue(topChannel.inquiries).toLocaleString()}건 문의`,
  });
  if (numberValue(execution.blocked) > 0 || numberValue(execution.active) > 0) signals.push({
    id: "execution",
    tone: numberValue(execution.blocked) > 0 ? "danger" : "neutral",
    label: "실행 대기",
    value: `${numberValue(execution.active) + numberValue(execution.blocked)}건`,
    detail: `차단 ${numberValue(execution.blocked)}건`,
  });
  if (numberValue(publishing.inReview) > 0) signals.push({
    id: "review",
    tone: "neutral",
    label: "발행 전 검수",
    value: `${numberValue(publishing.inReview)}건`,
    detail: "검수 완료 후 발행 가능",
  });
  return signals;
}
