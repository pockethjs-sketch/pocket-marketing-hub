# 프런트엔드 Google Sheets API 어댑터

## 구현 상태

`frontend/src/api/`의 API 계층을 `App.jsx`에 연결했습니다. 운영 빌드는 Apps Script를 통해 Google Sheets 원장을 읽고 쓰며, API 주소가 없거나 요청이 실패하면 임시 데이터로 대체하지 않고 명시적인 오류를 표시합니다.

어댑터가 지원하는 화면 단위는 다음과 같습니다.

| 프런트 메서드 | 서버 action | 용도 |
|---|---|---|
| `previewBootstrap` | `preview_bootstrap` | 공개 세션과 최소 고객사·프로젝트 탐색 정보를 한 번에 발급 |
| `previewOverview` | `preview_overview` | 공개 첫 총괄을 bootstrap과 병렬 조회 |
| `bootstrap` | `bootstrap` | 인증 사용자의 고객사·프로젝트·채널 탐색 정보 |
| `overview` | `project_overview` | 선택 프로젝트 총괄 현황 |
| `tasks` | `tasks` | 업무 목록 |
| `contents` | `contents` | 콘텐츠 목록 |
| `performance` | `performance` | KPI·성과 |
| `files` | `files` | 자료 링크 |
| `activity` | `activity` | 안전하게 투영된 활동 이력 |
| `mutate` | `mutate` | 생성·수정·보관 |

## 환경 설정

`frontend/.env.example`을 참고해 배포 환경에 공개 가능한 API 주소만 설정합니다.

```dotenv
VITE_POCKET_API_URL=https://example.invalid/api
VITE_POCKET_API_MODE=auto
VITE_POCKET_API_TIMEOUT_MS=60000
VITE_POCKET_API_CREDENTIALS=omit
```

- `VITE_` 값은 브라우저 번들에 공개됩니다. API 키·공유 비밀번호·관리자 토큰을 넣으면 안 됩니다.
- `auto`에서 URL이 없으면 설정 오류를 표시합니다.
- `live`는 URL 누락이나 API 실패를 오류로 표시하며 데모로 감추지 않습니다.

## 상태 모델

`createHubDataSource()`는 다음 상태를 제공합니다.

```js
const source = createHubDataSource();
const unsubscribe = source.subscribe((state) => {
  // state.mode: initializing | live
  // state.phase: idle | loading | saving | ready | error
  // state.error: 사용자에게 표시 가능한 오류 요약
  // state.lastSuccessfulAt: 마지막 API 성공 시각
});
```

인증·네트워크·서버 오류는 다른 데이터로 감추지 않고 오류로 표시합니다. API가 없는 상태의 쓰기도 성공한 것처럼 처리하지 않습니다.

## 저장 요청

```js
await source.mutate({
  projectId: "PRJ-001",
  expectedRowVersion: 4,
  mutation: {
    entityType: "task",
    operation: "UPDATE",
    id: "TSK-001",
    fields: { title: "촬영안 검수", visibility_code: "PROJECT_TEAM" },
  },
});
```

프런트가 `mutation_id`를 생략하면 UUID를 생성합니다. 서버는 이 ID의 멱등성, 로그인 사용자 권한, `row_version`, 허용 필드, 참조 무결성을 반드시 검증해야 합니다. `Content-Type: text/plain`을 사용해 Apps Script 계열 엔드포인트의 불필요한 CORS preflight를 피하지만, 이것은 인증을 대신하지 않습니다.

## App.jsx 연결 순서

1. 로그인 없는 앱 부팅은 `previewBootstrap()`과 `previewOverview()`를 병렬 실행해 탐색 정보와 첫 총괄을 함께 준비합니다.
2. 유효한 저장 세션 또는 로그인 상태에서는 `bootstrap()`으로 최소 탐색 정보만 받습니다.
3. 로그인 사용자는 탐색 화면 뒤 `overview()`를 조회하고, 공개 첫 진입은 병렬 응답을 그대로 사용해 두 번째 직렬 대기를 없앱니다.
4. 업무·콘텐츠·성과·자료 탭 진입 시 해당 화면 action을 지연 조회합니다.
5. 화면에 `loading`, `error`, 마지막 성공 시각을 표시합니다.
6. 추가·수정 버튼은 서버 성공 응답을 받은 뒤에만 화면을 확정합니다.
7. 저장 후 영향받은 화면 데이터와 활동로그를 다시 조회합니다.

운영 원장은 `POCKET_ONLY / PROJECT_TEAM / CLIENT` 공개 범위와 프로젝트별 `ADMIN / EDIT / READ_ONLY` 권한을 사용합니다. 화면의 작성 버튼도 선택 프로젝트의 실제 권한에 맞춰 표시됩니다.
