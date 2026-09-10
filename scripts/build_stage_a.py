#!/usr/bin/env python3
"""
A단계 — 공단 SIF 아카이브 원본(xlsx) → 확장열 28열 JSON

원래 주피터 노트북(scripts/notebooks/SIF_변환_검증_노트북.ipynb)으로 사람이 한 셀씩
돌리던 작업을 스크립트로 옮긴 것이다. 노트북과 같은 규칙을 쓰되, 다음이 다르다.

  · 판단 테이블(기인물 룩업·크로스워크·재해형태 용어·개별판정·KOEN 규칙)을
    코드 밖 scripts/mapping/*.json 에서 읽는다 — 코드를 열지 않고 고칠 수 있다.
  · 개별판정을 id가 아니라 재해개요 지문으로 찾는다 — 공단이 연번을 재배정해도
    같은 사례에 다시 붙는다.
  · 행수를 3,459로 박아두지 않는다 — 다음 배포판은 건수가 다르다.
  · 규칙으로 정하지 못한 사례는 멈추지 않고 미결 목록(scripts/out/미결_*.csv)으로
    뽑아 준다. 사람이 판정해 매핑 JSON에 넣고 다시 돌리면 된다.

사용:
  python3 scripts/build_stage_a.py --xlsx "source/한국산업안전보건공단_...xlsx"
  python3 scripts/build_stage_a.py --xlsx <원본> --out source/SIF_확장열.json

종료코드: 0 정상 / 2 미결 있음(산출물은 --allow-pending 일 때만 기록) / 1 오류
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import Counter

try:
    import pandas as pd
except ImportError:
    sys.exit("pandas 가 필요합니다:  pip3 install pandas openpyxl")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
MAP_DIR = os.path.join(SCRIPT_DIR, "mapping")
OUT_DIR = os.path.join(SCRIPT_DIR, "out")

# 확장열 28열 — build_dataset.py 와 사이트가 이 순서에 의존한다
COLS_B = ['id', '공종', '작업명', '단위작업명', '공종코드', '작업명코드', '단위작업코드', 'KOEN공정',
          '기인물분류', '기인물', '12대기인물', '위험도순위', '3년간사고비중',
          '발생연도', '발생월', '계절', '혹서기', '재해형태', '재해종류', '재해정도', '복수재해자', '추락고_m',
          '재해개요', '재해유발요인', '위험성감소대책', '감소대책_항목수', '재해개요_글자수', '익명처리']

RAW_COLS = ['연번', '공종', '작업명', '단위작업명', '재해종류', '재해개요', '기인물', '재해유발요인', '위험성감소대책']


def load_map(name):
    with open(os.path.join(MAP_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def fingerprint(s, n=40):
    """재해개요 지문 — 공백·마스킹 기호·숫자를 뺀 앞 40자. jaehae-manual.json 의 키와 같은 규칙."""
    return re.sub(r'[\s○◯Oo0-9]', '', s or '')[:n]


# ─────────────────────────────────────────────────────────────
# 1. 원본 로드
# ─────────────────────────────────────────────────────────────
def load_raw(xlsx, sheet=None):
    """공단 원본은 위쪽 몇 행이 제목·병합 헤더. '연번'이 있는 행을 찾아 그 아래 9열을 잘라낸다."""
    # 통합 파일(개요 / 제조업등 / 건설업)에서 건설업 시트를 고른다. 이름이 바뀌면 --sheet 로 지정.
    xf = pd.ExcelFile(xlsx)
    cand = [s for s in xf.sheet_names if '건설' in s] or xf.sheet_names[-1:]
    sheet = sheet or cand[0]
    print(f"  시트: {sheet}  (전체: {', '.join(xf.sheet_names)})")
    raw = pd.read_excel(xf, sheet_name=sheet, header=None)
    hdr, col0 = None, None
    for i in range(min(10, len(raw))):
        row = raw.iloc[i].astype(str).str.strip().tolist()
        if '연번' in row:
            hdr, col0 = i, row.index('연번')
            break
    if hdr is None:
        sys.exit("오류: 첫 10행 안에서 '연번' 헤더를 찾지 못했습니다. 원본 서식이 바뀌었는지 확인하십시오.")
    # 헤더가 2행에 걸쳐 병합돼 있으면(고위험작업·상황 / 공종·작업명·단위작업명) 그 다음 행부터 데이터
    start = hdr + 1
    if start < len(raw) and str(raw.iloc[start, col0 + 1]).strip() in ('공종', 'nan') and \
       str(raw.iloc[start, col0]).strip() in ('nan', ''):
        start += 1
    df = raw.iloc[start:, col0:col0 + 9].copy()
    df.columns = RAW_COLS
    df = df.dropna(subset=['재해개요']).reset_index(drop=True)
    for c in df.columns:
        if c != '연번':
            df[c] = df[c].astype(str).str.strip().str.replace('_x000D_', '', regex=False)
    return df


# ─────────────────────────────────────────────────────────────
# 2. 기인물 파생 4열 (룩업 + 크로스워크)
# ─────────────────────────────────────────────────────────────
def apply_giinmul(df, pending):
    lookup = load_map('giinmul-lookup.json')['항목']
    alias = load_map('giinmul-crosswalk.json').get('alias', {})
    key = df['기인물'].map(lambda x: alias.get(x, x))
    unknown = sorted(set(key) - set(lookup))
    for k in unknown:
        n = int((key == k).sum())
        pending['기인물'].append({'기인물': k, '건수': n,
                                '조치': 'scripts/mapping/giinmul-lookup.json 에 항목 추가 또는 giinmul-crosswalk.json alias 로 기존 명칭에 연결'})
    for col in ['기인물분류', '12대기인물', '위험도순위', '3년간사고비중']:
        df[col] = key.map(lambda k: lookup.get(k, {}).get(col))
    # 미결 기인물은 일단 '분류불능'으로 채워 파이프라인이 끝까지 가게 한다 (허용 시)
    df['기인물분류'] = df['기인물분류'].fillna('분류불능')
    df['3년간사고비중'] = df['3년간사고비중'].fillna('해당없음')
    df['12대기인물'] = df['12대기인물'].fillna(False).astype(bool)
    return df


# ─────────────────────────────────────────────────────────────
# 3. 발생 시점 · 코드 · 추락고 · 재해정도 등 파생
# ─────────────────────────────────────────────────────────────
YP = re.compile(r'((?:19|20)\d{2})')
MP = re.compile(r'(?:19|20)\d{2}\s*[년월.\-/]?\s*(\d{1,2})\s*[월년.\-/경]')
SEASON = {12: '겨울', 1: '겨울', 2: '겨울', 3: '봄', 4: '봄', 5: '봄',
          6: '여름', 7: '여름', 8: '여름', 9: '가을', 10: '가을', 11: '가을'}
U = r'(?:m|M|미터)(?![mM])'
HP = [re.compile(r'[Hh]\s*[≒=≈:：]\s*약?\s*([0-9]+(?:\.[0-9]+)?)\s*' + U),
      re.compile(r'높이\s*[:：]?\s*약?\s*([0-9]+(?:\.[0-9]+)?)\s*' + U),
      re.compile(r'약?\s*([0-9]+(?:\.[0-9]+)?)\s*' + U + r'\s*아래')]


def first_int(P, s):
    m = P.search(str(s))
    return int(m.group(1)) if m else None


def fall_height(s):
    for P in HP:
        m = P.search(str(s))
        if m:
            return float(m.group(1))
    return None


def degree(s):
    s = str(s)
    if '사망' in s or '익사' in s:
        return '사망'
    if '부상' in s:
        return '부상'
    return '미상'


def apply_derived(df, pending):
    df['발생연도'] = df['재해개요'].map(lambda s: first_int(YP, s))
    df['발생월'] = df['재해개요'].map(lambda s: first_int(MP, s))
    bad_month = df['발생월'].isna() | ~df['발생월'].between(1, 12)
    for _, x in df[bad_month].iterrows():
        pending['발생월'].append({'연번': x['연번'], '재해개요_앞부분': x['재해개요'][:60],
                                 '조치': '원문 연·월 표기 확인 후 build_stage_a.py 의 MP 정규식 보강'})
    df['계절'] = df['발생월'].map(lambda m: None if pd.isna(m) else SEASON[int(m)])
    df['혹서기'] = df['발생월'].map(lambda m: None if pd.isna(m) else
                                  ('혹서기' if int(m) in (6, 7, 8) else '혹한기' if int(m) in (12, 1, 2) else '-'))

    koen = load_map('koen-rule.json')
    ex_gj = set(koen['제외_공종'])
    ex_kw = koen['제외_단위작업_키워드']
    df['KOEN공정'] = ~(df['공종'].isin(ex_gj) |
                      df['단위작업명'].map(lambda s: any(k in str(s) for k in ex_kw)))

    df['공종코드'] = df['공종'].str.extract(r'^(\d+)\.')[0]
    df['작업명코드'] = df['작업명'].str.extract(r'^(\d+\.\d+)')[0]
    df['단위작업코드'] = df['단위작업명'].str.extract(r'^(\d+\.\d+\.\d+)')[0]
    for c, src in [('공종코드', '공종'), ('작업명코드', '작업명'), ('단위작업코드', '단위작업명')]:
        for _, x in df[df[c].isna()].iterrows():
            pending['코드'].append({'연번': x['연번'], '열': src, '값': x[src],
                                   '조치': '번호 접두가 없는 항목 — 공단 원본 표기 확인'})
    df['공종코드'] = pd.to_numeric(df['공종코드'], errors='coerce')

    df['추락고_m'] = df['재해개요'].map(fall_height)
    df['재해정도'] = df['재해개요'].map(degree)
    df['복수재해자'] = df['재해개요'].str.contains(r'[2-9]\s*명|\d\d\s*명', regex=True)
    df['감소대책_항목수'] = df['위험성감소대책'].str.count('▶')
    df['재해개요_글자수'] = df['재해개요'].str.len()
    df['익명처리'] = df['재해개요'].str.contains('○')
    return df


# ─────────────────────────────────────────────────────────────
# 4. 재해형태 — 공단 재해종류 → 사이트 용어
# ─────────────────────────────────────────────────────────────
def apply_jaehae(df, pending, review_rows):
    term = load_map('jaehae-term.json')
    manual = load_map('jaehae-manual.json')['항목']
    fix, keep, read = term['TERM_FIX'], set(term['KEEP']), set(term['READ'])
    allowed = set(term['허용_재해형태'])
    anchors = term['결과절_기준어']
    기전어 = [(lab, ws) for lab, ws in term['기전어']]
    원인어 = [(lab, ws) for lab, ws in term['원인어']]

    def 결과절(s, 기준어):
        for a in 기준어:
            i = s.rfind(a)
            if i >= 0:
                return s[i:]
        return s[-70:]

    def 마지막기전(tl):
        hits = [(tl.rfind(w), lab) for lab, ws in 기전어 for w in ws if tl.rfind(w) >= 0]
        return max(hits)[1] if hits else None

    def 첫원인(s):
        for lab, ws in 원인어:
            if any(w in s for w in ws):
                return lab
        return None

    df['재해형태'] = df['재해종류'].map(lambda t: fix.get(t, t))

    unknown_terms = sorted(set(df['재해종류']) - set(fix) - keep - read)
    for t in unknown_terms:
        pending['재해종류'].append({'재해종류': t, '건수': int((df['재해종류'] == t).sum()),
                                   '조치': 'scripts/mapping/jaehae-term.json 의 TERM_FIX/KEEP/READ 에 추가'})

    n_auto = n_manual = 0
    for i, x in df.iterrows():
        t = x['재해종류']
        if t not in read:
            continue
        s = x['재해개요']
        if t == '전도':
            v = 마지막기전(결과절(s, anchors['전도']))
        elif t == '파열':
            v = 마지막기전(결과절(s, anchors['파열']))
        else:  # 화상
            v = 첫원인(s)
        how = '자동(원문 판독)'
        if v is None:
            m = manual.get(fingerprint(s))
            if m:
                v, how = m['재해형태'], '개별판정(지문 매칭)'
                n_manual += 1
            else:
                pending['재해형태'].append({'연번': x['연번'], '재해종류': t, '지문': fingerprint(s),
                                          '재해개요': s, '조치': '원문을 읽고 재해형태를 정해 jaehae-manual.json 에 지문 키로 추가'})
                how = '미결'
        else:
            n_auto += 1
        if v is not None:
            df.at[i, '재해형태'] = v
        review_rows.append({'연번': x['연번'], '재해종류': t, '배정': v or '', '방법': how, '재해개요': s})

    bad = sorted(set(df['재해형태']) - allowed)
    if bad:
        # 미결(원문값 잔존) 외에 허용 목록을 벗어난 값이 있으면 규칙 오류
        leftover = [b for b in bad if b not in read and b not in unknown_terms]
        if leftover:
            sys.exit(f"오류: 허용되지 않은 재해형태 값 {leftover} — jaehae-term.json 확인")
    return df, n_auto, n_manual


# ─────────────────────────────────────────────────────────────
# 5. 저장 · 리포트
# ─────────────────────────────────────────────────────────────
def to_records(df):
    INT = {'id', '위험도순위', '발생연도', '발생월', '감소대책_항목수', '재해개요_글자수', '공종코드'}
    out = []
    for r in df.to_dict('records'):
        o = {}
        for k, v in r.items():
            if isinstance(v, bool) or type(v).__name__ == 'bool_':
                v = bool(v)
            elif hasattr(v, 'item') and not isinstance(v, str):   # numpy scalar
                v = v.item()
            if isinstance(v, float):
                v = None if v != v else (int(v) if k in INT else v)   # NaN → None
            if v is pd.NA:
                v = None
            o[k] = v
        out.append(o)
    return out


def write_csv(path, rows):
    if not rows:
        return
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--xlsx', required=True, help='공단 원본 xlsx 경로')
    ap.add_argument('--sheet', default=None, help='시트 이름 (기본: 이름에 "건설"이 들어간 시트)')
    ap.add_argument('--out', default=None, help='확장열 JSON 출력 경로 (기본: source/SIF_확장열_<건수>건.json)')
    ap.add_argument('--allow-pending', action='store_true',
                    help='미결이 있어도 산출물을 기록한다(미결 재해형태는 공단 원문값 유지)')
    args = ap.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)

    pending = {'기인물': [], '재해형태': [], '재해종류': [], '발생월': [], '코드': []}
    review = []

    print("A단계 — 공단 원본 → 확장열 28열\n")
    print("[1/4] 원본 로드")
    df = load_raw(args.xlsx, args.sheet)
    n = len(df)
    print(f"  {n:,}행 · 9열 · 재해개요 결측 {int(df['재해개요'].eq('').sum())}")

    print("[2/4] 파생 열")
    df = apply_giinmul(df, pending)
    df = apply_derived(df, pending)
    df, n_auto, n_manual = apply_jaehae(df, pending, review)
    print(f"  기인물 룩업 미결 {len(pending['기인물'])} · 재해형태 자동 {n_auto} / 개별판정 {n_manual} / 미결 {len(pending['재해형태'])}")

    df.insert(0, 'id', range(1, n + 1))
    df = df[COLS_B]

    # ── 미결 리포트
    print("[3/4] 미결 점검")
    n_pending = sum(len(v) for v in pending.values())
    for k, rows in pending.items():
        if rows:
            p = os.path.join(OUT_DIR, f'미결_{k}.csv')
            write_csv(p, rows)
            print(f"  ✗ {k} {len(rows)}건 → {os.path.relpath(p, PROJECT_DIR)}")
    write_csv(os.path.join(OUT_DIR, '재해형태_원문판독_검토목록.csv'), review)
    if n_pending == 0:
        print("  미결 없음 ✓")

    # ── 리포트
    out = args.out or os.path.join(PROJECT_DIR, 'source', f'SIF_확장열_{n}건.json')
    yrs = Counter(df['발생연도'].dropna().astype(int))
    rep = [
        "# A단계 리포트", "",
        f"- 원본: `{os.path.relpath(args.xlsx, PROJECT_DIR)}`",
        f"- 산출: `{os.path.relpath(out, PROJECT_DIR)}` ({n:,}건 × {len(COLS_B)}열)", "",
        "| 항목 | 값 |", "|---|---:|",
        f"| 행수 | {n:,} |",
        f"| 공종 / 작업명 / 단위작업명 | {df['공종'].nunique()} / {df['작업명'].nunique()} / {df['단위작업명'].nunique()} |",
        f"| 기인물 | {df['기인물'].nunique()} |",
        f"| 재해종류 → 재해형태 | {df['재해종류'].nunique()} → {df['재해형태'].nunique()} |",
        f"| 재해형태 자동 판독 / 개별판정 / 미결 | {n_auto} / {n_manual} / {len(pending['재해형태'])} |",
        f"| 12대기인물 | {int(df['12대기인물'].sum()):,} |",
        f"| KOEN공정 | {int(df['KOEN공정'].sum()):,} |",
        f"| 추락고 추출 | {int(df['추락고_m'].notna().sum()):,} |",
        f"| 발생연도 범위 | {min(yrs)}~{max(yrs)} |",
        f"| 미결 합계 | {n_pending} |", "",
    ]
    if n_pending:
        rep += ["## 미결 — 사람이 정해야 하는 것", ""]
        for k, rows in pending.items():
            if rows:
                rep.append(f"- **{k}** {len(rows)}건 → `scripts/out/미결_{k}.csv` · {rows[0]['조치']}")
        rep.append("")
    with open(os.path.join(OUT_DIR, 'stage_a_report.md'), 'w', encoding='utf-8') as f:
        f.write("\n".join(rep) + "\n")

    print("[4/4] 저장")
    if n_pending and not args.allow_pending:
        print(f"\n  미결 {n_pending}건 — 산출물을 기록하지 않았습니다.")
        print("  scripts/out/미결_*.csv 를 보고 매핑 JSON을 보완한 뒤 다시 실행하거나,")
        print("  일단 진행하려면 --allow-pending 을 붙이십시오(미결 재해형태는 공단 원문값이 남습니다).")
        sys.exit(2)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(to_records(df), f, ensure_ascii=False, indent=1)
    print(f"  {os.path.relpath(out, PROJECT_DIR)} ({os.path.getsize(out) / 1024 / 1024:.1f}MB)")
    print(f"  scripts/out/stage_a_report.md\n\nA단계 완료.")


if __name__ == '__main__':
    main()
