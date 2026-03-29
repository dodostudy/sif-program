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

/** DB 레코드 필터링 */
function filterDB(records, filters) {
  return records.filter(r => {
    if (filters.koen === true && !r.KOEN공정) return false;
    if (filters.koen === false && r.KOEN공정) return false;
    if (filters['공종'] && r['공종'] !== filters['공종']) return false;
    if (filters['작업명'] && r['작업명'] !== filters['작업명']) return false;
    if (filters['단위작업명'] && r['단위작업명'] !== filters['단위작업명']) return false;
    if (filters['기인물'] && r['기인물'] !== filters['기인물']) return false;
    if (filters['기인물분류'] && r['기인물분류'] !== filters['기인물분류']) return false;
    if (filters['12대기인물'] === true && !r['12대기인물']) return false;
    if (filters['재해형태'] && r['재해형태'] !== filters['재해형태']) return false;
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

/** HTML 테이블 생성 */
function buildTable(containerId, columns, rows, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const { pageSize = 20, currentPage = 1, sortKey = null, sortDir = 'desc' } = options;

  // 정렬
  let sortedRows = [...rows];
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

  let html = `
    <div class="text-sm text-gray-400 mb-2">총 ${formatNumber(rows.length)}건${totalPages > 1 ? ` (${page}/${totalPages} 페이지)` : ''}</div>
    <div class="overflow-x-auto">
    <table class="w-full text-sm text-left">
      <thead class="text-xs uppercase bg-gray-800 text-gray-400">
        <tr>
          ${columns.map(col => `<th class="px-3 py-2 cursor-pointer hover:text-gray-200 whitespace-nowrap" data-sort="${col.key}">${col.label} ${sortKey === col.key ? (sortDir === 'desc' ? '▼' : '▲') : ''}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
  `;

  pageRows.forEach((row, i) => {
    html += `<tr class="border-b border-gray-700 hover:bg-gray-800/50">`;
    columns.forEach(col => {
      let value = row[col.key];
      if (col.format) value = col.format(value, row);
      else if (typeof value === 'number') value = formatNumber(value);
      else value = value || '-';
      const maxW = col.maxWidth ? `max-width:${col.maxWidth}px;` : '';
      html += `<td class="px-3 py-2 ${col.wrap ? '' : 'truncate'}" style="${maxW}" title="${String(row[col.key] || '').replace(/"/g, '&quot;')}">${value}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;

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
