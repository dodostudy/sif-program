# SIF 프로그램 한/영 다국어(i18n) 로드맵

> 목표: 사이트 우측 상단(테마 버튼 좌측 빈 공간)에 **한국어 / English** 전환 버튼을 추가하고,
> `data/db.json`을 영어로 번역한 **별도 영어 JSON**을 참조하여 영어 정보를 제공한다.
> 번역은 **건설·안전·플랜트** 분야 용어를 일관되게 적용한다.

## 확정된 방향 (2026-07-07)

| 항목 | 결정 |
|---|---|
| 번역 범위 | **전체** — UI 문구 + 범주형 값 + 자유서술 3개 컬럼(재해개요/재해유발요인/위험성감소대책) |
| 참조 구조 | **룩업 계층** — `db.json`은 한글 원본 단일 소스로 유지, 표시할 때만 영어로 치환 |
| 번역 실행 | 도메인 용어집을 주입한 LLM 파이프라인을 **직접 구축 + 실행** |

---

## 1. 현행 구조 분석 (왜 룩업 계층인가)

- `db.json` = **2,574건 · 15컬럼**.
  - 범주형 8개(고유값 합계 ~300): `공종`(12) `작업명`(49) `단위작업명`(113) `기인물분류`(32) `기인물`(58) `3년간사고비중`(10) `혹서기`(4) `재해형태`(20)
  - 자유서술 3개(긴 문단 약 **5,300개**): `재해개요`(2,574) `재해유발요인`(1,579) `위험성감소대책`(1,194)
  - 기타: `id` `KOEN공정`(bool) `12대기인물`(bool) `위험도순위`(null)
- **코드가 한글 값을 "키"로 사용** → JSON 값을 통째로 영어로 바꾸면 로직이 깨진다.
  - `r['공종'] === activeGongzongFilter` 등 필터/집계 등식 비교
  - 히트맵 하드코딩: `disasterTypes = ['떨어짐','깔림 뒤집힘','맞음','끼임','부딪힘 접촉','무너짐','감전']` (index.html:594)
  - `dropdownRef['12대기인물']` 리스트 매칭 (index.html:553)
  - `.replace(/^\d+\.\s*/, '')` 공종 번호 제거 (여러 곳)
- **결론**: 필터·집계는 항상 **한글 canonical 값**으로 수행하고, **화면에 그릴 때만** `tCat()`/`tText()`로 영어 치환.
  → 코드 로직 무변경, 원문/번역 불일치 없음, 3MB 원본 중복 없음.

## 2. 타깃 아키텍처

### 2.1 파일 레이아웃
```
data/
  db.json                     # (기존) 한글 원본, 단일 소스 — 수정 안 함
  dropdown-ref.json           # (기존) 계층/12대기인물 참조
  i18n/
    ui_en.json                # UI 문구 사전  { "nav.intro":"Introduction", ... }
    glossary_en.json          # 범주값 한→영  { "재해형태": {"떨어짐":"Fall", ...}, ... }
    db_en.json                # 자유서술 한→영, id 매핑
                              #   { "1": {"재해개요":"...","재해유발요인":"...","위험성감소대책":"..."}, ... }
glossary/
  terms_ko_en.json            # 건설·안전·플랜트 도메인 용어집(번역 주입용, ~200 항목)
scripts/
  i18n_extract.py             # 고유 문자열 추출 → 번역 작업목록 생성
  i18n_translate.*            # 배치 번역 파이프라인(용어집 주입)
  i18n_qa.py                  # 번역 품질 자동 점검
js/
  i18n.js                     # (신규) I18n 런타임 모듈
```

### 2.2 런타임 모듈 `js/i18n.js`
```
I18n = {
  lang: localStorage['sif-lang'] || 'ko',
  async init()                 // ui_en·glossary_en 항상 로드, db_en은 lang==='en'일 때만 lazy
  t(key)                       // UI 문구; ko면 HTML에 박힌 한글 그대로 사용 → key 없으면 fallback
  tCat(column, value)          // 범주값; ko/누락이면 value 반환
  tText(id, column, value)     // 자유서술; ko/누락이면 value 반환
  setLang(lang)                // localStorage 저장 후 location.reload() (가장 안전한 전환)
}
```
- 전환 방식은 **저장 후 새로고침**으로 시작(각 페이지가 로드→렌더 구조라 리스크 최소). 추후 무新로고침 리렌더로 고도화 가능.

