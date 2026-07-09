/**
 * DataLoader - JSON/CSV 데이터 로딩 + 캐시
 */
const DataLoader = {
  _cache: {},

  async loadJSON(path) {
    if (this._cache[path]) return this._cache[path];
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
    const data = await resp.json();
    this._cache[path] = data;
    return data;
  },

  async loadCSV(path) {
    if (this._cache[path]) return this._cache[path];
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
    const text = await resp.text();
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (result) => {
          this._cache[path] = result.data;
          resolve(result.data);
        },
        error: (err) => reject(err),
      });
    });
  },

  async loadDB() {
    const data = await this.loadJSON(this._basePath('/data/db.json'));
    // EN 모드: 서술 3개 컬럼(재해개요/유발요인/감소대책)을 영어로 오버레이
    if (typeof I18n !== 'undefined' && I18n.isEn && !this._dbOverlaid) {
      try {
        await I18n.init();
        I18n.overlayDb(data);
        this._dbOverlaid = true;
      } catch (e) { /* 무시 */ }
    }
    return data;
  },

  async loadDropdownRef() {
    return this.loadJSON(this._basePath('/data/dropdown-ref.json'));
  },

  async loadCSVFile(filename) {
    return this.loadCSV(this._basePath(`/data/csv/${filename}`));
  },

  _basePath(path) {
    // pages/ 하위에서 호출 시 상대경로 보정
    if (window.location.pathname.includes('/pages/')) {
      return '..' + path;
    }
    return '.' + path;
  },

  clearCache() {
    this._cache = {};
  }
};
