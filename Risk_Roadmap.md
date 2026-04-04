# 위험성평가 페이지 재설계 + 기인물조회 개선 + 키워드 검색

## Context
위험성평가 페이지를 **안전누리 GPTs / 발전업 / 건설업** 3가지 진입점 구조로 전면 재설계한다. 기인물조회에 발전소공정 토글 + 12대기인물 토글을 추가하고, 공정조회·기인물조회·재해형태분석 3페이지에 키워드 검색을 추가한다.

---

## 수정 대상 파일

| 파일 | 변경 |
|------|------|
| `js/components.js` | `createKoenToggle` ID 충돌 해결 (containerId 접두사) |
| `js/utils.js` | `WORK_TYPE_MAP` 이동, `filterDB`에 keyword 추가, `createKeywordSearch` 헬퍼, `buildSelectableTable` 신규 |
| `css/style.css` | 키워드 검색·위자드 칩·체크박스 행·인쇄 규칙 추가 |
| `pages/risk-assessment.html` | **전면 재설계** (진입 카드 + 발전업 위자드 + 건설업 위자드) |
| `pages/cause-inquiry.html` | KOEN 토글 + 12대 토글 + 키워드 + WORK_TYPE_MAP 제거(utils.js로 이동) |
| `pages/process-inquiry.html` | 키워드 검색 추가 |
| `pages/disaster-type.html` | createKoenToggle ID 참조 수정 + 키워드 검색 추가 |

---

## Phase 1: 공통 인프라 (3개 작업)

### 1-1. `createKoenToggle` ID 충돌 해결 — `js/components.js:130~152`

현재 `id="koen-toggle"`, `id="koen-label"` 하드코딩 → `containerId`를 접두사로 사용.
```javascript
function createKoenToggle(containerId, onChange) {
  const toggleId = `${containerId}-toggle`;
  const labelId = `${containerId}-label`;
  // innerHTML 내에서 toggleId, labelId 사용
}
```
**영향**: `disaster-type.html`의 reset 로직(line 291~293)에서 `document.getElementById('koen-toggle')` → 새 ID로 갱신.

### 1-2. `filterDB`에 keyword 필터 추가 — `js/utils.js:59~76`

```javascript
// return true 직전에 추가:
if (filters.keyword) {
  const kw = filters.keyword.toLowerCase();
  const match = ['재해개요', '재해유발요인', '위험성감소대책']
    .some(f => (r[f] || '').toLowerCase().includes(kw));
  if (!match) return false;
}
```

### 1-3. `WORK_TYPE_MAP`을 `js/utils.js`로 이동

`cause-inquiry.html`의 line 103~114에 있는 `WORK_TYPE_MAP` 상수를 `js/utils.js` 상단으로 이동. `cause-inquiry.html`에서 해당 선언 삭제. `risk-assessment.html`에서도 `utils.js`를 이미 로드하므로 참조 가능.

---

## Phase 2: 키워드 검색 (3페이지)

### 공통 헬퍼 — `js/utils.js`에 추가

```javascript
function createKeywordSearch(containerId, onInput) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="keyword-search-bar">
      <input type="text" class="keyword-input"
        placeholder="키워드 검색 (재해개요, 유발요인, 감소대책)">
    </div>`;
  const input = container.querySelector('input');
  input.addEventListener('input', debounce(() => {
    onInput(input.value.trim() || null);
  }, 300));
  return input; // 초기화 시 .value = '' 설정용
}
```

### CSS — `css/style.css`

```css
.keyword-search-bar { /* filter-bar 아래, 동일 다크 테마 */ }
.keyword-input { /* #1F2937 배경, 전체 폭, 0.875rem */ }
@media print { .keyword-search-bar { display: none !important; } }
```

### 적용 (3페이지 동일 패턴)

| 페이지 | FilterManager 키 추가 | HTML 위치 |
|--------|----------------------|-----------|
| `process-inquiry.html` | `'keyword'` 추가 | `<div class="filter-bar">` 바로 아래 |
| `cause-inquiry.html` | `'keyword'` 추가 | `<div class="filter-bar">` 바로 아래 |
| `disaster-type.html` | `'keyword'` 추가 | `<div class="filter-bar">` 바로 아래 |

각 페이지에서:
1. FM 초기화에 `'keyword'` 키 추가
2. `<div id="keyword-search-wrap" class="mb-4"></div>` 삽입
3. `init()`에서 `createKeywordSearch('keyword-search-wrap', v => fm.set('keyword', v))` 호출
4. 초기화 버튼에 keyword input 리셋 로직 추가

---

## Phase 3: 기인물조회 페이지 개선 — `pages/cause-inquiry.html`

### 3-1. 발전소 공정 토글 추가

필터 바 맨 좌측에 추가:
```html
<div class="filter-group" id="cause-koen-wrap"></div>  <!-- 작업유형 앞 -->
```

JS:
```javascript
const fm = new FilterManager(['koen', '작업유형', '12대기인물', '기인물', 'keyword']);
createKoenToggle('cause-koen-wrap', (val) => fm.set('koen', val));
```

### 3-2. 12대 기인물을 토글로 변경

기존 `<select id="filter-12">` → Tailwind 토글 교체:
```html
<div class="filter-group">
  <label>12대 기인물</label>
  <div class="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
    <label class="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" id="filter-12-toggle" class="sr-only peer">
      <div class="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:bg-purple-600 ..."></div>
    </label>
    <span class="text-xs text-gray-400" id="filter-12-label">전체</span>
  </div>
