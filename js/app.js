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

window.addEventListener('beforeprint', () => {
  document.body.classList.add('is-printing');

  // 1) Chart.js 축 라벨/범례 텍스트를 인쇄용 어두운 색으로 변경
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#1f2937';
    Chart.defaults.borderColor = '#9ca3af';
    try {
      Object.values(Chart.instances).forEach(chart => chart.update('none'));
    } catch (e) { /* 무시 */ }
  }

  // 2) 각 canvas를 오프스크린 canvas에 흰 배경으로 합성 → <img> 로 변환
  _printImgs = [];
  document.querySelectorAll('canvas').forEach(canvas => {
    if (!canvas.offsetParent && !document.body.classList.contains('is-printing')) return;
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
      Object.values(Chart.instances).forEach(chart => chart.update('none'));
    } catch (e) { /* 무시 */ }
  }

  // 삽입한 이미지 제거
  _printImgs.forEach(({ img }) => img.remove());
  _printImgs = [];
});
