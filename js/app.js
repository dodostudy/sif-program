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
   인쇄 / PDF 지원: canvas → 흰 배경 이미지 변환
   ===================================================== */
let _printImgs = [];
// 인쇄 전 각 차트의 원래 datalabels 색상 보존용
let _origDatalabelsColors = new Map();

/**
 * 인쇄 버튼 핸들러:
 * 차트 색상을 먼저 인쇄용으로 변경 → 렌더링 완료 후 window.print()
 * (beforeprint에서 바로 캡처하면 첫 번째 클릭 시 차트가 아직 업데이트 안 된 상태로 캡처됨)
 */
function handlePrintWithCharts() {
  if (typeof Chart !== 'undefined') {
    // 축/범례 레이블을 인쇄용 어두운 색으로
    Chart.defaults.color = '#1a1a1a';
    Chart.defaults.borderColor = '#9ca3af';

    _origDatalabelsColors.clear();
    try {
      Object.values(Chart.instances).forEach(chart => {
        const dl = chart.config?.options?.plugins?.datalabels;
        if (dl) {
          // 원래 색상 저장 후 검은색으로 변경
          // (도넛 차트 등에서 '#fff'이면 흰 배경에 안 보임)
          _origDatalabelsColors.set(chart.id, dl.color);
          dl.color = '#1a1a1a';
        }
        // 'none': 애니메이션 없이 즉시 재렌더링 (기본 update()는 1000ms 애니메이션이라
        // setTimeout 150ms 안에 렌더링이 완료되지 않아 첫 번째 클릭 시 차트 누락)
        chart.update('none');
      });
    } catch (e) { /* 무시 */ }
  }
  // 즉시 렌더링된 캔버스를 다음 2프레임에서 캡처하도록 인쇄 실행
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}

window.addEventListener('beforeprint', () => {
  document.body.classList.add('is-printing');

  // canvas → 흰 배경 합성 이미지로 변환
  _printImgs = [];
  document.querySelectorAll('canvas').forEach(canvas => {
    if (canvas.width === 0 || canvas.height === 0) return;
    try {
      const off = document.createElement('canvas');
      off.width  = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, off.width, off.height);
      ctx.drawImage(canvas, 0, 0);

      const img = document.createElement('img');
      img.src = off.toDataURL('image/png');
      img.className = 'print-canvas-img';
      canvas.parentNode.insertBefore(img, canvas.nextSibling);
      _printImgs.push({ img, canvas });
    } catch (e) { /* CORS 등 오류 무시 */ }
  });
});

window.addEventListener('afterprint', () => {
  document.body.classList.remove('is-printing');

  // Chart.js 색상 복원
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.borderColor = '#374151';
    try {
      Object.values(Chart.instances).forEach(chart => {
        const dl = chart.config?.options?.plugins?.datalabels;
        if (dl && _origDatalabelsColors.has(chart.id)) {
          dl.color = _origDatalabelsColors.get(chart.id);
        }
        chart.update('none');
      });
    } catch (e) { /* 무시 */ }
  }
  _origDatalabelsColors.clear();

  // 삽입한 이미지 제거
  _printImgs.forEach(({ img }) => img.remove());
  _printImgs = [];
});
