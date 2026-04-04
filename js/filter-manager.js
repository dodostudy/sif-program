/**
 * FilterManager - Observer 패턴 기반 필터 상태관리
 * Cascading filter 지원 (상위 변경 시 하위 자동 초기화)
 */
class FilterManager {
  constructor(filterKeys) {
    this.state = {};
    this.subscribers = {};
    this.downstreamMap = {};
    filterKeys.forEach(k => {
      this.state[k] = null;
      this.subscribers[k] = [];
    });
    this.subscribers['__data__'] = [];
  }

  setDownstream(key, downstreamKeys) {
    this.downstreamMap[key] = downstreamKeys;
  }

  set(key, value) {
    if (Array.isArray(value) && value.length === 0) {
      this.state[key] = null;
    } else {
      this.state[key] = value || null;
    }

    // 하위 필터 초기화
    if (this.downstreamMap[key]) {
      this.downstreamMap[key].forEach(dk => {
        this.state[dk] = null;
        this._notify(dk);
      });
    }

    this._notify(key);
    this._notify('__data__');
  }

  get(key) {
    return this.state[key];
  }

  getAll() {
    return { ...this.state };
  }

  subscribe(key, callback) {
    if (!this.subscribers[key]) this.subscribers[key] = [];
    this.subscribers[key].push(callback);
  }

  onDataChange(callback) {
    this.subscribe('__data__', callback);
  }

  _notify(key) {
    (this.subscribers[key] || []).forEach(cb => cb(this.state[key], this.state));
  }

  reset() {
    Object.keys(this.state).forEach(k => {
      this.state[k] = null;
      this._notify(k);
    });
    this._notify('__data__');
  }
}
