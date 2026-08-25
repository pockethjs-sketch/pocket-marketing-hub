export const clients = [
  {
    id: "und",
    initials: "UN",
    name: "UND",
    descriptor: "통합 마케팅",
    projectId: "und-monthly",
    status: "active",
  },
  {
    id: "mugeuk",
    initials: "MG",
    name: "무극",
    descriptor: "콘텐츠 운영",
    projectId: "mugeuk-content",
    status: "planned",
  },
];

export const projects = {
  "und-monthly": {
    clientId: "und",
    clientName: "UND",
    name: "통합 마케팅 운영",
    label: "포켓컴퍼니 · NS 마케팅",
    phase: "8월 4주차",
    status: "진행 중",
    period: "2026.08.01 — 2026.08.31",
    updatedAt: "오늘 09:42",
    objective: "유튜브·인스타그램·SEO 실행 현황과 검수·성과를 한 화면에서 공유합니다.",
    metrics: [
      { label: "진행 업무", value: "5 / 8", helper: "이번 달 업무", progress: 63, tone: "blue" },
      { label: "검수 대기", value: "2건", helper: "고객 확인 필요", progress: null, tone: "warning" },
      { label: "발행 콘텐츠", value: "4 / 8", helper: "이번 달 목표", progress: 50, tone: "success" },
      { label: "콘텐츠 도달", value: "24,680", helper: "전월 대비 +18%", progress: null, tone: "blue" },
    ],
    phases: [
      { id: "week-1", code: "1주", label: "기획·세팅", tasks: "2/2", output: "0/0", progress: 100, state: "done" },
      { id: "week-2", code: "2주", label: "콘텐츠 제작", tasks: "2/2", output: "1/2", progress: 75, state: "done" },
      { id: "week-3", code: "3주", label: "발행·검수", tasks: "2/2", output: "2/3", progress: 83, state: "done" },
      { id: "week-4", code: "4주", label: "성과 확인", tasks: "1/2", output: "1/3", progress: 50, state: "current" },
    ],
    workstreams: [
      { id: "youtube", name: "유튜브", summary: "롱폼 · 숏폼 · 채널 관리", done: 2, total: 3, color: "#2563eb" },
      { id: "instagram", name: "인스타그램", summary: "피드 · 릴스 · 댓글 관리", done: 2, total: 3, color: "#8b5cf6" },
      { id: "seo", name: "SEO", summary: "검색 콘텐츠 · 키워드", done: 1, total: 2, color: "#10b981" },
    ],
    attention: [
      {
        id: "attention-1",
        title: "9월 유튜브 촬영안 확정",
        detail: "촬영 주제와 출연 가능 일정을 확인해야 다음 달 제작 일정을 고정할 수 있습니다.",
        owner: "포켓 운영팀",
        due: "8월 27일",
        level: "고객 확인",
      },
      {
        id: "attention-2",
        title: "인스타그램 콘텐츠 2건 검수",
        detail: "카피와 이미지 수정 의견을 반영한 최종본을 확인합니다.",
        owner: "NS 마케팅",
        due: "8월 26일",
        level: "검수 대기",
      },
    ],
  },
  "mugeuk-content": {
    clientId: "mugeuk",
    clientName: "무극",
    name: "콘텐츠 채널 운영",
    label: "포켓컴퍼니 · NS 마케팅",
    phase: "준비",
    status: "킥오프 전",
    period: "일정 확정 전",
    updatedAt: "샘플 데이터",
    objective: "프로젝트 생성과 고객사 전환 흐름을 확인하기 위한 비식별 데모입니다.",
    metrics: [
      { label: "진행 업무", value: "0 / 6", helper: "준비 중", progress: 0, tone: "blue" },
      { label: "검수 대기", value: "0건", helper: "등록 전", progress: null, tone: "warning" },
      { label: "발행 콘텐츠", value: "0 / 4", helper: "기획 전", progress: 0, tone: "success" },
      { label: "콘텐츠 도달", value: "-", helper: "데이터 없음", progress: null, tone: "blue" },
    ],
    phases: [
      { id: "week-1", code: "1주", label: "킥오프", tasks: "0/2", output: "0/0", progress: 0, state: "current" },
      { id: "week-2", code: "2주", label: "기획", tasks: "0/2", output: "0/1", progress: 0, state: "upcoming" },
      { id: "week-3", code: "3주", label: "제작", tasks: "0/1", output: "0/2", progress: 0, state: "upcoming" },
      { id: "week-4", code: "4주", label: "발행", tasks: "0/1", output: "0/1", progress: 0, state: "upcoming" },
    ],
    workstreams: [
      { id: "youtube", name: "유튜브", summary: "채널 기획", done: 0, total: 2, color: "#2563eb" },
      { id: "instagram", name: "인스타그램", summary: "콘텐츠 기획", done: 0, total: 2, color: "#8b5cf6" },
      { id: "seo", name: "SEO", summary: "키워드 정리", done: 0, total: 2, color: "#10b981" },
    ],
    attention: [],
  },
};

