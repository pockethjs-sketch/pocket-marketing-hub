import assert from "node:assert/strict";
import test from "node:test";

import { dailyMetricSeries, trackingFunnel, trackingRate, trackingSignals } from "../src/performanceTracking.js";

test("성과 흐름은 이전 단계 대비 전환율과 이탈률을 계산한다", () => {
  const funnel = trackingFunnel({ impressions: 1000, engagements: 100, clicks: 25, inquiries: 5 });
  assert.equal(funnel[1].conversionRate, 10);
  assert.equal(funnel[2].conversionRate, 25);
  assert.equal(funnel[3].dropRate, 80);
  assert.equal(trackingRate(1, 0), null);
});

test("일별 추이는 같은 날짜의 원장 행을 합산한다", () => {
  assert.deepEqual(dailyMetricSeries([
    { date: "2026-08-02", clicks: 3 },
    { date: "2026-08-01", clicks: 2 },
    { date: "2026-08-02", clicks: 4 },
  ], "clicks"), [
    { date: "2026-08-01", value: 2 },
    { date: "2026-08-02", value: 7 },
  ]);
});

test("성과 신호는 최대 이탈과 문의 기여 채널을 실제 값으로 고른다", () => {
  const signals = trackingSignals({
    totals: { impressions: 1000, engagements: 200, clicks: 100, inquiries: 10 },
    channels: [
      { label: "Instagram", inquiries: 4, clicks: 50 },
      { label: "YouTube", inquiries: 6, clicks: 30 },
    ],
  });
  assert.equal(signals[0].value, "클릭 → 문의");
  assert.equal(signals[1].value, "YouTube");
});
