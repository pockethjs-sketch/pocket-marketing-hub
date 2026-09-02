# Pocket Marketing Hub

포켓컴퍼니가 고객사·실행사와 콘텐츠 마케팅 프로젝트를 운영하기 위한 공유형 프로젝트 허브입니다.

운영 데이터는 Supabase와 비공개 Google Sheets에 도메인별로 분리 저장합니다. 로그인·업무·업무 로그·회의록·KPI·권한은 Supabase Auth/RLS/Postgres를 사용하고, 실행계획·콘텐츠·성과 추적·파일·세부 로그는 전환이 끝날 때까지 Apps Script/Sheets를 유지합니다. 비밀키·접근코드·서명키는 공개 저장소에 넣지 않습니다.

운영 빌드는 `VITE_POCKET_DATA_BACKEND=supabase`를 사용합니다. `sheets`는 검증된 비상 롤백 경로이며 두 원장에 업무를 장기 이중 쓰지 않습니다. PostgreSQL 스키마·RLS·RPC·Edge Function은 `supabase/`에 버전 관리합니다.

## 운영 주체

- 대행사: 포켓컴퍼니
- 실행사: NS 마케팅
- 고객사: UND, 무극 등
- 고객 기본 권한: 읽기 전용

## 데이터 원장

- Supabase: Auth, 프로젝트 멤버십, 업무 101건, 업무 로그, 회의록, KPI, 고객 권한, mutation
- Google Sheets 원장: 실행계획·콘텐츠·성과 추적·파일·세부 로그 및 업무 롤백 대조본
- Schema version: `2026-08-26-v3`

현재 운영 원장과 화면에는 UND와 무극 고객사·프로젝트만 유지합니다. 2026-09-02 기존 업무를 전체 백업 후 초기화한 다음 기준 파일 `캠페인 스케줄 관리.html`의 무극 23건과 UND 78건을 `06_업무`에 다시 이관했습니다. 제목·세부내용·시작일·종료일·날짜별 간트 배열·상태·담당·완료링크·비고를 원본과 대조했고 두 프로젝트의 `source_task_id` 중복은 0건입니다. 최종 이관 보정 직전 백업 `PocketMarketingHub_20260902_195807`은 21개 시트 해시가 모두 일치하며, 동일 원본 재실행은 변경 없이 건너뜁니다.

## 구현된 화면

- 고객사/프로젝트 선택
- 총괄 현황
- 클라이언트 공유용 90일 실행계획(승인본·읽기 전용)
- 업무 목록·필터
- 콘텐츠 목록·캘린더 전환
- KPI 성과
- 파일·활동 로그
- 계정 로그인과 포켓/NS/고객사 권한 분리
- 데스크톱 고정 좌측 탐색: 고객사 목록과 프로젝트 메뉴를 항상 표시, 모바일만 임시 서랍
- 포켓·NS의 업무·콘텐츠·자료 신규등록
- 업무 저장 성공 응답을 현재 목록에 즉시 병합하고 업무 로그는 진입할 때 지연 조회

운영 빌드는 `VITE_POCKET_API_MODE=live`로 고정하며, 연결 실패 시 임시 데이터로 대체하지 않고 오류를 표시합니다.

## 로컬 실행

```bash
cd frontend
npm install
npm run dev
```

프로덕션 빌드는 `frontend/dist/client`에 생성됩니다.

## 문서

- [Google Sheets 연동 현황](docs/INTEGRATION_STATUS.md)
- [데이터 모델](docs/DATA_MODEL.md)
- [저장·연동 원칙](docs/STORAGE_AND_SYNC.md)
- [읽기 API 계약](docs/API_CONTRACT.md)
- [보안 경계](docs/SECURITY_BOUNDARY.md)
- [Apps Script API](apps-script/README.md)
- [Apps Script 배포·설정](apps-script/DEPLOYMENT.md)
- [Supabase 개발 이전 계획](docs/SUPABASE_MIGRATION.md)
