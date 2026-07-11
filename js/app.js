/**
 * 앱 초기화 - Chart.js 기본설정 + 공통 컴포넌트 로드
 */

/* =====================================================
   테마 (다크/라이트) 관리
   ===================================================== */
const THEME_COLORS = {
  dark: {
    chartText: '#9CA3AF',
    chartBorder: '#374151',
    tooltipBg: 'rgba(17, 24, 39, 0.95)',
    tooltipTitle: '#F9FAFB',
    tooltipBody: '#D1D5DB',
    tooltipBorder: '#374151',
  },
  light: {
    chartText: '#374151',
    chartBorder: '#E5E7EB',
    tooltipBg: 'rgba(255, 255, 255, 0.95)',
    tooltipTitle: '#111827',
    tooltipBody: '#374151',
    tooltipBorder: '#D1D5DB',
  }
};

function applyChartTheme(theme) {
  if (typeof Chart === 'undefined') return;
  const c = THEME_COLORS[theme];
  Chart.defaults.color = c.chartText;
  Chart.defaults.borderColor = c.chartBorder;
  Chart.defaults.plugins.tooltip.backgroundColor = c.tooltipBg;
  Chart.defaults.plugins.tooltip.titleColor = c.tooltipTitle;
  Chart.defaults.plugins.tooltip.bodyColor = c.tooltipBody;
  Chart.defaults.plugins.tooltip.borderColor = c.tooltipBorder;

  // 이미 생성된 차트 인스턴스도 업데이트
  try {
    Object.values(Chart.instances).forEach(chart => chart.update('none'));
  } catch (e) { /* 무시 */ }
}

function getCurrentTheme() {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

/* =====================================================
   막대차트 공통 datalabel 설정 (전 페이지 재사용)
   ===================================================== */
/**
 * 수평 막대차트에 "건수 (비율%)"를 막대 끝에 상시 표시.
 * @param {number} total 해당 차트 스코프의 전체 건수 (비율 분모 — 도넛과 동일 의미).
 *                       Top-N이라 표시 막대 합이 total 미만일 수 있음(정상).
 * 표기: "N건 (X%)" / EN "N cases (X%)". 아주 작은 값은 건수만.
 * 색: 테마별 대비 확보 + 외곽선(textStroke)으로 막대 안/밖 어디서든 가독.
 */
function barDatalabels(total) {
  return {
    display: true,
    anchor: 'end',
    // 막대가 아주 길어(우측 경계 근접) 라벨이 밖으로 넘치면 막대 안쪽으로 자동 배치
    align: (ctx) => {
      const arr = (ctx.dataset && ctx.dataset.data) || [];
      const max = arr.reduce((m, v) => Math.max(m, +v || 0), 0);
      const v = +arr[ctx.dataIndex] || 0;
      return (max && v / max > 0.8) ? 'start' : 'end';
    },
    clamp: true,          // 경계에서 라벨을 차트 영역 안으로 당김
    clip: false,
    offset: 2,
    color: () => (getCurrentTheme() === 'light' ? '#1F2937' : '#E5E7EB'),
    textStrokeColor: () => (getCurrentTheme() === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(17,24,39,0.9)'),
    textStrokeWidth: 3,
    font: { size: 10, weight: '600' },
    formatter: (value) => {
      if (!value) return '';
      const cnt = (typeof I18n !== 'undefined') ? I18n.cases(value) : `${value}건`;
      const pct = total ? (value / total * 100) : 0;
      // 아주 작은 값(짧은 막대)은 건수만 표기해 라벨 넘침 방지
      if (pct < 2) return cnt;
      return `${cnt} (${pct.toFixed(1)}%)`;
    },
  };
}

function updateThemeToggleUI() {
  const isLight = getCurrentTheme() === 'light';
  if (typeof THEME_ICONS !== 'undefined') {
    const fixedBtn = document.getElementById('theme-toggle-fixed');
    if (fixedBtn) {
      fixedBtn.innerHTML = isLight ? THEME_ICONS.moon : THEME_ICONS.sun;
    }
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const isCurrentlyLight = html.classList.contains('light');
  const newTheme = isCurrentlyLight ? 'dark' : 'light';

  html.classList.toggle('light', !isCurrentlyLight);
  html.classList.toggle('dark', isCurrentlyLight);
  localStorage.setItem('sif-theme', newTheme);

  applyChartTheme(newTheme);
  updateThemeToggleUI();
}

document.addEventListener('DOMContentLoaded', async () => {
  const theme = getCurrentTheme();

  // 언어 리소스 로드 대기 (EN일 때 사전 프리페치 완료 보장)
  if (typeof I18n !== 'undefined') { try { await I18n.init(); } catch (e) { /* 무시 */ } }

  // Chart.js 글로벌 설정
  if (typeof Chart !== 'undefined') {
    const c = THEME_COLORS[theme];
    Chart.defaults.color = c.chartText;
    Chart.defaults.borderColor = c.chartBorder;
    Chart.defaults.font.family = "'Pretendard', 'Noto Sans KR', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 16;
    Chart.defaults.plugins.tooltip.backgroundColor = c.tooltipBg;
    Chart.defaults.plugins.tooltip.titleColor = c.tooltipTitle;
    Chart.defaults.plugins.tooltip.bodyColor = c.tooltipBody;
    Chart.defaults.plugins.tooltip.borderColor = c.tooltipBorder;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;

    // datalabels 플러그인: 글로벌 비활성화 (도넛 차트에서만 per-chart 활성화)
    if (typeof ChartDataLabels !== 'undefined') {
      Chart.register(ChartDataLabels);
      Chart.defaults.plugins.datalabels = { display: false };
    }
  }

  // 사이드바 렌더링
  renderSidebar();

  // 정적 DOM 영어 치환 + 동적 콘텐츠 자동 번역 (EN일 때만 동작)
  if (typeof I18n !== 'undefined') { I18n.refresh(); I18n.installAutoTranslate(); }
});

/* =====================================================
   인쇄 / PDF 지원: 고해상도 캔버스 → 이미지 변환
   ===================================================== */
let _printImgs = [];
let _origDatalabelsColors = new Map();
let _origChartDPRs = new Map();
// handlePrintWithCharts 에서 캡처 완료 여부 (beforeprint 폴백 판단용)
let _capturedByHandler = false;

/**
 * 인쇄 버튼 핸들러:
 * 1) Chart.js 색상을 인쇄용으로 변경 + 해상도 3배로 상향
 * 2) 렌더링 완료 후 캔버스를 고해상도 이미지로 캡처
 * 3) window.print() 호출
 */
function handlePrintWithCharts() {
  if (typeof Chart !== 'undefined') {
    // 축/범례 레이블을 인쇄용 어두운 색으로
    Chart.defaults.color = '#1a1a1a';
    Chart.defaults.borderColor = '#9ca3af';

    _origDatalabelsColors.clear();
    _origChartDPRs.clear();
    try {
      Object.values(Chart.instances).forEach(chart => {
        // 데이터라벨 색상 변경 (도넛 차트 등)
        const dl = chart.config?.options?.plugins?.datalabels;
        if (dl) {
          _origDatalabelsColors.set(chart.id, dl.color);
          dl.color = '#1a1a1a';
        }
        // 인쇄 해상도 3배로 상향 (선명한 출력)
        _origChartDPRs.set(chart.id, chart.currentDevicePixelRatio);
        chart.options.devicePixelRatio = 3;
        chart.update('none');
      });
    } catch (e) { /* 무시 */ }
  }

  // 렌더링 완료 후 캡처 → 인쇄
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      captureCanvasesForPrint();
      _capturedByHandler = true;
      window.print();
    });
  });
}

