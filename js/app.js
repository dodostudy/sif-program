/**
 * 앱 초기화 - Chart.js 기본설정 + 공통 컴포넌트 로드
 */

document.addEventListener('DOMContentLoaded', () => {
  // Chart.js 글로벌 설정 (다크모드)
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.borderColor = '#374151';
    Chart.defaults.font.family = "'Pretendard', 'Noto Sans KR', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 16;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 24, 39, 0.95)';
    Chart.defaults.plugins.tooltip.titleColor = '#F9FAFB';
    Chart.defaults.plugins.tooltip.bodyColor = '#D1D5DB';
    Chart.defaults.plugins.tooltip.borderColor = '#374151';
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

  // Chart.js 색상 + 해상도 복원
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.borderColor = '#374151';
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
