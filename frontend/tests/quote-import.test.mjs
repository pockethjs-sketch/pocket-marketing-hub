import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeQuoteGrid,
  buildQuoteImportPayload,
  buildQuoteItems,
  gridFromCells,
  parseDelimited,
} from "../src/quoteImport.js";

const sample = [
  "고객사,테스트 고객사",
  "캠페인,9월 영상 운영",
  "캠페인 기간,2026-09-01 ~ 2026-09-30",
  "매체,항목,세부내용,수량,단위,금액",
  "YouTube,본편 업로드,SEO 세팅,2,건,200000원",
  "NAVER,블로그 세팅,프로필 구축,1,식,300000원",
  "합계,,,,,500000원",
].join("\n");

test("견적서 표에서 프로젝트 정보와 업무 항목을 인식한다", () => {
  const analysis = analyzeQuoteGrid(gridFromCells(parseDelimited(sample)));
  const items = buildQuoteItems(analysis);
  assert.equal(analysis.metadata.client, "테스트 고객사");
  assert.equal(analysis.metadata.project, "9월 영상 운영");
  assert.equal(analysis.metadata.start, "2026-09-01");
  assert.equal(analysis.metadata.end, "2026-09-30");
  assert.equal(analysis.map.name, 1);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    media: "YouTube",
    name: "본편 업로드",
    detail: "SEO 세팅",
    quantity: 2,
    unit: "건",
    price: null,
    amount: 200000,
    split: true,
  });
});

test("수량 분할과 디자인 파생 업무를 프로젝트 저장 형식으로 만든다", () => {
  const analysis = analyzeQuoteGrid(gridFromCells(parseDelimited(sample)));
  const items = buildQuoteItems(analysis);
  const payload = buildQuoteImportPayload({
    analysis,
    items,
    selectedIndexes: [0, 1],
    clientName: "테스트 고객사",
    projectName: "9월 영상 운영",
    start: "2026-09-01",
    end: "2026-09-30",
    splitQuantities: true,
    deriveDesign: true,
    fileName: "quote.csv",
  });
  assert.equal(payload.fields.client_name, "테스트 고객사");
  assert.equal(payload.quote.selected_item_count, 2);
  assert.equal(payload.tasks.filter((task) => task.title.startsWith("본편 업로드")).length, 2);
  assert.equal(payload.tasks.filter((task) => task.title.startsWith("썸네일 제작")).length, 2);
  assert.ok(payload.tasks.every((task) => task.progress_percent === 0));
  assert.ok(payload.tasks.every((task) => task.schedule_dates.at(-1) === task.due_date));
});

test("탭 구분 견적서도 읽고 잘못된 기간은 저장 전에 차단한다", () => {
  const rows = parseDelimited("매체\t항목\t수량\t금액\nInstagram\t카드뉴스\t3\t300000", "\t");
  const analysis = analyzeQuoteGrid(gridFromCells(rows));
  const items = buildQuoteItems(analysis);
  assert.equal(items[0].quantity, 3);
  assert.throws(() => buildQuoteImportPayload({
    analysis,
    items,
    selectedIndexes: [0],
    clientName: "A",
    projectName: "B",
    start: "2026-09-30",
    end: "2026-09-01",
  }), /시작일과 종료일/);
});
