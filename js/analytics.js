/**
 * analytics.js — 파생 지표 집계 엔진
 *
 * 공단 전처리 산출물의 분석 테이블(T1~T6)을 정적 파일로 싣는 대신,
 * db.json에서 런타임에 같은 규칙으로 계산한다. 발전소공정(KOEN) 토글이나
 * 공종 필터가 걸리면 등급·순위·비율이 그 스코프 안에서 다시 나와야 하는데,
 * 전국 3,459건 기준으로 미리 계산된 값을 그대로 쓰면 토글과 어긋나기 때문이다.
 *
 * 모든 함수는 순수 함수이며, 입력은 filterDB()로 이미 걸러진 레코드 배열이다.
 * 전국 기준으로 호출했을 때 T1~T6과 값이 일치하는지는
 * scripts/test_analytics.mjs 가 회귀 검증한다.
 */

/* ────────────────────────────────────────────────────────────
   추락 높이
   ──────────────────────────────────────────────────────────── */

/**
 * 높이 구간. 첫 칸이 2m인 것은 산업안전보건기준에 관한 규칙상
 * 추락 방호조치 의무가 2m 이상에서 발생하기 때문 — "기준 미만인데도
 * 사망한 사례가 몇 건인가"를 바로 읽을 수 있게 한다.
 */
const HEIGHT_BANDS = [
  { key: '2m 미만', min: 0, max: 2 },
  { key: '2~5m', min: 2, max: 5 },
  { key: '5~10m', min: 5, max: 10 },
  { key: '10~20m', min: 10, max: 20 },
  { key: '20m 이상', min: 20, max: Infinity },
];

/** 높이 미상(재해개요에 높이 표기가 없는 사례) 구간 키 */
const HEIGHT_UNKNOWN = '높이 미상';

/** 추락고(m) → 구간 키. null이면 '높이 미상' */
function heightBand(h) {
  if (h == null || Number.isNaN(h)) return HEIGHT_UNKNOWN;
  const band = HEIGHT_BANDS.find(b => h >= b.min && h < b.max);
  return band ? band.key : HEIGHT_BANDS[HEIGHT_BANDS.length - 1].key;
}

/**
 * 떨어짐 사례만 남긴다.
 * 떨어짐이 아닌 사고에도 추락고_m 값이 있는 경우가 있으나(낙하물이 떨어진 높이,
 * 붕괴 높이 등) 사람이 떨어진 높이가 아니라 성격이 다르므로 제외한다.
 */
function fallRecords(data) {
  return data.filter(r => r['재해형태'] === '떨어짐');
}

/**
 * 구간별 집계.
 * @returns {{bands, total, known, unknown, median, max, min}}
 *   bands: [{key, count, pct}] — pct 분모는 높이가 확인된 건수(known)
 */
function fallHeightStats(data) {
  const fall = fallRecords(data);
  const counts = {};
  HEIGHT_BANDS.forEach(b => { counts[b.key] = 0; });
  counts[HEIGHT_UNKNOWN] = 0;

  const heights = [];
  fall.forEach(r => {
    const h = r['추락고_m'];
    counts[heightBand(h)]++;
    if (h != null) heights.push(h);
  });

  heights.sort((a, b) => a - b);
  const known = heights.length;
  const median = known
    ? (known % 2 ? heights[(known - 1) / 2] : (heights[known / 2 - 1] + heights[known / 2]) / 2)
    : null;

  return {
    bands: [
      ...HEIGHT_BANDS.map(b => ({
        key: b.key,
        count: counts[b.key],
        pct: known ? counts[b.key] / known * 100 : 0,
      })),
      { key: HEIGHT_UNKNOWN, count: counts[HEIGHT_UNKNOWN], pct: 0 },
    ],
    total: fall.length,
    known,
    unknown: counts[HEIGHT_UNKNOWN],
    median,
    max: known ? heights[known - 1] : null,
    min: known ? heights[0] : null,
  };
}

/** 구간 필터 — band가 null/'전체'면 전건 */
function filterByBand(data, band) {
  if (!band || band === '전체') return data;
  return data.filter(r => heightBand(r['추락고_m']) === band);
}

/**
 * 높이 히스토그램. 상한을 넘는 값은 마지막 칸에 몰아넣는다
 * (최대 97m라 그대로 그리면 오른쪽이 거의 비어 형태가 안 보인다).
 * @returns [{label, from, to, count}]
 */
