#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n 정적 감사: 각 페이지 HTML의 '정적 텍스트노드' 한글이
ui_en.json / glossary_en.json / data-en 속성으로 커버되는지 전수 검사.

- <script>/<style> 내부(JS 템플릿)는 제외 → 동적 문자열은 스크린샷으로 별도 검증
- data-en 조상이 있는 텍스트는 커버로 간주 (EN 모드에서 innerHTML 통째 교체됨)
- 숫자+단위(건/개/위/페이지)만 남는 텍스트는 런타임 _numUnits()가 처리하므로 무시

사용: python3 scripts/i18n_audit.py   (미커버 있으면 exit 1)
"""
import json, re, sys, os
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index.html', 'pages/intro.html', 'pages/process-inquiry.html',
         'pages/cause-inquiry.html', 'pages/disaster-type.html',
         'pages/risk-assessment.html', 'pages/risk-map.html']

ui = json.load(open(f'{ROOT}/data/i18n/ui_en.json', encoding='utf-8'))
gl = json.load(open(f'{ROOT}/data/i18n/glossary_en.json', encoding='utf-8'))


def strip_num(s):
    return re.sub(r'^\d+(\.\d+)*\.?\s*', '', s)


flat = dict(ui)
for col, m in gl.items():
    for ko, en in m.items():
        flat.setdefault(ko, en)
        ks = strip_num(ko)
        if ks != ko:
            flat.setdefault(ks, strip_num(en))

HANGUL = re.compile(r'[가-힣]')


class Aud(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True)
        s.stack = []   # (tag, has_data_en)
        s.skip = 0     # script/style 깊이
        s.hits = []

    def handle_starttag(s, tag, attrs):
        d = dict(attrs)
        if tag in ('script', 'style'):
            s.skip += 1
        if tag not in ('br', 'img', 'input', 'meta', 'hr', 'path', 'svg'):
            s.stack.append((tag, 'data-en' in d))

    def handle_endtag(s, tag):
        if tag in ('script', 'style') and s.skip > 0:
            s.skip -= 1
        for i in range(len(s.stack) - 1, -1, -1):
            if s.stack[i][0] == tag:
                del s.stack[i]
                break

    def handle_data(s, data):
        if s.skip:
            return
        t = data.strip()
        if not t or not HANGUL.search(t):
            return
        if any(de for _, de in s.stack):
            return  # data-en 조상 → 커버
        if t in flat:
            return  # 사전 커버
        red = re.sub(r'[\d,\s()%.\-→·:]|건|개|위|페이지', '', t)
        if not HANGUL.search(red):
            return  # 숫자단위만 → 런타임 처리
        s.hits.append(t)


total = 0
for fn in PAGES:
    a = Aud()
    a.feed(open(f'{ROOT}/{fn}', encoding='utf-8').read())
    seen = set()
    uniq = [x for x in a.hits if not (x in seen or seen.add(x))]
    total += len(uniq)
    print(f"\n{'=' * 55}\n{fn}: 미커버 정적 한글 {len(uniq)}건")
    for x in uniq:
        print("   •", x[:110])

print(f"\n총 미커버: {total}건")
sys.exit(0 if total == 0 else 1)
