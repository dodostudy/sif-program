/**
 * 유틸리티 함수
 */

/** 작업유형별 기인물 분류 맵 (공통 상수) */
const WORK_TYPE_MAP = {
  '고소': ['비계', '달비계', '이동식비계', '비계(일체형비계)', '말비계', '사다리', '작업발판/가설계단', '리프트', '슬라브단부', '개구부(바닥개구부)', '개구부(기타개구부)', '엘리베이터피트', '철골(철골구조물)', '철골(철골자재)', '지붕(처마,홈통)', '지붕(채광판,선라이트)', '천장(판넬 등 마감재)', '거푸집', '동바리'],
  '중장비': ['굴착기', '트럭', '이동식크레인', '고정식크레인', '콘크리트펌프카', '지게차', '천공기/항타기', '로울러', '콘크리트믹서', '기타건설장비', '기타건설기계기구', '고소작업대'],
  '굴착': ['토사', '흙막이가시설', '암석', '기초파일'],
  '전기': ['충전부', '전주'],
  '중량물': ['철근콘크리트자재(철근,콘크리트,PC)', '각재(파이프,강관,합판)', '배관'],
  '화기': ['용접(단)기', '절단기/톱'],
  '밀폐': null,
  '일반': ['기계설비', '외부마감재', '벽체', '기타구조물', '기타가설구조물', '기타자재(내부마감재,시멘트,마대)', '수목', '교통수단', '방망', '바닥(바닥에 걸려 넘어짐)', '계단', '분류불능', '물'],
  '폭염/원인미상': ['폭염', '원인미상'],
  '화학물질': ['화학물질'],
};

/** 그룹별 집계 */
function aggregateBy(data, groupKey, sumKey = null) {
  const map = {};
  data.forEach(item => {
    const key = item[groupKey];
    if (!key) return;
    if (!map[key]) map[key] = { key, count: 0, sum: 0 };
    map[key].count++;
    if (sumKey && item[sumKey]) map[key].sum += Number(item[sumKey]) || 0;
  });
  return Object.values(map);
}

/** 다중 키 그룹별 집계 */
function aggregateByMultiple(data, groupKeys, sumKey = null) {
  const map = {};
  data.forEach(item => {
    const keyParts = groupKeys.map(k => item[k] || '');
    const compositeKey = keyParts.join('|||');
    if (!map[compositeKey]) {
      const entry = { count: 0, sum: 0 };
      groupKeys.forEach(k => entry[k] = item[k]);
      map[compositeKey] = entry;
    }
    map[compositeKey].count++;
    if (sumKey && item[sumKey]) map[compositeKey].sum += Number(item[sumKey]) || 0;
  });
  return Object.values(map);
}

/** 상위 N개 추출 (내림차순) */
function topN(data, key, n) {
  return [...data].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, n);
}

/** 숫자 포맷 (1,234) */
function formatNumber(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString('ko-KR');
}

/** 퍼센트 포맷 */
function formatPercent(value, total) {
  if (!total) return '0%';
  return (value / total * 100).toFixed(1) + '%';
}

/** 필터 값 매칭 (단일값 또는 배열 지원) */
function matchFilter(filterVal, recordVal) {
  if (!filterVal) return true;
  if (Array.isArray(filterVal)) return filterVal.includes(recordVal);
  return recordVal === filterVal;
}

/** DB 레코드 필터링 */
function filterDB(records, filters) {
  return records.filter(r => {
    if (filters.koen === true && !r.KOEN공정) return false;
    if (filters.koen === false && r.KOEN공정) return false;
    if (!matchFilter(filters['공종'], r['공종'])) return false;
    if (!matchFilter(filters['작업명'], r['작업명'])) return false;
    if (!matchFilter(filters['단위작업명'], r['단위작업명'])) return false;
    if (!matchFilter(filters['기인물'], r['기인물'])) return false;
    if (!matchFilter(filters['기인물분류'], r['기인물분류'])) return false;
    if (filters['12대기인물'] === true && !r['12대기인물']) return false;
    if (!matchFilter(filters['재해형태'], r['재해형태'])) return false;
    if (filters['작업유형'] && typeof filters['작업유형'] === 'object') {
      if (!filters['작업유형'].includes(r['기인물'])) return false;
    }
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      const match = ['재해개요', '재해유발요인', '위험성감소대책']
        .some(f => (r[f] || '').toLowerCase().includes(kw));
      if (!match) return false;
    }
    return true;
  });
}