</div>
```

JS 이벤트:
```javascript
document.getElementById('filter-12-toggle').addEventListener('change', (e) => {
  document.getElementById('filter-12-label').textContent = e.target.checked ? '12대만' : '전체';
  fm.set('12대기인물', e.target.checked ? true : null);
});
```

---

## Phase 4: 위험성평가 페이지 재설계 — `pages/risk-assessment.html`

### 4-1. 전체 레이아웃

```
#page-header
#print-title (인쇄용)

#entry-cards          ← 3개 카드 (안전누리 GPTs / 발전업 / 건설업)

#gpts-section         ← GPTs 링크 + 교육영상 (hidden)
#power-section        ← 발전업 위자드 전체 (hidden)
  ├─ #power-koen-wrap   (발전소공정 토글)
  ├─ #power-step1       (기인물 선택 - 작업유형 그룹별)
  ├─ #power-step2       (재해형태 선택)
  ├─ #power-step3       (유사 작업명 선택)
  ├─ #power-step4       (재해사례 체크박스 테이블)
  └─ #power-result      (최종 위험성평가 테이블)
#construction-section ← 건설업 위자드 (hidden)
  ├─ #const-step1       (공종 선택 - 복수)
  ├─ #const-step2       (작업명 선택 - 복수)
  ├─ #const-step3       (단위작업명 선택 - 복수)
  └─ #const-result      (결과: 카드+차트+테이블)
```

### 4-2. 진입 화면

```html
<div id="entry-cards" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
  <div class="wizard-card" onclick="showSection('gpts')">
    🤖 AI GPTs 안전누리 / 대화형 7단계 위험성평가
  </div>
  <div class="wizard-card" onclick="showSection('power')">
    ⚡ 발전업 / 기인물 기반 위험성평가
  </div>
  <div class="wizard-card" onclick="showSection('construction')">
    🏗️ 건설업 / 공종 기반 위험성평가
  </div>
