# Pocket Marketing Hub

포켓컴퍼니가 고객사·실행사와 콘텐츠 마케팅 프로젝트를 운영하기 위한 공유형 프로젝트 허브입니다.

현재 단계는 화면 구현 전 **데이터 원장과 저장 규칙을 먼저 확정한 상태**입니다.

## 운영 주체

- 대행사: 포켓컴퍼니
- 실행사: NS 마케팅
- 고객사: UND, 무극 등
- 고객 기본 권한: 읽기 전용

## 데이터 원장

- Google Sheets: https://docs.google.com/spreadsheets/d/1pvgGQqYeQ69N5w17rDdIUnaMI7qIwPLGXyfZd8a24ZA/edit
- Spreadsheet ID: `1pvgGQqYeQ69N5w17rDdIUnaMI7qIwPLGXyfZd8a24ZA`
- Schema version: `2026-08-25-v1`

UND 프로젝트에는 제공된 90일 팀 트래커의 103개 업무와 22개 KPI 정의가 이관되어 있습니다. 무극은 실제 데이터와 섞이지 않도록 `is_demo=true`인 예시 고객사·프로젝트만 들어 있습니다.

## 예정 화면 구조

- 고객사/프로젝트 선택
- 총괄 현황
- 업무 보드
- 콘텐츠 캘린더
- 승인함
- 채널 성과
- 파일·활동 로그

화면은 동일한 원장을 사용하되 역할에 따라 서버에서 노출 범위를 필터링합니다.

## 문서

- [데이터 모델](docs/DATA_MODEL.md)
- [저장·연동 원칙](docs/STORAGE_AND_SYNC.md)

