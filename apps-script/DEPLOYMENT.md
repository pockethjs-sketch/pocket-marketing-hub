# Apps Script 배포·설정

## 현재 운영 배포

- 백엔드: `2026-09-01-page-catalog-v39`
- Web App 배포: @96
- 운영 검증: health `READY`; 고객 페이지 권한 카탈로그와 세부 로그 분리
- 권한 격리: UND는 UND 프로젝트 1개만 노출, 무극 직접 조회 거부, NS 권한 관리 거부
- 최신 백업: 21개 시트 manifest 해시 일치

## 1. clasp 프로젝트 연결

`apps-script` 폴더에서 `.clasp.json.example`을 `.clasp.json`으로 복사하고 실제 Script ID를 입력합니다. `.clasp.json`은 gitignored입니다.

```powershell
Set-Location apps-script
Copy-Item .clasp.json.example .clasp.json
clasp login
clasp push
```

`apps-script/Secrets.gs`는 gitignored이지만 로컬 파일이므로 clasp push에는 포함됩니다. 운영 배포 후에는 Script Properties가 항상 우선합니다.

## 2. Script Properties

Apps Script의 `프로젝트 설정 → 스크립트 속성`에 입력합니다.

| 키 | 값 | 필수 |
|---|---|---:|
| `SHEET_ID` | 비공개 데이터 원장의 스프레드시트 ID | 예 |
| `SESSION_SIGNING_SECRET` | 32자 이상 난수; 저장소·시트에 금지 | 예 |
| `ACCESS_CODE_PEPPER` | 접근코드 digest 전용 32자 이상 난수; 세션키와 다르게 설정 | 예 |
| `ACCESS_ACCOUNTS_JSON` | 초기/로컬 fallback용 이메일별 접근코드 HMAC digest JSON | 예 |
| `ENABLE_WRITES` | 최초 `false`; 검증 후 `true` | 예 |
| `SESSION_VERSION` | 기본 `1`; 전체 세션 폐기 시 증가 | 선택 |
| `SESSION_TTL_SECONDS` | 기본 28800, 최대 43200 | 선택 |
| `ALLOWED_EMAIL_DOMAINS` | 쉼표 구분 도메인 화이트리스트 | 선택 |
| `PUBLIC_PREVIEW_ENABLED` | `true`일 때 로그인 없는 고객 조회 세션 발급 | 선택 |
| `PUBLIC_PREVIEW_EMAIL` | `CLIENT_VIEWER` 전용 사용자 이메일 | 미리보기 사용 시 필수 |
| `PUBLIC_PREVIEW_PROJECT_IDS` | 공개 조회를 허용할 프로젝트 ID 목록(쉼표 구분) | 미리보기 사용 시 필수 |
| `BACKUP_RUNNER_DIGEST` | GitHub Actions 백업 러너 비밀값의 SHA-256 digest | 자동 백업 사용 시 필수 |

Script Properties가 비어 있으면 `Secrets.gs`의 `MH_LOCAL_SECRETS`를 fallback으로 읽습니다.

## 3. 서버 초기화

1. Apps Script 편집기에서 `mhSetupInitialize`를 실행합니다.
2. 실행 결과의 `sheetConfigured`, `sessionSecretConfigured`, `accessCodePepperConfigured`, `schemaValid`가 모두 참인지 확인합니다.
3. 쓰기는 계속 꺼둡니다.

## 4. 접근 계정 등록

계정 이메일은 먼저 `03_사용자`에 있어야 합니다.

1. 임시 Script Properties `SETUP_ACCOUNT_EMAIL`, `SETUP_ACCOUNT_CODE`를 추가합니다.
2. 접근코드는 사용자별로 다르게 설정합니다. 외부 이메일 계정은 최소 24자(권장 32자) 랜덤값이 필수입니다. 사내 단축 아이디는 서버에서 `@hub.local` 계정으로 정규화되며 최소 8자를 허용하지만, 운영 보안상 더 긴 고유값을 권장합니다.
3. `mhSetupRegisterStagedAccount`를 실행합니다.
4. 함수가 digest를 이메일별 `ACCESS_ACCOUNT_*` Script Property에 저장하고 두 임시 평문 속성을 즉시 삭제합니다. 이 구조는 단일 Property의 9KB 한도를 피합니다.
5. 실행 완료 후 임시 속성이 사라졌는지 다시 확인합니다.

계정 차단은 `SETUP_ACCOUNT_EMAIL`에 대상 이메일을 넣고 인자 없는 `mhSetupDisableStagedAccount`를 실행합니다. 차단은 기존 세션에도 다음 요청부터 적용됩니다.