/**
 * 모든 canvas를 흰 배경 PNG 이미지로 변환하여 DOM에 삽입
 */
function captureCanvasesForPrint() {
  // 기존 이미지 정리
  _printImgs.forEach(({ img }) => img.remove());
  _printImgs = [];

  document.querySelectorAll('canvas').forEach(canvas => {
    // 빈 캔버스 또는 보이지 않는 캔버스 건너뛰기
    if (canvas.width === 0 || canvas.height === 0) return;

    try {
      const off = document.createElement('canvas');
      off.width  = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext('2d');

      // 흰색 배경 그리기 (다크모드 → 인쇄용 흰 배경)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, off.width, off.height);
      // 원본 캔버스를 흰 배경 위에 합성
      ctx.drawImage(canvas, 0, 0);

      const img = document.createElement('img');
      img.src = off.toDataURL('image/png');
      img.className = 'print-canvas-img';
      canvas.parentNode.insertBefore(img, canvas.nextSibling);
      _printImgs.push({ img, canvas });
    } catch (e) { /* CORS 등 오류 무시 */ }
  });
}

/**
 * beforeprint 폴백:
 * window.print() 직접 호출 시 (위험성평가 등) 여기서 캡처
 * handlePrintWithCharts 경유 시에는 이미 캡처 완료 → 건너뛰기
 */
window.addEventListener('beforeprint', () => {
  document.body.classList.add('is-printing');
  if (!_capturedByHandler) {
    // 직접 window.print() 호출 시: Chart.js 색상 변경 + 캡처
    if (typeof Chart !== 'undefined') {
      Chart.defaults.color = '#1a1a1a';
      Chart.defaults.borderColor = '#9ca3af';
      _origDatalabelsColors.clear();
      _origChartDPRs.clear();
      try {
        Object.values(Chart.instances).forEach(chart => {
          const dl = chart.config?.options?.plugins?.datalabels;
          if (dl) {
            _origDatalabelsColors.set(chart.id, dl.color);
            dl.color = '#1a1a1a';
          }
          _origChartDPRs.set(chart.id, chart.currentDevicePixelRatio);
          chart.options.devicePixelRatio = 3;
          chart.update('none');
        });
      } catch (e) { /* 무시 */ }
    }
    captureCanvasesForPrint();
  }
});

window.addEventListener('afterprint', () => {
  document.body.classList.remove('is-printing');
  _capturedByHandler = false;

  // Chart.js 색상 + 해상도 복원 (현재 테마에 맞게)
  if (typeof Chart !== 'undefined') {
    const c = THEME_COLORS[getCurrentTheme()];
    Chart.defaults.color = c.chartText;
    Chart.defaults.borderColor = c.chartBorder;
    try {
      Object.values(Chart.instances).forEach(chart => {
        // 데이터라벨 색상 복원
        const dl = chart.config?.options?.plugins?.datalabels;
        if (dl && _origDatalabelsColors.has(chart.id)) {
          dl.color = _origDatalabelsColors.get(chart.id);
        }
        // 해상도 복원
        if (_origChartDPRs.has(chart.id)) {
          delete chart.options.devicePixelRatio;
        }
        chart.update('none');
      });
    } catch (e) { /* 무시 */ }
  }
  _origDatalabelsColors.clear();
  _origChartDPRs.clear();

  // 삽입한 이미지 제거
  _printImgs.forEach(({ img }) => img.remove());
  _printImgs = [];
});
