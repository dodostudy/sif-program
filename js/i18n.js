/**
 * I18n - 한/영 다국어 런타임 (룩업 계층)
 *  - db.json은 한글 원본 단일 소스로 유지, 표시할 때만 영어로 치환
 *  - t(ko)          : UI 문구 (한글 원문을 키로 사용)
 *  - tCat(col, val) : 범주형 값 (공종/재해형태 등)
 *  - tText(id, col, val) : 자유서술 (재해개요/유발요인/감소대책)
 *  - cases(n)       : "N건" / "N cases"
 * 언어 전환은 localStorage 저장 후 새로고침(각 페이지가 로드→렌더 구조).
 */
const I18n = {
  lang: (typeof localStorage !== 'undefined' && localStorage.getItem('sif-lang')) || 'ko',
  _ui: {},
  _glossary: {},
  _dbText: {},
  ready: null,

  _path(p) {
    return (window.location.pathname.includes('/pages/') ? '..' : '.') + p;
  },

  init() {
    if (this.ready) return this.ready;
    if (this.lang !== 'en') {
      this.ready = Promise.resolve();
      return this.ready;
    }
    const load = (p) => fetch(this._path(p)).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
    this.ready = Promise.all([
      load('/data/i18n/ui_en.json'),
      load('/data/i18n/glossary_en.json'),
      load('/data/i18n/db_en.json'),
    ]).then(([ui, gl, db]) => {
      this._ui = ui || {};
      this._glossary = gl || {};
      this._dbText = db || {};
      this._loaded = true;
      this._flat = null; // 리소스 로드 완료 → 평면 사전 재생성 강제
    });
    return this.ready;
  },

  _loaded: false,

  get isEn() { return this.lang === 'en'; },

  /** UI 문구: 한글 원문(ko)을 키이자 fallback으로 사용 */
  t(ko) {
    if (this.lang !== 'en') return ko;
    return (this._ui[ko] != null && this._ui[ko] !== '') ? this._ui[ko] : ko;
  },

  /** 범주형 값 치환 (집계/필터는 항상 한글 canonical, 표시할 때만 호출) */
  tCat(column, value) {
    if (this.lang !== 'en' || value == null) return value;
    const col = this._glossary[column];
    return (col && col[value] != null) ? col[value] : value;
  },

  /** 자유서술 치환 (id 매핑) */
  tText(id, column, value) {
    if (this.lang !== 'en' || id == null) return value;
    const rec = this._dbText[id];
    return (rec && rec[column] != null && rec[column] !== '') ? rec[column] : value;
  },

  /** DB 레코드 배열에 서술 3개 컬럼 영어 오버레이 (EN일 때, 로드 직후 1회)
      범주형 컬럼은 필터 키로 쓰이므로 건드리지 않는다. */
  overlayDb(records) {
    if (this.lang !== 'en' || !this._loaded || !Array.isArray(records)) return;
    const cols = ['재해개요', '재해유발요인', '위험성감소대책'];
    for (const r of records) {
      const t = this._dbText[r.id];
      if (!t) continue;
      for (const c of cols) {
        if (t[c]) r[c] = t[c];
      }
    }
  },

  /** "123건" / "123 cases" */
  cases(n) {
    return this.lang === 'en' ? `${n} cases` : `${n}건`;
  },

  setLang(lang) {
    if (lang !== 'ko' && lang !== 'en') return;
    localStorage.setItem('sif-lang', lang);
    window.location.reload();
  },

  /* ── DOM 텍스트 일괄 치환 (정적 HTML/표/드롭다운용) ──
     _ui + 범주 용어집을 평면화한 사전으로, 텍스트 노드의 한글 원문을
     영어로 바꾼다. 차트(canvas)·자유서술은 대상 아님. 여러 번 호출해도 안전. */
  _flat: null,
  _stripNum(s) { return s.replace(/^\d+(\.\d+)*\.?\s*/, ''); },

  _buildFlat() {
    if (this._flat) return this._flat;
    const flat = Object.assign({}, this._ui);
    for (const col of Object.keys(this._glossary || {})) {
      const m = this._glossary[col];
      for (const ko of Object.keys(m)) {
        const en = m[ko];
        if (en == null || en === '') continue;
        if (flat[ko] == null) flat[ko] = en;
        // 번호 접두어를 떼고 표시하는 경우(카드/히트맵 행 라벨) 대비
        const koShort = this._stripNum(ko);
        const enShort = this._stripNum(en);
        if (koShort !== ko && flat[koShort] == null) flat[koShort] = enShort;
      }
    }
    this._flat = flat;
    return flat;
  },

  translateDOM(root) {
    if (this.lang !== 'en' || !this._loaded) return;
    const dict = this._buildFlat();
    const el = root || document.body;
    if (!el) return;
    const SKIP = { SCRIPT: 1, STYLE: 1, CANVAS: 1, NOSCRIPT: 1 };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (SKIP[node.parentNode && node.parentNode.nodeName]) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
      const raw = node.nodeValue;
      const key = raw.trim();
      let en = dict[key];
      // 화살표/기호 접미가 붙은 라벨("기인물 ▼") 대응
      if (en == null) {
        const m = key.match(/^(.*\S)\s*([▼▲▾▸►◀☰⌄]+)$/);
        if (m && dict[m[1]] != null) { node.nodeValue = raw.replace(key, dict[m[1]] + ' ' + m[2]); continue; }
      }
      if (en != null && en !== key) {
        node.nodeValue = raw.replace(key, en);
      } else {
        const conv = this._numUnits(raw);
        if (conv !== raw) node.nodeValue = conv;
      }
    }

    // placeholder / title 속성 치환
    el.querySelectorAll('[placeholder]').forEach((inp) => {
      const p = inp.getAttribute('placeholder');
      if (p && dict[p.trim()] != null) inp.setAttribute('placeholder', dict[p.trim()]);
    });
    el.querySelectorAll('[title]').forEach((n) => {
      const p = n.getAttribute('title');
      if (!p) return;
      const key = p.trim();
      if (dict[key] != null) { n.setAttribute('title', dict[key]); return; }
      const conv = this._numUnits(p);
      if (conv !== p) n.setAttribute('title', conv);
    });
  },

  /** 숫자+단위 표기 변환: "123건"→"123 cases", "58개"→"58", "3위"→"#3", "1/258 페이지"→"1/258 pages" */
  _numUnits(raw) {
    if (!/[건개위]|페이지|^총|\s총/.test(raw)) return raw;
    return raw
      .replace(/(\d[\d,]*)\s*건/g, '$1 cases')
      .replace(/(\d[\d,]*)\s*개/g, '$1')
      .replace(/(\d+)\s*위/g, '#$1')
      .replace(/(\d[\d,]*)\s*페이지/g, '$1 pages')
      .replace(/(^|\s)총(\s+\d)/g, '$1Total$2');
  },

  /** EN이면 body 전체 재치환 (렌더 후 호출) */
  refresh() { this.translateDOM(document.body); },

  /* ── 자동 번역: 동적으로 추가되는 DOM을 감지해 재치환 ──
     페이지별 렌더 코드를 수정하지 않고도 표/드롭다운/차트 외 HTML을 커버.
     자기 자신의 텍스트 변경은 _translating 플래그로 무시. */
  _observer: null,
  _translating: false,
  _raf: 0,

  installAutoTranslate() {
    if (this.lang !== 'en' || this._observer || typeof MutationObserver === 'undefined') return;
    if (!document.body) return;
    const obs = new MutationObserver((muts) => {
      if (this._translating) return;
      for (const m of muts) {
        if (m.addedNodes.length || m.type === 'characterData') { this._schedule(); break; }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    this._observer = obs;
  },

  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._translating = true;
      try { this.translateDOM(document.body); } finally { this._translating = false; }
    });
  },
};

// 즉시 로드 시작(EN일 때 리소스 프리페치)
I18n.init();
