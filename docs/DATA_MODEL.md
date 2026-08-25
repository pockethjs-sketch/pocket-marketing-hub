# 데이터 모델

## 핵심 원칙

1. 고객사명·프로젝트명 같은 표시값으로 관계를 연결하지 않고 불변 ID로 연결한다.
2. 한 셀에 프로젝트 전체 JSON을 저장하지 않는다.
3. 웹 입력은 대상 탭의 한 행으로 저장하고 `15_활동로그`에 같은 작업의 이벤트를 추가한다.
4. 삭제는 행 삭제가 아니라 `archived_at`을 기록하는 보관 방식으로 처리한다.
5. 고객 화면은 `client_id`, `project_id`, `visibility_code`, 권한 정보를 서버에서 검사한 결과만 반환한다.
6. 사용자·콘텐츠·성과·승인은 서로 독립된 원장으로 관리한다.

## 탭 구조

| 탭 | 역할 | 기본키 | 주요 연결 |
|---|---|---|---|
| 01_고객사 | 고객사 마스터 | client_id | 모든 업무 데이터의 고객사 기준 |
| 02_프로젝트 | 고객사별 프로젝트 | project_id | client_id |
| 03_사용자 | 내부·실행사·고객 사용자 | user_id | 권한, 담당자, 승인자 |
| 04_프로젝트권한 | 프로젝트별 접근권한 | membership_id | user_id, client_id, project_id |
| 05_프로젝트채널 | 운영 채널·계정 | project_channel_id | client_id, project_id |
| 06_업무 | 실행 업무 원장 | task_id | project_id, assignee_user_id |
| 07_업무의존성 | 선행·후행 업무 | dependency_id | task_id, depends_on_task_id |
| 08_콘텐츠 | 콘텐츠 단위 원장 | content_id | task_id, project_channel_id |
| 09_콘텐츠버전 | 초안·수정본 이력 | content_version_id | content_id |
| 10_승인 | 고객·내부 승인 이력 | approval_id | 콘텐츠/업무 엔터티 ID |
| 11_KPI정의 | KPI 기준·목표 | kpi_id | project_id, channel_code |
| 12_성과일별 | 채널별 일자 원천 성과 | performance_id | project_id, performance_date |
| 13_KPI실적 | KPI별 집계 실적 | kpi_actual_id | kpi_id, period_start/end |
| 14_파일링크 | 문서·산출물 링크 | file_id | 연결 엔터티 ID |
| 15_활동로그 | 모든 변경 이벤트 | event_id | mutation_id, entity_id |
| 16_동기화상태 | API·수동연동 상태 | sync_id | source_code, project_id |
| 91_업무템플릿 | 프로젝트 생성용 표준업무 | template_task_id | service_type_code |
| 98_운영점검 | 참조 무결성·건수 점검 | - | 전 탭 |

`00_안내`, `00_데이터사전`은 운영자가 보는 설명 탭이며 `90_코드목록`, `99_설정`은 시스템 탭입니다.

## 현재 초기 데이터

- UND 고객사 1개
- UND 90일 프로젝트 1개
- UND 채널 10개
- UND 실행 업무 103개
- UND 업무 템플릿 103개
- UND KPI 정의 22개
- 참조 HTML 3개
- 데모 고객사·프로젝트 없음. 현재 활성 운영 범위는 UND 프로젝트이다.

## 화면 데이터 매핑

| 화면 | 읽는 탭 | 쓰는 탭 |
|---|---|---|
| 총괄 현황 | 02, 06, 10, 11, 13, 16 | 없음 |
| 업무 보드 | 06, 07, 03 | 06, 15 |
| 콘텐츠 캘린더 | 08, 09, 05 | 08, 09, 15 |
| 승인함 | 08, 09, 10 | 10, 15 |
| 채널 성과 | 11, 12, 13 | 12, 13, 15 |
| 파일·활동 로그 | 14, 15 | 14, 15 |
