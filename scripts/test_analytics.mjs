/**
 * analytics.js 회귀 테스트
 *
 * js/analytics.js 의 런타임 집계가 공단 전처리 산출물(T1~T6)과 같은 값을 내는지
 * 전국 스코프에서 대조한다. T-테이블을 정적 파일로 싣지 않고 런타임 계산으로
 * 대체했기 때문에, 이 테스트가 그 대체의 근거다.
 *
 * 실행: node scripts/test_analytics.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// analytics.js 는 브라우저 전역 스크립트라 그대로 평가해 심볼을 꺼낸다
const src = fs.readFileSync(path.join(ROOT, 'js/analytics.js'), 'utf8');
const EXPORTS = ['HEIGHT_BANDS', 'HEIGHT_UNKNOWN', 'heightBand', 'fallHeightStats', 'filterByBand',
  'fallHeightHistogram', 'heightByCause', 'causeProfile', 'causeMaster', 'gongjongCandidates',
  'riskCombos', 'comboGradeIndex', 'representativeCases', 'similarCases', 'measureTopN', 'timeSeries'];
const A = new Function(`${src}\nreturn {${EXPORTS.join(',')}};`)();

const db = read('data/db.json');
const T1 = read('new_data_260908/시스템탑재/T1_기인물프로파일.json');
const T2 = read('new_data_260908/시스템탑재/T2_공종기인물후보.json');
const T3 = read('new_data_260908/시스템탑재/T3_고위험조합.json');
const T4 = read('new_data_260908/시스템탑재/T4_대표사례.json');
const T6 = read('new_data_260908/시스템탑재/T6_기인물마스터_사망순.json');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `\n      기대 ${JSON.stringify(want)}\n      실제 ${JSON.stringify(got)}`}`);
  ok ? pass++ : fail++;
};
const near = (name, got, want, tol = 0.05) => {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` — 기대 ${want}, 실제 ${got}`}`);
  ok ? pass++ : fail++;
};

console.log(`\ndb.json ${db.length.toLocaleString()}건으로 검증\n`);

// ── 1. 추락 높이 (신규 지표 — T-테이블에 대응 없음, db.json 직접 대조)
console.log('[1] 추락 높이');
const fall = db.filter(r => r['재해형태'] === '떨어짐');
const st = A.fallHeightStats(db);
eq('떨어짐 건수', st.total, fall.length);
eq('높이 확인 건수', st.known, fall.filter(r => r['추락고_m'] != null).length);
eq('미상 건수', st.unknown, fall.filter(r => r['추락고_m'] == null).length);
eq('구간 합 = 떨어짐 전건', st.bands.reduce((s, b) => s + b.count, 0), st.total);
eq('구간 경계 배타성(2m는 2~5m로)', A.heightBand(2), '2~5m');
eq('구간 하한 포함(0m는 2m 미만)', A.heightBand(0), '2m 미만');
eq('상한 초과(97m는 20m 이상)', A.heightBand(97), '20m 이상');
eq('null은 미상', A.heightBand(null), A.HEIGHT_UNKNOWN);
near('중앙값', st.median, 6.0, 0.001);
// 떨어짐 외 사고의 추락고는 집계에서 빠져야 한다
const otherWithH = db.filter(r => r['재해형태'] !== '떨어짐' && r['추락고_m'] != null).length;
eq(`떨어짐 외 추락고 ${otherWithH}건 제외됨`, st.known, db.filter(r => r['재해형태'] === '떨어짐' && r['추락고_m'] != null).length);
// 구간 필터
const b25 = A.filterByBand(fall, '2~5m');
eq('구간 필터 건수 일치', b25.length, st.bands.find(b => b.key === '2~5m').count);
eq('구간 필터 전건 통과', A.filterByBand(fall, '전체').length, fall.length);
// 히스토그램
const hist = A.fallHeightHistogram(db);
eq('히스토그램 합 = 높이 확인 건수', hist.reduce((s, b) => s + b.count, 0), st.known);
// 기인물 × 구간
const hbc = A.heightByCause(db, 15);
eq('히트맵 기인물 수', hbc.causes.length, 15);
eq('히트맵 행 합 = 기인물 건수', hbc.causes.every(c => A.HEIGHT_BANDS.reduce((s, b) => s + c.cells[b.key], 0) === c.total), true);

// ── 2. 기인물 프로파일 (T1)
console.log('\n[2] 기인물 프로파일 ↔ T1');
const prof = A.causeProfile(db);
const t1Meta = {};
T1.forEach(r => { t1Meta[r['기인물']] = { n: r['기인물건수'], type: r['프로파일유형'], top: r['1위재해형태'], topPct: r['1위비율'] }; });
eq('기인물 종수', Object.keys(prof).length, Object.keys(t1Meta).length);
const typeCount = t => Object.values(prof).filter(p => p.type === t).length;
eq('단일형 20', typeCount('단일형'), 20);
eq('혼합형 14', typeCount('혼합형'), 14);
eq('분산형 23', typeCount('분산형'), 23);
const typeMismatch = Object.keys(t1Meta).filter(k => !prof[k] || prof[k].type !== t1Meta[k].type);
eq('전 기인물 유형 일치', typeMismatch, []);
const nMismatch = Object.keys(t1Meta).filter(k => prof[k].n !== t1Meta[k].n);
eq('전 기인물 건수 일치', nMismatch, []);
const pctMismatch = Object.keys(t1Meta).filter(k => Math.abs(prof[k].topPct - t1Meta[k].topPct) > 0.06);
eq('1위 비율 일치', pctMismatch, []);
// 분포 행 수 = T1 행 수
const distRows = Object.values(prof).reduce((s, p) => s + p.dist.length, 0);
eq('분포 행 수', distRows, T1.length);

// ── 3. 기인물 마스터 (T6)
console.log('\n[3] 기인물 마스터 ↔ T6');
const master = A.causeMaster(db);
eq('행 수', master.length, T6.length);
eq('1위 기인물', master[0].기인물, T6[0]['기인물']);
eq('1위 표시명', master[0].label, T6[0]['표시명']);
const t6 = {}; T6.forEach(r => { t6[r['기인물']] = r; });
eq('전 기인물 사망건수 일치', master.filter(m => m.n !== t6[m.기인물]['사망건수']).map(m => m.기인물), []);
eq('전 기인물 최근5년 일치', master.filter(m => m.recentN !== t6[m.기인물]['최근5년건수']).map(m => m.기인물), []);
eq('주요공종 일치', master.filter(m => (m.주요공종 || '').replace(/^\d+\.\s*/, '') !== t6[m.기인물]['주요공종']).map(m => m.기인물), []);

