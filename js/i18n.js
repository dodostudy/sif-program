/**
 * I18n - 다국어 스텁 (영문 모드 종료, 2026-09)
 *
 * 영어 모드는 운영상 필요가 없어져 폐기했다(번역 데이터 `data/i18n/`, 번역 파이프라인
 * `scripts/i18n_*.py` 함께 삭제). 다만 `I18n.t()` / `I18n.tCat()` / `I18n.cases()` 호출이
 * 6개 페이지 60여 곳에 흩어져 있어, 호출부를 건드리지 않고 이 파일만 패스스루로 남긴다.
 *  · t(ko)          → 한글 원문 그대로
 *  · tCat(col, val) → 값 그대로 (집계·필터는 원래도 한글 canonical 값을 쓴다)
 *  · isEn           → 항상 false
 * 다국어를 다시 도입한다면 이 파일을 복원하는 것으로 시작한다 (git 이력 참조).
 */
const I18n = {
  lang: 'ko',
  ready: Promise.resolve(),

  get isEn() { return false; },

  init() { return this.ready; },

  /** UI 문구 */
  t(ko) { return ko; },

  /** 범주형 값 (공종/기인물/재해형태 등) */
  tCat(column, value) { return value; },

  /** 자유서술 (재해개요/유발요인/감소대책) */
  tText(id, column, value) { return value; },

  /** DB 레코드 오버레이 — 한글 단일 소스이므로 할 일 없음 */
  overlayDb() {},

  /** "123건" */
  cases(n) { return `${n}건`; },

  setLang() {},
  translateDOM() {},
  refresh() {},
  installAutoTranslate() {},
};
