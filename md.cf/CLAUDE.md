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
| 서비스명 | 분당발전본부 위험성평가 지원시스템 (SIF) |
| 목적 | KOEN(한국남동발전) 건설현장 근로자의 위험성평가 수행 지원 |
| 데이터 | 건설현장 사망·중상 재해 사례 **3,459건** (2013~2023, 공단 SIF 아카이브 2026-04-01판) |
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
│   ├── intro.html                 # 소개
│   ├── risk-map.html              # 위험지도 (3축 탭 + heat 리스트 + hop)
│   ├── process-inquiry.html       # 공정조회 (정방향)
│   ├── cause-inquiry.html         # 기인물조회 (역방향)
│   ├── disaster-type.html         # 재해형태 분석
│   └── risk-assessment.html       # 위험성평가 생성 (GPTs / 발전업 / 건설업 위저드)
├── css/style.css                  # 다크·라이트, 프린트, 히트맵, 반응형
├── js/
│   ├── app.js                     # Chart.js 전역 설정 + 테마 + 인쇄
│   ├── components.js              # 사이드바/헤더/발전소공정 토글
│   ├── data-loader.js             # JSON fetch + 인메모리 캐시
│   ├── chart-manager.js           # Chart.js lifecycle
│   ├── filter-manager.js          # Observer 패턴 cascading 필터
│   ├── multi-select.js            # 멀티셀렉트 패널
│   ├── utils.js                   # WORK_TYPE_MAP, filterDB, aggregateBy, buildTable 등
│   └── i18n.js                    # 패스스루 스텁 (영문 모드 폐기, 2026-09)
├── data/
│   ├── db.json                    # 3,459건 × 30열 (~4.9MB, minified)
│   └── dropdown-ref.json          # 공종 계층 + 기인물분류 맵 + 12대기인물 (~13KB)
├── scripts/
│   ├── build_dataset.py           # ★ 데이터 빌드 (B단계) — 데이터 갱신 시 이것만 실행
│   ├── notebooks/                 # A단계 변환 노트북 (공단 원본 → 확장열 28열)
│   ├── docs/                      # 변환가이드·시스템탑재 테이블 가이드·구신버전 변화보고
│   └── out/                       # 빌드 리포트·PII 감사 로그 (gitignore)
├── source/                        # 원본 (확장열 JSON, T4/T4m, 공단 xlsx)
│   └── legacy/                    # 구 원본 2,574건 자산 (규칙 역산 참조용)
├── md.cf/                         # 로드맵·기획 문서 (Roadmap4.md가 현행)
└── .claude/agents/                # 프로젝트 전담 에이전트 4종
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
공단 원본 xlsx
    ↓ A단계: scripts/notebooks/*.ipynb (사람이 실행, 파생 13열 생성)
source/SIF_신버전_확장열_3459건.json
    ↓ B단계: python3 scripts/build_dataset.py (PII 마스킹 + 대표사례 병합 + 검증)
data/db.json (3,459건 × 30열 flat array)
data/dropdown-ref.json (hierarchy + 기인물분류)
    ↓ DataLoader.loadDB() / loadDropdownRef()
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
- `source/SIF_신버전_확장열_3459건.json` — 3,459건 × 28열 (공단 아카이브 2026-04-01판 전처리 산출물)
- `source/T4_대표사례.json` · `source/T4m_사례하위유형매핑.json` — 대표사례 군집
- `source/legacy/` — 구 2,574건 자산 (파생 규칙 역산 참조용)

### db.json 레코드 구조 (30열)

```json
{
  "id": 1,
  "공종": "1. 토공사", "작업명": "1.1 굴착 작업", "단위작업명": "1.1.1 굴착 장비반입",
  "공종코드": 1, "작업명코드": "1.1", "단위작업코드": "1.1.1",
  "KOEN공정": true,
  "기인물분류": "개구부", "기인물": "바닥개구부(자재인양구 등)", "12대기인물": true,
  "위험도순위": 1, "3년간사고비중": "0.09",
  "발생연도": 2019, "발생월": 3, "계절": "봄", "혹서기": "-",
  "재해형태": "떨어짐", "재해종류": "추락", "재해정도": "사망",
  "복수재해자": false, "추락고_m": 4.7,
  "재해개요": "...", "재해유발요인": "...", "위험성감소대책": "▶ ...",
  "감소대책_항목수": 3, "재해개요_글자수": 134, "익명처리": true,
  "하위유형번호": 0, "대표사례여부": false
}
```

| 구분 | 컬럼 |
|---|---|
| 분류 | `공종` `작업명` `단위작업명` + 코드 3열 |
| 파생(구버전 승계) | `KOEN공정` `기인물분류` `12대기인물` `위험도순위` `3년간사고비중` `혹서기` |
| 신규 | `발생연도` `발생월` `계절` `재해종류` `재해정도` `복수재해자` `추락고_m` `감소대책_항목수` `재해개요_글자수` `익명처리` |
| 대표사례 | `하위유형번호` `대표사례여부` (기인물×재해형태 칸 내 군집) |

> `재해형태`는 구버전 용어(떨어짐/맞음/무너짐), `재해종류`는 공단 원어(추락/낙하/붕괴). 필터·집계는 `재해형태` 기준.

### 주요 통계

| 항목 | 수치 |
|------|------|
| 총 레코드 | 3,459건 |
| 공종 | 13개 |
| 작업명 | 49개 |
| 단위작업명 | 112개 |
| 기인물 | 57개 |
| 기인물분류 | 32개 |
| 재해형태 | 16개 (재해종류 20개) |
| 발생연도 | 2013~2023 (2016~2023에 99%) |
| 재해정도 | 사망 3,303 · 부상 136 · 미상 20 |
| 발전소(KOEN) 공정 | 97.7% (3,379건) — 교량·하천항만·양수발전댐 제외 |
| 12대 기인물 해당 | 58.7% (2,032건) |
| 최다 재해형태 | 떨어짐 59.9% (2,071건) |
| 최다 공종 | 마감공사 24.9% (863건) |
| 추락고 확인 | 떨어짐 2,071건 중 1,383건 (66.8%), 중앙값 6.0m |
| 대표사례 | 310건 (하위유형 310개 × 1건) |

### 데이터 업데이트 방법

```bash
python3 scripts/build_dataset.py
```
→ `data/db.json`, `data/dropdown-ref.json` 재생성 + `scripts/out/build_report.md` 검증 리포트.
전 단계 assert(건수·타입·대표사례·**개인정보 잔존 0건**)를 통과해야 산출물이 쓰인다.

공단이 새 아카이브를 배포하면 먼저 A단계(`scripts/notebooks/`의 노트북)를 다시 돌려
`source/SIF_신버전_확장열_*.json`을 만들고, 그 다음 위 명령을 실행한다.
데이터 교체 시 `js/utils.js`의 `WORK_TYPE_MAP`(기인물 57종 배정)도 함께 점검해야 한다.

> ⚠ **개인정보**: 공단 원본은 비식별이 일관되지 않다. 실명·주소·업체명이 실제로 남아 있었고
> `build_dataset.py`가 마스킹한다. 배포 전 `scripts/out/pii_audit.csv`를 사람이 확인할 것.

## 페이지별 기능 요약

| 페이지 | 파일 | 주요 기능 |
|--------|------|-----------|
| 소개 | `pages/intro.html` | 시스템 소개, 데이터 수치 카운트업, 페이지별 기능 안내 |
| 대시보드 | `index.html` | 요약카드 3개 + 도넛/수평바/히트맵, 발전소공정 토글, 공종 드릴다운 |
| 위험지도 | `pages/risk-map.html` | 3축 탭(공정/기인물/재해유형) heat 랭킹 + 상세 패널 + hop 브레드크럼 |
| 공정조회 | `pages/process-inquiry.html` | 5단계 cascading 필터 → 재해사례 테이블 + 기인물/재해형태 차트 |
| 기인물조회 | `pages/cause-inquiry.html` | 작업유형→12대→기인물 역방향 조회 → 공종별/재해형태별/작업명별 분포 |
| 재해형태 분석 | `pages/disaster-type.html` | 재해형태 중심 다차원 필터 + 히트맵 |
| 위험성평가 생성 | `pages/risk-assessment.html` | 진입카드(GPTs/발전업/건설업) → 위저드 → 결과 테이블·인쇄·엑셀 |

> 영문(EN) 모드는 2026-09 폐기했다. `js/i18n.js`는 패스스루 스텁이고 `data/i18n/`·번역 스크립트는 삭제됨.
> 통계분석 페이지와 사전집계 CSV(`data/csv/`)도 폐기됨 — 모든 집계는 db.json 런타임 집계.

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
cd "/Users/kimjihwan/workspace/[Platform]/sif_Program"
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
