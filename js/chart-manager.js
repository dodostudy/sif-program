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

// 차트 색상 팔레트 — 테마별로 다르다.
// 다크: 기존 Tailwind 계열. 라이트: 흰 바탕용 에디토리얼(링크 파랑·코랄·머스터드·민트·잉크).
// primary/danger/… 는 getter 라 호출 시점의 테마 값을 돌려준다. 이미 그려진 차트는
// remapChart() 로 반대 테마 색으로 바꿔 준다(테마 토글 시 app.js 가 호출).
const CHART_COLORS = {
  _dark: {
    primary: [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
      '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
      '#E11D48', '#84CC16', '#0EA5E9', '#D946EF', '#FB923C',
      '#22D3EE', '#A855F7', '#34D399', '#F43F5E', '#FBBF24'
    ],
    danger: '#EF4444', warning: '#F59E0B', success: '#10B981', info: '#3B82F6',
    infoStrong: '#1D4ED8', mark12: '#8B5CF6', hot: '#F59E0B', hotStrong: '#D97706',
    cold: '#38BDF8', coldStrong: '#0284C7', dim: '#94A3B8', grid: '#1F2937',
    heatEnd: [239, 68, 68], heatBase: [55, 65, 81],
    season: { '봄': '#34D399', '여름': '#F59E0B', '가을': '#F97316', '겨울': '#38BDF8' },
  },
  _light: {
    primary: [
      '#1b61c9', '#aa2d00', '#2f7f4f', '#d9a441', '#5b4b8a',
      '#b03a5b', '#2f7f8f', '#e07b39', '#254fad', '#4b8a5c',
      '#8c2f39', '#9fb56b', '#5b7fa6', '#9c5c8f', '#fcab79',
      '#7fb3c9', '#7a4b9c', '#a8d8c4', '#d97a6a', '#f4d35e'
    ],
    danger: '#aa2d00', warning: '#d9a441', success: '#2f7f4f', info: '#1b61c9',
    infoStrong: '#1a3866', mark12: '#aa2d00', hot: '#d9a441', hotStrong: '#a26a00',
    cold: '#5b7fa6', coldStrong: '#254fad', dim: '#9297a0', grid: '#ececec',
    heatEnd: [170, 45, 0], heatBase: [255, 255, 255],
    season: { '봄': '#4b8a5c', '여름': '#d9a441', '가을': '#c2632a', '겨울': '#254fad' },
  },
  get _t() {
    const light = typeof getCurrentTheme === 'function' && getCurrentTheme() === 'light';
    return light ? this._light : this._dark;
  },
  get primary() { return this._t.primary; },
  get danger() { return this._t.danger; },
  get warning() { return this._t.warning; },
  get success() { return this._t.success; },
  get info() { return this._t.info; },
  get infoStrong() { return this._t.infoStrong; },
  get mark12() { return this._t.mark12; },
  get hot() { return this._t.hot; },
  get hotStrong() { return this._t.hotStrong; },
  get cold() { return this._t.cold; },
  get coldStrong() { return this._t.coldStrong; },
  get dim() { return this._t.dim; },
  get grid() { return this._t.grid; },
  get season() { return this._t.season; },

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
   * heat 색 (저위험 → 고위험). 저위험 끝은 테마 표면색 — 라이트=흰색→코랄 / 다크=어두운 표면→빨강.
   * 고정 색을 쓰면 라이트 테마에서 빈 칸·저빈도 칸이 회색 블록으로 보인다.
   */
  heatmapColor(value, min, max) {
    if (!value) return 'transparent';
    const t = this._t;
    const ratio = Math.min((value - min) / (max - min || 1), 1);
    const r = Math.round(t.heatEnd[0] * ratio + t.heatBase[0] * (1 - ratio));
    const g = Math.round(t.heatEnd[1] * ratio + t.heatBase[1] * (1 - ratio));
    const b = Math.round(t.heatEnd[2] * ratio + t.heatBase[2] * (1 - ratio));
    return `rgba(${r},${g},${b},${0.3 + ratio * 0.7})`;
  },

  /* ── 테마 전환: 그려진 차트의 색을 반대 테마 값으로 치환 ── */
  _pairs() {
    if (this._pairCache) return this._pairCache;
    const d = this._dark, l = this._light, map = {}, rgb = {};
    const add = (a, b) => {
      map[a.toLowerCase()] = b; map[b.toLowerCase()] = a;
      const key = h => `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`;
      rgb[key(a)] = b; rgb[key(b)] = a;
    };
    d.primary.forEach((c, i) => add(c, l.primary[i]));
    ['danger','warning','success','info','infoStrong','mark12','hot','hotStrong','cold','coldStrong','dim','grid']
      .forEach(k => add(d[k], l[k]));
    Object.keys(d.season).forEach(k => add(d.season[k], l.season[k]));
    return (this._pairCache = { map, rgb });
  },
  _swap(c) {
    if (typeof c !== 'string') return Array.isArray(c) ? c.map(x => this._swap(x)) : c;
    const { map, rgb } = this._pairs();
    const h = c.trim().toLowerCase();
    if (map[h]) return map[h];
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(h);
    if (m && rgb[`${m[1]},${m[2]},${m[3]}`]) {
      return m[4] === undefined ? rgb[`${m[1]},${m[2]},${m[3]}`] : this.getAlpha(rgb[`${m[1]},${m[2]},${m[3]}`], +m[4]);
    }
    return c;
  },
  remapChart(chart) {
    if (!chart || !chart.data) return;
    (chart.data.datasets || []).forEach(ds => {
      ['backgroundColor', 'borderColor', 'pointBackgroundColor', 'pointBorderColor', 'hoverBackgroundColor']
        .forEach(k => { if (ds[k] !== undefined && typeof ds[k] !== 'function') ds[k] = this._swap(ds[k]); });
    });
    const sc = (chart.options && chart.options.scales) || {};
    Object.values(sc).forEach(ax => { if (ax && ax.grid && typeof ax.grid.color === 'string') ax.grid.color = this._swap(ax.grid.color); });
  },
  /* 열지도 셀(data-heat="값|최대")도 테마에 맞춰 다시 칠한다 */
  repaintHeatCells(root = document) {
    root.querySelectorAll('[data-heat]').forEach(el => {
      const [v, m] = el.dataset.heat.split('|').map(Number);
      el.style.background = this.heatmapColor(v, 0, m);
    });
  }
};
