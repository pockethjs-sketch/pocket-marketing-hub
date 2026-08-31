import assert from "node:assert/strict";
import test from "node:test";
import { dailyMeetingsViewModel } from "../src/api/viewModel.js";

test("데일리 회의록 원장 응답을 날짜별 화면 데이터로 변환한다", () => {
  const result = dailyMeetingsViewModel({ data: { totalMatching: 1, items: [{
    meeting_id: "MTG-1",
    meeting_date: "2026-08-31",
    title: "데일리 미팅",
    discussion_text: "진행 현황 공유",
    decisions_text: "시안 확정",
    action_items_text: "NS: 9/1 업로드",
    author_name: "포켓컴퍼니",
    visibility_code: "PROJECT_TEAM",
    row_version: 2,
  }] } });
  assert.equal(result.total, 1);
  assert.deepEqual(result.items[0], {
    id: "MTG-1",
    date: "2026-08-31",
    title: "데일리 미팅",
    attendees: "",
    discussion: "진행 현황 공유",
    decisions: "시안 확정",
    actionItems: "NS: 9/1 업로드",
    authorId: null,
    authorName: "포켓컴퍼니",
    visibilityCode: "PROJECT_TEAM",
    createdAt: null,
    updatedAt: null,
    rowVersion: 2,
  });
});