// ── 4. 공종별 기인물 후보 (T2)
console.log('\n[4] 공종별 기인물 후보 ↔ T2');
const gz = '1. 토공사';
const cand = A.gongjongCandidates(db, gz);
const t2gz = T2.filter(r => r['공종'] === gz).sort((a, b) => a['순위'] - b['순위']);
eq('토공사 후보 수', cand.rows.length, t2gz.length);
eq('토공사 1위', cand.rows[0].기인물, t2gz[0]['기인물']);
eq('토공사 1위 건수', cand.rows[0].count, t2gz[0]['건수']);
near('토공사 1위 비율', +cand.rows[0].pct.toFixed(1), t2gz[0]['공종내비율']);
near('토공사 3위 누적', +cand.rows[2].cum.toFixed(1), t2gz[2]['누적비율'], 0.15);
eq('전 공종 행 수 합', [...new Set(db.map(r => r['공종']))].reduce((s, g) => s + A.gongjongCandidates(db, g).rows.length, 0), T2.length);

// ── 5. 고위험 조합 (T3)
console.log('\n[5] 고위험 조합 ↔ T3');
const combos = A.riskCombos(db);
eq('조합 수', combos.length, T3.length);
const grade = g => combos.filter(c => c.grade === g).length;
// 등급 경계가 동점 무리를 관통하고 누적 계산 방식이 참조 구현과 달라(주석 참조)
// 경계에서 1개까지는 갈릴 수 있다. 개수가 그 이상 벌어지면 회귀다.
eq('A등급 44', grade('A'), 44);
eq('B등급 152±1', Math.abs(grade('B') - 152) <= 1, true);
eq('C등급 476±1', Math.abs(grade('C') - 476) <= 1, true);
eq('등급 합 = 조합 수', grade('A') + grade('B') + grade('C'), T3.length);
eq('전국 최종 누적 100%', combos[combos.length - 1].cum, 100);
eq('특이조합 223', combos.filter(c => c.unusual).length, 223);
eq('1위 조합', [combos[0].공종, combos[0].기인물, combos[0].재해형태, combos[0].count],
   [T3[0]['공종'], T3[0]['기인물'], T3[0]['재해형태'], T3[0]['건수']]);
