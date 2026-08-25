# Pocket Marketing Hub

포켓컴퍼니가 고객사·실행사와 콘텐츠 마케팅 프로젝트를 운영하기 위한 공유형 프로젝트 허브입니다.

현재 단계는 **비식별 데모 프런트엔드와 데이터 원장 구조를 함께 검증하는 단계**입니다. 공개 GitHub Pages에는 실제 고객 데이터나 Google Sheet 연결 정보를 넣지 않습니다.

## 운영 주체

- 대행사: 포켓컴퍼니
- 실행사: NS 마케팅
- 고객사: UND, 무극 등
- 고객 기본 권한: 읽기 전용

## 데이터 원장

- Google Sheets 원장: 내부 운영 문서(공개 저장소에는 링크와 ID를 기록하지 않음)
- Schema version: `2026-08-25-v1`

UND 프로젝트에는 제공된 90일 팀 트래커의 103개 업무와 22개 KPI 정의가 이관되어 있습니다. 무극은 실제 데이터와 섞이지 않도록 `is_demo=true`인 예시 고객사·프로젝트만 들어 있습니다.

## 구현된 데모 화면

- 고객사/프로젝트 선택
- 총괄 현황
- 업무 목록·필터
- 콘텐츠 목록·캘린더 전환
- KPI 성과
- 파일·활동 로그
- 포켓/NS/고객사 데모 권한 전환

데모 데이터는 `frontend/src/data/demoData.js`에 있으며 실제 원장과 분리되어 있습니다. 운영 연결 시에는 동일한 원장을 사용하되 역할과 고객사 범위를 Apps Script 또는 인증 프록시에서 필터링합니다.

## 로컬 실행

```bash
cd frontend
npm install
npm run dev
```

프로덕션 빌드는 `frontend/dist/client`에 생성됩니다.

## 문서

- [데이터 모델](docs/DATA_MODEL.md)
- [저장·연동 원칙](docs/STORAGE_AND_SYNC.md)
- [읽기 API 계약](docs/API_CONTRACT.md)
- [보안 경계](docs/SECURITY_BOUNDARY.md)
