# Supabase 이전 현황

## 현재 상태

- 공식 Supabase Codex 플러그인 `0.1.15` 설치
- Supabase MCP OAuth 인증 완료
- 프로젝트 루트 `.mcp.json`에 `https://mcp.supabase.com/mcp` 등록
- 원격 프로젝트 연결 및 Supabase CLI 프로젝트 구조 생성
- `@supabase/supabase-js` 버전 고정 및 lockfile 반영
- PostgreSQL 마이그레이션 7개, 인덱스·RLS·감사 로그 트리거·업무 RPC 적용
- RLS/페이지 권한/외래키 인덱스/브라우저 열 노출 계약 테스트 작성
- 원격 PostgreSQL에서 공개 테이블 22개 생성 확인
- 공개 테이블 22개 전부 RLS 활성화, `anon` 권한 0개, `PUBLIC` 함수 실행권한 0개, 브라우저 DELETE·활동로그 원문·서버 전용 테이블 쓰기 권한 0개 확인
- `read_tasks`, `mutate_task`, `mutate_tasks_batch`, `read_task_activity` RPC와 Auth Edge bridge 배포
- 업무 생성·동일 mutation 재호출·낙관적 충돌·간트 전체 해제·다건 저장·보관과 프로젝트/페이지/공개범위 교차검증 통과
- 고객 업무 응답에서 내부 계획·차단 사유·비고·실행 조직·프로젝트 구성원 차단 확인
- Sheets에서 고객사 2건, 프로젝트 2건, 업무 101건(UND 78·무극 23) 복제 및 누락·중복·일정 불일치 0건 확인
- Pocket·NS Supabase Auth 사용자, 프로필, 두 프로젝트 멤버십 생성 및 실제 로그인·업무 읽기·쓰기 검증
- 프런트 테스트 139개, Supabase 원격 보안 계약, 프로덕션 빌드 통과
- `npm audit` 운영·개발 의존성 취약점 0건. Vite는 보안 패치가 포함된 `6.4.3`으로 고정
- 운영 프런트 기능 플래그와 GitHub Actions 저장소 변수를 `supabase`로 전환
- 업무·업무 로그·총괄의 업무 집계는 Supabase, 나머지 화면은 Sheets를 사용하는 단계적 어댑터 적용

실제 원격 측정은 업무 78건 조회 0.22~0.51초, 생성 0.19~0.42초, 간트 다건 변경 0.46초, 보관 0.18초, 로그 조회 0.18초입니다. 로그인은 기존 Apps Script 자격 증명을 매번 검증하므로 5.3~10.6초가 걸렸습니다. 다음 성능 단계는 짧은 아이디를 Supabase Auth 로그인 규칙으로 직접 수용해 Apps Script 왕복을 제거하는 것입니다.

현재 보안 Advisor의 RLS·함수 경고는 해소했습니다. 남은 경고는 Auth의 유출 비밀번호 보호 기능이 꺼져 있다는 항목 하나이며, 운영 고객 계정을 열기 전에 설정 가능 여부를 다시 확인해야 합니다. 성능 Advisor의 미사용 인덱스 표시는 새 DB에 실제 트래픽이 거의 없어서 발생한 정보 수준 항목이므로 지금 삭제하지 않습니다.

Edge Function의 `LEGACY_API_URL`은 코드에 하드코딩하지 않고 Supabase 런타임 secret으로만 제공해야 합니다. 현재 원격 v3는 전환 검증 당시 배포본이며, 다음 함수 재배포 전에는 반드시 이 secret을 먼저 설정하고 로그인 회귀 테스트를 수행합니다.

## 선택한 구조

PostgreSQL 내부 기본키는 단일 DB 쓰기 성능과 인덱스 지역성을 위해 `bigint identity`를 사용합니다. 기존 Sheets 식별자는 `legacy_id`로 보존해 이관 대조와 롤백 추적에 사용합니다. Supabase Auth 사용자만 UUID를 사용합니다.

| Sheets 원장 | Supabase 테이블 |
|---|---|
| 01_고객사 | `clients` |
| 02_프로젝트 | `projects` |
| 03_사용자 | `profiles` + `auth.users` |
| 04_프로젝트권한 | `project_memberships` |
| 05_프로젝트채널 | `project_channels` |
| 06_업무 | `tasks` |
| 07_업무의존성 | `task_dependencies` |
| 08_콘텐츠 | `contents` |
| 09_콘텐츠버전 | `content_versions` |
| 10_승인 | `approvals` |
| 11_KPI정의 | `kpi_definitions` |
| 12_성과일별 | `daily_performance` |
| 13_KPI실적 | `kpi_actuals` |
| 14_파일링크 | `file_links` |
| 15_활동로그 | `activity_events` |
| 16_동기화상태 | `sync_status` |
| 17_실행계획 | `plans` |
| 18_실행계획섹션 | `plan_sections` |
| 19_데일리회의록 | `daily_meetings` |
| 20_뮤테이션 | `mutations` |
| 21_백업로그 | `backup_runs` |
| 브라우저 신규 알림 확인 | `notification_receipts` |

## 권한 모델

