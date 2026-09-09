/**
 * ChartManager - Chart.js 인스턴스 라이프사이클 관리
 */
class ChartManager {
  constructor() {
    this.charts = {};
  }

  create(canvasId, config) {
    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.warn(`Canvas not found: ${canvasId}`);
      return null;
    }
    const ctx = canvas.getContext('2d');
    this.charts[canvasId] = new Chart(ctx, config);
    return this.charts[canvasId];
  }

  update(canvasId, newData, newLabels) {
    const chart = this.charts[canvasId];
    if (!chart) return;
    if (newLabels) chart.data.labels = newLabels;
    chart.data.datasets.forEach((ds, i) => {
      ds.data = Array.isArray(newData[0]) ? newData[i] : newData;
    });
    chart.update('active');
  }

  destroy(canvasId) {
    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
      delete this.charts[canvasId];
    }
  }

  destroyAll() {
    Object.keys(this.charts).forEach(id => this.destroy(id));
  }

  get(canvasId) {
    return this.charts[canvasId] || null;
  }
}

// 차트 색상 팔레트
const CHART_COLORS = {
  primary: [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
    '#E11D48', '#84CC16', '#0EA5E9', '#D946EF', '#FB923C',
    '#22D3EE', '#A855F7', '#34D399', '#F43F5E', '#FBBF24'
  ],
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  info: '#3B82F6',

  getColor(index) {
    return this.primary[index % this.primary.length];
  },

  getAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  },

  /**
   * heat 색 (저위험 → 고위험 빨강).
   * 저위험 끝은 테마 표면색으로 맞춘다 — 라이트=흰색→빨강 / 다크=어두운 표면→빨강.
   * 고정 색을 쓰면 라이트 테마에서 빈 칸·저빈도 칸이 회색 블록으로 보인다.
   */
  heatmapColor(value, min, max) {
    if (!value) return 'transparent';
    const isLight = typeof getCurrentTheme === 'function' && getCurrentTheme() === 'light';
    const [br, bg_, bb] = isLight ? [255, 255, 255] : [55, 65, 81];
    const ratio = Math.min((value - min) / (max - min || 1), 1);
    const r = Math.round(239 * ratio + br * (1 - ratio));
    const g = Math.round(68 * ratio + bg_ * (1 - ratio));
    const b = Math.round(68 * ratio + bb * (1 - ratio));
    return `rgba(${r},${g},${b},${0.3 + ratio * 0.7})`;
  }
};