/** 드롭다운 옵션 채우기 */
function populateDropdown(selectId, options, placeholder = '전체') {
  const select = document.getElementById(selectId);
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });
  // 기존 선택값 유지 시도
  if (currentValue && options.includes(currentValue)) {
    select.value = currentValue;
  }
}

/** 키워드 검색 입력 생성 */
function createKeywordSearch(containerId, onInput) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  container.innerHTML = `
    <div class="keyword-search-bar">
      <input type="text" class="keyword-input"
        placeholder="키워드 검색 (재해개요, 유발요인, 감소대책)">
    </div>`;
  const input = container.querySelector('input');
  input.addEventListener('input', debounce(() => {
    onInput(input.value.trim() || null);
  }, 300));
  return input;
}

/** HTML 테이블 생성 (컬럼 필터 지원) */
function buildTable(containerId, columns, rows, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const { pageSize = 20, currentPage = 1, sortKey = null, sortDir = 'desc',
          columnFilters = {}, filterColumns = [], openFilterKey = null } = options;

  // 컬럼 필터 적용 (배열 멀티셀렉트 지원)
  let filteredRows = [...rows];
  Object.keys(columnFilters).forEach(key => {
    const val = columnFilters[key];
    if (val) {
      if (Array.isArray(val)) {
        filteredRows = filteredRows.filter(r => val.includes(String(r[key] || '').trim()));
      } else {
        filteredRows = filteredRows.filter(r => String(r[key] || '').trim() === val);
      }
    }
  });

  // 정렬
  let sortedRows = [...filteredRows];
  if (sortKey) {
    sortedRows.sort((a, b) => {
      const va = a[sortKey] || '';
      const vb = b[sortKey] || '';
      const result = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko');
      return sortDir === 'desc' ? -result : result;
    });
  }

  // 페이지네이션
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const page = Math.min(Math.max(currentPage, 1), totalPages || 1);
  const start = (page - 1) * pageSize;
  const pageRows = sortedRows.slice(start, start + pageSize);

  // 필터 옵션 생성: 각 컬럼은 "다른 필터 적용 후" 가능한 값만 표시 (연계 필터)
  const filterOptions = {};
  filterColumns.forEach(key => {
    const vals = {};
    let baseRows = rows;
    Object.keys(columnFilters).forEach(otherKey => {
      if (otherKey === key) return;
      const otherVal = columnFilters[otherKey];
      if (otherVal) {
        if (Array.isArray(otherVal)) {
          baseRows = baseRows.filter(r => otherVal.includes(String(r[otherKey] || '').trim()));
        } else {
          baseRows = baseRows.filter(r => String(r[otherKey] || '').trim() === otherVal);
        }
      }
    });
    baseRows.forEach(r => {
      const v = String(r[key] || '').trim();
      if (v) vals[v] = (vals[v] || 0) + 1;
    });
    filterOptions[key] = Object.entries(vals).sort((a, b) => b[1] - a[1]);
  });

  const totalCount = formatNumber(filteredRows.length);
  const totalHint = rows.length !== filteredRows.length ? ` (전체 ${formatNumber(rows.length)}건)` : '';
  const pageHint = totalPages > 1 ? ` · ${page}/${totalPages} 페이지` : '';

  let html = `
    <div class="flex items-center justify-between mb-2">
      <div class="text-sm text-gray-400">총 ${totalCount}건${totalHint}${pageHint}</div>
      <button class="table-excel-btn text-xs text-emerald-400 hover:text-emerald-300 px-3 py-1 border border-emerald-700 hover:border-emerald-500 rounded transition-colors">📥 엑셀 다운로드</button>
    </div>`;

  // 컬럼 필터 바 (체크박스 멀티셀렉트)
  if (filterColumns.length > 0) {
    html += `<div class="flex flex-wrap gap-2 mb-2">`;
    filterColumns.forEach(key => {
      const col = columns.find(c => c.key === key);
      const label = col ? col.label : key;
      const currentArr = columnFilters[key] || null;
      const selectedCount = Array.isArray(currentArr) ? currentArr.length : 0;
      const triggerText = selectedCount === 0 ? `${label} ▼`
        : selectedCount === 1 ? `${label} (1개)`
        : `${label} (${selectedCount}개)`;
      const hasSelection = selectedCount > 0 ? ' tbl-ms-active' : '';
      const isOpen = openFilterKey === key;

      html += `<div class="tbl-ms" data-filter-key="${key}">`;
      html += `<button type="button" class="tbl-ms-trigger${hasSelection}">${triggerText}</button>`;
      html += `<div class="tbl-ms-panel${isOpen ? '' : ' hidden'}">`;
      html += `<div class="tbl-ms-panel-header"><span class="tbl-ms-panel-title">${label} 선택</span><button type="button" class="tbl-ms-close-btn">✕ 닫기</button></div>`;
      if ((filterOptions[key] || []).length >= 8) {
        html += `<div class="tbl-ms-search"><input type="text" class="tbl-ms-search-input" placeholder="검색..."></div>`;
      }
      html += `<div class="tbl-ms-options">`;
      (filterOptions[key] || []).forEach(([val, cnt]) => {
        const display = key === '공종' ? val.replace(/^\d+\.\s*/, '') : val;
        const checked = (Array.isArray(currentArr) && currentArr.includes(val)) ? ' checked' : '';
        const escaped = val.replace(/"/g, '&quot;');
        html += `<label class="tbl-ms-option"><input type="checkbox" value="${escaped}"${checked}><span class="tbl-ms-option-label">${display}</span><span class="tbl-ms-option-count">(${cnt})</span></label>`;
      });
      html += `</div>`;
      html += `<div class="tbl-ms-actions"><button type="button" class="tbl-ms-btn tbl-ms-btn-all">전체선택</button><button type="button" class="tbl-ms-btn tbl-ms-btn-clear">선택해제</button></div>`;
      html += `</div></div>`;
    });
    const hasActiveFilter = Object.values(columnFilters).some(v => v && (Array.isArray(v) ? v.length > 0 : true));
    if (hasActiveFilter) {
      html += `<button class="table-filter-reset text-xs text-blue-400 hover:text-blue-300 px-2 py-1 border border-gray-600 rounded">필터 초기화</button>`;
    }
    html += `</div>`;
  }

  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    // 모바일: 카드 뷰
    if (pageRows.length === 0) {
      html += `<div class="text-center text-gray-500 py-8 text-sm">조회 결과가 없습니다.</div>`;
    } else {
      html += `<div class="flex flex-col gap-2">`;
      pageRows.forEach(row => {
        html += `<div class="bg-gray-800/70 rounded-lg p-3 border border-gray-700">`;
        columns.forEach((col, ci) => {
          let value = row[col.key];
          if (col.format) value = col.format(value, row);
          else if (typeof value === 'number') value = formatNumber(value);
          else value = value || '-';
          const isLast = ci === columns.length - 1;
          const isHighlight = ['재해형태', '기인물', '공종', '작업명'].includes(col.key);
          html += `<div class="flex gap-2 py-1.5 ${isLast ? '' : 'border-b border-gray-700/60'}">
            <span class="text-xs text-gray-500 flex-shrink-0" style="min-width:5rem">${col.label}</span>
            <span class="text-xs ${isHighlight ? 'text-white font-semibold' : 'text-gray-300'} flex-1" style="word-break:break-word">${value}</span>
          </div>`;
        });
        html += `</div>`;
      });
      html += `</div>`;
    }
  } else {
    // 데스크탑: 테이블 뷰
    html += `<div class="overflow-x-auto">
      <table class="w-full text-sm text-left" style="table-layout:fixed">
        <colgroup>
          ${columns.map(col => {
            const w = col.width || '';
            const minW = col.minWidth ? `min-width:${col.minWidth}px;` : '';
            return `<col style="${w ? `width:${w}px;` : ''}${minW}">`;
          }).join('')}
        </colgroup>
        <thead class="text-xs uppercase bg-gray-800 text-gray-400">
          <tr>
            ${columns.map(col => `<th class="px-3 py-2 cursor-pointer hover:text-gray-200 whitespace-nowrap" data-sort="${col.key}">${col.label} ${sortKey === col.key ? (sortDir === 'desc' ? '▼' : '▲') : ''}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    pageRows.forEach(row => {
      html += `<tr class="border-b border-gray-700 hover:bg-gray-800/50">`;
      columns.forEach(col => {
        let value = row[col.key];
        if (col.format) value = col.format(value, row);
        else if (typeof value === 'number') value = formatNumber(value);
        else value = value || '-';
        const titleAttr = `title="${String(row[col.key] || '').replace(/"/g, '&quot;')}"`;
        if (col.wrap) {
          // 줄바꿈 허용 컬럼 (재해개요, 감소대책 등)
          html += `<td class="px-3 py-2" style="word-break:break-word;white-space:pre-wrap;" ${titleAttr}>${value}</td>`;
        } else {
          // 고정 너비 컬럼: 내부 div로 overflow 처리 (td 자체의 overflow:hidden은 브라우저 호환 이슈)
          html += `<td class="px-0 py-0" style="overflow:hidden;" ${titleAttr}>
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0.5rem 0.75rem;">${value}</div>
          </td>`;
        }
      });
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
  }

  // 페이지네이션 버튼
  if (totalPages > 1) {
    html += `<div class="flex items-center justify-center gap-2 mt-3">`;
    html += `<button class="table-page-btn px-3 py-1 rounded text-sm ${page <= 1 ? 'text-gray-600' : 'text-gray-300 hover:bg-gray-700'}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>이전</button>`;

    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    for (let p = startPage; p <= endPage; p++) {
      html += `<button class="table-page-btn px-3 py-1 rounded text-sm ${p === page ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}" data-page="${p}">${p}</button>`;
    }

    html += `<button class="table-page-btn px-3 py-1 rounded text-sm ${page >= totalPages ? 'text-gray-600' : 'text-gray-300 hover:bg-gray-700'}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>다음</button>`;
    html += `</div>`;
  }

  container.innerHTML = html;

  // 패널 닫기 공통 함수 (테이블 갱신 후 openFilterKey 없이 재렌더링)
  function applyAndClose(filterKey) {
    const ms = container.querySelector(`.tbl-ms[data-filter-key="${filterKey}"]`);
    if (!ms) return;
    const panel = ms.querySelector('.tbl-ms-panel');
    const checked = [...panel.querySelectorAll('.tbl-ms-option input[type="checkbox"]:checked')].map(cb => cb.value);
    const newFilters = { ...columnFilters };
    if (checked.length > 0) newFilters[filterKey] = checked;
    else delete newFilters[filterKey];
    // openFilterKey 없이 재렌더링 → 패널 닫힌 상태
    buildTable(containerId, columns, rows, { ...options, columnFilters: newFilters, currentPage: 1 });
  }

  // 패널 열기 (테이블 재렌더링으로 openFilterKey 포함)
  function openPanel(filterKey) {
    buildTable(containerId, columns, rows, { ...options, currentPage: options.currentPage || 1, openFilterKey: filterKey });
  }

  container.querySelectorAll('.tbl-ms').forEach(ms => {
    const trigger = ms.querySelector('.tbl-ms-trigger');
    const panel = ms.querySelector('.tbl-ms-panel');
    const filterKey = ms.dataset.filterKey;

    // 트리거 클릭 → 열기 (열려있으면 닫기 적용)
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!panel.classList.contains('hidden')) {
        applyAndClose(filterKey);
      } else {
        openPanel(filterKey);
      }
    });

    // 닫기 버튼 → 필터 적용 후 닫기
    const closeBtn = panel.querySelector('.tbl-ms-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyAndClose(filterKey);
      });
    }

    // 체크박스 변경 → 패널은 유지, 선택 카운트만 트리거에 반영 (실시간 표시)
    panel.querySelectorAll('.tbl-ms-option input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        // 트리거 텍스트만 즉시 업데이트 (buildTable 재호출 없음)
        const col = columns.find(c => c.key === filterKey);
        const label = col ? col.label : filterKey;
        const checkedCount = panel.querySelectorAll('.tbl-ms-option input[type="checkbox"]:checked').length;
        trigger.textContent = checkedCount === 0 ? `${label} ▼` : `${label} (${checkedCount}개)`;
        trigger.className = 'tbl-ms-trigger' + (checkedCount > 0 ? ' tbl-ms-active' : '');
      });
    });

    // 전체선택
    const btnAll = panel.querySelector('.tbl-ms-btn-all');
    if (btnAll) {
      btnAll.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.querySelectorAll('.tbl-ms-option:not([style*="display: none"]) input[type="checkbox"]').forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change')); });
      });
    }

    // 선택해제
    const btnClear = panel.querySelector('.tbl-ms-btn-clear');
    if (btnClear) {
      btnClear.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.querySelectorAll('.tbl-ms-option input[type="checkbox"]').forEach(cb => { cb.checked = false; cb.dispatchEvent(new Event('change')); });
      });
    }

    // 검색
    const searchInput = panel.querySelector('.tbl-ms-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        e.stopPropagation();
        const query = searchInput.value.toLowerCase();
        panel.querySelectorAll('.tbl-ms-option').forEach(opt => {
          const lbl = opt.querySelector('.tbl-ms-option-label').textContent.toLowerCase();
          opt.style.display = lbl.includes(query) ? '' : 'none';
        });
      });
    }

    // 패널 내부 클릭은 외부 닫기 방지
    panel.addEventListener('click', (e) => e.stopPropagation());
  });

  // 외부 클릭 시 모든 열린 패널 적용 후 닫기
  const closeTblMs = () => {
    container.querySelectorAll('.tbl-ms').forEach(ms => {
      const panel = ms.querySelector('.tbl-ms-panel');
      if (!panel.classList.contains('hidden')) {
        applyAndClose(ms.dataset.filterKey);
      }
    });
  };
  if (container._tblMsClose) document.removeEventListener('click', container._tblMsClose);
  container._tblMsClose = closeTblMs;
  document.addEventListener('click', closeTblMs);

  // 필터 초기화 버튼
  const resetBtn = container.querySelector('.table-filter-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      buildTable(containerId, columns, rows, { ...options, columnFilters: {}, currentPage: 1 });
    });
  }

  // 정렬 이벤트
  container.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const newDir = (sortKey === key && sortDir === 'desc') ? 'asc' : 'desc';
      buildTable(containerId, columns, rows, { ...options, sortKey: key, sortDir: newDir, currentPage: 1 });
    });
  });

  // 페이지네이션 이벤트
  container.querySelectorAll('.table-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages) {
        buildTable(containerId, columns, rows, { ...options, currentPage: p });
      }
    });
  });

  // 엑셀 다운로드 버튼 이벤트
  const excelBtn = container.querySelector('.table-excel-btn');
  if (excelBtn) {
    excelBtn.addEventListener('click', () => {
      downloadTableAsExcel(columns, filteredRows);
    });
  }
}