export const tasks = [
  { id: "T-001", phase: "1주차", stream: "유튜브", title: "8월 유튜브 주제와 업로드 일정 확정", status: "완료", priority: "높음", owner: "포켓 운영팀", due: "08.05", clientVisible: true, parent: "월간 기획" },
  { id: "T-002", phase: "1주차", stream: "SEO", title: "핵심 검색 키워드와 콘텐츠 방향 정리", status: "완료", priority: "높음", owner: "포켓 운영팀", due: "08.06", clientVisible: true, parent: "검색 전략" },
  { id: "T-003", phase: "2주차", stream: "인스타그램", title: "피드 콘텐츠 2건 디자인 제작", status: "완료", priority: "보통", owner: "NS 마케팅", due: "08.12", clientVisible: true, parent: "콘텐츠 제작" },
  { id: "T-004", phase: "2주차", stream: "유튜브", title: "브랜드 인터뷰 영상 1차 편집", status: "진행", priority: "높음", owner: "NS 마케팅", due: "08.14", clientVisible: true, parent: "영상 제작" },
  { id: "T-005", phase: "3주차", stream: "인스타그램", title: "릴스 2건 게시 및 댓글 모니터링", status: "진행", priority: "보통", owner: "NS 마케팅", due: "08.21", clientVisible: true, parent: "채널 운영" },
  { id: "T-006", phase: "3주차", stream: "SEO", title: "검색형 아티클 초안 검토", status: "검토", priority: "보통", owner: "포켓 운영팀", due: "08.22", clientVisible: false, parent: "검색 콘텐츠" },
  { id: "T-007", phase: "4주차", stream: "유튜브", title: "9월 촬영 주제와 출연 일정 확정", status: "고객 확인", priority: "높음", owner: "포켓 운영팀", due: "08.27", clientVisible: true, parent: "다음 달 준비" },
  { id: "T-008", phase: "4주차", stream: "인스타그램", title: "월간 채널 성과 정리", status: "대기", priority: "보통", owner: "포켓 운영팀", due: "08.30", clientVisible: true, parent: "성과 보고" },
];

export const contents = [
  { id: "C-001", channel: "유튜브", format: "롱폼", title: "브랜드 대표 인터뷰 1편", status: "제작", date: "08.28", owner: "NS 마케팅", visible: true },
  { id: "C-002", channel: "유튜브", format: "숏폼", title: "이번 주 핵심 메시지 숏폼", status: "게시예약", date: "08.26", owner: "NS 마케팅", visible: true },
  { id: "C-003", channel: "인스타그램", format: "피드", title: "고객이 자주 묻는 질문 3가지", status: "검토", date: "08.26", owner: "NS 마케팅", visible: true },
  { id: "C-004", channel: "네이버 블로그", format: "아티클", title: "브랜드 선택 기준 가이드", status: "기획", date: "08.29", owner: "포켓 운영팀", visible: true },
  { id: "C-005", channel: "인스타그램", format: "릴스", title: "서비스 이용 전후 비교", status: "아이디어", date: "09.02", owner: "NS 마케팅", visible: false },
  { id: "C-006", channel: "유튜브", format: "숏폼", title: "현장 비하인드 30초", status: "게시예약", date: "08.27", owner: "NS 마케팅", visible: true },
];

export const kpis = [
  { id: "K-001", name: "유튜브 조회수", weight: 20, value: 12480, target: 20000, unit: "회", source: "YouTube Studio", state: "측정 중" },
  { id: "K-002", name: "인스타그램 도달", weight: 20, value: 18320, target: 30000, unit: "회", source: "Meta Insights", state: "측정 중" },
  { id: "K-003", name: "콘텐츠 발행", weight: 20, value: 4, target: 8, unit: "건", source: "콘텐츠 원장", state: "측정 중" },
  { id: "K-004", name: "검색 유입", weight: 15, value: 890, target: 1500, unit: "명", source: "GA4", state: "측정 중" },
  { id: "K-005", name: "콘텐츠 저장·공유", weight: 10, value: 368, target: 600, unit: "건", source: "채널 통계", state: "측정 중" },
  { id: "K-006", name: "상담 문의", weight: 15, value: 14, target: 30, unit: "건", source: "문의 원장", state: "측정 중" },
];

export const activities = [
  { id: "A-001", type: "task", title: "피드 콘텐츠 2건 제작 완료", meta: "인스타그램 · 오늘 09:42", internalMeta: "NS 마케팅 완료 처리" },
  { id: "A-002", type: "content", title: "현장 비하인드 숏폼 게시예약", meta: "유튜브 · 어제 17:10", internalMeta: "NS 마케팅 상태 변경" },
  { id: "A-003", type: "schedule", title: "9월 촬영 일정 후보 등록", meta: "촬영 · 어제 14:25", internalMeta: "고객 확인 대기" },
  { id: "A-004", type: "metric", title: "주간 채널 성과 데이터 갱신", meta: "성과 · 8월 25일", internalMeta: "비식별 데모 데이터" },
];

export const roleOptions = [
  { id: "pocket", label: "포켓", detail: "전체 운영" },
  { id: "ns", label: "NS", detail: "실행 업무" },
  { id: "client", label: "고객사", detail: "조회 전용" },
];
