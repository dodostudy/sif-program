#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
기인물별 재해 시나리오 — xlsx 내보내기

  scripts/out/scenario_result.json  ─▶  scripts/out/기인물별_재해시나리오.xlsx

시트 넷:
  1. 기인물 요약   기인물마다 사례·재해형태·시나리오 개수. 한 장으로 훑는 용도.
  2. 시나리오      시나리오 한 줄씩. 대표사례와 핵심대책 3개까지. 이 파일의 본체다.
  3. 사례 배정     사례 3,459건이 각각 어느 시나리오로 갔는지. 근거를 되짚을 때 쓴다.
  4. 읽는 법       열 설명과 한계. 파일만 따로 돌아다녀도 뜻이 통하게 적어 둔다.

먼저 scripts/build_scenarios.py 를 돌려 scenario_result.json 이 있어야 한다.

사용:
  python3 scripts/export_scenarios_xlsx.py

필요 패키지: xlsxwriter   (pip3 install xlsxwriter)
"""

import argparse
import json
import os
import sys

try:
    import xlsxwriter
except ImportError:
    sys.exit("패키지 누락: xlsxwriter\n  pip3 install xlsxwriter")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', default=os.path.join(SCRIPT_DIR, 'out', 'scenario_result.json'))
    ap.add_argument('--db', default=os.path.join(PROJECT_DIR, 'data', 'db.json'))
    ap.add_argument('--out', default=os.path.join(SCRIPT_DIR, 'out', '기인물별_재해시나리오.xlsx'))
    args = ap.parse_args()

    if not os.path.exists(args.src):
        sys.exit(f"먼저 python3 scripts/build_scenarios.py 를 돌리십시오 — {args.src} 없음")

    data = json.load(open(args.src, encoding='utf-8'))
    db = {r['id']: r for r in json.load(open(args.db, encoding='utf-8'))}
    data = dict(sorted(data.items(), key=lambda kv: -kv[1]['total']))

    wb = xlsxwriter.Workbook(args.out, {'constant_memory': False})
    F = {
        'head':  wb.add_format({'bold': True, 'bg_color': '#1F2937', 'font_color': '#FFFFFF',
                                'border': 1, 'border_color': '#374151', 'align': 'center',
                                'valign': 'vcenter', 'text_wrap': True}),
        'txt':   wb.add_format({'border': 1, 'border_color': '#D1D5DB', 'valign': 'top', 'text_wrap': True}),
        'txt_n': wb.add_format({'border': 1, 'border_color': '#D1D5DB', 'valign': 'top'}),
        'num':   wb.add_format({'border': 1, 'border_color': '#D1D5DB', 'valign': 'top',
                                'align': 'right', 'num_format': '#,##0'}),
        'pct':   wb.add_format({'border': 1, 'border_color': '#D1D5DB', 'valign': 'top',
                                'align': 'right', 'num_format': '0.0"%"'}),
        'gi':    wb.add_format({'border': 1, 'border_color': '#D1D5DB', 'valign': 'top', 'bold': True}),
        'title': wb.add_format({'bold': True, 'font_size': 14}),
        'body':  wb.add_format({'text_wrap': True, 'valign': 'top'}),
        'b':     wb.add_format({'bold': True}),
    }

    def sheet(name, cols, rows):
        """cols = [(제목, 너비, 서식키)]"""
        ws = wb.add_worksheet(name)
        ws.freeze_panes(1, 0)
        ws.set_row(0, 30)
        for i, (t, w, _) in enumerate(cols):
            ws.write(0, i, t, F['head'])
            ws.set_column(i, i, w)
        for r, row in enumerate(rows, 1):
            for c, v in enumerate(row):
                ws.write(r, c, v, F[cols[c][2]])
        ws.autofilter(0, 0, len(rows), len(cols) - 1)
        return ws

    # ── 1. 기인물 요약
    s1 = []
    for 기, v in data.items():
        forms = v['types']
        s1.append([기, v['total'], len(forms),
                   sum(len(t['scenarios']) for t in forms),
                   forms[0]['재해형태'], forms[0]['비중'],
                   ' · '.join(f"{t['재해형태']} {len(t['scenarios'])}개" for t in forms)])
    sheet('1. 기인물 요약', [
        ('기인물', 30, 'gi'), ('사례', 8, 'num'), ('재해형태', 10, 'num'), ('시나리오', 10, 'num'),
        ('1위 재해형태', 16, 'txt_n'), ('1위 비중', 10, 'pct'), ('재해형태별 시나리오 수', 60, 'txt'),
    ], s1)

    # ── 2. 시나리오 (본체)
    s2 = []
    for 기, v in data.items():
        for t in v['types']:
            for rank, s in enumerate(t['scenarios'], 1):
                rep = s['대표사례']
                ms = [m for m, _ in s['핵심대책']] + ['', '', '']
                s2.append([
                    기, t['재해형태'], t['건수'], rank, s['이름'], s['건수'],
                    s['재해형태내비중'], s['비중'],
                    ' · '.join(f"{w}({n})" for w, n in s['주요작업']),
                    rep['id'], str(rep['공종']), str(rep['작업명']), rep['발생연도'],
                    rep['재해유발요인'], ms[0], ms[1], ms[2], s['규칙순위'],
                ])
    sheet('2. 시나리오', [
        ('기인물', 24, 'gi'), ('재해형태', 14, 'txt_n'), ('재해형태 건수', 10, 'num'),
        ('순위', 6, 'num'), ('재해 시나리오', 44, 'txt'), ('건수', 7, 'num'),
        ('재해형태 내 비중', 10, 'pct'), ('기인물 내 비중', 10, 'pct'),
        ('주요 작업', 40, 'txt'),
        ('대표사례 번호', 10, 'num'), ('대표사례 공종', 22, 'txt'), ('대표사례 작업명', 22, 'txt'),
        ('대표사례 연도', 9, 'num'), ('대표사례 재해유발요인', 70, 'txt'),
        ('핵심대책 1', 55, 'txt'), ('핵심대책 2', 55, 'txt'), ('핵심대책 3', 55, 'txt'),
        ('배정 규칙 순위', 9, 'num'),
    ], s2)

    # ── 3. 사례 배정
    s3 = []
    for 기, v in data.items():
        for t in v['types']:
            for s in t['scenarios']:
                for i in s['사례id']:
                    r = db.get(i, {})
                    s3.append([i, 기, t['재해형태'], s['이름'],
                               i == s['대표사례']['id'] and '대표' or '',
                               str(r.get('공종', '')), str(r.get('작업명', '')),
                               r.get('발생연도', ''), r.get('재해유발요인', '')])
    s3.sort(key=lambda x: x[0])
    sheet('3. 사례 배정', [
        ('사례번호', 10, 'num'), ('기인물', 24, 'txt_n'), ('재해형태', 14, 'txt_n'),
        ('재해 시나리오', 44, 'txt'), ('대표', 7, 'txt_n'),
        ('공종', 22, 'txt'), ('작업명', 22, 'txt'), ('발생연도', 9, 'num'),
        ('재해유발요인', 80, 'txt'),
    ], s3)

    # ── 4. 읽는 법
    ws = wb.add_worksheet('4. 읽는 법')
    ws.set_column(0, 0, 22)
    ws.set_column(1, 1, 95)
    n_gi = len(data)
    n_case = sum(v['total'] for v in data.values())
    n_scen = sum(len(t['scenarios']) for v in data.values() for t in v['types'])
    lines = [
        ('', ''),
        ('무엇인가', f'공단 SIF 아카이브 {n_case:,}건을 기인물 {n_gi}종 아래 재해 시나리오 {n_scen}개로 나눈 표입니다. '
                     '위험성평가에서 기인물을 고르면 "이 기인물은 이런 방식으로 사망사고가 난다"를 보여주기 위한 정의입니다.'),
        ('구조', '기인물(공단 원본) → 재해형태(공단 원본) → 재해 시나리오(이번에 정의). 모두 건수가 많은 순서입니다.'),
        ('', ''),
        ('무엇을 기준으로 나눴나', '① 사고가 나는 방식(기전)이 다른가 ② 감소대책이 다른가 ③ 설명할 수 있는가. '
                                  '가장 중요한 기준은 ②입니다. 기전이 달라 보여도 대책이 같으면 나눌 이유가 약하고, '
                                  '비슷해 보여도 대책이 다르면 나눴습니다.'),
        ('개수를 정해 두었나', '아닙니다. 내용이 갈리는 만큼 만들었습니다. 그래서 기인물마다 개수가 다릅니다. '
                              '지붕 채광판은 167건이지만 기전이 하나뿐이라 2개, 고소작업대는 173건에 19개입니다.'),
        ('"그 밖의 ~"는 무엇인가', '앞의 규칙에 걸리지 않은 사례가 모이는 칸입니다. 그럴듯한 이름을 붙이면 '
                                 '무관한 사례가 몰려 이름이 사실을 가리지 못하므로 중립적으로 두었습니다. 전체의 24.7%입니다.'),
        ('', ''),
        ('대표사례는 누가 골랐나', '사람이 고르지 않았습니다. 시나리오 안에서 다른 사례들과 문장이 가장 비슷한 한 건을 '
                                 '기계가 정합니다(TF-IDF 코사인 유사도 평균 최대). 그 시나리오의 전형에 해당합니다.'),
        ('핵심대책은 무엇인가', '그 시나리오에 속한 사례들의 위험성감소대책 문장을 세어 많은 순으로 3개입니다. '
                              '공단 원문 그대로라 같은 뜻이 여러 표현으로 흩어져 있습니다. 현장에 맞게 다듬어 쓰십시오.'),
        ('배정 규칙 순위', '규칙은 목록 순서대로 적용되고 걸린 사례는 아래로 내려가지 않습니다. '
                         '이 열은 그 시나리오가 몇 번째 규칙이었는지를 나타냅니다. 숫자 자체에 의미는 없습니다.'),
        ('', ''),
        ('얼마나 믿을 수 있나', '분류를 만들지 않은 별도의 검토자가 6회에 걸쳐 사례 원문 약 1,900건을 대조했고 '
                              '지적을 반영했습니다. 같은 원본에 같은 규칙을 적용하면 항상 같은 결과가 나옵니다.'),
        ('한계', '재해 시나리오에 객관적 정답은 없습니다. 사례 원문을 읽고 내린 실무적 판단이며 다른 관점에서 다르게 '
                '나눌 수 있습니다. 원문이 짧아 무슨 작업이었는지 알 수 없는 사례는 억지로 배정하지 않고 "그 밖의 ~"에 두었습니다. '
                '건수가 적은 시나리오는 통계적 대표성이 없는, 그런 사고가 있었다는 기록입니다.'),
        ('쓸 때의 전제', '이 표는 위험성평가의 참고자료입니다. 현장의 실제 위험요인을 대체하지 않습니다.'),
        ('', ''),
        ('자세한 근거', 'scripts/docs/재해시나리오_분류방법론.html 에 기준·절차·검증 내용과 한계를 적어 두었습니다. '
                      '규칙 원본은 scripts/mapping/scenario_rules.py 입니다.'),
    ]
    ws.write(0, 0, '기인물별 재해 시나리오 — 읽는 법', F['title'])
    for r, (k, v) in enumerate(lines, 2):
        if k:
            ws.write(r, 0, k, F['b'])
            ws.write(r, 1, v, F['body'])
            ws.set_row(r, max(15, (len(v) // 60 + 1) * 15))

    wb.close()
    print(f"기인물 {n_gi} · 사례 {n_case:,} · 시나리오 {n_scen}")
    print(f"  시트 2 시나리오 {len(s2):,}행 · 시트 3 사례배정 {len(s3):,}행")
    print(f"  {os.path.relpath(args.out, PROJECT_DIR)}  ({os.path.getsize(args.out) / 1024:.0f}KB)")


if __name__ == '__main__':
    main()
