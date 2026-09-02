import assert from "node:assert/strict";
import test from "node:test";

import { readableTaskActivities, taskActivitySentence } from "../src/taskActivity.js";

test("업무 로그는 내부 ID 대신 현재 업무 목록에서 이름을 복원한다", () => {
  const items = readableTaskActivities([{
    id: "EVT-1",
    type: "task",
    entityId: "TSK-UND-P0-MKT-1",
    taskTitle: "",
    actor: "홍길동",
    userInitiated: true,
    actionCode: "UPDATED",
    changes: [{ field: "status_code", label: "상태", before: "진행", after: "완료" }],
  }], [{ id: "TSK-UND-P0-MKT-1", title: "콘텐츠 일정 확정" }]);
  assert.equal(items[0].taskTitle, "콘텐츠 일정 확정");
});

test("알아볼 수 없는 시스템·변경값 없는 수정 이력은 업무 로그에서 제외한다", () => {
  const items = readableTaskActivities([{
    id: "EVT-NO-TITLE", type: "task", entityId: "TSK-UNKNOWN", actor: "포켓", userInitiated: true, actionCode: "UPDATED", changes: [{ field: "status_code" }],
  }, {
    id: "EVT-SYSTEM", type: "task", entityId: "TSK-1", taskTitle: "업무", actor: "SYSTEM", userInitiated: false, actionCode: "UPDATED", changes: [{ field: "status_code" }],
  }, {
    id: "EVT-NO-CHANGE", type: "task", entityId: "TSK-2", taskTitle: "업무 2", actor: "포켓", userInitiated: true, actionCode: "UPDATED", changes: [],
  }], []);
  assert.deepEqual(items, []);
});

test("업무 로그는 사용자 필드만 표시하고 생성은 문장으로 설명한다", () => {
  const items = readableTaskActivities([{
    id: "EVT-2", type: "task", entityId: "TSK-2", taskTitle: "신규 업무", actor: "NS 담당자", userInitiated: true, actionCode: "CREATED",
    changes: [{ field: "row_version", label: "행 버전", before: 0, after: 1 }],
  }], []);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].changes, []);
  assert.equal(taskActivitySentence(items[0]), "업무가 추가되었습니다.");
});

test("실제 사용자와 매칭되지 않거나 사용자 작업이 아닌 이벤트는 업무 로그에 표시하지 않는다", () => {
  const items = readableTaskActivities([{
    id: "EVT-AUTO", type: "task", entityId: "TSK-1", taskTitle: "자동 동기화", actor: "포켓", userInitiated: false, actionCode: "UPDATED",
    changes: [{ field: "status_code", before: "미착수", after: "진행" }],
  }, {
    id: "EVT-MIGRATE", type: "task", entityId: "TSK-2", taskTitle: "구조 이관", actor: "운영자", userInitiated: true, actionCode: "MIGRATE",
    changes: [{ field: "status_code", before: "미착수", after: "진행" }],
  }], []);
  assert.deepEqual(items, []);
});