near('1위 표준화잔차', combos[0].resid, T3[0]['공종기인물_표준화잔차'], 0.06);
// 동점 조합의 정렬 순서는 구현마다 다르므로 위치가 아니라 키로 대조한다
const t3idx = {};
T3.forEach(r => { t3idx[`${r['공종']}|||${r['기인물']}|||${r['재해형태']}`] = r; });
const residMismatch = combos.filter(c => {
  const t = t3idx[`${c.공종}|||${c.기인물}|||${c.재해형태}`];
  return !t || Math.abs(c.resid - t['공종기인물_표준화잔차']) > 0.06;
});
eq('전 조합 잔차 일치', residMismatch.map(c => `${c.공종}/${c.기인물}`), []);
const cntMismatch = combos.filter(c => t3idx[`${c.공종}|||${c.기인물}|||${c.재해형태}`]?.['건수'] !== c.count);
eq('전 조합 건수 일치', cntMismatch.map(c => `${c.공종}/${c.기인물}/${c.재해형태}`), []);
// 등급 경계(누적 50%/80%)가 동점 무리를 관통하면 그 안에서 누가 A이고 누가 B인지는
// 구현별 정렬 순서에 달린 임의값이다. 등급별 개수(위에서 확인)가 본질이고,
// 개별 불일치는 "같은 건수의 조합이 경계 양쪽에 걸쳐 있는 경우"에 한정돼야 한다.
const gradeMismatch = combos.filter(c => t3idx[`${c.공종}|||${c.기인물}|||${c.재해형태}`]?.['등급'] !== c.grade);
const notTie = gradeMismatch.filter(c => {
  const t3grade = t3idx[`${c.공종}|||${c.기인물}|||${c.재해형태}`]['등급'];
  return !combos.some(o => o.count === c.count && o.grade === t3grade);
});
eq('등급 불일치는 모두 경계 동점 조합', notTie.map(c => `${c.공종}/${c.기인물}/${c.재해형태}`), []);
eq('동점 무리 밖 등급은 전부 일치', gradeMismatch.length, gradeMismatch.filter(c => notTie.indexOf(c) < 0).length);
// 결정론 — 같은 입력이면 항상 같은 순서·등급
eq('재실행 결과 동일', JSON.stringify(A.riskCombos(db)), JSON.stringify(combos));
// 소표본 스코프에서는 잔차를 내지 않는다
const small = db.filter(r => r['공종'] === '9. 터널공사');
eq(`소표본(${small.length}건) 잔차 미계산`, A.riskCombos(small)[0].resid, null);
// 등급 인덱스
const idx = A.comboGradeIndex(combos);
eq('등급 조회', idx.get(T3[0]['공종'], T3[0]['기인물'], T3[0]['재해형태']).grade, 'A');

// ── 6. 대표사례 (T4)
console.log('\n[6] 대표사례 ↔ T4');
eq('db 대표사례 수', db.filter(r => r['대표사례여부']).length, T4.length);
const rep = A.representativeCases(db, { limit: 5 });
eq('대표사례 5건 반환', rep.length, 5);
eq('전부 대표사례', rep.every(r => r['대표사례여부']), true);
eq('하위유형 중복 없음', new Set(rep.map(r => `${r['기인물']}|${r['재해형태']}|${r['하위유형번호']}`)).size, 5);
// 비계×떨어짐 칸: T4가 5개 하위유형으로 나눈 칸
const bigCell = db.filter(r => r['기인물'] === '비계' && r['재해형태'] === '떨어짐');
const bigRep = A.representativeCases(bigCell, { limit: 10 });
const t4big = T4.filter(r => r['기인물'] === '비계' && r['재해형태'] === '떨어짐');
eq('비계×떨어짐 하위유형 수', bigRep.length, t4big.length);
eq('비계×떨어짐 대표 id 집합 일치',
   bigRep.map(r => r.id).sort((a, b) => a - b), t4big.map(r => +r['대표사례id']).sort((a, b) => a - b));
eq('유사사례 = 하위유형 구성원', A.similarCases(bigCell, bigRep[0]).length, bigRep[0]._n);
eq('하위유형 구성원 합 = 칸 건수', bigRep.reduce((s, r) => s + r._n, 0), bigCell.length);

// ── 7. 감소대책 / 발생시기
console.log('\n[7] 감소대책 · 발생시기');
const top = A.measureTopN(db, 5);
eq('Top5 반환', top.length, 5);
eq('1위 문장 출현 166건', top[0].count, 166);
const ts = A.timeSeries(db, '발생연도');
eq('연도 8개(2016~2023)', ts.rows.length, 8);
eq('연도 합 + 범위밖 = 전건', ts.rows.reduce((s, r) => s + r.count, 0) + ts.outOfRange, db.length);
eq('범위 밖 39건(2013~15 38 + 2024 1)', ts.outOfRange, 39);
eq('월 12개', A.timeSeries(db, '발생월').rows.length, 12);
eq('계절 4개', A.timeSeries(db, '계절').rows.length, 4);

// ── 8. 스코프 일관성 — KOEN 토글 시 지표가 그 안에서 재계산되는가
console.log('\n[8] 스코프 재계산');
const koen = db.filter(r => r['KOEN공정']);
const kCombos = A.riskCombos(koen);
eq('KOEN 스코프 건수', koen.length, 3379);
eq('KOEN 조합 누적비율 100% 도달', Math.round(kCombos[kCombos.length - 1].cum), 100);
eq('KOEN 등급이 전국과 다름(재계산 증거)', kCombos.filter(c => c.grade === 'A').length !== 44, true);
const kSt = A.fallHeightStats(koen);
eq('KOEN 떨어짐 < 전체 떨어짐', kSt.total < st.total, true);

console.log(`\n${fail === 0 ? '전체 통과' : '실패 있음'} — 통과 ${pass} / 실패 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
