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
- Schema version: `2026-08-25-v1`

UND 프로젝트의 기존 HTML 참고 업무 103건과 KPI 22건은 운영 집계에서 보관 처리했습니다. 새 운영 데이터는 웹 입력 또는 승인된 원장 이관을 통해 생성합니다. 무극은 `is_demo=true`인 화면 검증용 고객사·프로젝트로 분리돼 있습니다.

## 구현된 화면

- 고객사/프로젝트 선택
- 총괄 현황
- 업무 목록·필터
- 콘텐츠 목록·캘린더 전환
- KPI 성과
- 파일·활동 로그
- 계정 로그인과 포켓/NS/고객사 권한 분리
- 포켓·NS의 업무·콘텐츠·자료 신규등록
- 저장 성공 후 목록·집계·활동로그 재조회

운영 빌드는 `VITE_POCKET_API_MODE=live`로 고정하며, 연결 실패 시 데모 데이터로 대체하지 않습니다. 비식별 데모는 API 주소가 없는 로컬 UI 검증에만 사용합니다.

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
