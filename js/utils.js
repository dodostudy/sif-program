/**
 * 유틸리티 함수
 */

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

/** HTML 테이블 생성 (컬럼 필터 지원) */
function buildTable(containerId, columns, rows, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const { pageSize = 20, currentPage = 1, sortKey = null, sortDir = 'desc',
          columnFilters = {}, filterColumns = [] } = options;

  // 컬럼 필터 적용
  let filteredRows = [...rows];
  Object.keys(columnFilters).forEach(key => {
    const val = columnFilters[key];
    if (val) {
      filteredRows = filteredRows.filter(r => {
        const cellVal = String(r[key] || '').trim();
        return cellVal === val;
      });
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
    // 이 컬럼을 제외한 나머지 필터 적용
    let baseRows = rows;
    Object.keys(columnFilters).forEach(otherKey => {
      if (otherKey === key) return;
      const otherVal = columnFilters[otherKey];
      if (otherVal) {
        baseRows = baseRows.filter(r => String(r[otherKey] || '').trim() === otherVal);
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

  // 컬럼 필터 바
  if (filterColumns.length > 0) {
    html += `<div class="flex flex-wrap gap-2 mb-2">`;
    filterColumns.forEach(key => {
      const col = columns.find(c => c.key === key);
      const label = col ? col.label : key;
      const currentVal = columnFilters[key] || '';
      html += `<select class="table-col-filter bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 px-2 py-1" data-filter-key="${key}" style="min-width:100px">`;
      html += `<option value="">${label} ▼</option>`;
      (filterOptions[key] || []).forEach(([val, cnt]) => {
        const display = key === '공종' ? val.replace(/^\d+\.\s*/, '') : val;
        const selected = currentVal === val ? ' selected' : '';
        html += `<option value="${val.replace(/"/g, '&quot;')}"${selected}>${display} (${cnt})</option>`;
      });
      html += `</select>`;
    });
    const hasActiveFilter = Object.values(columnFilters).some(v => v);
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

  // 컬럼 필터 이벤트
  container.querySelectorAll('.table-col-filter').forEach(sel => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.filterKey;
      const newFilters = { ...columnFilters, [key]: sel.value || undefined };
      if (!sel.value) delete newFilters[key];
      buildTable(containerId, columns, rows, { ...options, columnFilters: newFilters, currentPage: 1 });
    });
  });

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
