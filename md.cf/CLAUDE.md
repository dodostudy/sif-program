# CLAUDE.md - 프로젝트 설정

## 언어 및 커뮤니케이션 규칙

- **기본 응답 언어**: 한국어
- **코드 주석**: 한국어로 작성
- **커밋 메시지**: 한국어로 작성
- **문서화**: 한국어로 작성
- **변수명/함수명**: 영어 (코드 표준 준수)

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | SIF 건설재해 위험성평가 차트 시스템 |
| 목적 | KOEN(한국남동발전) 건설현장 근로자의 위험성평가 수행 지원 |
| 데이터 | 건설현장 사망/중상 재해 사례 2,574건 (2019~2021) |
| 기술스택 | HTML, CSS, JavaScript, TailwindCSS, Chart.js, PapaParse (모두 CDN) |
| 배포 | GitHub Pages (정적 웹사이트, 서버 불필요) |
| GitHub | https://github.com/dodostudy/sif-program |
| 웹사이트 | https://dodostudy.github.io/sif-program/ |

---

## 프로젝트 구조

```
sif_Program/
├── index.html                     # 메인 대시보드
├── pages/
│   ├── process-inquiry.html       # 공정조회 (Excel ③공정조회 시트 대응)
│   ├── cause-inquiry.html         # 기인물조회 (역방향 조회)
│   ├── statistics.html            # 통계분석 (5탭, CSV 기반)
│   └── risk-assessment.html       # 위험성평가 (현장 근로자용)
├── css/
│   └── style.css                  # 다크모드, 프린트, 히트맵, 반응형 스타일
├── js/
│   ├── app.js                     # Chart.js 글로벌 설정 + 사이드바 초기화
│   ├── components.js              # 공통 사이드바/헤더/발전소공정 토글 렌더링
│   ├── data-loader.js             # JSON/CSV fetch + 인메모리 캐시
│   ├── chart-manager.js           # Chart.js 인스턴스 lifecycle 관리
│   ├── filter-manager.js          # Observer 패턴 cascading 필터 상태관리
│   └── utils.js                   # aggregateBy, topN, buildTable, filterDB 등
├── data/
│   ├── db.json                    # Excel DB시트 → JSON 변환 (2,574건, ~3MB)
│   ├── dropdown-ref.json          # 공종→작업명→단위작업명 계층구조 + 기인물분류 맵 (~12KB)
│   └── csv/                       # 10개 사전집계 CSV 파일 (~700KB)
├── images/
│   └── logo.png                   # 행복플러스+ 분당 심볼 이미지
├── scripts/
│   └── convert-excel.py           # Excel → JSON 변환 스크립트 (데이터 업데이트 시 실행)
├── source/                        # 원본 Excel/CSV 파일 (버전관리용)
├── Roadmap.md                     # 7단계 구현 로드맵
└── CLAUDE.md                      # 이 파일
```

---

## 핵심 아키텍처

### JS 모듈 의존관계

```
app.js ──────────────────────────────────── 모든 페이지 공통 초기화
  └─ components.js                          사이드바/헤더 렌더링

각 HTML 페이지
  ├─ data-loader.js                         데이터 로딩 (캐시)
  │    └─ fetch() → db.json / dropdown-ref.json / csv/
  ├─ filter-manager.js (FilterManager)      필터 상태 관리
  │    └─ Observer 패턴: subscribe → notify → re-render
  ├─ chart-manager.js (ChartManager)        Chart.js lifecycle
  │    └─ create() 시 기존 인스턴스 destroy → 메모리 누수 방지
  └─ utils.js                               데이터 집계/포맷/테이블 빌더
```

### 데이터 흐름

```
Excel 파일 (source/)
    ↓ scripts/convert-excel.py (openpyxl)
data/db.json (2,574건 flat array)
data/dropdown-ref.json (hierarchy + 기인물분류)
    ↓ DataLoader.loadDB() / loadDropdownRef() / loadCSVFile()
브라우저 메모리 캐시
    ↓ filterDB(records, filters)
필터링된 데이터셋
    ↓ aggregateBy() / topN()
차트 데이터 / 테이블 데이터
    ↓ ChartManager.create() / buildTable()
화면 렌더링
```

