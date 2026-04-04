/**
 * MultiSelect - 체크박스 기반 멀티셀렉트 드롭다운 컴포넌트
 */

// 전역: 열려있는 드롭다운 관리 (동시에 하나만 열림)
const _msRegistry = [];

document.addEventListener('click', (e) => {
  _msRegistry.forEach(ms => {
    if (ms._container && !ms._container.contains(e.target)) {
      ms.close();
    }
  });
});

class MultiSelect {
  /**
   * @param {Object} config
   * @param {string}   config.containerId - 컨테이너 div ID
   * @param {string}   config.placeholder - 미선택 시 표시 텍스트
   * @param {Function} config.onChange     - 선택 변경 콜백 (values: string[] | null)
   * @param {boolean}  config.showCounts   - 옵션별 건수 표시 여부
   */
  constructor({ containerId, placeholder = '전체', onChange = () => {}, showCounts = false }) {
    this._containerId = containerId;
    this._placeholder = placeholder;
    this._onChange = onChange;
    this._showCounts = showCounts;
    this._options = [];
    this._selected = new Set();
    this._isOpen = false;
    this._searchText = '';

    this._container = document.getElementById(containerId);
    if (!this._container) return;

    this._render();
    _msRegistry.push(this);
  }

  _render() {
    this._container.classList.add('ms-dropdown');
    this._container.innerHTML = `
      <button type="button" class="ms-trigger">
        <span class="ms-trigger-text">${this._placeholder}</span>
        <svg class="ms-trigger-arrow" viewBox="0 0 20 20" fill="none">
          <path stroke="#6b7280" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 8l4 4 4-4"/>
        </svg>
      </button>
      <div class="ms-panel hidden">
        <div class="ms-search hidden">
          <input type="text" class="ms-search-input" placeholder="검색...">
        </div>
        <div class="ms-options"></div>
        <div class="ms-actions">
          <button type="button" class="ms-btn-all">전체선택</button>
          <button type="button" class="ms-btn-clear">선택해제</button>
        </div>
      </div>
    `;

    this._trigger = this._container.querySelector('.ms-trigger');
    this._triggerText = this._container.querySelector('.ms-trigger-text');
    this._panel = this._container.querySelector('.ms-panel');
    this._searchWrap = this._container.querySelector('.ms-search');
    this._searchInput = this._container.querySelector('.ms-search-input');
    this._optionsWrap = this._container.querySelector('.ms-options');
    this._btnAll = this._container.querySelector('.ms-btn-all');
    this._btnClear = this._container.querySelector('.ms-btn-clear');

    // 트리거 클릭
    this._trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._isOpen) {
        this.close();
      } else {
        this.open();
      }
    });

    // 검색 입력
    this._searchInput.addEventListener('input', (e) => {
      this._searchText = e.target.value.toLowerCase();
      this._renderOptions();
    });
    this._searchInput.addEventListener('click', (e) => e.stopPropagation());

    // 전체선택
    this._btnAll.addEventListener('click', (e) => {
      e.stopPropagation();
      // 검색 중이면 검색 결과만 선택
      const visibleOptions = this._getVisibleOptions();
      visibleOptions.forEach(opt => this._selected.add(opt.value));
      this._renderOptions();
      this._updateTrigger();
      this._fireChange();
    });

    // 선택해제
    this._btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._searchText) {
        // 검색 중이면 검색 결과만 해제
        const visibleOptions = this._getVisibleOptions();
        visibleOptions.forEach(opt => this._selected.delete(opt.value));
      } else {
        this._selected.clear();
      }
      this._renderOptions();
      this._updateTrigger();
      this._fireChange();
    });

    // 패널 내부 클릭 전파 차단
    this._panel.addEventListener('click', (e) => e.stopPropagation());
  }

  _getVisibleOptions() {
    if (!this._searchText) return this._options;
    return this._options.filter(opt =>
      opt.label.toLowerCase().includes(this._searchText)
    );
  }

  _renderOptions() {
    const visible = this._getVisibleOptions();

    if (visible.length === 0) {
      this._optionsWrap.innerHTML = '<div class="ms-empty">옵션 없음</div>';
      return;
    }

    this._optionsWrap.innerHTML = visible.map(opt => {
      const checked = this._selected.has(opt.value) ? 'checked' : '';
      const countHtml = (this._showCounts && opt.count != null)
        ? `<span class="ms-option-count">(${opt.count}건)</span>`
        : '';
      return `
        <label class="ms-option">
          <input type="checkbox" value="${this._escHtml(opt.value)}" ${checked}>
          <span class="ms-option-label">${this._escHtml(opt.label)}</span>
          ${countHtml}
        </label>
      `;
    }).join('');

    // 체크박스 이벤트
    this._optionsWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) {
          this._selected.add(e.target.value);
        } else {
          this._selected.delete(e.target.value);
        }
        this._updateTrigger();
        this._fireChange();
      });
    });
  }

  _updateTrigger() {
    const size = this._selected.size;
    if (size === 0) {
      this._triggerText.textContent = this._placeholder;
      this._trigger.classList.remove('has-selection');
    } else if (size === 1) {
      const val = [...this._selected][0];
      const opt = this._options.find(o => o.value === val);
      this._triggerText.textContent = opt ? opt.label : val;
      this._trigger.classList.add('has-selection');
    } else {
      this._triggerText.textContent = `${size}개 선택`;
      this._trigger.classList.add('has-selection');
    }
  }

  _fireChange() {
    const values = this._selected.size > 0 ? [...this._selected] : null;
    this._onChange(values);
  }

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  open() {
    // 다른 열린 드롭다운 닫기
    _msRegistry.forEach(ms => {
      if (ms !== this) ms.close();
    });
    this._panel.classList.remove('hidden');
    this._trigger.classList.add('active');
    this._isOpen = true;

    // 검색 초기화
    this._searchText = '';
    this._searchInput.value = '';
    this._renderOptions();

    // 옵션 10개 이상이면 검색 표시
    if (this._options.length >= 10) {
      this._searchWrap.classList.remove('hidden');
      this._searchInput.focus();
    } else {
      this._searchWrap.classList.add('hidden');
    }
  }

  close() {
    this._panel.classList.add('hidden');
    this._trigger.classList.remove('active');
    this._isOpen = false;
  }

  /**
   * 옵션 목록 설정
   * @param {Array<{value: string, label: string, count?: number}>} options
   */
  setOptions(options) {
    this._options = options || [];

    // 기존 선택값 중 새 옵션에 없는 것 제거
    const validValues = new Set(this._options.map(o => o.value));
    const removed = [];
    this._selected.forEach(v => {
      if (!validValues.has(v)) {
        removed.push(v);
      }
    });
    removed.forEach(v => this._selected.delete(v));

    this._renderOptions();
    this._updateTrigger();

    // 옵션이 없으면 트리거 비활성화
    if (this._options.length === 0) {
      this._trigger.disabled = true;
      this._trigger.classList.add('disabled');
    } else {
      this._trigger.disabled = false;
      this._trigger.classList.remove('disabled');
    }

    // 선택값이 변경되었으면 콜백 호출
    if (removed.length > 0) {
      this._fireChange();
    }
  }

  /** 현재 선택된 값 배열 반환 (없으면 null) */
  getValues() {
    return this._selected.size > 0 ? [...this._selected] : null;
  }

  /** 프로그래밍 방식으로 선택 설정 (차트 클릭 등) */
  setValues(values) {
    this._selected.clear();
    if (values && values.length > 0) {
      values.forEach(v => this._selected.add(v));
    }
    this._renderOptions();
    this._updateTrigger();
    this._fireChange();
  }

  /** 전체 선택 해제 (콜백 호출하지 않음 — reset용) */
  clear() {
    this._selected.clear();
    this._renderOptions();
    this._updateTrigger();
  }

  /** 전체 선택 해제 + 콜백 호출 */
  clearAndNotify() {
    this._selected.clear();
    this._renderOptions();
    this._updateTrigger();
    this._fireChange();
  }
}