## 5. Web App 배포

- 실행 사용자: 배포한 운영 계정
- 액세스 권한: 모든 사용자

Web App 자체는 공개 URL이지만 데이터 API는 접근코드 로그인과 서명 세션 없이는 동작하지 않습니다. `/exec?action=health`는 데이터 없이 설정 상태만 반환합니다.

현재 운영은 로그인 필수이며 `PUBLIC_PREVIEW_ENABLED=false`, `MH_PUBLIC_TASK_WRITES_ENABLED=false`입니다. 공개 미리보기를 다시 켜야 할 때만 `PUBLIC_PREVIEW_EMAIL`, `PUBLIC_PREVIEW_PROJECT_IDS`와 함께 별도 보안 검토 후 활성화합니다. `preview_session`과 `preview_bootstrap`은 이전 클라이언트 호환용으로만 유지됩니다.

운영 URL 예:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

GitHub Pages에는 이 Web App URL만 공개 설정으로 넣습니다. `SHEET_ID`, 접근코드, 서명키는 넣지 않습니다.

## 6. 검증 순서

1. `GET ?action=health`가 `SETUP_REQUIRED`가 아닌지 확인합니다.
2. 고객 계정 로그인 → 본인 고객사·프로젝트만 bootstrap에 나오는지 확인합니다.
3. 고객 계정으로 다른 `projectId` 요청 → `error.code=forbidden` 확인.
4. 고객 응답에 `HTML_REFERENCE`, 내부 메모, 원가, before/after JSON이 없는지 확인합니다.
5. Pocket/NS 계정으로 읽기 확인.
6. `ENABLE_WRITES=false`에서 mutate가 차단되는지 확인.
7. `mhSetupMigrateVisibilityCodes`를 한 번 실행해 기존 `INTERNAL`과 시트 드롭다운을 마이그레이션합니다.
8. `mhSetupProtectApiManagedSheets`를 실행해 API 관리 원장의 직접 편집을 막습니다.
9. 인증된 Pocket 관리자 계정으로 `deep_health` POST가 `READY`인지 확인합니다.
10. 인자 없는 `mhSetupEnableWrites` 실행 후 테스트 업무 1건 생성·수정·보관.
11. 대상 원장과 `15_활동로그`에 PREPARE/COMMIT가 함께 기록되는지 확인.
12. 같은 `mutationId` 재전송 시 중복 행이 생기지 않는지 확인.
13. 같은 행을 오래된 `expectedRowVersion`으로 수정해 conflict가 나는지 확인.
14. `ops_maintenance`의 `status`, `schema_audit`, `verify_backup`을 확인합니다.
15. GitHub Actions의 `Backup marketing hub sheet`를 수동 실행하고 `21_백업로그` 새 행을 확인합니다.

## 7. 사고 대응

- 모든 세션 폐기: `mhSetupRotateAllSessions()` 실행
- 쓰기 즉시 차단: `mhSetupDisableWrites` 실행
- 특정 계정 차단: `SETUP_ACCOUNT_EMAIL` 입력 후 `mhSetupDisableStagedAccount`, 또는 `03_사용자.status_code=DISABLED`
- 서명키 유출: `SESSION_SIGNING_SECRET` 교체 후 `SESSION_VERSION` 증가

## 현재 제한

- 이 API는 Google Sheets의 원자적 트랜잭션을 제공하지 않습니다. PREPARE 후 쓰기, COMMIT 전 중단은 재요청 시 행 버전으로 복구 판정합니다.
- Apps Script 로그인 실패 제한은 CacheService 기반으로 강한 분산 rate limit가 아닙니다.
- 등록 계정은 CacheService 외에 Script Properties에도 8회 실패/15분 잠금을 기록하지만, 외부 공개 서비스 수준의 인증·MFA를 대체하지 않습니다.
- 고객 쓰기는 의도적으로 구현하지 않았습니다.
- 고객 계정과 프로젝트별 조회 권한은 포켓 계정의 권한 관리 화면에서 생성·수정·제거합니다. 고객사·프로젝트 자체 생성은 운영자가 원장에 먼저 등록해야 합니다.
- 운영자가 원장을 직접 수정하면 `row_version` 자동 증가와 API 활동로그가 생기지 않습니다. 운영 데이터 탭은 보호하고 일상 수정은 웹 UI를 사용해야 합니다.
- 외부 채널 API 동기화와 백업 파일 30일 자동 정리는 아직 구현하지 않았습니다. 후자는 Drive 파일 삭제 권한 추가와 재승인이 필요하므로 운영 승인 없이 활성화하지 않습니다.
