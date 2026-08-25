export const clients = [
  {
    id: "und",
    initials: "UN",
    name: "UND",
    descriptor: "라이프스타일",
    projectId: "und-90d",
    status: "active",
  },
  {
    id: "mugeuk",
    initials: "MG",
    name: "무극",
    descriptor: "브랜드 채널 운영",
    projectId: "mugeuk-social",
    status: "planned",
  },
];

export const projects = {
  "und-90d": {
    clientId: "und",
    clientName: "UND LIFESTYLE",
    name: "90일 브랜딩·마케팅",
    label: "POCKET COMPANY × NS MARKETING",
    phase: "구축 P0",
    status: "정상 진행",
    period: "2026.09.01 — 2026.11.29",
    updatedAt: "오늘 09:42",
    objective: "자사몰과 채널 기반을 구축하고, 월 26건의 콘텐츠 운영 체계를 정착시킵니다.",
    metrics: [
      { label: "전체 업무", value: "22 / 103", helper: "완료 22건", progress: 21, tone: "terracotta" },
      { label: "이번 단계", value: "12 / 37", helper: "구축 P0", progress: 32, tone: "ink" },
      { label: "콘텐츠", value: "8 / 32", helper: "초기 발행", progress: 25, tone: "blue" },
      { label: "다음 마감", value: "9월 06일", helper: "전환 추적 검증", progress: null, tone: "olive" },
    ],
    phases: [
      { id: "p0", code: "P0", label: "구축 3주", tasks: "12/37", output: "8/32", progress: 32, state: "current" },
      { id: "m1", code: "M1", label: "운영 1개월", tasks: "0/24", output: "0/26", progress: 0, state: "upcoming" },
      { id: "m2", code: "M2", label: "운영 2개월", tasks: "0/21", output: "0/26", progress: 0, state: "upcoming" },
      { id: "m3", code: "M3", label: "운영 3개월", tasks: "0/21", output: "0/26", progress: 0, state: "upcoming" },
    ],
    workstreams: [
      { id: "marketing", name: "전략·마케팅", summary: "계획 · 검색 · 광고 · 보고", done: 11, total: 53, color: "#b0561f" },
      { id: "design", name: "디자인", summary: "자사몰 · 상세 · 소재", done: 7, total: 25, color: "#1f6b99" },
      { id: "video", name: "영상", summary: "촬영 · 편집 · 유튜브", done: 4, total: 25, color: "#5f7a2a" },
    ],
    attention: [
      {
        id: "attention-1",
        title: "전환 추적 발화 검증",
        detail: "자사몰 이벤트 2종의 실제 발화를 확인해야 다음 광고 설정을 진행할 수 있습니다.",
        owner: "포켓 운영팀",
        due: "9월 06일",
        level: "확인 필요",
      },
      {
        id: "attention-2",
        title: "1차 촬영 제품 확정",
        detail: "촬영 후보 6개 중 우선 제품 4개를 고객사와 최종 확정합니다.",
        owner: "콘텐츠팀",
        due: "9월 08일",
        level: "고객 확인",
      },
    ],
  },
  "mugeuk-social": {
    clientId: "mugeuk",
    clientName: "무극",
    name: "소셜 채널 운영",
    label: "POCKET COMPANY",
    phase: "준비",
    status: "킥오프 전",
    period: "일정 확정 전",
    updatedAt: "샘플 데이터",
    objective: "프로젝트 생성 흐름을 확인하기 위한 비식별 데모 프로젝트입니다.",
    metrics: [
      { label: "전체 업무", value: "0 / 12", helper: "준비 중", progress: 0, tone: "terracotta" },
      { label: "이번 단계", value: "0 / 5", helper: "준비", progress: 0, tone: "ink" },
      { label: "콘텐츠", value: "0 / 8", helper: "기획 전", progress: 0, tone: "blue" },
      { label: "다음 마감", value: "미정", helper: "킥오프 일정", progress: null, tone: "olive" },
    ],
    phases: [
      { id: "prepare", code: "P0", label: "준비", tasks: "0/5", output: "0/0", progress: 0, state: "current" },
      { id: "m1", code: "M1", label: "운영 1개월", tasks: "0/7", output: "0/8", progress: 0, state: "upcoming" },
    ],
    workstreams: [
      { id: "marketing", name: "전략·마케팅", summary: "채널 전략 · 편성", done: 0, total: 7, color: "#b0561f" },
      { id: "design", name: "디자인", summary: "소셜 템플릿", done: 0, total: 3, color: "#1f6b99" },
      { id: "video", name: "영상", summary: "숏폼 기획", done: 0, total: 2, color: "#5f7a2a" },
    ],
    attention: [],
  },
};

