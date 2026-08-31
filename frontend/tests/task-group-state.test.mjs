import assert from "node:assert/strict";
import test from "node:test";

import { disclosureChevronDirection, disclosureChevronGlyph, expandSelectedTaskGroup, toggleCollapsedTaskGroup } from "../src/taskGroupState.js";

test("분야 헤더를 누르면 해당 분야만 접힘 목록에 추가하거나 제거한다", () => {
  assert.deepEqual(toggleCollapsedTaskGroup([], "마케팅"), ["마케팅"]);
  assert.deepEqual(toggleCollapsedTaskGroup(["마케팅", "영상"], "마케팅"), ["영상"]);
});

test("상단에서 특정 분야를 선택하면 그 분야를 자동으로 펼친다", () => {
  assert.deepEqual(expandSelectedTaskGroup(["마케팅", "영상"], "마케팅"), ["영상"]);
  assert.deepEqual(expandSelectedTaskGroup(["마케팅", "영상"], "전체"), ["마케팅", "영상"]);
});

test("접힌 항목은 오른쪽, 펼친 항목은 아래쪽 화살표를 표시한다", () => {
  assert.equal(disclosureChevronDirection(false), "right");
  assert.equal(disclosureChevronDirection(true), "down");
  assert.equal(disclosureChevronGlyph(false), "›");
  assert.equal(disclosureChevronGlyph(true), "⌄");
});