/** 체크박스 선택 테이블 (위험성평가 발전업 위자드용) */
function buildSelectableTable(containerId, columns, rows, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const { pageSize = 10, currentPage = 1, sortKey = null, sortDir = 'desc',
          checkedIds = new Set(), onCheckChange = null,
          filterColumns = [], columnFilters = {} } = options;

  // 컬럼 필터 적용 (표시 행만 필터링, checkedIds는 전체 행 기준 유지)
  let displayRows = [...rows];
  Object.entries(columnFilters).forEach(([key, val]) => {
    if (val) displayRows = displayRows.filter(r => String(r[key] || '') === val);
  });

  // 정렬
  let sortedRows = [...displayRows];
  if (sortKey) {
    sortedRows.sort((a, b) => {
      const va = a[sortKey] || '';
      const vb = b[sortKey] || '';
      const result = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko');
      return sortDir === 'desc' ? -result : result;
    });
  }

  // 페이지네이션
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const page = Math.min(Math.max(currentPage, 1), totalPages || 1);
  const start = (page - 1) * pageSize;
  const pageRows = sortedRows.slice(start, start + pageSize);

  const totalCount = formatNumber(displayRows.length);
  const allCount = formatNumber(rows.length);
  const checkedCount = checkedIds.size;
  const pageHint = totalPages > 1 ? ` · ${page}/${totalPages} 페이지` : '';
  const filteredHint = displayRows.length !== rows.length ? ` (전체 ${allCount}건)` : '';

  // 필터 옵션 생성 (전체 rows 기준)
  const filterOptions = {};
  filterColumns.forEach(key => {
    const vals = {};
    rows.forEach(r => { const v = String(r[key] || '').trim(); if (v) vals[v] = (vals[v] || 0) + 1; });
    filterOptions[key] = Object.entries(vals).sort((a, b) => b[1] - a[1]);
  });

  let html = '';

  // 컬럼 필터 드롭다운 바
  if (filterColumns.length > 0) {
    html += `<div class="flex flex-wrap gap-2 mb-3">`;
    filterColumns.forEach(key => {
      const col = columns.find(c => c.key === key);
      const label = col ? col.label : key;
      const curVal = columnFilters[key] || '';
      html += `<div class="flex items-center gap-1.5">
        <span class="text-xs text-gray-500">${label}</span>
        <select class="sel-tbl-filter text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 cursor-pointer" data-filter-key="${key}">
          <option value="">전체</option>
          ${filterOptions[key].map(([v, cnt]) => `<option value="${v.replace(/"/g,'&quot;')}" ${curVal===v?'selected':''}>${v} (${cnt})</option>`).join('')}
        </select>
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div class="flex items-center justify-between mb-2">
    <div class="text-sm text-gray-400">총 ${totalCount}건${filteredHint}${pageHint} · <span class="text-blue-400">${checkedCount}건 선택</span></div>
  </div>`;

  // 전체 행 ID
  const allIds = rows.map(r => r.id);
  const allChecked = allIds.length > 0 && allIds.every(id => checkedIds.has(id));

  html += `<div class="overflow-x-auto">
    <table class="w-full text-sm text-left" style="table-layout:fixed">
      <colgroup>
        <col style="width:36px;">
        ${columns.map(col => {
          const w = col.width || '';
          const minW = col.minWidth ? `min-width:${col.minWidth}px;` : '';
          return `<col style="${w ? `width:${w}px;` : ''}${minW}">`;
        }).join('')}
      </colgroup>
      <thead class="text-xs uppercase bg-gray-800 text-gray-400">
        <tr>
          <th class="px-2 py-2 text-center"><input type="checkbox" class="sel-all accent-blue-500" ${allChecked ? 'checked' : ''}></th>
          ${columns.map(col => `<th class="px-3 py-2 cursor-pointer hover:text-gray-200 whitespace-nowrap" data-sort="${col.key}">${col.label} ${sortKey === col.key ? (sortDir === 'desc' ? '▼' : '▲') : ''}</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

  pageRows.forEach(row => {
    const isChecked = checkedIds.has(row.id);
    const bgClass = isChecked ? 'bg-blue-900/20' : '';
    html += `<tr class="border-b border-gray-700 hover:bg-gray-800/50 ${bgClass}" data-row-id="${row.id}">`;
    html += `<td class="px-2 py-2 text-center"><input type="checkbox" class="sel-row accent-blue-500" value="${row.id}" ${isChecked ? 'checked' : ''}></td>`;
    columns.forEach(col => {
      let value = row[col.key];
      if (col.format) value = col.format(value, row);
      else if (typeof value === 'number') value = formatNumber(value);
      else value = value || '-';
      if (col.wrap) {
        html += `<td class="px-3 py-2" style="word-break:break-word;white-space:pre-wrap;">${value}</td>`;
      } else {
        html += `<td class="px-0 py-0" style="overflow:hidden;"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0.5rem 0.75rem;">${value}</div></td>`;
      }
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;

  // 페이지네이션
  if (totalPages > 1) {
    html += `<div class="flex items-center justify-center gap-2 mt-3">`;
    html += `<button class="table-page-btn px-3 py-1 rounded text-sm ${page <= 1 ? 'text-gray-600' : 'text-gray-300 hover:bg-gray-700'}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>이전</button>`;
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    for (let p = startPage; p <= endPage; p++) {
      html += `<button class="table-page-btn px-3 py-1 rounded text-sm ${p === page ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}" data-page="${p}">${p}</button>`;
    }
    html += `<button class="table-page-btn px-3 py-1 rounded text-sm ${page >= totalPages ? 'text-gray-600' : 'text-gray-300 hover:bg-gray-700'}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>다음</button>`;
    html += `</div>`;
  }

  container.innerHTML = html;

  // 이벤트: 개별 체크박스
  container.querySelectorAll('.sel-row').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = parseInt(cb.value);
      if (cb.checked) checkedIds.add(id);
      else checkedIds.delete(id);
      if (onCheckChange) onCheckChange([...checkedIds]);
      // 현재 페이지 상태만 반영 (전체 재렌더링 방지)
      const tr = cb.closest('tr');
      tr.classList.toggle('bg-blue-900/20', cb.checked);
      // 전체선택 체크박스 동기화
      const selAll = container.querySelector('.sel-all');
      selAll.checked = allIds.every(id => checkedIds.has(id));
      // 선택 건수 텍스트 업데이트
      const countEl = container.querySelector('.text-blue-400');
      if (countEl) countEl.textContent = `${checkedIds.size}건 선택`;
    });
  });

  // 이벤트: 전체선택
  container.querySelector('.sel-all').addEventListener('change', (e) => {
    const checked = e.target.checked;
    // 전체 행 (현재 페이지가 아닌 모든 행)
    allIds.forEach(id => {
      if (checked) checkedIds.add(id);
      else checkedIds.delete(id);
    });
    if (onCheckChange) onCheckChange([...checkedIds]);
    buildSelectableTable(containerId, columns, rows, { ...options, checkedIds, currentPage: page });
  });

  // 정렬 이벤트
  container.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const newDir = (sortKey === key && sortDir === 'desc') ? 'asc' : 'desc';
      buildSelectableTable(containerId, columns, rows, { ...options, sortKey: key, sortDir: newDir, currentPage: 1, checkedIds });
    });
  });

  // 페이지네이션 이벤트
  container.querySelectorAll('.table-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages) {
        buildSelectableTable(containerId, columns, rows, { ...options, currentPage: p, checkedIds });
      }
    });
  });

  // 컬럼 필터 드롭다운 이벤트
  container.querySelectorAll('.sel-tbl-filter').forEach(sel => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.filterKey;
      const newFilters = { ...columnFilters };
      if (sel.value) newFilters[key] = sel.value;
      else delete newFilters[key];
      buildSelectableTable(containerId, columns, rows, { ...options, columnFilters: newFilters, currentPage: 1, checkedIds });
    });
  });
}

/** CSV(Excel) 다운로드 */
function downloadTableAsExcel(columns, rows, filename = '재해사례') {
  // 비밀번호 확인
  const pw = prompt('다운로드 비밀번호를 입력하세요:');
  if (pw === null) return; // 취소
  if (pw !== '6112') {
    alert('비밀번호가 올바르지 않습니다.');
    return;
  }

  const headers = columns.map(col => `"${col.label}"`).join(',');
  const data = rows.map(row =>
    columns.map(col => {
      let v = row[col.key];
      // HTML 태그 제거
      v = String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim();
      return `"${v.replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');

  const blob = new Blob(['\uFEFF' + headers + '\n' + data], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 차트/테이블 토글 */
function setupChartTableToggle(toggleBtnId, chartContainerId, tableContainerId) {
  const btn = document.getElementById(toggleBtnId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const chart = document.getElementById(chartContainerId);
    const table = document.getElementById(tableContainerId);
    chart.classList.toggle('hidden');
    table.classList.toggle('hidden');
    btn.textContent = chart.classList.contains('hidden') ? '차트 보기' : '테이블 보기';
  });
}

/** 디바운스 */
function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
