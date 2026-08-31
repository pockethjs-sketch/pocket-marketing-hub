export const KPI_UNIT_OPTIONS = Object.freeze([
  ["COUNT", "건"],
  ["PEOPLE", "명"],
  ["KRW", "원"],
  ["PERCENT", "%"],
  ["VIEW", "회"],
]);

export const KPI_PERIOD_OPTIONS = Object.freeze([
  ["MONTHLY", "월간"],
  ["WEEKLY", "주간"],
  ["DAILY", "일간"],
  ["QUARTERLY", "분기"],
]);

export const KPI_CHANNEL_OPTIONS = Object.freeze([
  ["", "전체 채널"],
  ["WEBSITE", "자사몰"],
  ["YOUTUBE", "유튜브"],
  ["INSTAGRAM", "인스타그램"],
  ["NAVER_BLOG", "네이버 블로그"],
  ["NAVER_SMARTPLACE", "스마트플레이스"],
  ["NAVER_ADS", "네이버 광고"],
  ["META_ADS", "메타 광고"],
  ["GOOGLE_SEARCH", "구글 검색"],
]);

export function kpiInitialFields(kpi = null) {
  return {
    metric_name: kpi?.name || "",
    target_value: kpi?.target === 0 || kpi?.target ? String(kpi.target) : "",
    unit_code: kpi?.unitCode || "COUNT",
    period_type_code: kpi?.periodTypeCode || "MONTHLY",
    channel_code: kpi?.channelCode || "",
    customer_visible: kpi?.customerVisible !== false,
  };
}

export function kpiSubmissionFields(fields = {}) {
  const target = Number(fields.target_value);
  if (!Number.isFinite(target) || target < 0) throw new Error("목표값은 0 이상의 숫자로 입력해 주세요.");
  return {
    metric_name: String(fields.metric_name || "").trim(),
    target_value: target,
    unit_code: String(fields.unit_code || "COUNT").toUpperCase(),
    period_type_code: String(fields.period_type_code || "MONTHLY").toUpperCase(),
    channel_code: String(fields.channel_code || "").toUpperCase(),
    customer_visible: Boolean(fields.customer_visible),
  };
}