function fallHeightHistogram(data, { binSize = 1, cap = 30 } = {}) {
  const bins = [];
  for (let x = 0; x < cap; x += binSize) {
    bins.push({ label: `${x}~${x + binSize}m`, from: x, to: x + binSize, count: 0 });
  }
  bins.push({ label: `${cap}m 초과`, from: cap, to: Infinity, count: 0 });

  fallRecords(data).forEach(r => {
    const h = r['추락고_m'];
    if (h == null) return;
    const idx = h >= cap ? bins.length - 1 : Math.min(Math.floor(h / binSize), bins.length - 2);
    bins[idx].count++;
  });
  return bins;
}

/**
 * 기인물 × 높이구간 교차표 (히트맵용).
 * "사다리는 5m 미만, 철골은 5~20m" 같은 기인물별 높이 성향을 한 장으로 보여준다.
 * @returns {{causes:[{key,total,cells:{[band]:number}}], bands:string[], max:number}}
 */
function heightByCause(data, topNCauses = 15) {
  const fall = fallRecords(data).filter(r => r['추락고_m'] != null);
  const map = {};
  fall.forEach(r => {
    const c = r['기인물'];
    if (!c) return;
    if (!map[c]) { map[c] = { key: c, total: 0, cells: {} }; HEIGHT_BANDS.forEach(b => { map[c].cells[b.key] = 0; }); }
    map[c].total++;
    map[c].cells[heightBand(r['추락고_m'])]++;
  });

  const causes = Object.values(map).sort((a, b) => b.total - a.total).slice(0, topNCauses);
  let max = 0;
  causes.forEach(c => HEIGHT_BANDS.forEach(b => { max = Math.max(max, c.cells[b.key]); }));
  return { causes, bands: HEIGHT_BANDS.map(b => b.key), max };
}

/* ────────────────────────────────────────────────────────────
   기인물 프로파일 · 마스터   (T1 / T6 대응)
   ──────────────────────────────────────────────────────────── */

/**
 * 기인물별 재해형태 분포와 프로파일 유형.
 * 1위 재해형태 비중 80% 이상이면 단일형, 50~80% 혼합형, 미만이면 분산형.
 * 분산형(굴착기 등)은 재해형태를 하나로 정할 수 없어 화면에서 분포로 보여줘야 한다.
 */
function causeProfile(data) {
  const map = {};
  data.forEach(r => {
    const c = r['기인물'], f = r['재해형태'];
    if (!c || !f) return;
    if (!map[c]) map[c] = { key: c, n: 0, 분류: r['기인물분류'], is12: !!r['12대기인물'], _f: {} };
    map[c].n++;
    map[c]._f[f] = (map[c]._f[f] || 0) + 1;
  });

  Object.values(map).forEach(m => {
    m.dist = Object.entries(m._f)
      .map(([재해형태, count]) => ({ 재해형태, count, pct: count / m.n * 100 }))
      .sort((a, b) => b.count - a.count);
    delete m._f;
    m.top = m.dist[0].재해형태;
    m.topPct = m.dist[0].pct;
    m.type = m.topPct >= 80 ? '단일형' : (m.topPct >= 50 ? '혼합형' : '분산형');
  });
  return map;
}

/**
 * 기인물 마스터 — 드롭다운·랭킹용. 건수 내림차순.
 * recentFrom 이후 건수를 따로 세는 이유: 누적 건수는 많아도 최근에 줄어든 기인물과
 * 최근 급증한 기인물을 구분해야 하기 때문(고소작업대가 대표적).
 */
function causeMaster(data, { recentFrom = 2019 } = {}) {
  const prof = causeProfile(data);
  const recent = {}, gz = {};
  data.forEach(r => {
    const c = r['기인물'];
    if (!c) return;
    if (r['발생연도'] >= recentFrom) recent[c] = (recent[c] || 0) + 1;
    if (!gz[c]) gz[c] = {};
    if (r['공종']) gz[c][r['공종']] = (gz[c][r['공종']] || 0) + 1;
  });

  return Object.values(prof).map(m => {
    const 주요공종 = Object.entries(gz[m.key] || {}).sort((a, b) => b[1] - a[1])[0];
    return {
      기인물: m.key,
      n: m.n,
      recentN: recent[m.key] || 0,
      is12: m.is12,
      분류: m.분류,
      주요공종: 주요공종 ? 주요공종[0] : null,
      type: m.type,
      top: m.top,
      topPct: m.topPct,
      label: `${m.key} (${m.n}건${m.is12 ? ' ·12대' : ''})`,
    };
  }).sort((a, b) => b.n - a.n || b.recentN - a.recentN);
}

