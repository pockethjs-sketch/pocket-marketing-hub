# 화면별 읽기 API 계약

공개 GitHub Pages는 현재 비식별 데모 데이터를 사용합니다. 아래 계약은 실제 Google Sheets 원장을 연결할 때 Apps Script 또는 인증 프록시가 반환해야 할 최소 구조입니다.

## 공통 응답

```json
{
  "ok": true,
  "contractVersion": "2026-08-25-read-v1",
  "schemaVersion": "2026-08-25-v1",
  "revision": "rev_20260825_103001",
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
| `bootstrap` | 앱 셸·고객사 레일 | 로그인 사용자가 볼 수 있는 고객사·프로젝트 요약만 |
| `project_overview` | 총괄 현황 | 핵심 집계, 단계·분야 진행, 확인 항목, 최근 활동 상위 5개 |
| `tasks` | 업무 | 필터된 업무 목록, 기본 30건·최대 100건 |
| `contents` | 콘텐츠 | 최대 92일의 콘텐츠와 현재 버전·검수 상태 |
| `approvals` | 검수 현황 | 공개 허용된 현재 검수 상태만 |
| `performance` | 성과 | 최대 366일의 집계 KPI·추이·채널 분해 |
| `files` | 자료 | 공개 범위가 허용된 파일 링크만 |
| `activity` | 활동 | 안전한 요약 문장으로 투영한 이벤트만 |

Apps Script에서는 URL 경로 대신 `?action=project_overview&project_id=...` 형태로 라우팅한다.

## 역할별 공개 단계

`visibility_code`는 다음 3단계로 운영한다.

- `POCKET_ONLY`: 포켓 내부 전략·원가·위험·계약 기준
- `PROJECT_TEAM`: 포켓과 배정된 실행사 업무·콘텐츠 제작 정보
- `CLIENT`: 고객사가 볼 수 있는 일정·결과·승인·성과

고객 응답에는 실행사명, 내부 담당자 ID, 차단 사유, 내부 메모, 원가, 변경 전후 JSON을 포함하지 않는다.

## 응답 크기와 페이지 처리

- `bootstrap`: 50KB 이하 권장
- 일반 응답: 200KB 이하 권장
- 목록 기본 30건, 최대 100건
- 커서는 시트 행 번호가 아닌 `updated_at + immutable_id` 기반 불투명 토큰 사용
- 캐시 키에 `user_id`, `role`, `project_id`, `visibility`, `dateRange`를 포함

