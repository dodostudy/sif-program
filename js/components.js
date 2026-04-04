/**
 * 공통 UI 컴포넌트 (사이드바, 헤더)
 */

const NAV_ITEMS = [
  { href: '/pages/intro.html', icon: 'info', label: '소개' },
  { href: '/index.html', icon: 'home', label: '대시보드' },
  { href: '/pages/process-inquiry.html', icon: 'search', label: '공정조회' },
  { href: '/pages/cause-inquiry.html', icon: 'alert', label: '기인물조회' },
  { href: '/pages/disaster-type.html', icon: 'flame', label: '재해형태 분석' },
  { href: '/pages/risk-assessment.html', icon: 'shield', label: '위험성평가' },
  { href: '/pages/statistics.html', icon: 'chart', label: '통계분석' },
];

const ICONS = {
  info: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  home: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>`,
  search: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`,
  alert: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>`,
  chart: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,
  flame: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"/></svg>`,
  shield: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`,
  menu: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  close: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
};

function getBasePath() {
  const path = window.location.pathname;
  if (path.includes('/pages/')) return '..';
  return '.';
}

function isActivePage(href) {
  const current = window.location.pathname;
  if (href === '/index.html') {
    return current.endsWith('/index.html') || current.endsWith('/') || current === '';
  }
  return current.endsWith(href.split('/').pop());
}

function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const base = getBasePath();
  const navHtml = NAV_ITEMS.map(item => {
    const active = isActivePage(item.href);
    const href = base + item.href;
    return `
      <a href="${href}" class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${active ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}">
        ${ICONS[item.icon]}
        <span class="sidebar-label">${item.label}</span>
      </a>`;
  }).join('');

  const logoPath = base + '/images/logo.png';
  sidebar.innerHTML = `
    <div class="flex flex-col h-full w-64 bg-gray-900 border-r border-gray-800 fixed top-0 left-0 z-40 transform -translate-x-full lg:translate-x-0 transition-transform" id="sidebar-panel">
      <div class="p-4 border-b border-gray-800">
        <div class="flex items-center gap-3">
          <img src="${logoPath}" alt="행복플러스+ 분당" class="w-10 h-10 object-contain flex-shrink-0">
          <div>
            <h1 class="text-sm font-bold text-white whitespace-nowrap">위험성평가 지원 시스템</h1>
            <p class="text-xs text-blue-300 font-medium">분당발전본부 안전관리실</p>
            <p class="text-xs text-gray-500">SIF 사고사망 고위험요인</p>
          </div>
        </div>
      </div>
      <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
        ${navHtml}
      </nav>
      <div class="p-4 border-t border-gray-800 space-y-1">
        <p class="text-xs text-white font-medium">산업재해 고위험요인 (2013년~2021년)</p>
        <p class="text-xs text-white">출처: 한국산업안전보건공단</p>
        <p class="text-xs text-amber-300 font-medium pt-1 border-t border-gray-800">⚠ 상업적 이용 및 내용에 대한 변경 금지</p>
      </div>
    </div>
  `;

  // 모바일 햄버거 메뉴
  const mobileBtn = document.createElement('button');
  mobileBtn.id = 'mobile-menu-btn';
  mobileBtn.className = 'fixed top-3 left-3 z-50 lg:hidden bg-gray-800/90 p-1.5 rounded-lg text-gray-300 backdrop-blur-sm';
  mobileBtn.innerHTML = ICONS.menu;
  document.body.appendChild(mobileBtn);

  // 오버레이
  const overlay = document.createElement('div');
  overlay.id = 'sidebar-overlay';
  overlay.className = 'fixed inset-0 bg-black/50 z-30 hidden lg:hidden';
  document.body.appendChild(overlay);

  const panel = document.getElementById('sidebar-panel');

  mobileBtn.addEventListener('click', () => {
    panel.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
    mobileBtn.innerHTML = panel.classList.contains('-translate-x-full') ? ICONS.menu : ICONS.close;
  });

  overlay.addEventListener('click', () => {
    panel.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
    mobileBtn.innerHTML = ICONS.menu;
  });
}

function renderPageHeader(title, subtitle = '', options = {}) {
  const header = document.getElementById('page-header');
  if (!header) return;

  const { showPrint = true } = options;

  const printIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>`;

  const printBtn = showPrint
    ? `<button onclick="handlePrintWithCharts()" class="no-print flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-sm text-gray-300 hover:text-white rounded-lg transition-colors">${printIcon} 인쇄 / PDF</button>`
    : '';

  header.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white print-title">${title}</h2>
        ${subtitle ? `<p class="text-sm text-gray-400 mt-1 print-subtitle">${subtitle}</p>` : ''}
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-3" id="header-controls"></div>
        ${printBtn}
      </div>
    </div>
  `;
}

function createKoenToggle(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
      <span class="text-xs text-gray-400">발전소 공정</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" id="koen-toggle" class="sr-only peer">
        <div class="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
      </label>
      <span class="text-xs text-gray-400" id="koen-label">전체</span>
    </div>
  `;

  const toggle = document.getElementById('koen-toggle');
  const label = document.getElementById('koen-label');
  toggle.addEventListener('change', () => {
    label.textContent = toggle.checked ? '발전소 공정만' : '전체';
    onChange(toggle.checked ? true : null);
  });
}
