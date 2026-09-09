/**
 * 차트 라벨 겹침 자동 검사
 *
 * 라벨이 서로 겹치거나 차트 밖으로 나가는 문제가 반복해서 나왔다(도넛 조각,
 * 세로 막대, 추세선 위 라벨). 눈으로만 확인하면 화면 폭·데이터가 바뀔 때마다
 * 놓치므로, 실제 렌더된 라벨의 위치를 읽어 기계적으로 검사한다.
 *
 * 원리: chartjs-plugin-datalabels가 계산해 둔 라벨 크기(_rects.frame)와
 * 해결된 정렬(_model.align/anchor/offset), 요소 기하로 라벨의 절대 박스를
 * 복원한다. clamp가 켜진 라벨은 플러그인이 차트 영역 안으로 당기므로,
 * 당긴 뒤의 위치로 겹침을 본다(당김이 오히려 겹침을 만들 수 있다).
 *
 * 사용:
 *   python3 -m http.server 8099 &
 *   "<크롬>" --headless=new --remote-debugging-port=9333 --user-data-dir=$(mktemp -d) about:blank &
 *   node scripts/audit_chart_labels.mjs 1500     # 데스크톱
 *   node scripts/audit_chart_labels.mjs 390      # 모바일
 *
 * 실패 시 종료코드 1.
 */

const W = process.argv[2] || '1500';
const PORT = process.env.SIF_PORT || '8099';
const CDP = process.env.SIF_CDP || '9333';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  '/index.html',
  '/pages/risk-map.html',
  '/pages/process-inquiry.html',
  '/pages/cause-inquiry.html',
  '/pages/disaster-type.html',
  '/pages/fall-height.html',
  '/pages/trend.html',
  '/pages/risk-assessment.html',
];

// 차트가 상호작용 뒤에만 그려지는 페이지는 그 동작을 먼저 실행한다
const ACT = {
  '/pages/risk-map.html': `document.querySelectorAll('.rm-row')[0].dispatchEvent(new MouseEvent('click',{bubbles:true}))`,
  '/pages/process-inquiry.html': `msGongzong.setValues(['4. 마감공사'])`,
  '/pages/cause-inquiry.html': `msCause.setValues(['비계'])`,
  '/pages/disaster-type.html': `fm.set('재해형태',['떨어짐'])`,
  '/pages/risk-assessment.html': `(async()=>{showSection('construction');await new Promise(r=>setTimeout(r,500));
     document.querySelectorAll('#const-step1 [onclick^="toggleConstGZ"]')[0].click();constStep1Next();
     await new Promise(r=>setTimeout(r,500));
     document.querySelectorAll('#const-step2 [onclick^="toggleConstWork"]')[0].click();constStep2Next();
     await new Promise(r=>setTimeout(r,500));
     document.querySelectorAll('#const-step3 [onclick^="toggleConstUnit"]')[0].click();constStep3Next();})()`,
};