/* ────────────────────────────────────────────────────────────
   공종별 기인물 후보 · 고위험 조합   (T2 / T3 대응)
   ──────────────────────────────────────────────────────────── */

/**
 * 공종 안에서 기인물 순위와 누적 비율.
 * cumCut(기본 80%)까지가 "주요 기인물" — 그 아래는 접어도 되는 꼬리다.
 */
function gongjongCandidates(data, 공종, { cumCut = 80 } = {}) {
  const scope = 공종 ? data.filter(r => r['공종'] === 공종) : data;
  const counts = {};
  scope.forEach(r => { if (r['기인물']) counts[r['기인물']] = (counts[r['기인물']] || 0) + 1; });

  let cum = 0;
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([기인물, count], i) => {
      const pct = count / scope.length * 100;
      cum += pct;
      return { rank: i + 1, 기인물, count, pct, cum };
    });
  const majorCut = rows.findIndex(r => r.cum >= cumCut);
  return { rows, total: scope.length, majorCut: majorCut < 0 ? rows.length : majorCut + 1 };
}

/**
 * 공종 × 기인물 × 재해형태 조합의 빈도와 위험 등급.
 *
 *  · 등급 — 누적 비중 50%까지 A, 80%까지 B, 나머지 C.
 *    A만 관리해도 사망의 절반을 덮는다는 뜻이라 우선순위표로 바로 쓸 수 있다.
 *  · 표준화잔차 — 빈도만 보면 큰 공종이 항상 위에 온다. 공종 크기를 감안해
 *    "이 공종에서 유별나게 많은가"를 보는 지표. 기대빈도 = 행합×열합/N,
 *    잔차 = (관측−기대)/√기대. 3 이상이면 통계적으로 과다한 조합.
 *    표본이 작으면 불안정하므로 minForResid 미만 스코프에서는 계산하지 않는다.
 */
function riskCombos(data, { minForResid = 100 } = {}) {
  const N = data.length;
  if (!N) return [];

  // 공종 × 기인물 교차표 → 표준화잔차
  const rowSum = {}, colSum = {}, obs = {};
  data.forEach(r => {
    const g = r['공종'], c = r['기인물'];
    if (!g || !c) return;
    rowSum[g] = (rowSum[g] || 0) + 1;
    colSum[c] = (colSum[c] || 0) + 1;
    const k = g + '|||' + c;
    obs[k] = (obs[k] || 0) + 1;
  });
  const gcTotal = Object.values(obs).reduce((s, v) => s + v, 0);
  const resid = {};
  if (gcTotal >= minForResid) {
    Object.keys(obs).forEach(k => {
      const [g, c] = k.split('|||');
      const exp = rowSum[g] * colSum[c] / gcTotal;
      resid[k] = exp > 0 ? (obs[k] - exp) / Math.sqrt(exp) : 0;
    });
  }

  const combo = {};
  data.forEach(r => {
    const g = r['공종'], c = r['기인물'], f = r['재해형태'];
    if (!g || !c || !f) return;
    const k = g + '|||' + c + '|||' + f;
    if (!combo[k]) combo[k] = { 공종: g, 기인물: c, 재해형태: f, count: 0 };
    combo[k].count++;
  });

  // 누적은 반올림하지 않은 비율로 계산하고 표시할 때만 소수 1자리로 줄인다.
  // 참조 구현(T3)은 비율을 2자리로 반올림한 뒤 누적했는데, 조합이 수백 개라
  // 오차가 쌓여 스코프에 따라 최종 누적이 101%로 나온다(발전소공정 토글 시 실측).
  // 화면에 그대로 보이는 값이라 정확한 쪽을 택했다. 그 결과 등급 경계에서 1개가
  // 갈리지만, 경계는 어차피 동점 무리를 관통하므로 개별 배정은 임의값이다.
  // 잔차는 표시값(소수 1자리) 기준으로 특이조합을 판정한다 —
  // "표시된 잔차가 3.0인데 특이조합이 아닌" 모순을 피하기 위해서다.
  // 동점 조합의 순서가 실행마다 달라지면 경계(50%/80%)를 가로지르는 조합의 등급이
  // 흔들린다. 이름순 2차 정렬로 결과를 결정론적으로 고정한다.
  // (경계가 동점 무리를 관통하면 그 안에서 누가 A이고 누가 B인지는 어차피 임의다 —
  //  등급별 개수는 같고 개별 배정만 갈린다.)
  let cum = 0;
  return Object.values(combo)
    .sort((a, b) => b.count - a.count
      || a.공종.localeCompare(b.공종, 'ko')
      || a.기인물.localeCompare(b.기인물, 'ko')
      || a.재해형태.localeCompare(b.재해형태, 'ko'))
    .map((x, i) => {
      const pct = x.count / N * 100;
      cum += pct;
      const cumR = Math.round(cum * 10) / 10;
      const rk = x.공종 + '|||' + x.기인물;
      const r = rk in resid ? Math.round(resid[rk] * 10) / 10 : null;
      return {
        rank: i + 1, ...x, pct, cum: cumR,
        grade: cumR <= 50 ? 'A' : (cumR <= 80 ? 'B' : 'C'),
        resid: r,
        unusual: r != null && r >= 3,
      };
    });
}

