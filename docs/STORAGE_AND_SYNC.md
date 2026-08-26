# 저장·연동 원칙

## 쓰기 흐름

1. 브라우저가 `mutation_id`를 생성해 서버에 요청한다.
2. Apps Script가 로그인 세션과 `04_프로젝트권한`을 확인한다.
3. `LockService`로 동시 쓰기를 잠근다.
4. 대상 행의 `row_version`을 검사한다.
5. 대상 원장 행을 생성 또는 수정한다.
6. 같은 트랜잭션의 변경 내용을 `15_활동로그`에 추가한다.
7. 성공 응답과 새 `row_version`을 브라우저에 반환한다.

동일 `mutation_id`가 다시 들어오면 중복 저장하지 않고 기존 성공 결과를 반환하도록 구현합니다.

## 읽기 흐름

- 포켓 내부: 권한이 있는 모든 고객사·프로젝트의 내부/고객 공개 데이터를 조회
- NS 마케팅: 배정된 프로젝트의 실행 업무·콘텐츠·파일만 조회 및 수정
- 고객사: 본인 `client_id`와 허용된 `project_id`의 `visibility_code=CLIENT` 데이터만 읽기
- 고객사 쓰기: 1차 버전에서는 비활성화

프런트에서 고객사 ID를 바꿔 보내더라도 서버가 세션의 프로젝트 권한을 다시 확인해야 합니다.

- 로그인 없는 최초 진입은 `preview_bootstrap`과 `preview_overview`를 병렬 호출해 공개 세션·탐색 정보·첫 총괄을 준비한다.
- 로그인 또는 유효 세션이 있는 최초 진입은 최소 `bootstrap`으로 고객사·프로젝트·채널만 받고, 총괄과 업무는 화면별로 지연 조회한다.
- 첫 총괄이 준비되면 `project_snapshot`을 한 번 실행해 실행계획·업무·콘텐츠·성과·자료·활동을 같은 실행에서 읽고 브라우저 화면 캐시를 미리 채운다. 스냅샷이 실패하거나 4초 이상 지연되면 해당 탭의 기존 개별 API로 복귀한다.
- 브라우저는 `프로젝트 + 화면` 응답을 10분 보관한다. 수동 새로고침·저장·프로젝트 변경 시 캐시 세대를 폐기해 이전 응답이 최신 화면을 덮지 못하게 한다.
- 시트 읽기는 실행 내 메모리 캐시와 최대 180초의 `CacheService` 캐시를 사용하며, 배포·스키마 버전이 달라지면 이전 캐시는 재사용하지 않는다.
- 공개 고객 응답은 일반 화면 120초, 실행계획과 프로젝트 스냅샷 300초까지 재사용한다. 따라서 시트를 웹 밖에서 직접 수정하면 화면 종류에 따라 최대 5분 뒤 반영될 수 있다. 웹을 통한 저장은 관련 서버 캐시까지 폐기하지만, 시트 직접 수정은 캐시 만료를 기다린다.
- 웹 저장은 공유 읽기 캐시를 사용하지 않고 최신 시트를 다시 읽으며, 성공 즉시 대상 시트 캐시를 제거한다.

## 비밀정보

- API 키, 세션 서명 키, 관리자 비밀번호는 Google Sheet와 GitHub에 저장하지 않는다.
- Apps Script의 Script Properties에만 보관한다.
- GitHub Pages 정적 파일에는 공개 가능한 설정값만 둔다.

## 백업

- 실연동 전 원장 전체 백업본을 별도 Drive 파일로 생성했습니다.
- 매일 자동 백업과 30일 보관은 다음 운영 안정화 범위이며 현재 자동화되지 않았습니다.
- `15_활동로그`는 추가 전용으로 운영한다.
- 원장 수정 전후 값을 로그에 남겨 복구 근거를 확보한다.

## API 단위

- `POST action=preview_bootstrap`: 로그인 없는 공개 조회 세션과 최소 bootstrap을 한 응답으로 발급
- `POST action=preview_overview`: 공개 허용 프로젝트의 첫 총괄을 bootstrap과 병렬 조회
- `POST action=bootstrap`: 로그인 사용자가 볼 수 있는 고객사·프로젝트·채널
- `POST action=project_overview`: 총괄 화면에 필요한 집계와 상위 항목
- `POST action=project_snapshot`: 실행계획·업무·콘텐츠·성과·자료·활동을 한 실행에서 조회해 후속 탭 캐시 구성
- `POST action=tasks|contents|approvals|performance|files|activity`: 화면별 지연 조회
- `POST action=mutate`: 행 단위 생성·수정·보관
- `POST action=deep_health`: 관리자 전용 시트 접근·전체 스키마 검사
- `GET action=health`: 공개 가능한 설정 상태와 백엔드 버전

Apps Script 실제 배포 시 모든 읽기·쓰기를 `Content-Type: text/plain` POST JSON으로 전송합니다. 이 방식은 GitHub Pages에서 커스텀 인증 헤더로 인한 CORS preflight를 피하면서 세션을 query string에 남기지 않습니다.

첫 화면을 막지 않도록 bootstrap에는 탐색 정보만 반환한다. 총괄은 첫 화면과 병렬로 조회하고, 나머지 projection은 첫 화면 뒤 `project_snapshot`으로 준비한다. 스냅샷을 지원하지 않거나 실패한 서버에서는 화면별 API와 페이지 처리를 그대로 사용한다.
