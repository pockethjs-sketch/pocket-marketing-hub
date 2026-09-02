# 화면별 읽기 API 계약

GitHub Pages 운영 빌드는 아래 계약의 Apps Script API를 사용합니다. 비식별 데모는 API 주소가 없는 로컬 UI 검증에만 사용합니다.

## 공통 응답

```json
{
  "ok": true,
  "contractVersion": "2026-08-26-project-snapshot-v6",
  "schemaVersion": "2026-08-26-v3",
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

로그인 클라이언트는 `login` 요청에 `includeBootstrap: true`와 현재 URL의 `initialView`를 보냅니다. 성공 응답의 `data.session`은 서명 세션, `data.bootstrap`은 허용 고객사·프로젝트·채널의 앱 셸 데이터입니다. `initialView`가 `overview` 또는 `tasks`이면 첫 접근 프로젝트의 해당 화면 데이터도 `bootstrap.initial`에 함께 반환해 첫 화면까지 한 Apps Script 실행으로 준비합니다. 이 결합 응답은 Apps Script 왕복과 콜드 스타트를 한 번으로 줄이며, `includeBootstrap`이 없는 기존 호출은 평면 세션 응답을 계속 받습니다.

```json
{
  "action": "login",
  "account": "operator-id",
  "accessCode": "server-verified-secret",
  "includeBootstrap": true,
  "initialView": "tasks"
}
```

| action | 화면 | 반환 범위 |
|---|---|---|
| `preview_bootstrap` | 로그인 없는 첫 앱 셸 | 1시간 읽기 전용 세션 + 허용 고객사·프로젝트·채널 |
| `preview_overview` | 로그인 없는 첫 총괄 | 공개 허용 프로젝트의 총괄 projection; bootstrap과 병렬 호출 |
| `bootstrap` | 앱 셸·고객사 레일 | 로그인 사용자가 볼 수 있는 고객사·프로젝트 요약만 |
| `project_overview` | 총괄 현황 | 핵심 집계, 단계·분야 진행, 확인 항목, 최근 활동 상위 5개 |
| `project_plan` | 실행계획 | `planType=CLIENT_SHARE|INTERNAL`에 해당하는 최신 PUBLISHED 계획과 역할별 공개 섹션 |
| `project_snapshot` | 후속 탭 사전 준비 | 실행계획·업무·콘텐츠·성과·자료·활동의 역할별 projection을 한 응답으로 묶음 |
| `tasks` | 업무 | 필터된 업무 목록, 프로젝트 일정, 08_콘텐츠 발행 집계; 기본 30건·최대 200건 |
| `contents` | 콘텐츠 | 최대 92일의 콘텐츠와 현재 버전·검수 상태 |
| `approvals` | 검수 현황 | 공개 허용된 현재 검수 상태만 |
| `performance_tracking` | 성과 추적 *(현재 화면 숨김)* | 최근 90일 일별 성과·퍼널·채널 기여; `12_성과일별` 전용 경량 조회 |
| `performance` | 성과 | 최대 366일의 집계 KPI·추이·채널 분해 |
| `files` | 자료 | 공개 범위가 허용된 파일 링크만 |
| `activity` | 활동·업무 로그 | 안전한 요약 문장으로 투영한 COMMIT 이벤트만; `entityType=TASK` 지원 |
| `daily_meetings` | 데일리 회의록 | 프로젝트별 날짜 역순 회의 내용·결정사항·후속업무; 최대 200건 |
| `access_admin` | 고객 계정·권한 원장 | `MASTER`·`POCKET_MANAGER` 전용; 고객 계정, 프로젝트, 페이지 허용 범위 |

Apps Script에서는 URL 경로와 GET query 대신 `text/plain` POST JSON의 `action`, `projectId`로 라우팅한다. 인증 세션도 query string이나 커스텀 헤더가 아니라 JSON 본문의 `auth.sessionToken`으로 전달한다. 프런트는 각 요청 URL에 데이터 의미와 무관한 `_mh` 난수를 붙여 만료된 Apps Script 302 리다이렉트가 재사용되는 것을 막는다.

간트의 다중 행 수정은 `mutate_batch`를 사용한다. 한 요청에는 같은 `projectId`의 `task / UPDATE`만 최대 40건까지 포함할 수 있으며 업무 ID와 `mutationId`는 요청 안에서 중복될 수 없다. 서버는 모든 행의 권한·허용 필드·`expectedRowVersion`을 쓰기 전에 검사하고, 행별 canonical record를 입력 순서대로 `data.results`에 반환한다. 대량 요청은 프런트가 40건 단위로 순차 분할한다.

```json
{
  "action": "mutate_batch",
  "auth": { "sessionToken": "signed-session" },
  "projectId": "PRJ-UND-90D-001",
  "mutations": [
    {
      "mutationId": "mut_unique_1",
      "entityType": "task",
      "operation": "UPDATE",
      "id": "TSK-1",
      "expectedRowVersion": 3,
      "fields": {
        "planned_start_date": "2026-09-03",
        "due_date": "2026-09-05",
        "schedule_dates_json": "[\"2026-09-03\",\"2026-09-05\"]"
      }
    }
  ]
}
```

성과 화면의 KPI 설정은 `mutate`에 `entityType = kpi_definition`을 사용합니다. 내부 운영 계정은 `11_KPI정의`의 생성·수정·보관을 요청할 수 있고, 수정·보관에는 현재 `row_version`이 필요합니다. 허용 필드는 KPI명, 목표값, 단위, 측정주기, 채널, 고객 공개 여부이며 실제 실적은 이 mutation으로 입력하지 않습니다.

`performance_tracking`은 별도 실적을 저장하지 않는 읽기 전용 집계입니다. 첫 응답이 지연되지 않도록 `12_성과일별`의 비용·노출·반응·클릭·문의·전환·매출만 선택 기간 기준으로 한 번 읽어 합산합니다. 고객 역할일 때만 `05_프로젝트채널.customer_visible = true` 채널 목록을 추가 확인합니다. 프런트가 계산하는 전환율과 병목은 이 응답의 실제 합계만 사용하며, 원장 행이 없으면 0원·0건으로 가장하지 않고 연결된 빈 상태를 표시합니다. 이 경량 조회는 모든 화면에서 실행되는 `project_snapshot`에 포함하지 않고 성과 추적 탭 진입 시에만 호출합니다.

고객 계정 생성·수정·비활성화는 `access_admin_mutate` 전용 action을 사용합니다. 입력은 계정 ID, 표시 이름, 프로젝트, 허용 페이지 배열, 활성 상태이며 신규 계정은 8자 이상의 임시 비밀번호가 필요합니다. 서버는 포켓 관리자 권한을 다시 검사하고 사용자·프로젝트권한 원장과 Script Properties의 비밀번호 digest를 갱신합니다. 고객 세션의 화면별 조회는 메뉴 숨김과 별개로 서버에서도 `allowed_pages_json`을 검사해 미허용 action을 `403 page_access_denied`로 거부합니다.

`ops_maintenance.operation = migrate_campaign_schedule_v1`은 Pocket 관리자 전용 캠페인 HTML 이관 작업입니다. `mugeuk`, `und` 두 seed 캠페인을 함께 받아 각각 고정 프로젝트로 매핑하며, `06_업무`가 비어 있거나 기존 이관 원천 ID 집합과 정확히 일치할 때만 동작합니다. 첫 쓰기와 데이터 보정 전에 전체 스프레드시트를 강제 복제하고 21개 원장의 셀 해시가 모두 일치해야 진행합니다. 일정 일자 배열이 없는 구배포 원장은 `schedule_dates_json` 열을 먼저 생성하고 기존 동일 ID 행을 보정합니다. 결과는 사용자 업무 로그가 아니라 `TASK_BATCH` 감사 이벤트로 기록합니다.

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

`project_plan`은 개별 fallback 조회와 `project_snapshot`의 실행계획 항목에 같은 reader를 사용합니다. 요청의 `planType`은 `CLIENT_SHARE` 또는 `INTERNAL`이며 생략하면 하위 호환을 위해 `CLIENT_SHARE`입니다. `plan`에는 최신 승인본 메타데이터와 파생 `plan_type_code`를, `sections`에는 `sort_order` 순서의 정제된 본문을 반환합니다. 원본 파일 링크·내부 원천 코드·편집 필드는 반환하지 않으며 고객은 이 action으로 저장할 수 없습니다. 계획 응답은 프로젝트·역할별로 최대 5분 캐시합니다.

`CLIENT_VIEWER`가 `INTERNAL`을 요청하면 `403 internal_plan_requires_project_team`으로 거부합니다. 실행사는 내부 계획의 `PROJECT_TEAM` 본문만, 포켓 역할은 그 본문과 `POCKET_ONLY` 실행팀 부록을 함께 봅니다. 캐시 키에도 `planType`을 포함해 두 계획의 응답이 섞이지 않게 합니다.

### 프로젝트 스냅샷 응답

`project_snapshot`은 현재 화면을 막지 않고 그 화면의 전용 API가 완료된 뒤 실행되는 읽기 최적화 API입니다. 하위 호환 `plan`에는 클라이언트 공유용 계획을, `internalPlan`에는 현재 역할이 내부 계획을 볼 수 있을 때만 내부 계획을 넣습니다. 고객 응답의 `internalPlan`은 `null`입니다. 이외 `tasks`, `contents`, `performance`, `files`, `activity`는 기존 reader 그대로 호출하므로 역할·프로젝트 권한, 공개 범위, 필드 제거, 기간·건수 제한은 개별 API와 동일합니다. `overview`는 첫 진입 시 이미 조회하므로 스냅샷에 중복 포함하지 않습니다. 스냅샷이 진행 중이어도 탭 이동은 이를 기다리지 않고 해당 탭 전용 API를 즉시 호출합니다.

### 업무 응답

`tasks`는 업무 목록 외에 프로젝트 일정 기준과 콘텐츠 발행 집계를 함께 반환합니다.

프로젝트와 업무의 날짜 필드는 `yyyy-MM-dd` 날짜 전용 문자열입니다. 프런트의 `일정표` 보기는 같은 `tasks` 응답의 `title`, `description`, `planned_start_date`, `due_date`, `schedule_dates_json`, `progress_percent`, `status_code`, `completion_url`, `remarks`를 사용합니다. 업무의 `created_at`은 서버 생성 시각이며, 생성 후 24시간 신규 표시의 유일한 기준입니다. `updated_at`은 신규 판정에 사용하지 않습니다. `schedule_dates_json`은 정렬·중복 제거된 ISO 날짜 배열 문자열이며 간트 드래그의 비연속 선택을 보존합니다. 값이 없는 구버전 행은 시작일~종료일 전체를 선택한 것으로 해석하고, `[]`는 일정이 없음을 의미합니다. 별도 일정 API나 복제 테이블은 사용하지 않습니다.

간트 UPDATE에서 `schedule_dates_json`을 보내면 서버가 배열을 검증하고 `planned_start_date`·`due_date`를 첫 날짜·마지막 날짜로 다시 계산합니다. 일반 수정 화면이 시작일 또는 종료일만 바꾸면 명시 날짜 배열을 비우고 새 경계의 연속 구간 모델로 돌아갑니다. 배열은 업무당 최대 500일입니다.

`progress_percent`는 0~100 범위의 사용자 직접 입력값입니다. 신규 업무의 기본값은 상태와 관계없이 0이며, `DONE`·`NOT_STARTED` 전환이나 종료일 경과로 서버가 자동 변경하지 않습니다.

`daily_meetings`는 업무 페이지 권한을 상속합니다. 저장은 `daily_meeting` 엔터티의 CREATE/UPDATE/ARCHIVE mutation을 사용하고, 고객 역할은 `visibility_code = CLIENT` 행만 읽으며 쓰기는 허용하지 않습니다.

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
      "created_at": "2026-09-03T09:15:00+09:00",
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

### 업무 로그 응답

업무 화면은 목록과 별도로 `activity`에 `entityType=TASK`를 보내 최근 확정 이력을 지연 조회합니다. 응답은 `15_활동로그`의 `COMMIT` 이벤트만 사용하며 업무명, 변경자 표시명, 동작 코드, 허용된 필드의 변경 전·후 값을 반환합니다. 설명·개인 담당자 ID와 원시 `before_json`·`after_json`은 반환하지 않습니다.

## 응답 크기와 페이지 처리

- `preview_bootstrap`·`bootstrap`: 10KB 이하 권장, 총괄·목록 원문 포함 금지
- `preview_overview`: 첫 진입 병렬 조회 전용이며 쓰기 세션이나 내부 필드를 반환하지 않음
- `project_snapshot`: 후속 탭 준비 전용이며 각 하위 reader의 목록 제한을 유지하고, 서버 캐시에는 90KB 초과 시 gzip으로 저장
- 일반 응답: 200KB 이하 권장
- 목록 기본 30건, 최대 200건
- 커서는 시트 행 번호가 아닌 `updated_at + immutable_id` 기반 불투명 토큰 사용
- 캐시 키에 `user_id`, `role`, `project_id`, `visibility`, `dateRange`를 포함
