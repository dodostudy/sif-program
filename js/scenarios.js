/**
 * Scenarios — 기인물별 재해 시나리오 조회
 *
 * data/scenarios.json 은 시나리오 이름과 사례번호만 담는다.
 * 건수·비중·핵심대책은 화면에 걸린 필터(공종·발전소공정 등)에 맞춰 여기서 그때그때 센다.
 * 필터를 걸면 해당하는 사례가 없는 시나리오는 빠지고, 남은 것의 비중은 다시 계산된다.
 *
 * 분류 기준·절차·검증: scripts/docs/재해시나리오_분류방법론.html
 * 규칙 원본:          scripts/mapping/scenario_rules.py
 */
const Scenarios = {
  _raw: null,

  async load() {
    if (!this._raw) this._raw = await DataLoader.loadScenarios();
    return this._raw;
  },

  /** 이 기인물에 정의된 시나리오가 있는가 */
  has(cause) {
    return !!(this._raw && this._raw['기인물'][cause]);
  },

  meta() {
    const r = this._raw || {};
    return { 생성일: r['생성일'], 배정해시: r['배정해시'], 시나리오수: r['시나리오수'], 기인물수: r['기인물수'] };
  },

  /**
   * 기인물 하나에 대한 재해형태 → 시나리오 목록.
   * @param {string} cause  기인물명
   * @param {Array}  rows   현재 화면의 필터링된 레코드 (전체를 주면 전체 기준)
   * @returns {Array} [{ 재해형태, 건수, 비중, 시나리오: [...] }]  둘 다 건수 많은 순
   */
  forCause(cause, rows) {
    const def = this._raw && this._raw['기인물'][cause];
    if (!def) return [];

    // 이 기인물의 사례만 골라 번호로 찾을 수 있게 해 둔다
    const byId = new Map();
    rows.forEach(r => { if (r['기인물'] === cause) byId.set(r['id'], r); });
    const total = byId.size;
    if (!total) return [];

    const out = [];
    def.forEach(form => {
      const scens = [];
      let formN = 0;
      form['시나리오'].forEach(s => {
        const hit = s['사례'].map(id => byId.get(id)).filter(Boolean);
        if (!hit.length) return;
        formN += hit.length;
        scens.push({
          이름: s['이름'],
          건수: hit.length,
          전체건수: s['사례'].length,
          사례: hit,
          대표: byId.get(s['대표']) || hit[0],
          대표교체: !byId.has(s['대표']),
          주요작업: this._top(hit, '작업명', 3),
          핵심대책: this._measures(hit, 3),
        });
      });
      if (!scens.length) return;
      scens.forEach(s => { s.재해형태내비중 = +(s.건수 / formN * 100).toFixed(1); });
      scens.sort((a, b) => b.건수 - a.건수);
      out.push({ 재해형태: form['재해형태'], 건수: formN, 비중: +(formN / total * 100).toFixed(1), 시나리오: scens });
    });
    out.sort((a, b) => b.건수 - a.건수);
    return out;
  },

  /**
   * 기인물 여럿을 한 번에 — 시나리오를 평평하게 펴서 건수 순으로 돌려준다.
   * 위험성평가 위저드처럼 기인물을 복수로 고를 수 있는 자리에서 쓴다.
   * @returns {Array} [{ 기인물, 재해형태, 이름, 건수, 사례, 대표, 핵심대책, 주요작업 }]
   */
  forCauses(causes, rows) {
    const out = [];
    causes.forEach(c => {
      this.forCause(c, rows).forEach(f => {
        f.시나리오.forEach(s => out.push({ ...s, 기인물: c, 재해형태: f.재해형태 }));
      });
    });
    out.sort((a, b) => b.건수 - a.건수);
    return out;
  },

  /** 기인물 요약 한 줄 — "떨어짐 12개 · 맞음 1개" */
  summary(forms) {
    return forms.map(f => `${f.재해형태} ${f.시나리오.length}개`).join(' · ');
  },

  _top(rows, col, n) {
    const c = {};
    rows.forEach(r => { const v = r[col]; if (v) c[v] = (c[v] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
  },

  /** 감소대책 문장을 세어 많은 순으로. 공단 원문 그대로라 표기가 제각각인 점은 감안할 것. */
  _measures(rows, n) {
    const c = {};
    rows.forEach(r => {
      String(r['위험성감소대책'] || '').split('\n').forEach(line => {
        const s = line.replace(/▶/g, '').trim();
        if (s) c[s] = (c[s] || 0) + 1;
      });
    });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
  },
};
