#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
기인물별 재해 시나리오 배정 — 규칙 적용 · 검토자료 · 초안 문서

  scripts/mapping/scenario_rules.py  ─┐
  data/db.json                       ─┴─▶ [배정] ─┬─▶ scripts/out/scenario_review.json  (검토 에이전트용)
                                                  ├─▶ scripts/out/scenario_result.json  (중간 산출)
                                                  └─▶ scripts/docs/기인물_재해시나리오_초안.html

배정은 규칙 목록 순서대로 적용하고, 걸린 사례는 아래 규칙으로 내려가지 않는다.
마지막 ANY 규칙이 남은 전부를 받으므로 누락 없이 전건이 배정된다.
무작위 요소가 없어 같은 원본·같은 규칙이면 항상 같은 결과가 나온다 — 끝에 배정 해시를 찍어 확인한다.

기준·절차·검증 내용: scripts/docs/재해시나리오_분류방법론.html

사용:
  python3 scripts/build_scenarios.py
  python3 scripts/build_scenarios.py --quiet          # 기인물별 나열 생략

필요 패키지: scikit-learn   (대표사례 medoid 선정에만 쓴다)
"""

import argparse
import collections
import datetime
import hashlib
import html
import json
import os
import sys

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
except ImportError as e:
    sys.exit(f"패키지 누락: {e.name}\n  pip3 install scikit-learn")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, os.path.join(SCRIPT_DIR, 'mapping'))
from scenario_rules import SCEN, ANY          # noqa: E402


# ── 배정 ─────────────────────────────────────────────────────────────

def medoid(rows):
    """군집 안에서 다른 사례들과 문장이 가장 비슷한 한 건. 사람이 고르지 않는다."""
    if len(rows) == 1:
        return rows[0]
    X = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 4), min_df=1).fit_transform(
        [r['재해유발요인'] or '' for r in rows])
    return rows[int(cosine_similarity(X).mean(axis=1).argmax())]


def measures(rows, n=3):
    """시나리오에 속한 사례들의 감소대책 문장을 세어 많은 순으로."""
    c = collections.Counter()
    for r in rows:
        for s in str(r['위험성감소대책']).split('\n'):
            s = s.replace('▶', '').strip()
            if s:
                c[s] += 1
    return c.most_common(n)


def assign(db):
    """기인물 → 재해형태(건수 순) → 시나리오(건수 순). 규칙 순위별 배정 실적도 함께 센다."""
    result, rank_hits, unmatched = {}, collections.Counter(), []
    for 기인물, bytype in SCEN.items():
        sel = [r for r in db if r['기인물'] == 기인물]
        if not sel:
            unmatched.append(기인물)
            continue
        tc = collections.Counter(r['재해형태'] for r in sel)
        types = []
        for 재해형태, n in tc.most_common():
            rows_t = [r for r in sel if r['재해형태'] == 재해형태]
            rules = bytype.get(재해형태) or [(f'그 밖의 {재해형태} 재해', ANY)]
            rest, groups = list(rows_t), []
            for order, (name, f) in enumerate(rules, 1):
                hit = [r for r in rest if f(r)]
                if not hit:
                    continue
                ids = {id(x) for x in hit}
                rest = [r for r in rest if id(r) not in ids]
                rank_hits[order] += len(hit)
                groups.append((name, order, hit))
            assert not rest, f"미배정 {len(rest)}건 — {기인물}/{재해형태} 마지막 규칙이 ANY 가 아님"
            groups.sort(key=lambda g: -len(g[2]))
            types.append({
                '재해형태': 재해형태, '건수': n, '비중': round(n / len(sel) * 100, 1),
                'scenarios': [{
                    '이름': nm, '규칙순위': order, '건수': len(rs),
                    '비중': round(len(rs) / len(sel) * 100, 1),
                    '재해형태내비중': round(len(rs) / n * 100, 1),
                    '주요작업': collections.Counter(x['작업명'] for x in rs).most_common(3),
                    '대표사례': {k: medoid(rs)[k] for k in ['id', '공종', '작업명', '발생연도', '재해유발요인']},
                    '핵심대책': measures(rs),
                    '사례id': [r['id'] for r in rs],
                } for nm, order, rs in groups],
            })
        result[기인물] = {'total': len(sel), 'types': types}
    return result, rank_hits, unmatched


def assign_hash(result):
    """배정 결과의 지문. (사례번호, 기인물, 재해형태, 시나리오이름) 을 정렬해 해싱한다."""
    rows = sorted(
        (i, 기, t['재해형태'], s['이름'])
        for 기, v in result.items() for t in v['types'] for s in t['scenarios'] for i in s['사례id'])
    h = hashlib.md5(json.dumps(rows, ensure_ascii=False).encode('utf-8')).hexdigest()
    return h[:16], len(rows)


def review_json(result, by_id):
    """검토 에이전트용 — 시나리오마다 배정 사례의 원문과 감소대책을 그대로 싣는다."""
    out = {}
    for 기, v in result.items():
        out[기] = {'총건수': v['total'], '재해형태': [{
            '재해형태': t['재해형태'], '건수': t['건수'],
            '시나리오': [{
                '이름': s['이름'], '건수': s['건수'], '핵심대책': [m for m, _ in s['핵심대책']],
                '배정사례': [{'id': i,
                              '재해유발요인': by_id[i]['재해유발요인'],
                              '감소대책': by_id[i]['위험성감소대책']} for i in s['사례id']],
            } for s in t['scenarios']],
        } for t in v['types']]}
    return out


# ── 초안 문서 ────────────────────────────────────────────────────────

CSS = """
:root{--ink:#16191d;--ink-2:#4a5158;--ink-3:#767d85;--paper:#fbfaf7;--panel:#fff;--rule:#dcd8cf;
--mark:#7a5c00;--mark-bg:#fdf6dd;--mark-rule:#e3d190;--ok:#1f5c3d;--ok-bg:#e9f3ec;--ok-rule:#bcd8c5;
--warn:#8a2a12;--warn-bg:#fbeae4;--warn-rule:#e8bfb2;--bar:#2997ff;--bar2:#c9e4ff}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:16px;line-height:1.7;letter-spacing:-.01em}
.wrap{max-width:58rem;margin:0 auto;padding:0 1.4rem 6rem}
header{padding:4rem 0 2rem;border-bottom:2px solid var(--ink)}
header h1{font-size:1.95rem;line-height:1.25;margin:0 0 .7rem;font-weight:700}
header p{margin:0;color:var(--ink-2);max-width:44rem}
.meta{margin-top:1.5rem;display:flex;flex-wrap:wrap;gap:.35rem 1.6rem;font-size:.86rem;color:var(--ink-3)}
.meta b{color:var(--ink);font-weight:600}
h2{font-size:1.25rem;margin:3rem 0 .8rem;font-weight:700}
p{margin:.65rem 0}ul,ol{margin:.65rem 0;padding-left:1.15rem}li{margin:.28rem 0}
.box{border:1px solid var(--rule);background:var(--panel);border-radius:.6rem;padding:1rem 1.2rem;margin:1rem 0}
.box.mark{background:var(--mark-bg);border-color:var(--mark-rule);color:var(--mark)}
.box.ok{background:var(--ok-bg);border-color:var(--ok-rule);color:var(--ok)}
.box.warn{background:var(--warn-bg);border-color:var(--warn-rule);color:var(--warn)}
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.92rem;background:var(--panel)}
th,td{border:1px solid var(--rule);padding:.5rem .7rem;text-align:left;vertical-align:middle}
th{background:#f1efe9;font-weight:700;white-space:nowrap}
td.n,th.n{text-align:right;white-space:nowrap}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem;margin:1.2rem 0}
.kpi div{border:1px solid var(--rule);background:var(--panel);border-radius:.5rem;padding:.8rem .9rem;text-align:center}
.kpi b{display:block;font-size:1.5rem;line-height:1.2}
.kpi span{font-size:.78rem;color:var(--ink-3)}
.mix{font-size:.88rem;color:var(--ink-2);margin:.2rem 0 0}
.mix i{font-style:normal;color:var(--ink-3)}
.agent{margin:3.4rem 0 0;padding-top:1.6rem;border-top:2px solid var(--ink)}
.agent h2{display:flex;align-items:baseline;gap:.7rem;margin:0 0 .2rem}
.agent h2 .n{font-size:.78rem;font-weight:700;color:#fff;background:var(--ink);border-radius:999px;padding:.15rem .6rem}
.agent .sum{color:var(--ink-3);font-size:.9rem;margin:0 0 .4rem}
.dt{margin:2rem 0 .8rem;padding:.6rem .9rem;background:#eef1f4;border-left:4px solid var(--ink);border-radius:.3rem;
    display:flex;align-items:baseline;gap:.7rem;flex-wrap:wrap}
.dt b{font-size:1.05rem}
.dt span{font-size:.85rem;color:var(--ink-2)}
.sc{border:1px solid var(--rule);background:var(--panel);border-radius:.6rem;padding:.95rem 1.15rem;margin:.7rem 0 .7rem 1rem}
.sc-head{display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap;margin-bottom:.15rem}
.sc-rank{font-size:.72rem;font-weight:700;color:var(--ink-3);background:#f1efe9;border-radius:.25rem;padding:.05rem .4rem}
.sc-name{font-size:1rem;font-weight:700}
.sc-cnt{font-size:.84rem;color:var(--ink-3);white-space:nowrap}
.bar{height:6px;background:#eceae4;border-radius:999px;overflow:hidden;margin:.5rem 0 .75rem}
.bar i{display:block;height:100%;background:var(--bar)}
.lbl{font-size:.72rem;font-weight:700;color:var(--ink-3);letter-spacing:.03em;margin:.65rem 0 .2rem}
.case{font-size:.9rem;color:var(--ink-2);background:#f7f5f0;border-left:3px solid var(--rule);padding:.5rem .75rem;border-radius:.25rem}
.ms{margin:.25rem 0 0;padding-left:1.1rem;font-size:.88rem}
.ms li{margin:.2rem 0;color:var(--ink-2)}
.ms i{font-style:normal;color:var(--ink-3);font-size:.8rem}
.chk{display:flex;gap:.6rem;align-items:center;margin-top:.85rem;padding-top:.65rem;border-top:1px dashed var(--rule);font-size:.82rem;color:var(--ink-3)}
.chk .b{display:inline-block;width:.9rem;height:.9rem;border:1.5px solid var(--ink-3);border-radius:.2rem;flex:none}
.chk .line{flex:1;border-bottom:1px solid var(--rule);height:1.1rem}
@media(max-width:640px){body{font-size:15px}.wrap{padding:0 1rem 4rem}.kpi{grid-template-columns:repeat(2,1fr)}.sc{margin-left:0}}
@media print{body{background:#fff}.sc{break-inside:avoid}.agent{break-before:page}}
"""

E = lambda s: html.escape(str(s or ''))


def sc_html(s, rank):
    ms = ''.join(f"<li>{E(m)} <i>({n}건)</i></li>" for m, n in s['핵심대책'])
    work = ' · '.join(f"{E(w)} <i style='color:var(--ink-3)'>{n}건</i>" for w, n in s.get('주요작업', []))
    rep = s['대표사례']
    return f"""
      <div class="sc">
        <div class="sc-head">
          <span class="sc-rank">{rank}</span>
          <span class="sc-name">{E(s['이름'])}</span>
          <span class="sc-cnt">{s['건수']}건 · 이 재해형태의 {s['재해형태내비중']}%</span>
        </div>
        <div class="bar"><i style="width:{s['재해형태내비중']}%"></i></div>
        <div class="lbl">주로 어떤 작업에서</div>
        <div style="font-size:.86rem;color:var(--ink-2)">{work}</div>
        <div class="lbl">대표사례 (사례번호 {rep['id']} · {E(rep['공종'])} {E(rep['작업명'])} · {rep['발생연도']}년)</div>
        <div class="case">{E(rep['재해유발요인'])}</div>
        <div class="lbl">이 유형에서 가장 많이 제시된 대책</div>
        <ul class="ms">{ms}</ul>
        <div class="chk"><span class="b"></span>이름 수정 / 합침 / 나눔 의견<span class="line"></span></div>
      </div>"""


def build_doc(data):
    # 문서는 건수 많은 순으로 싣는다 — 규칙 파일에 적은 순서가 아니라.
    data = dict(sorted(data.items(), key=lambda kv: -kv[1]['total']))
    NGI = len(data)
    TOT = sum(v['total'] for v in data.values())
    NSCEN = sum(len(t['scenarios']) for v in data.values() for t in v['types'])
    NTYPE = len({t['재해형태'] for v in data.values() for t in v['types']})

    rows_tbl, mixes = [], []
    for 기, v in data.items():
        ns = sum(len(t['scenarios']) for t in v['types'])
        rows_tbl.append(f"<tr><td>{E(기)}</td><td class='n'>{v['total']}건</td>"
                        f"<td class='n'>{len(v['types'])}종</td><td class='n'>{ns}개</td></tr>")
        mix = ' · '.join(f"<b>{E(t['재해형태'])}</b> {t['건수']}건 <i>({len(t['scenarios'])}개 유형)</i>"
                         for t in v['types'])
        mixes.append(f"<p class='mix'><b>{E(기)}</b> — {mix}</p>")

    body = []
    for i, (기, v) in enumerate(data.items(), 1):
        ns = sum(len(t['scenarios']) for t in v['types'])
        secs = []
        for t in v['types']:
            cards = ''.join(sc_html(s, k) for k, s in enumerate(t['scenarios'], 1))
            secs.append(f"""
      <div class="dt"><b>{E(t['재해형태'])}</b>
        <span>{t['건수']}건 · 이 기인물의 {t['비중']}% · 유형 {len(t['scenarios'])}개</span></div>
      {cards}""")
        body.append(f"""
  <section class="agent">
    <h2><span class="n">기인물 {i}</span> {E(기)}</h2>
    <p class="sum">사망·중상 {v['total']}건 · 재해형태 {len(v['types'])}종 · 재해 시나리오 {ns}개. 건수가 많은 순서로 실었습니다.</p>
    {''.join(secs)}
  </section>""")

    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>기인물별 재해 시나리오 초안 (검토용)</title><style>{CSS}</style></head>
<body><div class="wrap">
<header>
  <h1>기인물별 재해 시나리오 초안</h1>
  <p>위험성평가에서 기인물을 고르면 "이 기인물은 이런 방식으로 사망사고가 난다"를 보여주기 위한 정의입니다.
     재해형태(떨어짐·끼임·감전 등)를 대분류로 두고, 그 아래에 사고 나는 방식을 나눴습니다.
     대분류와 유형 모두 건수가 많은 순서입니다.</p>
  <div class="meta">
    <span>대상 <b>기인물 {NGI}종</b></span>
    <span>사례 <b>{TOT:,}건</b></span>
    <span>재해형태 <b>{NTYPE}종</b></span>
    <span>시나리오 <b>{NSCEN}개</b></span>
    <span>작성 <b>{datetime.date.today().isoformat()}</b></span>
  </div>
</header>

<h2>한눈에 보기</h2>
<div class="kpi">
  <div><b>{NGI}</b><span>기인물</span></div>
  <div><b>{TOT:,}</b><span>사망·중상 사례</span></div>
  <div><b>{NTYPE}</b><span>재해형태</span></div>
  <div><b>{NSCEN}</b><span>재해 시나리오</span></div>
</div>
<table>
  <tr><th>기인물</th><th class="n">사례</th><th class="n">재해형태</th><th class="n">시나리오</th></tr>
  {''.join(rows_tbl)}
</table>
<div class="box">
  <p style="margin:0 0 .4rem;font-weight:700">기인물별 재해형태 구성</p>
  {''.join(mixes)}
</div>

<h2>어떻게 만들었나</h2>
<p>사례의 재해유발요인 문장을 읽고 <b>사고가 나는 방식</b>을 정의한 뒤, 각 사례를 키워드 규칙으로 배정했습니다.
   기계가 문장을 자동으로 묶는 방식(기존 하위유형)은 쓰지 않았습니다.
   기준·절차·검증 내용은 <b>재해시나리오_분류방법론.html</b> 에 따로 적어 두었습니다.</p>
<div class="box warn">
  <p><b>기존 자동 분류를 쓰지 않은 이유</b></p>
  <p>기존 하위유형은 사례가 100건 이상이면 무조건 5개, 30건 이상이면 무조건 3개로 나누는 규칙이었습니다.
     데이터 구조와 무관하게 개수를 먼저 정한 것입니다. 30건 이상인 26개 칸을 전부 측정한 결과 군집이 뚜렷한 칸은 1개뿐이었고,
     평균 분리도는 0.064였습니다(0.2 미만이면 경계가 흐릿하다는 뜻). 왜 이 사례가 이 유형인지 설명할 수 없다는 것이 가장 큰 문제였습니다.</p>
</div>
<div class="box ok">
  <p><b>규칙 방식의 장점</b></p>
  <p>· 왜 이 사례가 이 유형인지 키워드로 근거를 댈 수 있습니다.<br>
     · 분류가 틀렸다고 보이면 규칙을 고치면 됩니다.<br>
     · 공단이 데이터를 갱신해도 같은 규칙이 그대로 적용되어 유형이 흔들리지 않습니다.</p>
</div>
<div class="box mark">
  <p><b>개수를 미리 정해 두지 않았습니다.</b> 내용상 갈리는 만큼 나눴더니 기인물마다 개수가 달라졌습니다.
     아웃트리거 지반 침하, 작업대가 구조물에 걸렸다 빠지며 흔들림, 안전난간을 임의로 해체한 상태에서 작업처럼
     대책이 확연히 다른 것은 따로 세웠습니다. 건수가 적어도 성격이 다르면 그대로 두었습니다.</p>
  <p>나누는 축은 기인물마다 다릅니다. 비계와 고소작업대는 <b>사고 나는 방식</b>으로, 지붕 채광판은 사고 방식이
     하나(밟은 지붕재가 파손되어 추락)뿐이라 <b>무슨 작업 중이었나</b>로, 말비계는 <b>어디에 설치했나</b>로 갈랐습니다.</p>
</div>

<h2>검토해 주실 것</h2>
<ol>
  <li><b>유형 이름</b>이 현장에서 쓰는 말인지. 아니면 고쳐 주십시오.</li>
  <li><b>갈래가 맞는지.</b> 합쳐야 할 것, 더 나눠야 할 것이 있는지.</li>
  <li><b>대표사례</b>가 그 유형을 대표하기에 적절한지.</li>
  <li><b>핵심 대책</b>이 현장에 줄 만한 내용인지. 문안은 원문 그대로라 다듬을 부분이 있을 수 있습니다.</li>
</ol>
{''.join(body)}

<section class="agent">
  <h2><span class="n">다음</span> 확정 후 진행</h2>
  <ol>
    <li>위험성평가 생성과 기인물 조회에 <b>재해 시나리오 카드</b>를 붙입니다. 재해형태 대분류 아래에 유형이 건수 순으로 놓이고,
        카드마다 대표사례와 핵심 대책이 들어가며 나머지 사례는 접어 둡니다.</li>
    <li>감소대책 문안을 <b>표준화</b>합니다. 지금은 공단 원문 그대로라 같은 뜻이 여러 표현으로 흩어져 있습니다.</li>
  </ol>
</section>
</div></body></html>"""


# ── 실행 ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--db', default=os.path.join(PROJECT_DIR, 'data', 'db.json'))
    ap.add_argument('--out-dir', default=os.path.join(SCRIPT_DIR, 'out'))
    ap.add_argument('--doc', default=os.path.join(SCRIPT_DIR, 'docs', '기인물_재해시나리오_초안.html'))
    ap.add_argument('--quiet', action='store_true', help='기인물별 나열 생략')
    args = ap.parse_args()

    db = json.load(open(args.db, encoding='utf-8'))
    by_id = {r['id']: r for r in db}
    result, rank_hits, unmatched = assign(db)

    n_gi = len(result)
    n_case = sum(v['total'] for v in result.values())
    n_form = len({t['재해형태'] for v in result.values() for t in v['types']})
    n_scen = sum(len(t['scenarios']) for v in result.values() for t in v['types'])
    n_rule = sum(len(v) for g in SCEN.values() for v in g.values())
    h, n_assigned = assign_hash(result)

    os.makedirs(args.out_dir, exist_ok=True)
    json.dump(result, open(os.path.join(args.out_dir, 'scenario_result.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump(review_json(result, by_id),
              open(os.path.join(args.out_dir, 'scenario_review.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    with open(args.doc, 'w', encoding='utf-8') as f:
        f.write(build_doc(result))

    if not args.quiet:
        for 기, v in result.items():
            ns = sum(len(t['scenarios']) for t in v['types'])
            print(f"\n■ {기} — {v['total']}건 · 재해형태 {len(v['types'])}종 · 시나리오 {ns}개")
            for t in v['types']:
                print(f"  ▸ {t['재해형태']} {t['건수']}건 ({t['비중']}%) · 유형 {len(t['scenarios'])}개")
                for s in t['scenarios']:
                    print(f"       {s['건수']:>3}건  {s['이름']}")

    print(f"\n{'═' * 70}")
    print(f"기인물 {n_gi} · 사례 {n_case:,} · 재해형태 {n_form} · 시나리오 {n_scen} · 규칙 {n_rule}")
    print(f"전건 배정 {n_assigned:,}/{n_case:,} · 배정 해시 {h}")
    print("규칙 순위별 배정: " + " / ".join(f"{k}순위 {v}" for k, v in sorted(rank_hits.items())))
    if unmatched:
        print(f"\n주의 — 규칙은 있으나 db.json 에 사례가 없는 기인물 {len(unmatched)}종: {', '.join(unmatched)}")
    missing = sorted({r['기인물'] for r in db} - set(SCEN))
    if missing:
        print(f"주의 — 규칙이 없는 기인물 {len(missing)}종: {', '.join(missing)}")
    print(f"\n  {os.path.relpath(args.doc, PROJECT_DIR)}")
    print(f"  {os.path.relpath(args.out_dir, PROJECT_DIR)}/scenario_review.json · scenario_result.json")
    print(f"{'═' * 70}")


if __name__ == '__main__':
    main()
