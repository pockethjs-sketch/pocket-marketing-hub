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

- 최초 진입은 `bootstrap` 한 번으로 프로젝트 목록·선택 프로젝트 총괄·최초 업무 페이지를 함께 받는다.
- 시트 읽기는 실행 내 메모리 캐시와 최대 45초의 `CacheService` 캐시를 사용한다.
- 외부에서 시트를 직접 수정한 값은 캐시 만료 후 최대 45초 안에 조회 화면에 반영된다.
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

- `POST action=bootstrap`: 로그인 사용자가 볼 수 있는 고객사·프로젝트, 최초 총괄, 최초 업무 페이지
- `POST action=project_overview`: 총괄 화면에 필요한 집계와 상위 항목
- `POST action=tasks|contents|approvals|performance|files|activity`: 화면별 지연 조회
- `POST action=mutate`: 행 단위 생성·수정·보관
- `POST action=deep_health`: 관리자 전용 시트 접근·전체 스키마 검사
- `GET action=health`: 공개 가능한 설정 상태와 백엔드 버전

Apps Script 실제 배포 시 모든 읽기·쓰기를 `Content-Type: text/plain` POST JSON으로 전송합니다. 이 방식은 GitHub Pages에서 커스텀 인증 헤더로 인한 CORS preflight를 피하면서 세션을 query string에 남기지 않습니다.

첫 화면에서 이미 필요한 총괄과 최초 업무 페이지만 함께 반환하고, 콘텐츠·성과·자료·활동 원본은 화면별 projection과 페이지 처리로 지연 조회한다.
