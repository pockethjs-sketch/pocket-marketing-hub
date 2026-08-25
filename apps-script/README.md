# Pocket Marketing Hub Apps Script API

이 폴더는 GitHub Pages 프런트엔드와 비공개 Google Sheets 원장 사이의 서버입니다. 운영 Web App은 배포돼 있으며, URL과 비밀값은 저장소 밖의 GitHub Actions 변수·Script Properties·gitignored 로컬 파일에서 관리합니다.

## 보안 경계

- 모든 읽기·쓰기는 `text/plain` POST JSON으로 호출합니다.
- 접근코드 원문, 시트 ID, 서명키는 GitHub에 커밋하지 않습니다.
- 로그인 성공 시 최대 12시간의 HMAC 서명 세션을 발급합니다.
- 세션이 있어도 매 요청마다 `03_사용자`, `04_프로젝트권한`을 다시 확인합니다.
- 차단된 접근계정도 매 요청마다 다시 확인하므로 기존 세션을 즉시 거부합니다.
- `CLIENT_VIEWER`는 읽기 전용입니다.
- `EXECUTOR_EDITOR`는 배정 프로젝트 중 `EDIT/ADMIN` 권한만 수정할 수 있습니다.
- `EXECUTOR_EDITOR`는 고객 공개(`CLIENT`)로 승격할 수 없으며 Pocket 검수자가 공개 범위를 결정합니다.
- `MASTER`, `POCKET_MANAGER`, `POCKET_EDITOR`도 서버 권한 검사를 통과해야 합니다.
- 기존 `INTERNAL` 공개 코드는 서버에서 `POCKET_ONLY`로 취급합니다.
- `source_code=HTML_REFERENCE`인 이관 업무는 고객 응답에서 무조건 제외합니다.
- 삭제는 행 삭제가 아니라 `archived_at` 기록입니다.
- 쓰기는 `ENABLE_WRITES=true`를 명시하기 전까지 차단됩니다.

접근코드 방식은 사내 1차 운영용입니다. MFA·Google SSO가 필요한 외부 대규모 서비스라면 별도 인증 프록시로 교체해야 합니다.

## 파일

| 파일 | 역할 |
|---|---|
| `Router.gs` | `doGet`, `doPost`, action 라우팅 |
| `Auth.gs` | 접근코드 로그인, 서명 세션, 사용자·프로젝트 권한 |
| `Sheets.gs` | 시트 읽기, 행 추가·수정, 스키마 검사 |
| `ReadApi.gs` | bootstrap·overview·목록·성과 projection |
| `Mutations.gs` | create·update·archive, 중복 방지, 활동로그 |
| `Config.gs` | 시트명·엔터티·공개 범위·허용 필드 |
| `Utils.gs` | 응답 envelope, cursor, 날짜, 값 정규화 |
| `Setup.gs` | 초기 설정·계정 등록·세션 회전·점검 |
| `Secrets.gs` | 로컬 clasp 전용 fallback; gitignored |
| `appsscript.json` | V8·Google Sheets 최소 scope |

## 요청 방식

브라우저는 커스텀 헤더 없이 다음 방식으로 호출합니다.

```js
const response = await fetch(WEB_APP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(payload),
  redirect: 'follow',
});
const result = await response.json();
if (!result.ok) throw new Error(result.error.code);
```

Apps Script ContentService 특성상 애플리케이션 오류도 HTTP 200으로 올 수 있으므로 반드시 `result.ok`를 확인합니다.

### 로그인

```json
{
  "action": "login",
  "email": "operator@example.com",
  "accessCode": "24자-이상의-개별-랜덤-접근코드"
}
```

성공 시 `data.token`, `data.expiresIn`, `data.user`가 반환됩니다. 토큰은 `localStorage`가 아니라 `sessionStorage`에 저장합니다.

### 로그인 없는 공개 조회

`PUBLIC_PREVIEW_ENABLED=true`일 때만 아래 요청으로 1시간짜리 `CLIENT_VIEWER` 세션을 발급합니다.

```json
{ "action": "preview_session" }
```

`PUBLIC_PREVIEW_EMAIL` 사용자는 반드시 `CLIENT_VIEWER` 역할이어야 하며, `PUBLIC_PREVIEW_PROJECT_IDS`에 적힌 프로젝트만 `READ_ONLY`로 공개됩니다. 일반 로그인과 서버 권한 검사는 그대로 유지되고, 허용 목록 밖 프로젝트는 해당 계정에 배정돼도 공개되지 않습니다.

### 읽기

```json
{
  "action": "tasks",
  "auth": { "sessionToken": "서명-세션" },
  "projectId": "PRJ-...",
  "limit": 30,
  "filters": { "statusCode": "IN_PROGRESS" }
}
```

지원 action: `bootstrap`, `project_overview`, `tasks`, `contents`, `approvals`, `performance`, `files`, `activity`.

### 저장

```json
{
  "action": "mutate",
  "auth": { "sessionToken": "서명-세션" },
  "mutation": {
    "mutationId": "mut_b90a0d9b77d34b74",
    "entityType": "task",
    "operation": "UPDATE",
    "projectId": "PRJ-...",
    "id": "TSK-...",
    "expectedRowVersion": 3,
    "fields": {
      "status_code": "IN_PROGRESS",
      "customer_status_text": "작업 중"
    }
  }
}
```

지원 엔터티: `task`, `content`, `approval`, `file`. 지원 동작: `CREATE`, `UPDATE`, `ARCHIVE`.

같은 `mutationId`가 다시 들어오면 원장을 다시 수정하지 않고 기존 성공 결과를 반환합니다. `UPDATE/ARCHIVE`는 `expectedRowVersion`이 현재 `row_version`과 정확히 일치해야 합니다.

## 운영 전 필수 데이터

1. `03_사용자`에 실제 이메일·역할·ACTIVE 상태를 등록합니다.
2. `04_프로젝트권한`에 사용자별 `client_id`, `project_id`, `ADMIN/EDIT/READ_ONLY`를 등록합니다.
3. 고객에게 공개할 행만 `visibility_code=CLIENT`로 검수합니다.
4. 기존 `HTML_REFERENCE` 업무는 고객 공개 여부를 검수한 뒤 `source_code`를 운영 출처로 마이그레이션합니다.
5. 쓰기 활성화 전 `mhSetupMigrateVisibilityCodes`를 실행해 구형 `INTERNAL` 값과 드롭다운을 정리합니다.

전체 배포 순서는 [DEPLOYMENT.md](DEPLOYMENT.md)를 따릅니다.
