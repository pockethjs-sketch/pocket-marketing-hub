import assert from "node:assert/strict";
import test from "node:test";

let kpiForm = {};
try {
  kpiForm = await import("../src/kpiForm.js");
} catch {}

test("새 KPI는 월간·건수·고객 공개를 기본값으로 사용한다", () => {
  assert.equal(typeof kpiForm.kpiInitialFields, "function", "KPI 폼 모델이 필요합니다");
  assert.deepEqual(kpiForm.kpiInitialFields(), {
    metric_name: "",
    target_value: "",
    unit_code: "COUNT",
    period_type_code: "MONTHLY",
    channel_code: "",
    customer_visible: true,
  });
});

test("KPI 저장 요청은 목표값을 숫자로 정규화한다", () => {
  assert.equal(typeof kpiForm.kpiSubmissionFields, "function", "KPI 저장 변환기가 필요합니다");
  assert.deepEqual(kpiForm.kpiSubmissionFields({
    metric_name: "쇼룸 예약",
    target_value: "120",
    unit_code: "COUNT",
    period_type_code: "MONTHLY",
    channel_code: "WEBSITE",
    customer_visible: false,
  }), {
    metric_name: "쇼룸 예약",
    target_value: 120,
    unit_code: "COUNT",
    period_type_code: "MONTHLY",
    channel_code: "WEBSITE",
    customer_visible: false,
  });
});

test("KPI 편집은 원장의 코드와 공개 설정을 보존한다", () => {
  const fields = kpiForm.kpiInitialFields({
    name: "상담 문의",
    target: 30,
    unitCode: "PEOPLE",
    periodTypeCode: "WEEKLY",
    channelCode: "INSTAGRAM",
    customerVisible: false,
  });
  assert.equal(fields.metric_name, "상담 문의");
  assert.equal(fields.target_value, "30");
  assert.equal(fields.period_type_code, "WEEKLY");
  assert.equal(fields.customer_visible, false);
});