/** 특정 조합의 등급을 빠르게 찾기 위한 인덱스 */
function comboGradeIndex(combos) {
  const idx = {};
  combos.forEach(c => { idx[c.공종 + '|||' + c.기인물 + '|||' + c.재해형태] = c; });
  return {
    get(공종, 기인물, 재해형태) { return idx[공종 + '|||' + 기인물 + '|||' + 재해형태] || null; },
  };
}

/* ────────────────────────────────────────────────────────────
   대표사례 · 감소대책   (T4 / T4m / T5 대응)
   ──────────────────────────────────────────────────────────── */

/**
 * 대표사례 — 기인물×재해형태 칸 안에서 문장 군집의 중심(medoid)으로 뽑아
 * db.json에 대표사례여부로 실려 있다. 한 칸에 188건이 몰리는 경우가 있어
 * 전건을 보여주면 읽히지 않으므로, 상황이 다른 하위유형별 1건씩만 노출한다.
 * 하위유형 구성원이 많은 순으로 정렬한다.
 */
function representativeCases(data, { limit = 5 } = {}) {
  const size = {};
  data.forEach(r => {
    const k = r['기인물'] + '|||' + r['재해형태'] + '|||' + r['하위유형번호'];
    size[k] = (size[k] || 0) + 1;
  });
  return data
    .filter(r => r['대표사례여부'])
    .map(r => ({ ...r, _n: size[r['기인물'] + '|||' + r['재해형태'] + '|||' + r['하위유형번호']] || 1 }))
    .sort((a, b) => b._n - a._n)
    .slice(0, limit);
}

/** 같은 하위유형에 속한 사례들 (대표사례 카드의 "유사 사례 N건") */
function similarCases(data, rec) {
  return data.filter(r =>
    r['기인물'] === rec['기인물'] &&
    r['재해형태'] === rec['재해형태'] &&
    r['하위유형번호'] === rec['하위유형번호']);
}

/**
 * 감소대책 문장 빈도 Top-N.
 * 원본은 한 셀에 ▶로 구분된 여러 항목이 들어 있어 문장 단위로 쪼갠다.
 * 표기만 다른 같은 뜻의 문장이 많아(고유 3,149개 중 2,335개가 1회) 정확일치
 * 집계는 근사값이다 — 표준 대책 목록 작성은 별도 단계.
 */
function measureTopN(data, n = 5) {
  const counts = {};
  data.forEach(r => {
    (r['위험성감소대책'] || '').split(/\n|▶/).forEach(s => {
      const t = s.trim();
      if (t.length > 5) counts[t] = (counts[t] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([문장, count]) => ({ 문장, count }));
}

/* ────────────────────────────────────────────────────────────
   발생 시기
   ──────────────────────────────────────────────────────────── */

/**
 * 연도/월/계절/혹서기 집계.
 * 발생연도는 재해개요 원문 표기에서 뽑은 값이라 2013~2015(38건)·2024(1건)처럼
 * 집계 대상이 아닌 해가 소량 섞여 있다. from~to 밖은 outOfRange로 따로 센다.
 */
function timeSeries(data, key = '발생연도', { from = 2016, to = 2023 } = {}) {
  const counts = {};
  let outOfRange = 0;
  data.forEach(r => {
    const v = r[key];
    if (v == null) return;
    if (key === '발생연도' && (v < from || v > to)) { outOfRange++; return; }
    counts[v] = (counts[v] || 0) + 1;
  });
  const rows = Object.entries(counts)
    .map(([k, count]) => ({ key: key === '발생연도' || key === '발생월' ? Number(k) : k, count }))
    .sort((a, b) => (typeof a.key === 'number' ? a.key - b.key : String(a.key).localeCompare(b.key)));
  return { rows, outOfRange, total: data.length };
}
