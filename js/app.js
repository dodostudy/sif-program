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
    chartText: '#41454d',
    chartBorder: '#e6e6e6',
    tooltipBg: 'rgba(255, 255, 255, 0.97)',
    tooltipTitle: '#181d26',
    tooltipBody: '#333840',
    tooltipBorder: '#dddddd',
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

  // 이미 생성된 차트 인스턴스도 업데이트 — 데이터셋 색을 반대 테마 팔레트로 바꾼 뒤 다시 그린다
  try {
    Object.values(Chart.instances).forEach(chart => {
      if (typeof CHART_COLORS !== 'undefined' && CHART_COLORS.remapChart) CHART_COLORS.remapChart(chart);
      chart.update('none');
    });
  } catch (e) { /* 무시 */ }
  if (typeof CHART_COLORS !== 'undefined' && CHART_COLORS.repaintHeatCells) {
    try { CHART_COLORS.repaintHeatCells(); } catch (e) { /* 무시 */ }
  }
  if (typeof CHART_COLORS !== 'undefined' && CHART_COLORS.repaintAccents) {
    try { CHART_COLORS.repaintAccents(); } catch (e) { /* 무시 */ }
  }
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
    color: () => (getCurrentTheme() === 'light' ? '#181d26' : '#E5E7EB'),
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

/**
 * 도넛 조각 라벨.
 *
 * 조각이 얇은데 "324건 / 9.4%" 2줄을 그대로 찍으면 라벨이 조각 폭을 넘어 이웃
 * 조각 위로 올라가 글자끼리 겹친다(부딪힘 접촉 5.1% · 무너짐 5.2% 구간에서 실측).
 * 비율 임계값만으로는 차트 크기에 따라 결과가 달라지므로, 그 조각이 라벨을 실제로
 * 담을 수 있는지를 **호 길이**로 판단해 단계적으로 줄인다.
 *   넉넉하면 건수+비율 2줄 → 좁으면 비율 1줄 → 아주 좁으면 생략(툴팁으로 확인)
 */
function donutDatalabels(opts = {}) {
  const { totalOverride = null, canvasId = null, cutout = 0.5,
          minTwoLine = 46, minOneLine = 30 } = opts;

  // 조각의 호 길이를 알려면 반지름이 필요한데, 라벨 문구는 차트가 그려지기 "전"에
  // 한 번 정해진다(그 시점엔 원호 반지름이 아직 0이라 조각 크기를 못 읽는다).
  // 캔버스 컨테이너는 높이가 고정돼 있으므로 여기서 미리 재 둔다 — 실측과 일치한다.
  // 캔버스 자체는 Chart.js가 크기를 잡기 전이라 기본값(150px)이므로, 높이가 지정된
  // 부모 컨테이너를 먼저 본다.
  let midRadius = null;
  if (canvasId) {
    const el = document.getElementById(canvasId);
    const h = el
      ? Math.max(
          el.parentElement ? el.parentElement.getBoundingClientRect().height : 0,
          el.getBoundingClientRect().height)
      : 0;
    if (h > 0) {
      const outer = h / 2;
      midRadius = (outer + outer * cutout) / 2;
    }
  }

  return {
    display: true,
    color: '#fff',
    // 밝은 조각(노랑·피치) 위에서는 흰 글자만으로는 읽히지 않는다 — 어두운 외곽선을 둔다
    textStrokeColor: 'rgba(17,24,39,.55)',
    textStrokeWidth: 2,
    font: { size: 10, weight: 'bold' },
    textAlign: 'center',
    // Chart.js는 함수형 옵션을 scriptable로 보고, 레이아웃 전에 불완전한 컨텍스트로
    // 한 번 호출한다. 거기서 예외가 나면 라벨이 통째로 안 그려지므로 전부 방어한다.
    formatter: (value, ctx) => {
      if (!value) return '';
      const di = (ctx && ctx.datasetIndex) || 0;
      const ds = (ctx && ctx.dataset)
        || (ctx && ctx.chart && ctx.chart.data && ctx.chart.data.datasets
            ? ctx.chart.data.datasets[di] : null);
      const total = totalOverride != null
        ? totalOverride
        : (ds && Array.isArray(ds.data) ? ds.data.reduce((a, b) => a + (+b || 0), 0) : 0);
      if (!total) return '';
      const pct = value / total * 100;
      const text = pct.toFixed(1);

      // 이 조각이 라벨을 담을 수 있는 폭(px). 반지름을 못 재면 비율로 보수적 판단.
      if (midRadius == null) return pct < 10 ? '' : `${value}건\n${text}%`;
      const room = 2 * Math.PI * midRadius * (pct / 100);
      if (room >= minTwoLine) return `${value}건\n${text}%`;
      if (room >= minOneLine) return `${text}%`;
      return '';
    },
  };
}

/**
 * 세로 막대 라벨 — 막대 위에 얹는다.
 * barDatalabels는 가로 막대(indexAxis:'y')용이라 세로에 쓰면 긴 막대의 라벨이
 * 막대 안쪽으로 뒤집혀 기준선·눈금과 겹친다. 세로 차트는 이 설정과 함께
 * y축에 여유(suggestedMax)를 줘서 라벨이 항상 위에 들어가게 한다.
 */
function verticalBarDatalabels(total, opts = {}) {
  const { canvasId = null, count = 0 } = opts;

  // 막대 하나에 배정된 가로 폭(px). 좁은 화면에서 "437건 (31.6%)"를 그대로 찍으면
  // 옆 막대의 라벨과 글자가 붙어버린다(모바일 390px에서 실측). 컨테이너 폭을
  // 막대 수로 나눠, 들어가는 만큼만 표시한다.
  let slot = null;
  if (canvasId && count > 0) {
    const el = document.getElementById(canvasId);
    const w = el ? Math.max(
      el.parentElement ? el.parentElement.getBoundingClientRect().width : 0,
      el.getBoundingClientRect().width) : 0;
    if (w > 0) slot = w / count;
  }

  return {
    display: true,
    anchor: 'end',
    align: 'end',
    offset: 2,
    clamp: true,
    clip: false,
    color: () => (getCurrentTheme() === 'light' ? '#181d26' : '#E5E7EB'),
    textStrokeColor: () => (getCurrentTheme() === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(17,24,39,0.9)'),
    textStrokeWidth: 3,
    font: { size: 10, weight: '600' },
    formatter: (value) => {
      if (!value) return '';
      const cnt = (typeof I18n !== 'undefined') ? I18n.cases(value) : `${value}건`;
      const pct = total ? (value / total * 100) : 0;
      const full = pct < 2 ? cnt : `${cnt} (${pct.toFixed(1)}%)`;
      if (slot == null) return full;
      if (slot >= 96) return full;      // 건수 + 비율
      if (slot >= 52) return cnt;       // 건수만
      return `${value}`;                // 숫자만
    },
  };
}

/** 막대 라벨이 잘리지 않도록 y축 상한에 여유를 준다 */
function headroom(values, ratio = 1.18) {
  const max = values.reduce((m, v) => Math.max(m, +v || 0), 0);
  return max ? Math.ceil(max * ratio) : undefined;
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
