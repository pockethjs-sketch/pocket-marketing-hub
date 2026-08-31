# Pocket Marketing Hub

포켓컴퍼니가 고객사·실행사와 콘텐츠 마케팅 프로젝트를 운영하기 위한 공유형 프로젝트 허브입니다.

운영 데이터는 비공개 Google Sheets 원장에 저장하고, GitHub Pages는 Apps Script API를 통해 권한별 데이터만 읽고 씁니다. 시트 ID·접근코드·서명키는 공개 저장소에 넣지 않습니다.

## 운영 주체

- 대행사: 포켓컴퍼니
- 실행사: NS 마케팅
- 고객사: UND, 무극 등
- 고객 기본 권한: 읽기 전용

## 데이터 원장

- Google Sheets 원장: 내부 운영 문서(공개 저장소에는 링크와 ID를 기록하지 않음)
- Schema version: `2026-08-26-v3`

UND 팀 트래커에서 승인한 업무 144건은 `APPROVED_PLAN` 원천으로 복구되어 운영 화면에 표시됩니다. 기존 103건의 상태·담당자·메모는 보존하고 누락 업무만 추가했습니다. 현재 운영 원장과 화면에는 UND와 무극 고객사·프로젝트가 활성 상태입니다. 무극은 `260824무극_캠페인_일정표.xlsx`를 원천으로 2026-08-10~09-09 일정과 업무 20건을 운영 원장에 등록했으며, 구축성 업무 4건은 P0, 제작·운영 업무 16건은 M1로 분류합니다.

## 구현된 화면

- 고객사/프로젝트 선택
- 총괄 현황
- 클라이언트 공유용 90일 실행계획(승인본·읽기 전용)
- 업무 목록·필터
- 콘텐츠 목록·캘린더 전환
- KPI 성과
- 파일·활동 로그
- 계정 로그인과 포켓/NS/고객사 권한 분리
- 역할별 좌측 탐색: 포켓·NS 접기/펼치기, 고객사 기본 숨김·임시 서랍
- 포켓·NS의 업무·콘텐츠·자료 신규등록
- 저장 성공 후 목록·집계·활동로그 재조회

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