</div>
```

`showSection(type)`: 진입 카드 숨김 → 해당 섹션 표시 + 브레드크럼 갱신. "처음으로" 버튼으로 복귀.

### 4-3. GPTs 섹션

기존 GPTs 배너 내용 그대로 사용 (GPTs 열기 링크 + 사용방법 영상 링크). 별도 섹션으로 분리.

### 4-4. 발전업 위자드 — 핵심 플로우

**상태 관리**:
```javascript
const powerState = {
  selectedRows: [],     // 누적 선택된 행 ID 배열
  currentGiinmul: null, // 현재 기인물
  processedGiinmuls: [], // 이미 평가 완료한 기인물 목록
};
```

**데이터 기반**: `allData.filter(r => r.KOEN공정)` (발전소 공정 데이터만, 토글로 전환 가능)

**Step 1 — 기인물 선택**:
- `WORK_TYPE_MAP` 기준으로 10개 작업유형 그룹 표시
- 각 그룹 내 기인물을 칩/카드로 나열 (건수 포함)
- `밀폐` 그룹: 재해형태 '산소결핍 질식' 레코드에서 기인물 동적 추출
- 이미 평가 완료한 기인물은 완료 표시 (회색 + 체크 아이콘)
- 기인물 1개 클릭 → `powerState.currentGiinmul` 설정 → Step 2

**Step 2 — 재해형태 선택** (복수 가능):
- 현재 기인물 + KOEN 데이터에서 재해형태 추출 (건수 내림차순)
- 체크박스 목록
- "전체" 옵션 포함
- "다음" 버튼 → Step 3

**Step 3 — 유사 작업명 선택** (복수 가능):
- 현재 기인물 + 선택 재해형태 + KOEN 데이터에서 작업명 추출 (건수 내림차순)
- 체크박스 목록
- "전체" 옵션 포함
- "다음" 버튼 → Step 4

**Step 4 — 재해사례 체크박스 테이블**:
- 필터 조건: 기인물 + 재해형태(선택 시) + 작업명(선택 시) + KOEN
- `buildSelectableTable` 사용 (맨 좌측 체크박스 열)
- 열: ☑ | 기인물 | 재해형태 | 작업명 | 재해개요 | 감소대책
- 하단 버튼:
  - **"다음 기인물"**: 체크된 행 ID → `powerState.selectedRows`에 누적 → Step 1로 복귀
  - **"평가 완료"**: 체크된 행 누적 → 최종 결과 표시

**최종 결과**:
- `powerState.selectedRows`의 ID로 `allData`에서 행 추출
- 테이블: 기인물 | 재해형태 | 작업명 | 재해개요 | 감소대책
- 엑셀 다운로드 (`downloadTableAsExcel` 재사용)
- 인쇄 (`handlePrintWithCharts` 재사용)

### 4-5. `buildSelectableTable` — `js/utils.js` 신규

`buildTable`과 유사하되 첫 열에 체크박스 추가:
```javascript
function buildSelectableTable(containerId, columns, rows, options = {}) {
  // options.checkedIds: Set<number> — 이미 체크된 행 ID
  // options.onCheckChange: (checkedIds: number[]) => void — 체크 변경 콜백
  // 페이지네이션, 정렬 지원
  // 헤더에 전체선택 체크박스
  // 체크된 행은 bg-blue-900/20 하이라이트
}
```

### 4-6. 건설업 위자드 (복수 선택)

기존 카드 클릭 방식 → **카드에 체크박스 추가 + "다음" 버튼**으로 변경.

```javascript
const constState = { 공종: [], 작업명: [], 단위작업명: [] };
```

**Step 1 (공종)**: 12개 공종 카드에 체크박스. 복수 선택 + "다음" 버튼.
**Step 2 (작업명)**: 선택 공종들의 작업명 합집합 (`dropdownRef.hierarchy` 활용).
**Step 3 (단위작업명)**: 선택 공종+작업명 조합의 단위작업명 합집합.
**결과**: 기존과 동일 — 위험요인 카드 + 차트(기인물/재해형태) + 재해사례 테이블.

---

## 구현 순서

| # | 작업 | 파일 |
|---|------|------|
| 1 | `createKoenToggle` ID 수정 | `js/components.js` |
| 2 | `disaster-type.html` ID 참조 수정 | `pages/disaster-type.html` |
| 3 | `WORK_TYPE_MAP` → `js/utils.js` 이동 | `js/utils.js`, `pages/cause-inquiry.html` |
| 4 | `filterDB` keyword 추가 + `createKeywordSearch` 헬퍼 | `js/utils.js` |
| 5 | CSS 추가 (키워드·위자드·체크박스) | `css/style.css` |
| 6 | 기인물조회 개선 (KOEN 토글 + 12대 토글 + 키워드) | `pages/cause-inquiry.html` |
| 7 | 공정조회 + 재해형태분석 키워드 검색 | `pages/process-inquiry.html`, `pages/disaster-type.html` |
| 8 | `buildSelectableTable` 함수 | `js/utils.js` |
| 9 | 위험성평가: 진입 화면 + GPTs 섹션 | `pages/risk-assessment.html` |
| 10 | 위험성평가: 발전업 위자드 (Step 1~4 + 결과) | `pages/risk-assessment.html` |
| 11 | 위험성평가: 건설업 위자드 (복수 선택) | `pages/risk-assessment.html` |
| 12 | 인쇄 CSS 규칙 추가 | `css/style.css` |

---

## 검증

로컬 서버(`python3 -m http.server 8080`)에서:

1. **위험성평가 — 진입**: 3개 카드 클릭 → 각 섹션 표시 / "처음으로" 복귀
2. **발전업 위자드**: 기인물 선택 → 재해형태 → 작업명 → 사례 체크 → "다음 기인물" → 반복 → "평가 완료" → 최종 테이블 + 엑셀
3. **건설업 위자드**: 공종 복수 선택 → 작업명 복수 → 단위작업명 복수 → 결과 (카드+차트+테이블)
4. **기인물조회**: KOEN 토글 ON → 데이터 필터링 확인 / 12대 토글 ON → 12대만 / 키워드 입력 → 실시간 필터링
5. **키워드 검색 (3페이지)**: "떨어짐" 입력 → 재해개요/유발요인/감소대책에 포함된 레코드만 표시
6. **인쇄**: 발전업 최종 결과 인쇄 시 테이블만 출력, 위자드 단계 숨김
