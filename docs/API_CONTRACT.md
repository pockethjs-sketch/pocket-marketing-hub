# 화면별 읽기 API 계약

GitHub Pages 운영 빌드는 아래 계약의 Apps Script API를 사용합니다. 비식별 데모는 API 주소가 없는 로컬 UI 검증에만 사용합니다.

## 공통 응답

```json
{
  "ok": true,
  "contractVersion": "2026-08-26-fast-bootstrap-v3",
  "schemaVersion": "2026-08-25-v1",
  "revision": "rev_20260826_144001",
  "generatedAt": "2026-08-25T10:30:01+09:00",
  "requestId": "req_xxx",
  "scope": {
    "clientId": "CLT-UND",
    "projectId": "PRJ-UND-90D-001",
    "visibility": "CLIENT"
  },
  "data": {}
}
```

- 날짜·시간은 ISO 8601로 반환한다.
- 금액은 정수 KRW, 비율은 `0~100` 숫자로 반환한다.
- 빈 문자열 대신 `null`을 사용한다.
- 브라우저가 보낸 역할과 `client_id`는 신뢰하지 않는다.
- 오류 응답에 시트명, 행 번호, 스택을 노출하지 않는다.

## 화면별 action

| action | 화면 | 반환 범위 |
|---|---|---|
| `preview_bootstrap` | 로그인 없는 첫 앱 셸 | 1시간 읽기 전용 세션 + 허용 고객사·프로젝트·채널 |
| `preview_overview` | 로그인 없는 첫 총괄 | 공개 허용 프로젝트의 총괄 projection; bootstrap과 병렬 호출 |
| `bootstrap` | 앱 셸·고객사 레일 | 로그인 사용자가 볼 수 있는 고객사·프로젝트 요약만 |
| `project_overview` | 총괄 현황 | 핵심 집계, 단계·분야 진행, 확인 항목, 최근 활동 상위 5개 |
| `project_plan` | 실행계획 | 해당 프로젝트의 최신 PUBLISHED 승인본과 CLIENT 공개 섹션 10개 |
| `tasks` | 업무 | 필터된 업무 목록, 프로젝트 일정, 08_콘텐츠 발행 집계; 기본 30건·최대 200건 |
| `contents` | 콘텐츠 | 최대 92일의 콘텐츠와 현재 버전·검수 상태 |
| `approvals` | 검수 현황 | 공개 허용된 현재 검수 상태만 |
| `performance` | 성과 | 최대 366일의 집계 KPI·추이·채널 분해 |
| `files` | 자료 | 공개 범위가 허용된 파일 링크만 |
| `activity` | 활동 | 안전한 요약 문장으로 투영한 이벤트만 |

Apps Script에서는 URL 경로와 GET query 대신 `text/plain` POST JSON의 `action`, `projectId`로 라우팅한다. 인증 세션도 query string이나 커스텀 헤더가 아니라 JSON 본문의 `auth.sessionToken`으로 전달한다.

```json
{
  "action": "project_overview",
  "auth": { "sessionToken": "signed-session" },
  "projectId": "PRJ-..."
}
```

## 역할별 공개 단계

`visibility_code`는 다음 3단계로 운영한다.

- `POCKET_ONLY`: 포켓 내부 전략·원가·위험·계약 기준
- `PROJECT_TEAM`: 포켓과 배정된 실행사 업무·콘텐츠 제작 정보
- `CLIENT`: 고객사가 볼 수 있는 일정·결과·승인·성과

고객 응답에는 실행사명, 내부 담당자 ID, 차단 사유, 내부 메모, 원가, 변경 전후 JSON을 포함하지 않는다.

### 실행계획 응답

`project_plan`은 계획 화면에 들어갈 때만 지연 조회합니다. `plan`에는 최신 승인본 메타데이터를, `sections`에는 `sort_order` 순서의 정제된 본문을 반환합니다. 원본 파일 링크·내부 원천 코드·편집 필드는 반환하지 않으며 고객은 이 action으로 저장할 수 없습니다. 계획 응답은 프로젝트·역할별로 최대 5분 캐시합니다.

### 업무 응답

`tasks`는 업무 목록 외에 프로젝트 일정 기준과 콘텐츠 발행 집계를 함께 반환합니다.

```json
{
  "project": {
    "project_id": "PRJ-UND-90D-001",
    "phase_code": "P0",
    "start_date": "2026-08-26",
    "end_date": null
  },
  "publishing": {
    "source": "08_콘텐츠:PUBLISHED",
    "phases": [
      {
        "phase_code": "P0",
        "target": { "long_form": 2, "short_form": 10, "instagram": 10, "blog": 10, "total": 32 },
        "actual": { "long_form": 0, "short_form": 0, "instagram": 0, "blog": 0, "total": 0 }
      }
    ]
  },
  "items": [
    {
      "task_id": "TSK-...",
      "source_task_id": "P0-MKT-1",
      "phase_code": "P0",
      "workstream_code": "MKT",
      "category_code": "플랫폼 확정",
      "title": "킥오프 실시",
      "status_code": "NOT_STARTED",
      "plan_week": 1,
      "due_date": null,
      "contract_linked": false,
      "row_version": 1
    }
  ],
  "nextCursor": null,
  "totalMatching": 144
}
```

- `plan_week`는 승인된 90일 계획의 단계 내 주차이며, 저장된 `due_date`가 없을 때 프런트가 프로젝트 `start_date`와 단계 범위로 마감일을 계산합니다.
- `plan_note`는 계약·검수·선행조건 원문이며 `CLIENT_VIEWER`가 아닌 역할에만 반환합니다.
- `contract_linked`는 `plan_note` 존재 여부에서 파생한 Boolean입니다. 고객은 여부만 보고 원문은 받지 않습니다.
- 콘텐츠 실제값은 현재 역할이 볼 수 있는 `08_콘텐츠`의 `PUBLISHED` 행 가운데 업무 `task_id`로 단계가 연결되는 지원 포맷만 집계합니다. 따라서 고객 집계에는 `CLIENT` 공개 콘텐츠만 포함됩니다.
- 고객과 공개 미리보기는 `CLIENT_VIEWER + READ_ONLY`이고 `visibility_code = CLIENT`인 업무만 읽습니다. 생성·수정·보관 mutation은 서버가 거부합니다.
- 프로젝트 착수일은 Pocket 내부 사용자만 `project / UPDATE / start_date` mutation으로 변경합니다. `02_프로젝트.row_version`을 반드시 보내므로 동시 수정 충돌은 `409 row_version_conflict`로 차단됩니다.

## 응답 크기와 페이지 처리

- `preview_bootstrap`·`bootstrap`: 10KB 이하 권장, 총괄·목록 원문 포함 금지
- `preview_overview`: 첫 진입 병렬 조회 전용이며 쓰기 세션이나 내부 필드를 반환하지 않음
- 일반 응답: 200KB 이하 권장
- 목록 기본 30건, 최대 200건
- 커서는 시트 행 번호가 아닌 `updated_at + immutable_id` 기반 불투명 토큰 사용
- 캐시 키에 `user_id`, `role`, `project_id`, `visibility`, `dateRange`를 포함