### 2.3 언어 토글 UI (스크린샷의 빈 공간)
- `renderSidebar()` 끝에서 테마 버튼처럼 **body에 고정 버튼**을 추가 → 전 페이지 자동 적용.
- 위치: 테마 버튼(`top-3 right-3`) **좌측**에 `한국어 | EN` 세그먼트 버튼(`right-16` 근처).
- 클릭 → `I18n.setLang('ko'|'en')`. 현재 언어 하이라이트, `localStorage['sif-lang']` 저장.

## 3. 렌더링 통합 지점 (코드 수정 맵)

| 파일 | 대상 | 처리 |
|---|---|---|
| `js/components.js` | NAV 라벨, 사이드바 문구, 헤더/인쇄 버튼 | `t()` 치환, 언어 토글 버튼 추가 |
| `index.html` | 차트 제목, 요약카드 라벨, 드롭다운, 히트맵, 브레드크럼 | 라벨 `t()`, 차트 label `tCat()` |
| `js/chart-manager.js` | (라벨 생성부 없음, 데이터만) | 변경 최소 |
| `js/components.js:buildTable` | 컬럼 헤더 + 셀 값 | 헤더 `t()`, 범주셀 `tCat()`, 서술셀 `tText(row.id,…)` |
| `pages/*.html` | 각 페이지 헤더/문구/차트 제목 | `t()` / `tCat()` |
| `data/dropdown-ref.json` 소비부 | 계층 드롭다운 라벨 | `tCat()` (원본 키는 한글 유지) |

> 핵심 원칙: **집계·필터 인자는 한글 유지, `.map()`으로 라벨 만들 때만 `tCat()` 적용.**

## 4. 번역 파이프라인 (Phase 3 상세)

1. **추출** `i18n_extract.py`
   - 범주형: 컬럼별 고유값 → `i18n/_todo_categories.json` (~300)
   - 자유서술: 고유 문단 + 사용 id 목록 → `i18n/_todo_freetext.json` (~5,300)
   - 정규화: `_x000D_` 제거, `▶` 불릿·`\n` 개행 보존 표시
2. **도메인 용어집 확정** `glossary/terms_ko_en.json`
   - KOSHA 표준 재해형태 영문 등 고정 용어 우선(§6 시드 참조)
   - 모든 번역 프롬프트에 주입 → 용어 일관성 확보
3. **범주형 번역**(소량·고품질): ~300개 전량 번역 → 사람 검수 → `glossary_en.json`
4. **자유서술 번역**(대량): 20~40문단/배치, 용어집 주입, 병렬 처리
   - 프롬프트 제약: 숫자·날짜·단위·`▶`불릿·`\n` 보존, **내용 가감 금지**, 문장 단위 대응
   - 출력 = id 키 JSON → `db_en.json`
5. **QA** `i18n_qa.py`: 빈 값/숫자 보존/불릿 개수 대응 자동검사 + 표본 육안 검수

## 5. 실행 단계 (Phases)

- **Phase 0 — 스캐폴딩** ✅ 완료: `js/i18n.js`(t/tCat/tText/cases + translateDOM + MutationObserver 자동번역), 언어 토글 버튼(한국어/EN, 우측 상단), `data/i18n/` 파일. ko 무영향 회귀 검증 완료.
- **Phase 1 — UI 영어화** ✅ 완료: `ui_en.json`. 공통 크롬(사이드바/헤더/푸터/토글) 전 페이지, 소개페이지, 대시보드, 조회 3개 페이지 UI 문구 영어화. placeholder·화살표 라벨·숫자단위(건/개/위/페이지) 자동 변환.
- **Phase 2 — 범주값 영어화** ✅ 대부분 완료: `glossary_en.json`(범주 298개 전량). 대시보드 + 조회 3개 페이지(process/cause/disaster) 차트·필터·드롭다운·히트맵·테이블 영어 라벨 배선. ⏳ 잔여: 위험성평가 생성(risk-assessment) 위저드 페이지 세부 배선, 일부 canvas 툴팁/히트맵 title 속성.
- **Phase 3 — 서술문 영어화** ✅ 완료 (2026-07-08): 5,347문단 전량 번역 → `db_en.json`(2.4MB, 2,574 레코드 · 7,722 필드). 23개 배치 병렬 번역(도메인 용어집 주입), QA 통과 — gid 커버리지 5,347/5,347, ▶불릿 개수 일치 100%, 한글 잔존 0, 숫자 이슈는 전부 월 표기(08월→August)·영문 철자(6명→six) 등 정상 스타일. EN 모드에서 `DataLoader.loadDB()`가 서술 3개 컬럼을 오버레이 → 전 페이지 테이블/키워드검색 자동 영어화.
- **Phase 4 — 마감** ⏳ 예정: risk-assessment 위저드 세부 배선, 인쇄/PDF·모바일 확인.

