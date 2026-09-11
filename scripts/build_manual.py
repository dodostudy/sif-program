#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사용 매뉴얼 HTML 생성 — 탭별 화면 캡처를 본문에 박아 한 파일로 만든다

  scripts/manual/*.webp  ─▶  scripts/docs/사용매뉴얼.html

캡처는 data: URI 로 넣어 파일 하나만 들고 다녀도 그림이 보이게 한다.
캡처를 다시 찍으려면 scripts/manual/ 의 이미지를 갈아 끼우고 이 스크립트를 다시 돌린다.

숫자는 data/db.json 에서 직접 세어 쓴다 — 갱신 후 다시 돌리면 본문 숫자도 따라 바뀐다.

사용:
  python3 scripts/build_manual.py
"""

import argparse
import base64
import collections
import datetime
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
IMG_DIR = os.path.join(SCRIPT_DIR, 'manual')


def img(name, cap=''):
    """캡처를 data: URI 로 박는다. 없으면 자리만 비워 두고 경고한다."""
    path = os.path.join(IMG_DIR, name)
    if not os.path.exists(path):
        print(f"  경고 — 캡처 없음: {name}", file=sys.stderr)
        return f'<figure class="shot missing"><div class="ph">캡처 없음 · {name}</div></figure>'
    b64 = base64.b64encode(open(path, 'rb').read()).decode()
    c = f'<figcaption>{cap}</figcaption>' if cap else ''
    # 원본 크기를 박아 둔다 — 없으면 그림이 다 뜨기 전까지 자리를 차지하지 않아 글이 출렁인다.
    try:
        from PIL import Image
        w, h = Image.open(path).size
        dim = f' width="{w}" height="{h}"'
    except Exception:
        dim = ''
    return (f'<figure class="shot"><img alt="{cap or name}"{dim} '
            f'src="data:image/webp;base64,{b64}">{c}</figure>')


CSS = """
:root{--ink:#16191d;--ink-2:#4a5158;--ink-3:#767d85;--paper:#fbfaf7;--panel:#fff;--rule:#dcd8cf;
--mark:#7a5c00;--mark-bg:#fdf6dd;--mark-rule:#e3d190;--ok:#1f5c3d;--ok-bg:#e9f3ec;--ok-rule:#bcd8c5;
--warn:#8a2a12;--warn-bg:#fbeae4;--warn-rule:#e8bfb2}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);
 font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:16px;line-height:1.75;letter-spacing:-.01em}
.wrap{max-width:56rem;margin:0 auto;padding:0 1.4rem 6rem}
header{padding:4.5rem 0 2.2rem;border-bottom:2px solid var(--ink)}
header h1{font-size:2.05rem;line-height:1.25;margin:0 0 .7rem;font-weight:700}
header p{margin:0;color:var(--ink-2);max-width:44rem}
.meta{margin-top:1.6rem;display:flex;flex-wrap:wrap;gap:.35rem 1.6rem;font-size:.86rem;color:var(--ink-3)}
.meta b{color:var(--ink);font-weight:600}
h2{font-size:1.35rem;margin:3.4rem 0 .9rem;font-weight:700;line-height:1.35;padding-top:1.5rem;border-top:1px solid var(--rule)}
h2:first-of-type{border-top:0;padding-top:0}
h2 .no{display:inline-block;font-size:.72rem;font-weight:700;color:#fff;background:var(--ink);
 border-radius:999px;padding:.1rem .55rem;vertical-align:.22em;margin-right:.5rem}
h3{font-size:1.08rem;margin:2.4rem 0 .5rem;font-weight:700}
h3 .tab{display:inline-block;font-size:.68rem;font-weight:700;color:var(--ink-3);background:#efece5;
 border:1px solid var(--rule);border-radius:.25rem;padding:.1rem .4rem;vertical-align:.18em;margin-right:.45rem}
h4{font-size:.92rem;margin:1.3rem 0 .35rem;font-weight:700;color:var(--ink-2)}
p{margin:.7rem 0}ul,ol{margin:.7rem 0;padding-left:1.25rem}li{margin:.32rem 0}
.lead{color:var(--ink-2)}
.box{border:1px solid var(--rule);background:var(--panel);border-radius:.6rem;padding:1rem 1.2rem;margin:1.1rem 0}
.box.mark{background:var(--mark-bg);border-color:var(--mark-rule);color:var(--mark)}
.box.ok{background:var(--ok-bg);border-color:var(--ok-rule);color:var(--ok)}
.box.warn{background:var(--warn-bg);border-color:var(--warn-rule);color:var(--warn)}
.box p{margin:.35rem 0}.box .t{font-weight:700;display:block;margin-bottom:.35rem}
table{width:100%;border-collapse:collapse;margin:1.1rem 0;font-size:.91rem;background:var(--panel)}
th,td{border:1px solid var(--rule);padding:.5rem .7rem;text-align:left;vertical-align:top}
th{background:#f1efe9;font-weight:700;white-space:nowrap}
td.n,th.n{text-align:right;white-space:nowrap}
code{font:.9em "SF Mono",Menlo,Consolas,monospace;background:#eeece6;padding:.08em .35em;border-radius:.25rem}
.shot{margin:1.1rem 0 1.4rem;padding:0}
.shot img{display:block;width:100%;height:auto;border:1px solid var(--rule);border-radius:.5rem;background:#0b0f16}
.shot figcaption{font-size:.8rem;color:var(--ink-3);margin-top:.45rem}
.shot.missing .ph{border:1px dashed var(--rule);border-radius:.5rem;padding:3rem 1rem;text-align:center;color:var(--ink-3);font-size:.85rem}
.steps{counter-reset:s;list-style:none;padding-left:0;margin:.8rem 0}
.steps li{counter-increment:s;position:relative;padding-left:2.1rem;margin:.5rem 0}
.steps li::before{content:counter(s);position:absolute;left:0;top:.12rem;width:1.5rem;height:1.5rem;
 border-radius:50%;background:var(--ink);color:#fff;font-size:.75rem;font-weight:700;
 display:flex;align-items:center;justify-content:center}
.toc{background:var(--panel);border:1px solid var(--rule);border-radius:.6rem;padding:1rem 1.3rem;margin:1.8rem 0}
.toc ol{margin:.3rem 0;padding-left:1.3rem}
.toc ol ol{margin:.15rem 0}
.toc a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--rule)}
.toc a:hover{border-bottom-color:var(--ink)}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem;margin:1.2rem 0}
.kpi div{border:1px solid var(--rule);background:var(--panel);border-radius:.5rem;padding:.8rem .5rem;text-align:center}
.kpi b{display:block;font-size:1.45rem;line-height:1.2}
.kpi span{font-size:.76rem;color:var(--ink-3)}
@media(max-width:640px){body{font-size:15px}.wrap{padding:0 1rem 4rem}.kpi{grid-template-columns:repeat(2,1fr)}}
@media print{body{background:#fff}h2{break-before:page}h2:first-of-type{break-before:auto}
 .shot,table,.box{break-inside:avoid}.toc{break-after:page}}
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--db', default=os.path.join(PROJECT_DIR, 'data', 'db.json'))
    ap.add_argument('--scenarios', default=os.path.join(PROJECT_DIR, 'data', 'scenarios.json'))
    ap.add_argument('--out', default=os.path.join(SCRIPT_DIR, 'docs', '사용매뉴얼.html'))
    args = ap.parse_args()

    db = json.load(open(args.db, encoding='utf-8'))
    sc = json.load(open(args.scenarios, encoding='utf-8')) if os.path.exists(args.scenarios) else {}
    n = len(db)
    uniq = lambda k: len({r[k] for r in db if r.get(k)})
    yrs = sorted({r['발생연도'] for r in db if r.get('발생연도')})
    yc = collections.Counter(r['발생연도'] for r in db if r.get('발생연도'))
    solid = [y for y in yrs if yc[y] >= 50]
    koen = sum(1 for r in db if r.get('KOEN공정'))
    m12 = sum(1 for r in db if r.get('12대기인물'))
    fall = sum(1 for r in db if r.get('추락고_m') is not None)
    multi = sum(1 for r in db if r.get('복수재해자'))
    n_scen = sc.get('시나리오수', 0)
    n_gi_sc = sc.get('기인물수', 0)

    doc = f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SIF 위험성평가 지원 시스템 사용 매뉴얼</title><style>{CSS}</style></head>
<body><div class="wrap">

<header>
  <h1>위험성평가 지원 시스템<br>사용 매뉴얼</h1>
  <p class="lead">분당발전본부 안전관리실 · SIF 사고사망 고위험요인 분석 시스템.
     화면마다 무엇을 보는 곳인지, 어떻게 쓰는지, 숫자를 읽을 때 무엇을 조심해야 하는지 적었습니다.
     각 항목에 실제 화면을 함께 실었습니다.</p>
  <div class="meta">
    <span>대상 <b>한국산업안전보건공단 SIF 아카이브 {n:,}건</b></span>
    <span>기간 <b>{solid[0]}~{solid[-1]}년</b></span>
    <span>작성 <b>{datetime.date.today().isoformat()}</b></span>
  </div>
</header>

<div class="toc">
  <b>차례</b>
  <ol>
    <li><a href="#s1">이 시스템은 무엇인가</a></li>
    <li><a href="#s2">어느 화면부터 볼까</a></li>
    <li><a href="#s3">모든 화면에 공통인 것</a></li>
    <li><a href="#s4">화면별 사용법</a>
      <ol>
        <li><a href="#t-intro">소개</a></li>
        <li><a href="#t-dash">대시보드</a></li>
        <li><a href="#t-map">위험지도</a></li>
        <li><a href="#t-proc">공정 조회</a></li>
        <li><a href="#t-cause">기인물 조회</a></li>
        <li><a href="#t-dtype">재해형태 분석</a></li>
        <li><a href="#t-fall">추락높이 분석</a></li>
        <li><a href="#t-trend">발생시기 분석</a></li>
        <li><a href="#t-ra">위험성평가 생성</a></li>
      </ol></li>
    <li><a href="#s5">재해 시나리오란</a></li>
    <li><a href="#s6">숫자를 읽을 때 조심할 것</a></li>
  </ol>
</div>

<h2 id="s1"><span class="no">1</span>이 시스템은 무엇인가</h2>

<p>한국산업안전보건공단이 공개한 <b>SIF(사망·중상) 고위험요인 아카이브</b>를 현장에서 찾아 쓸 수 있게 만든 조회 도구입니다.
   건설 사망사고 {n:,}건을 공정·기인물·재해형태 세 축으로 돌려 가며 볼 수 있고,
   위험성평가를 쓸 때 참고할 사례와 감소대책을 뽑아 줍니다.</p>

<div class="kpi">
  <div><b>{n:,}</b><span>사망·중상 사례</span></div>
  <div><b>{uniq('공종')}</b><span>공종</span></div>
  <div><b>{uniq('기인물')}</b><span>기인물</span></div>
  <div><b>{uniq('재해형태')}</b><span>재해형태</span></div>
</div>

<p>사례 하나에는 공종·작업명·단위작업명, 기인물, 재해형태, 발생 연월, 재해개요, 재해유발요인,
   위험성감소대책이 들어 있습니다. 추락 사고는 추락 높이도 함께 있습니다({fall:,}건).</p>

<table>
  <tr><th>구분</th><th>내용</th></tr>
  <tr><td>출처</td><td>한국산업안전보건공단 산업재해 고위험요인(SIF) 공개 자료</td></tr>
  <tr><td>대상 기간</td><td>{solid[0]}~{solid[-1]}년</td></tr>
  <tr><td>사례 수</td><td>{n:,}건 (사망 또는 중상)</td></tr>
  <tr><td>개인정보</td><td>사람·회사·현장을 특정할 수 있는 표현은 ○○○으로 가렸습니다</td></tr>
  <tr><td>로그인</td><td>없습니다. 주소만 알면 바로 볼 수 있습니다</td></tr>
</table>

<div class="box warn">
  <span class="t">상업적 이용과 내용 변경은 금지되어 있습니다</span>
  <p>공단 공개 자료의 이용 조건입니다. 사내 위험성평가와 교육 목적으로만 쓰십시오.</p>
</div>

<h2 id="s2"><span class="no">2</span>어느 화면부터 볼까</h2>

<p>하려는 일에 따라 들어갈 곳이 다릅니다. 아래 표에서 골라 바로 가십시오.</p>

<table>
  <tr><th>하려는 일</th><th>갈 화면</th></tr>
  <tr><td>위험성평가서를 써야 한다</td><td><b>위험성평가 생성</b> — 기인물이나 공종을 고르면 사례와 대책이 모입니다</td></tr>
  <tr><td>이번에 쓸 장비·가설물이 어떻게 위험한지 알고 싶다</td><td><b>기인물 조회</b></td></tr>
  <tr><td>이번 공정에서 무엇을 조심해야 하는지 알고 싶다</td><td><b>공정 조회</b></td></tr>
  <tr><td>떨어짐·끼임 같은 사고 유형을 파고들고 싶다</td><td><b>재해형태 분석</b></td></tr>
  <tr><td>전체 위험 구조를 한눈에 보고 싶다</td><td><b>위험지도</b> 또는 <b>대시보드</b></td></tr>
  <tr><td>안전난간·방호망 높이 기준을 따져야 한다</td><td><b>추락높이 분석</b></td></tr>
  <tr><td>해빙기·혹서기 대비 자료가 필요하다</td><td><b>발생시기 분석</b></td></tr>
</table>

<h2 id="s3"><span class="no">3</span>모든 화면에 공통인 것</h2>

<h4>왼쪽 메뉴</h4>
<p>화면 왼쪽에 메뉴가 있습니다. <b>위험성평가 검토</b>와 <b>심층 분석</b>은 묶음이라 눌러야 하위 항목이 펼쳐집니다.
   좁은 화면(휴대전화)에서는 왼쪽 위 줄 세 개 단추로 엽니다.</p>

<h4>발전소 공정 토글</h4>
<p>화면 위쪽의 <b>발전소 공정</b> 스위치를 켜면 발전소에서 나올 수 있는 공정만 남습니다.
   전체 {n:,}건 중 {koen:,}건이 여기 해당합니다. 끄면 건설 전체를 봅니다.
   이 스위치는 그 화면의 모든 차트와 표에 함께 걸립니다.</p>

<h4>필터는 연쇄로 좁혀집니다</h4>
<p>공종을 고르면 작업명 목록이 그 공종에 있는 것만 남고, 작업명을 고르면 단위작업명이 다시 좁혀집니다.
   이미 고른 값이 새 조건에 맞지 않으면 저절로 풀립니다. 처음으로 돌리려면 <b>초기화</b>를 누르십시오.</p>

<h4>키워드 검색</h4>
<p>재해개요·재해유발요인·감소대책 본문에서 찾습니다. "개구부", "아웃트리거"처럼 현장 용어로 넣으면 됩니다.</p>

<h4>밝은 화면 · 어두운 화면</h4>
<p>오른쪽 위 동그란 단추로 바꿉니다. 선택은 이 브라우저에 기억됩니다. 인쇄할 때는 밝은 화면이 낫습니다.</p>

<h4>인쇄 / PDF</h4>
<p>오른쪽 위 <b>인쇄 / PDF</b>를 누르면 차트까지 그대로 들어간 인쇄본이 나옵니다.
   브라우저 인쇄 창에서 "PDF로 저장"을 고르면 파일로 남길 수 있습니다.</p>

<h4>엑셀 다운로드</h4>
<p>표 오른쪽 위 <b>엑셀 다운로드</b>를 누르면 지금 화면에 걸린 조건 그대로 내려받습니다.
   비밀번호를 묻습니다. 받은 파일은 CSV라 엑셀에서 바로 열립니다.</p>

<h2 id="s4"><span class="no">4</span>화면별 사용법</h2>

<h3 id="t-intro"><span class="tab">소개</span>시스템 소개</h3>
<p>이 시스템이 어떤 자료를 담고 있고 화면이 어떻게 구성되어 있는지 설명하는 첫 화면입니다.
   처음 쓰는 사람에게 이 화면부터 보여 주십시오.</p>
{img('01_intro.webp', '소개 화면 — 자료 범위와 화면 구성 안내')}

<h3 id="t-dash"><span class="tab">대시보드</span>전체 현황</h3>
<p>{n:,}건이 어떤 모습인지 한 장으로 보는 화면입니다. 특정 사례를 찾는 곳이 아니라 전체 윤곽을 잡는 곳입니다.</p>
<h4>이렇게 씁니다</h4>
<ol class="steps">
  <li>위쪽 숫자 칸에서 전체 건수와 주요 비중을 확인합니다.</li>
  <li>재해형태 분포와 공종별·작업명별 건수로 어디에 사고가 몰리는지 봅니다.</li>
  <li><b>기인물 Top 10</b>에서 <b>최근 5년</b> 단추를 누르면 최근 경향만 따로 볼 수 있습니다.
      오래전에 많았지만 지금은 줄어든 기인물과, 최근 늘고 있는 기인물이 갈립니다.</li>
  <li><b>공종 × 재해형태 교차분석</b>은 색이 진할수록 건수가 많습니다. 칸을 눌러 상세로 갑니다.</li>
</ol>
{img('02_dash.webp', '대시보드 — 전체 분포와 기인물 Top 10')}
<div class="box">
  <p><b>12대 기인물</b>은 공단이 중점관리 대상으로 지정한 기인물입니다. 전체의 {m12:,}건이 해당합니다.
     목록에서 따로 표시됩니다.</p>
</div>

<h3 id="t-map"><span class="tab">위험지도</span>3축을 넘나드는 조망</h3>
<p>공정·기인물·재해유형 세 축을 오가며 위험 구조를 훑는 화면입니다.
   "이 공종에서 무엇이 위험한가"를 보다가 "그 기인물은 다른 공종에서도 위험한가"로 자연스럽게 넘어갈 수 있습니다.</p>
<h4>이렇게 씁니다</h4>
<ol class="steps">
  <li>위쪽에서 축을 고릅니다 — <b>공정 · 기인물 · 재해유형</b>.</li>
  <li>왼쪽 순위 목록에서 항목을 누르면 오른쪽에 그 항목의 상세가 펼쳐집니다.</li>
  <li>상세 안의 차트 막대를 누르면 <b>그 범위 안에서 더 좁혀집니다</b>. 위쪽 빵부스러기로 되돌아갈 수 있습니다.</li>
  <li>맨 아래 <b>주요 재해 시나리오</b>에서 지금 범위에 가장 많은 사고 갈래 5가지를 봅니다. 줄을 누르면 사례 원문이 열립니다.</li>
</ol>
{img('03_map.webp', '위험지도 — 공종을 고른 뒤 그 안의 작업·기인물 분포와 주요 재해 시나리오')}
<div class="box mark">
  <p>차트의 비율(%)은 <b>지금 좁혀 놓은 범위</b>가 분모입니다. 전체 {n:,}건 대비가 아닙니다.
     화면 위쪽에 "전체 대비 몇 %"가 따로 적혀 있으니 함께 보십시오.</p>
</div>

<h3 id="t-proc"><span class="tab">위험성평가 검토</span>공정 조회</h3>
<p>공종 → 작업명 → 단위작업명 순으로 좁혀 그 공정의 사례를 찾는 화면입니다.
   작업 지시서나 작업허가서를 쓰기 전에 보는 용도입니다.</p>
<h4>이렇게 씁니다</h4>
<ol class="steps">
  <li>공종을 고릅니다. 작업명 목록이 그 공종 것만 남습니다.</li>
  <li>작업명, 이어서 단위작업명을 고릅니다.</li>
  <li>파란 안내 상자에 이 공정의 <b>상위 3 기인물</b>과 "기인물 N종 가운데 상위 M종이 사고의 80%를 차지합니다"가 뜹니다.
      무엇부터 볼지 정할 때 이 줄을 보십시오.</li>
  <li>기인물 목록을 열면 그 80% 지점에 <b>구분선</b>이 그어져 있습니다. 선 위쪽부터 보면 됩니다.</li>
  <li>아래 표에서 사례와 감소대책을 읽습니다. 필요하면 엑셀로 받습니다.</li>
</ol>
{img('04_proc.webp', '공정 조회 — 마감공사 · 판넬 등 외부마감 작업을 고른 화면. 파란 상자가 상위 기인물과 80% 지점을 알려 줍니다')}

<h3 id="t-cause"><span class="tab">위험성평가 검토</span>기인물 조회</h3>
<p>반대 방향입니다. 장비나 가설물을 정해 놓고 "이게 어디서 어떻게 위험한가"를 보는 화면입니다.
   비계·고소작업대·사다리처럼 쓸 것이 정해져 있을 때 씁니다.</p>
<h4>이렇게 씁니다</h4>
<ol class="steps">
  <li>기인물을 하나 고릅니다. 위쪽에 전체 순위와 주 재해형태, 최근 5년 건수가 뜹니다.</li>
  <li>공종별·재해형태별·작업명별 분포로 어느 공정에서 위험한지 봅니다.</li>
  <li><b>재해 시나리오</b>에서 이 기인물이 어떤 방식으로 사망사고를 내는지 갈래별로 읽습니다.
      갈래마다 대표사례와 가장 많이 제시된 대책이 붙어 있습니다.</li>
  <li>필요한 갈래의 <b>나머지 사례 N건 보기</b>를 눌러 전체를 확인합니다.</li>
</ol>
{img('05_cause.webp', '기인물 조회 — 굴착기를 고른 화면. 차트 막대 색과 아래 시나리오 상자 색이 같습니다')}
<div class="box ok">
  <span class="t">색이 같은 것끼리 보십시오</span>
  <p>재해형태별로 색을 나눴고, 위 차트의 막대 색과 아래 상자 색이 같습니다.
     차트에서 "깔림 뒤집힘이 파랑 57건"을 보면 아래에서 같은 파랑 상자를 찾으면 됩니다.</p>
</div>
<p>기인물 하나만 골랐을 때 나옵니다. 둘 이상 고르면 시나리오는 숨습니다 —
   시나리오는 기인물 하나를 전제로 정한 것이기 때문입니다.</p>

<h3 id="t-dtype"><span class="tab">위험성평가 검토</span>재해형태 분석</h3>
<p>떨어짐·끼임·감전 같은 사고 유형을 정해 놓고 "이 유형은 어디서 나오나"를 보는 화면입니다.
   유형별 대책을 정비할 때 씁니다.</p>
<h4>이렇게 씁니다</h4>
<ol class="steps">
  <li>재해형태를 고르면 그 유형이 나오는 공종·기인물·작업명이 건수 순으로 나옵니다.</li>
  <li><b>공종 × 기인물분류 히트맵</b>에서 색이 진한 칸이 그 유형의 집중 지점입니다.</li>
  <li><b>복수재해자 사고만</b>을 켜면 한 번에 여러 명이 다친 사고만 남습니다(전체 {multi:,}건).
      같은 유형이라도 피해가 커지는 조건을 따로 보는 데 씁니다.</li>
  <li>떨어짐을 고르면 <b>추락높이 분석으로 가는 안내줄</b>이 함께 나옵니다. 높이까지 따질 때 이어서 보십시오.</li>
</ol>
{img('06_dtype.webp', '재해형태 분석 — 떨어짐을 고른 화면. 공종·기인물·작업명 분포와 히트맵')}

<h3 id="t-fall"><span class="tab">심층 분석</span>추락높이 분석</h3>
<p>추락 사고를 높이로 갈라 보는 화면입니다. 추락 높이가 기록된 {fall:,}건이 대상입니다.
   안전난간·추락방호망 설치 기준을 따질 때 근거로 씁니다.</p>
<h4>이렇게 씁니다</h4>
<ol class="steps">
  <li>높이 구간별 건수에서 어느 높이대에 사고가 몰리는지 봅니다.</li>
  <li>기인물별·공종별·작업명별 건수로 그 높이대의 배경을 찾습니다.</li>
  <li>맨 아래 <b>이 화면을 읽는 법</b>에 해석 시 주의할 점이 적혀 있습니다.</li>
</ol>
{img('07_fall.webp', '추락높이 분석 — 높이 구간별 분포와 기인물·공종별 내역')}
<div class="box mark">
  <p>추락 높이는 <b>기록이 있는 사례만</b> 셉니다. 전체 추락 사고보다 적습니다.
     "2m 미만이 적다"가 아니라 "2m 미만은 높이가 덜 기록됐다"일 수 있으니 단정하지 마십시오.</p>
</div>

<h3 id="t-trend"><span class="tab">심층 분석</span>발생시기 분석</h3>
<p>연도·월·계절로 사고 추이를 보는 화면입니다. 해빙기·혹서기 대비 계획이나 연간 안전계획을 세울 때 씁니다.</p>
<h4>이렇게 씁니다</h4>
<ol class="steps">
  <li>연도별 추이로 전체가 줄고 있는지 봅니다.</li>
  <li>월별·계절 분포로 어느 시기에 몰리는지 확인합니다.</li>
  <li><b>기간 비교</b>에서 앞 기간과 뒤 기간을 견줘 무엇이 늘고 무엇이 줄었는지 봅니다.</li>
</ol>
{img('08_trend.webp', '발생시기 분석 — 연도·월·계절 추이와 기간 비교')}
<div class="box mark">
  <p>{yrs[0]}~{yrs[1]}년과 {yrs[-1]}년은 건수가 한 자릿수라 추세로 읽으면 안 됩니다.
     자료가 충분한 구간은 <b>{solid[0]}~{solid[-1]}년</b>입니다.</p>
</div>

<h3 id="t-ra"><span class="tab">위험성평가 생성</span>평가서 만들기</h3>
<p>고른 조건에 맞는 사례와 감소대책을 모아 인쇄할 수 있는 형태로 만들어 주는 화면입니다.
   들어가면 <b>발전업</b>과 <b>건설업</b> 중에 고릅니다.</p>
{img('09_ra_home.webp', '위험성평가 생성 첫 화면 — 발전업과 건설업 중 선택')}

<h4>발전업 — 기인물 기준 4단계</h4>
<ol class="steps">
  <li><b>기인물 선택</b> — 쓸 장비·가설물을 고릅니다. 여러 개 골라도 됩니다.
      이미 처리한 기인물은 표시가 남아 빠뜨리지 않습니다.</li>
  <li><b>재해형태 선택</b> — 그 기인물에서 나오는 재해형태 중 평가에 넣을 것을 고릅니다.</li>
  <li><b>작업명 선택</b> — 실제 하려는 작업과 비슷한 것을 고릅니다.</li>
  <li><b>재해사례 선택</b> — 조건에 맞는 사례가 모입니다. 기본은 전체 선택입니다.</li>
</ol>
{img('10_ra_step1.webp', '1단계 — 기인물 선택. 건수 비중에 따라 칩 색이 다릅니다')}

<p>4단계가 이 화면의 핵심입니다. 사례가 백 건 넘게 몰리면 표만으로는 고를 수 없어서,
   위에 <b>재해형태별 전체 통계 차트</b>를 두고 그 아래에 <b>재해 시나리오 카드</b>를 깝니다.</p>
<ul>
  <li>카드를 누르면 <b>그 시나리오의 사례만</b> 선택됩니다.</li>
  <li>카드에는 가장 많이 제시된 대책 한 줄이 함께 있어, 고르면서 대책을 볼 수 있습니다.</li>
  <li>색은 재해형태입니다. 위 차트 막대 색과 같습니다.</li>
  <li>여러 갈래를 함께 넣고 싶으면 표에서 직접 체크하면 됩니다.</li>
  <li>잘못 골랐으면 <b>전체 선택으로 되돌리기</b>를 누릅니다.</li>
</ul>
{img('11_ra_step4.webp', '4단계 — 위에 전체 통계, 아래에 재해 시나리오 카드')}

<p>다 골랐으면 <b>추가 후 다음 기인물</b>로 다른 기인물을 이어서 처리하거나,
   <b>추가 후 평가 완료</b>로 결과를 봅니다.</p>
{img('12_ra_result.webp', '평가 결과 — 권장 감소대책과 선택한 사례 목록. 인쇄하면 그대로 나옵니다')}

<h4>건설업 — 공종 기준 3단계</h4>
<p>공종 → 작업명 → 단위작업명 순으로 고릅니다. 발전소 공정이 아닌 일반 건설 현장에 씁니다.
   결과 화면에 위험도 카드, 권장 감소대책, 기인물·재해형태 분포, 사례 표가 함께 나옵니다.</p>
{img('13_ra_const.webp', '건설업 — 공종부터 고릅니다')}

<div class="box">
  <span class="t">결과를 그대로 제출하지 마십시오</span>
  <p>여기서 나오는 감소대책은 공단 원문 그대로입니다. 현장 조건에 맞게 고쳐 쓰고,
     현장에만 있는 위험요인은 직접 채워 넣으십시오. 이 화면은 빠뜨린 것이 없는지 확인하는 용도입니다.</p>
</div>

<h2 id="s5"><span class="no">5</span>재해 시나리오란</h2>

<p>같은 기인물이라도 사고가 나는 방식은 여러 갈래입니다.
   비계 떨어짐만 해도 구조물과의 틈으로 빠지는 것, 조립·해체 중 떨어지는 것,
   발판이 부러지는 것이 섞여 있고 <b>대책이 각각 다릅니다</b>.
   그래서 사례 원문을 읽고 사고 나는 방식으로 갈래를 나눴습니다. 이것이 재해 시나리오입니다.</p>

<div class="kpi">
  <div><b>{n_gi_sc}</b><span>기인물</span></div>
  <div><b>{n_scen}</b><span>재해 시나리오</span></div>
  <div><b>{n:,}</b><span>전건 분류</span></div>
  <div><b>3</b><span>나오는 화면</span></div>
</div>

<h4>어디에 나오나</h4>
<table>
  <tr><th>화면</th><th>쓰임</th></tr>
  <tr><td>기인물 조회</td><td>고른 기인물의 갈래 전체를 대표사례·대책과 함께 봅니다</td></tr>
  <tr><td>위험성평가 생성 4단계</td><td>카드를 눌러 그 갈래의 사례만 평가에 넣습니다</td></tr>
  <tr><td>위험지도</td><td>지금 보는 범위에서 건수가 많은 갈래 5가지를 봅니다</td></tr>
</table>

<h4>무엇을 기준으로 나눴나</h4>
<p>가장 중요한 기준은 <b>감소대책이 다른가</b>입니다. 사고 나는 방식이 달라 보여도 대책이 같으면 나눌 이유가 약하고,
   비슷해 보여도 대책이 다르면 나눴습니다. 위험성평가의 목적이 대책을 세우는 것이기 때문입니다.</p>
<p>개수는 미리 정해 두지 않았습니다. 내용이 갈리는 만큼 만들었습니다. 그래서 기인물마다 개수가 다릅니다 —
   지붕 채광판은 사고 나는 방식이 하나뿐이라 2개, 고소작업대는 19개입니다.</p>

<div class="box">
  <p>"그 밖의 ~"로 시작하는 갈래는 앞의 갈래에 들어가지 않은 사례가 모인 칸입니다.
     억지로 이름을 붙이면 무관한 사례가 몰려 이름이 사실을 가리지 못하므로 중립적으로 두었습니다.</p>
</div>

<div class="box mark">
  <span class="t">정답이 아닙니다</span>
  <p>재해 시나리오에 객관적 정답은 없습니다. 사례 원문을 읽고 내린 실무적 판단이며,
     다른 관점에서 다르게 나눌 수 있습니다. 나눈 기준과 절차, 검증 내용과 한계는
     <b>재해시나리오_분류방법론.html</b> 에 따로 적어 두었습니다.</p>
</div>

<h2 id="s6"><span class="no">6</span>숫자를 읽을 때 조심할 것</h2>

<table>
  <tr><th>항목</th><th>조심할 점</th></tr>
  <tr><td>모집단</td><td>{n:,}건은 <b>사망 또는 중상</b> 고위험요인 사례입니다. 전체 재해가 아닙니다.
      "이 기인물 사고가 몇 건"은 사망·중상 기준입니다.</td></tr>
  <tr><td>비율의 분모</td><td>화면을 좁히면 분모도 함께 좁아집니다. 지금 보는 범위가 분모입니다.</td></tr>
  <tr><td>연도</td><td>자료가 충분한 구간은 {solid[0]}~{solid[-1]}년입니다. 양 끝 해는 건수가 적어 추세로 읽으면 안 됩니다.</td></tr>
  <tr><td>추락 높이</td><td>기록이 있는 {fall:,}건만 셉니다.</td></tr>
  <tr><td>감소대책</td><td>공단 원문 그대로라 같은 뜻이 여러 표현으로 흩어져 있습니다.
      "가장 많이 제시된 대책"이 실제 빈도를 온전히 반영하지 못할 수 있습니다.</td></tr>
  <tr><td>건수가 적은 항목</td><td>1~2건짜리는 통계가 아니라 그런 사고가 있었다는 기록입니다.</td></tr>
  <tr><td>개인정보</td><td>사람·회사·현장을 특정할 수 있는 표현은 ○○○으로 가려 두었습니다.
      원문 맥락이 일부 끊겨 보일 수 있습니다.</td></tr>
</table>

<div class="box warn">
  <span class="t">이 시스템은 참고자료입니다</span>
  <p>과거 사고를 찾아 주는 도구이지 현장의 위험요인을 대신 판단해 주지 않습니다.
     여기 없는 위험이 현장에 있을 수 있습니다. 최종 판단은 현장을 아는 사람이 해야 합니다.</p>
</div>

<h4>함께 보면 좋은 문서</h4>
<table>
  <tr><th>문서</th><th>내용</th></tr>
  <tr><td><code>재해시나리오_분류방법론.html</code></td><td>재해 시나리오를 어떤 기준·절차로 나눴는지, 어떻게 검증했는지</td></tr>
  <tr><td><code>기인물_재해시나리오_초안.html</code></td><td>기인물 {n_gi_sc}종의 시나리오 전체 목록</td></tr>
  <tr><td><code>갱신방법.html</code></td><td>공단이 새 자료를 내면 반영하는 절차</td></tr>
</table>

</div></body></html>"""

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(doc)
    print(f"  {os.path.relpath(args.out, PROJECT_DIR)}  ({os.path.getsize(args.out) / 1024 / 1024:.2f}MB)")


if __name__ == '__main__':
    main()
