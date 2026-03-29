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
    return this.loadJSON(this._basePath('/data/db.json'));
  },

  async loadDropdownRef() {
    return this.loadJSON(this._basePath('/data/dropdown-ref.json'));
  },

  async loadCSVFile(filename) {
    return this.loadCSV(this._basePath(`/data/csv/${filename}`));
  },

  _basePath(path) {
    // pages/ 하위에서 호출 시 상대경로 보정
    const depth = window.location.pathname.split('/').filter(Boolean).length;
    if (depth > 1 || window.location.pathname.includes('/pages/')) {
      return '..' + path;
    }
    return '.' + path;
  },

  clearCache() {
    this._cache = {};
  }
};