- `POCKET_MANAGER + POCKET`: 전체 프로젝트 관리
- `POCKET_EDITOR`: 배정 프로젝트 편집
- `EXECUTOR_EDITOR + NS`: 배정 프로젝트의 `PROJECT_TEAM`·`CLIENT` 행 편집
- `CLIENT_VIEWER`: 배정 프로젝트의 `CLIENT` 행만 조회
- 비로그인 `anon`: 업무 테이블 접근권한 없음
- 브라우저: 물리 DELETE, 활동로그 쓰기, 뮤테이션 레지스트리 쓰기, 백업 쓰기 권한 없음

권한 판정은 사용자가 변경할 수 있는 `user_metadata`를 사용하지 않습니다. `profiles`, 활성 프로젝트 멤버십, RLS 헬퍼를 조합하며 헬퍼는 Data API에 노출되지 않는 `private` 스키마에 둡니다.

RLS는 행만 가릴 뿐 같은 `authenticated` 역할의 고객에게 내부 열을 조건부로 숨기지는 못합니다. 따라서 `tasks` 원본 테이블 SELECT는 브라우저에서 철회하고 `read_tasks()`가 역할별 허용 열만 반환합니다. 고객 응답에서는 `plan_note`, `blocker_reason`, `remarks`, 실행사 조직과 프로젝트 구성원을 제거합니다. 원천 payload나 내부 메모가 있는 `contents`, `content_versions`, `file_links`도 마스킹된 전용 읽기 RPC가 생기기 전까지 직접 조회를 차단합니다. `daily_performance.source_payload`는 브라우저 열 권한에서 제외했습니다.

## 일정 저장

Sheets의 `schedule_dates_json`은 PostgreSQL `date[]`로 변환합니다. 비어 있지 않은 배열이 저장되면 DB 트리거가 최솟값과 최댓값을 `planned_start_date`, `due_date`에 동기화합니다. 진행률은 날짜로 계산하지 않고 사용자가 입력한 `progress_percent`만 저장합니다.

## 프런트 기능 플래그

```env
VITE_POCKET_DATA_BACKEND=supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

운영 빌드는 `supabase`, 비상 롤백 빌드는 `sheets`입니다. `VITE_` 변수는 빌드 결과에 공개되므로 publishable key만 허용하며 secret/service-role key는 금지합니다.

프런트는 `supabase`를 선택했는데 URL이나 publishable key가 빠진 경우 즉시 실패합니다. 설정을 무시하고 Sheets로 조용히 되돌아가는 동작은 금지했습니다. GitHub Actions는 세 운영 변수가 하나라도 없으면 빌드 전에 실패합니다.

업무 읽기는 `read_tasks()`의 최대 1,000건 역할별 마스킹 계약과 프런트 어댑터까지 작성했습니다. 업무 쓰기는 `mutate_task()` 한 트랜잭션이 권한, 허용 페이지, mutation 중복, `row_version`, 일정 배열 정규화, 감사 연결을 처리합니다. 브라우저의 업무 테이블 직접 SELECT/INSERT/UPDATE는 금지했습니다. 알 수 없는 필드명은 성공처럼 무시하지 않고 거부합니다.

## 전환 게이트

완료:

1. 원격 DB 마이그레이션과 전 공개 테이블 RLS 적용
2. `anon` 차단, 원본 테이블 직접 쓰기 차단, 역할별 업무 열 마스킹
3. Sheets 대비 업무 101건의 `legacy_id`, 상태, 분야, 담당, 일정 배열 대조
4. Pocket·NS 로그인과 두 프로젝트 업무 읽기·생성·수정·다건 저장·보관 E2E
5. 같은 mutation 재시도 중복 방지와 작업자·변경 전후값 감사 로그
6. GitHub Pages 빌드 변수 등록, secret/service-role 문자열 저장소·산출물 제외 검사
7. 화면의 저장소 고정 문구 제거와 총괄 업무 집계의 Supabase 일관성 보정

남은 전체 이전 게이트:

1. 고객 계정의 Supabase 로그인·CLIENT 공개범위 E2E
2. 실행계획·회의록·콘텐츠·성과·파일·권한용 마스킹 RPC와 프런트 어댑터
3. 회의록·KPI·권한 저장 RPC와 실패 복구 E2E
4. Supabase 변경분을 포함하는 자동 백업·복원 훈련
5. Apps Script 인증 왕복을 제거한 Supabase 직접 로그인
6. Auth 유출 비밀번호 보호 설정 검토

## 롤백

Google Sheets 업무 101건은 전환 기준본으로 보존합니다. 장애가 발생하면 먼저 업무 쓰기를 잠그고 Supabase의 `legacy_id`, `row_version`, 최근 mutation과 Sheets 기준본을 대조한 뒤 `VITE_POCKET_DATA_BACKEND=sheets`로 다시 빌드·배포합니다. 현재는 Supabase 변경을 Sheets에 자동 복제하지 않으므로 전환 후 생긴 업무 변경을 확인 없이 Sheets로 되돌리면 유실될 수 있습니다. 양쪽에 동시에 사용자 쓰기를 허용하는 장기 이중 쓰기는 충돌과 중복의 원인이므로 사용하지 않습니다.