### FilterManager (Observer 패턴)

```javascript
// cascading 필터 설정 예시 (공정조회 페이지)
const fm = new FilterManager(['koen', '공종', '작업명', '단위작업명', '기인물']);
fm.setDownstream('공종', ['작업명', '단위작업명', '기인물']);
// '공종' 변경 → 하위 3개 자동 초기화 → 구독자 notify
fm.onDataChange(() => renderResults());  // 데이터 변경 시 전체 갱신
```

---

## 데이터 현황

### 원본 소스
- `source/260302_SIF 프로그램_공정조회 차트_r2.xlsx` — 11개 시트, DB시트 2,574행

### db.json 레코드 구조

```json
{
  "id": 1,
  "공종": "4. 마감공사",
  "작업명": "4.8 판넬 등 외부마감 작업",
  "단위작업명": "4.8.2 판넬 등 외부마감 시공",
  "KOEN공정": true,
  "기인물분류": "마감재",
  "기인물": "지붕(채광판,선라이트)",
  "12대기인물": true,
  "위험도순위": 3,
  "3년간사고비중": "9.0%",
  "혹서기": "해당없음",
  "재해형태": "떨어짐",
  "재해개요": "...",
  "재해유발요인": "...",
  "위험성감소대책": "▶ ..."
}
```

### 주요 통계

| 항목 | 수치 |
|------|------|
| 총 레코드 | 2,574건 |
| 공종 | 12개 |
| 작업명 | 49개 |
| 단위작업명 | 113개 |
| 기인물 | 58개 |
| 기인물분류 | 32개 |
| 재해형태 | 20개 |
| 12대 기인물 해당 | 56.9% (1,466건) |
| 최다 재해형태 | 떨어짐 62.5% (1,609건) |
| 최다 공종 | 마감공사 29.7% (751건) |

### 데이터 업데이트 방법

Excel 파일 교체 후 아래 실행:
```bash
python3 scripts/convert-excel.py
```
→ `data/db.json`, `data/dropdown-ref.json` 자동 갱신. CSV는 source/에서 data/csv/로 수동 복사.

---

## 페이지별 기능 요약

| 페이지 | 파일 | 주요 기능 |
|--------|------|-----------|
| 대시보드 | `index.html` | 요약카드 3개 + 도넛/수평바/히트맵 차트, 발전소공정 토글, 공종 드릴다운 |
| 공정조회 | `pages/process-inquiry.html` | 5단계 cascading 필터(발전소공정 연동) → 재해사례 테이블 + 기인물/재해형태 차트 |
| 기인물조회 | `pages/cause-inquiry.html` | 기인물 역방향 조회(12대/분류/기인물) → 공종별/재해형태별/작업명별 분포 차트 |
| 통계분석 | `pages/statistics.html` | 5탭 (공종/작업명/단위작업명/기인물/교차분석), 차트↔테이블 토글, 히트맵 |
| 위험성평가 | `pages/risk-assessment.html` | 3단계 카드 위자드(단계별 즉시결과) → 위험요인 카드(Top10) + 사례+대책 통합, 인쇄 지원 |

---

## CDN 라이브러리

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/papaparse@5"></script>
```

---

## 로컬 개발 서버 실행

```bash
cd /Users/kimjihwan/workspace/sif_Program
python3 -m http.server 8080
# 브라우저: http://localhost:8080
```

---

## 배포 정보

| 항목 | 내용 |
|------|------|
| 플랫폼 | GitHub Pages |
| 저장소 | https://github.com/dodostudy/sif-program |
| 웹사이트 | https://dodostudy.github.io/sif-program/ |
| 브랜치 | `main` / 루트 경로(`/`) |
| 배포 방식 | `git push` → 자동 빌드 (1~2분 소요) |