/** 브라우저 안에서 실행되는 검사 본체 */
const AUDIT = `(() => {
  const out = [];
  for (const cv of document.querySelectorAll('canvas')) {
    const ch = Chart.getChart(cv);
    if (!ch || !ch.$datalabels) continue;
    const type = ch.config.type;
    const area = ch.chartArea;
    const boxes = [];

    ch.$datalabels._labels.forEach(l => {
      const m = l._model;
      if (!m || !m.lines || !m.lines.length) return;
      const txt = m.lines.join('');
      if (!txt.trim()) return;
      const f = l._rects && l._rects.frame;
      if (!f) return;

      const dsIdx = l.$context ? l.$context.datasetIndex : 0;
      const el = ch.getDatasetMeta(dsIdx).data[l._index];
      if (!el) return;
      const dsType = (ch.data.datasets[dsIdx] && ch.data.datasets[dsIdx].type) || type;
      const align = m.align, off = m.offset || 0;

      let cx, cy;
      if (dsType === 'doughnut' || dsType === 'pie') {
        const r = (el.outerRadius + el.innerRadius) / 2;
        const a = (el.startAngle + el.endAngle) / 2;
        cx = el.x + Math.cos(a) * r; cy = el.y + Math.sin(a) * r;
      } else if (dsType === 'bar') {
        if (ch.options.indexAxis === 'y') {
          cy = el.y;
          cx = align === 'start' ? el.x - off - f.w / 2
             : align === 'center' ? el.x : el.x + off + f.w / 2;
        } else {
          cx = el.x;
          cy = align === 'start' ? el.y + off + f.h / 2
             : align === 'center' ? el.y : el.y - off - f.h / 2;
        }
      } else {
        cx = el.x;
        cy = align === 'start' ? el.y + off + f.h / 2 : el.y - off - f.h / 2;
      }

      let x1 = cx - f.w / 2, x2 = cx + f.w / 2, y1 = cy - f.h / 2, y2 = cy + f.h / 2;
      if (m.clamp && dsType !== 'doughnut' && dsType !== 'pie') {
        if (x1 < area.left) { x2 += area.left - x1; x1 = area.left; }
        if (x2 > area.right) { x1 -= x2 - area.right; x2 = area.right; }
        if (y1 < area.top) { y2 += area.top - y1; y1 = area.top; }
        if (y2 > area.bottom) { y1 -= y2 - area.bottom; y2 = area.bottom; }
      }
      boxes.push({ txt, clamped: !!m.clamp, x1, x2, y1, y2 });
    });

    // 겹침 — 교차 면적이 작은 쪽 라벨 면적의 15%를 넘으면 사람 눈에도 붙어 보인다
    const hits = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ow = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const oh = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        if (ow > 0 && oh > 0) {
          const ratio = (ow * oh) / Math.min((a.x2-a.x1)*(a.y2-a.y1), (b.x2-b.x1)*(b.y2-b.y1));
          if (ratio > 0.15) hits.push(a.txt + ' ↔ ' + b.txt + ' (' + (ratio*100).toFixed(0) + '%)');
        }
      }
    }
    // 영역 이탈 — clamp가 켜진 라벨은 플러그인이 당겨 주므로 대상이 아니다
    const outside = (type === 'doughnut' || type === 'pie') ? [] :
      boxes.filter(b => !b.clamped &&
             (b.x1 < area.left - 2 || b.x2 > area.right + 2 || b.y1 < area.top - 2))
           .map(b => b.txt);

    if (hits.length || outside.length) {
      out.push({ 차트: cv.id, 타입: type, 라벨수: boxes.length,
                 겹침: hits.slice(0, 6), 영역이탈: outside.slice(0, 6) });
    }
  }
  return out.length ? out : '겹침 없음';
})()`;

async function openTab(url) {
  const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?` + encodeURIComponent('about:blank'),
    { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  return { id: t.id, send };
}

let bad = 0;
console.log(`\n차트 라벨 검사 — 뷰포트 ${W}px\n`);
for (const page of PAGES) {
  let tab;
  try {
    tab = await openTab();
    await tab.send('Runtime.enable');
    await tab.send('Network.enable');
    await tab.send('Network.setCacheDisabled', { cacheDisabled: true });
    await tab.send('Emulation.setDeviceMetricsOverride',
      { width: +W, height: 2000, deviceScaleFactor: 1, mobile: +W < 500 });
    await tab.send('Page.navigate', { url: `http://localhost:${PORT}${page}` });
    await wait(7000);
    if (ACT[page]) { await tab.send('Runtime.evaluate', { expression: ACT[page], awaitPromise: true }); await wait(3500); }
    const r = await tab.send('Runtime.evaluate', { expression: AUDIT, returnByValue: true });
    const v = r.result?.result?.value;
    const ok = v === '겹침 없음';
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${page.padEnd(30)} ${ok ? '' : JSON.stringify(v, null, 1)}`);
  } catch (e) {
    bad++; console.log(`  ✗ ${page.padEnd(30)} 검사 실패: ${e.message}`);
  } finally {
    if (tab) await fetch(`http://127.0.0.1:${CDP}/json/close/${tab.id}`).catch(() => {});
  }
}
console.log(bad === 0 ? `\n  전부 통과 (${W}px)\n` : `\n  문제 ${bad}개 페이지 (${W}px)\n`);
process.exit(bad === 0 ? 0 : 1);