> 주의: 브라우저 캐시에 이전 빈 `db_en.json`이 남아있으면 새로고침(⌘⇧R) 필요.

### 검증 (2026-07-07, 헤드리스 Chrome)
- 대시보드 KO/EN 스크린샷: 사이드바·헤더·카드·차트라벨·히트맵·데이터라벨 전량 전환 확인.
- process-inquiry / disaster-type EN: 필터·카드·차트축 라벨(KOSHA 표준 용어)·placeholder 전환 확인.
- KO 회귀: 건/개 단위 및 원문 모두 보존, EN만 전환됨 확인.

## 6. 도메인 용어집 시드 (건설·안전·플랜트)

> KOSHA 표준·업계 통용 영문. Phase 2에서 확장·검수.

**컬럼명**: 공종 Work Type(Trade) · 작업명 Activity · 단위작업명 Task · 기인물분류 Causal Agent Category · 기인물 Causal Agent · 재해형태 Accident Type · 재해개요 Accident Summary · 재해유발요인 Contributing Factor · 위험성감소대책 Risk Reduction Measure · 3년간사고비중 3-yr Accident Share · 혹서기/혹한기 Hot/Cold Season · 12대기인물 12 Major Causal Agents · KOEN공정 KOEN(Power-plant) Process · 위험도순위 Risk Rank

**재해형태(KOSHA)**: 떨어짐 Fall (from height) · 깔림 뒤집힘 Struck/Crushed by overturning · 맞음 Struck by · 끼임 Caught-in/between · 부딪힘 접촉 Struck against/Contact · 무너짐 Collapse · 감전 Electric shock · 넘어짐 Slip/Trip · 화재 Fire · 폭발 Explosion · 질식 Asphyxiation · 빠짐 익사 Drowning

**공종/공법**: 토공사 Earthworks · 철근콘크리트공사 Reinforced concrete works · 흙막이 지보공 Earth-retaining shoring · 기초파일 Foundation pile · 항타 Pile driving · 되메움 Backfilling · 발파 Blasting · 그라우팅 Grouting · 거푸집 Formwork · 동바리 Formwork shore(prop) · 갱폼 Gang form · 비계 Scaffold · 발판 Working platform · 크레인 Crane · 굴착기 Excavator · 이동식크레인 Mobile crane · 고소작업대 Aerial work platform(MEWP) · 개구부 Opening · 안전대 Safety harness · 안전난간 Guardrail

**플랜트/발전**: 발전소 Power plant · 보일러 Boiler · 터빈 Turbine · 배관 Piping · 강관 Steel pipe · 하수관거 Sewer pipe · 옹벽 Retaining wall · 맨홀 Manhole · 관부설 Pipe laying · 보강토 Reinforced earth

## 7. 리스크 / 유의사항

- **저작권 문구**: 사이드바 "⚠ 상업적 이용 및 내용에 대한 변경 금지". 사고사례 원문 번역은 파생물 소지 → **원문 보존 + 내부 표시 목적** 전제(필요 시 영어 화면에 "번역본, 원문은 한국어" 주석).
- **작업 규모**: 5,300 문단은 한 번에 처리 불가 → 여러 배치로 나눠 진행(별도 결제·API 키 불필요, 현 세션 내 처리). Phase 3에서 배치 수·소요 재고지.
- **품질**: 사고 서술은 법적·기술적 표현 → 숫자·날짜·단위·인과관계 보존이 최우선. QA 자동검사로 누락 방지.
- **전환 UX**: 초기엔 새로고침 방식. 사용자 필터 상태는 한글 canonical이라 언어 무관하게 유지 가능.

## 8. 다음 액션

1. Phase 0 스캐폴딩(`js/i18n.js` + 언어 토글 버튼) 착수 → ko 무영향 확인
2. `i18n_extract.py`로 작업목록·통계 산출(정확한 문단 수·토큰 추정)
3. 용어집 시드 확정 후 Phase 1~2 진행, 이후 Phase 3 대량번역 실행