export const tasks = [
  { id: "T-001", phase: "P0", stream: "전략·마케팅", title: "GA4 전환 이벤트 설치 및 발화 검증", status: "진행", priority: "높음", owner: "포켓 운영팀", due: "09.06", clientVisible: true, parent: "전환 추적" },
  { id: "T-002", phase: "P0", stream: "전략·마케팅", title: "브랜드 메시지와 검색 키워드 확정", status: "검토", priority: "높음", owner: "포켓 운영팀", due: "09.05", clientVisible: true, parent: "브랜드 전략" },
  { id: "T-003", phase: "P0", stream: "디자인", title: "자사몰 메인 시안 1차 전달", status: "완료", priority: "높음", owner: "디자인팀", due: "09.03", clientVisible: true, parent: "자사몰" },
  { id: "T-004", phase: "P0", stream: "디자인", title: "제품 상세페이지 공통 구조 설계", status: "진행", priority: "보통", owner: "디자인팀", due: "09.09", clientVisible: true, parent: "상세페이지" },
  { id: "T-005", phase: "P0", stream: "영상", title: "1차 촬영 제품과 공간 확정", status: "고객 확인", priority: "높음", owner: "콘텐츠팀", due: "09.08", clientVisible: true, parent: "촬영" },
  { id: "T-006", phase: "P0", stream: "영상", title: "롱폼 1편 콘티 작성", status: "대기", priority: "보통", owner: "콘텐츠팀", due: "09.10", clientVisible: false, parent: "유튜브" },
  { id: "T-007", phase: "M1", stream: "전략·마케팅", title: "월간 채널 성과 리포트", status: "대기", priority: "보통", owner: "포켓 운영팀", due: "10.02", clientVisible: true, parent: "성과보고" },
  { id: "T-008", phase: "M1", stream: "영상", title: "숏폼 검증형 4편 제작", status: "대기", priority: "보통", owner: "콘텐츠팀", due: "09.25", clientVisible: true, parent: "숏폼" },
];

export const contents = [
  { id: "C-001", channel: "유튜브", format: "롱폼", title: "27년의 공정", status: "기획", date: "09.15", owner: "콘텐츠팀", visible: true },
  { id: "C-002", channel: "유튜브", format: "숏폼", title: "55 vs 75, 선택 기준", status: "제작", date: "09.11", owner: "콘텐츠팀", visible: true },
  { id: "C-003", channel: "인스타그램", format: "피드", title: "일요일의 소파", status: "검토", date: "09.09", owner: "디자인팀", visible: true },
  { id: "C-004", channel: "네이버 블로그", format: "아티클", title: "좋은 소파를 고르는 설계 기준", status: "기획", date: "09.18", owner: "포켓 운영팀", visible: true },
  { id: "C-005", channel: "인스타그램", format: "릴스", title: "반품이 없는 이유", status: "아이디어", date: "09.22", owner: "콘텐츠팀", visible: false },
  { id: "C-006", channel: "유튜브", format: "숏폼", title: "착석감 테스트", status: "게시예약", date: "09.07", owner: "콘텐츠팀", visible: true },
];

export const kpis = [
  { id: "K-001", name: "쇼룸 방문 예약", weight: 25, value: 8, target: 20, unit: "건", source: "예약 기록", state: "측정 중" },
  { id: "K-002", name: "상담 문의", weight: 25, value: 14, target: 30, unit: "건", source: "문의폼·통화", state: "측정 중" },
  { id: "K-003", name: "자사몰 방문자", weight: 20, value: 1240, target: 3000, unit: "명", source: "GA4", state: "측정 중" },
  { id: "K-004", name: "제품 상세 조회", weight: 15, value: 678, target: 1800, unit: "회", source: "GA4", state: "측정 중" },
  { id: "K-005", name: "스마트스토어 유입", weight: 10, value: 412, target: 900, unit: "회", source: "스토어 통계", state: "측정 중" },
  { id: "K-006", name: "광고 전환", weight: 5, value: 6, target: 18, unit: "건", source: "광고 관리자", state: "측정 중" },
];

export const activities = [
  { id: "A-001", type: "task", title: "자사몰 메인 시안 1차 전달 완료", meta: "디자인 · 오늘 09:42", internalMeta: "디자인팀이 완료 처리" },
  { id: "A-002", type: "content", title: "착석감 테스트 숏폼을 게시예약으로 변경", meta: "유튜브 · 어제 17:10", internalMeta: "콘텐츠팀이 상태 변경" },
  { id: "A-003", type: "schedule", title: "1차 촬영일을 9월 8일로 조정", meta: "촬영 · 어제 14:25", internalMeta: "고객 확인 대기" },
  { id: "A-004", type: "metric", title: "8월 기준 성과 데이터 갱신", meta: "성과 · 8월 31일", internalMeta: "수동 입력 데모" },
];

export const roleOptions = [
  { id: "pocket", label: "포켓", detail: "전체 운영" },
  { id: "ns", label: "NS", detail: "실행 업무" },
  { id: "client", label: "고객사", detail: "조회 전용" },
];
