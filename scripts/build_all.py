#!/usr/bin/env python3
"""
공단 SIF 아카이브 갱신 — 한 번에 전부 돌리기

  공단 xlsx ─▶ [A] build_stage_a.py ─▶ 확장열 JSON ─▶ [T] build_tables.py ─▶ T4·T4m
                                                     └────────────────────────▶ [B] build_dataset.py ─▶ data/db.json

사용:
  python3 scripts/build_all.py --xlsx "source/한국산업안전보건공단_...xlsx"
  python3 scripts/build_all.py --xlsx <원본> --allow-pending     # 미결이 있어도 끝까지 (원문값 유지)

끝나면 scripts/out/갱신_리포트.md 에 이전 db.json 과의 차이(건수·기인물·공종·재해형태)를 적는다.
미결(사람이 정해야 하는 것)이 있으면 A단계에서 멈추고 scripts/out/미결_*.csv 를 남긴다 —
scripts/mapping/*.json 을 보완한 뒤 다시 실행하면 된다. 자세한 절차: 갱신방법.html
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from collections import Counter
from datetime import date

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(SCRIPT_DIR, 'out')
DB = os.path.join(PROJECT_DIR, 'data', 'db.json')
PY = sys.executable


def run(step, args):
    print(f"\n{'─' * 70}\n▶ {step}\n{'─' * 70}")
    r = subprocess.run([PY] + args, cwd=PROJECT_DIR)
    return r.returncode


def summarize(records):
    return {
        '건수': len(records),
        '기인물': Counter(r['기인물'] for r in records),
        '공종': Counter(r['공종'] for r in records),
        '재해형태': Counter(r['재해형태'] for r in records),
        '연도': Counter(r['발생연도'] for r in records if r.get('발생연도')),
        '대표사례': sum(1 for r in records if r.get('대표사례여부')),
        'KOEN': sum(1 for r in records if r.get('KOEN공정')),
    }


def diff_lines(title, before, after):
    added = sorted(set(after) - set(before)); removed = sorted(set(before) - set(after))
    lines = [f"### {title}", "",
             f"- 종수 {len(before)} → {len(after)}" + (f" · 신규 {len(added)}" if added else "") + (f" · 소멸 {len(removed)}" if removed else "")]
    if added:
        lines.append("- 신규: " + ", ".join(f"{k}({after[k]})" for k in added))
    if removed:
        lines.append("- 소멸: " + ", ".join(f"{k}({before[k]})" for k in removed))
    big = sorted(((after.get(k, 0) - before.get(k, 0), k) for k in set(before) | set(after)), reverse=True)
    big = [(d, k) for d, k in big if d != 0][:8]
    if big:
        lines.append("- 증감 상위: " + ", ".join(f"{k} {'+' if d > 0 else ''}{d}" for d, k in big))
    return lines + [""]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--xlsx', required=True, help='공단 원본 xlsx')
    ap.add_argument('--sheet', default=None, help='시트 이름 (기본: "건설"이 들어간 시트)')
    ap.add_argument('--allow-pending', action='store_true', help='미결이 있어도 끝까지 진행')
    ap.add_argument('--keep-previous', action='store_true', default=True,
                    help='이전 db.json 을 scripts/out/db_previous.json 으로 보관 (기본 켜짐)')
    args = ap.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)

    if not os.path.exists(args.xlsx):
        sys.exit(f"오류: 원본 파일 없음 — {args.xlsx}")

    # 이전 산출물 보관 (비교용)
    before = None
    if os.path.exists(DB):
        shutil.copy(DB, os.path.join(OUT_DIR, 'db_previous.json'))
        before = summarize(json.load(open(DB, encoding='utf-8')))
        print(f"이전 db.json {before['건수']:,}건 → scripts/out/db_previous.json 보관")

    # [A] 원본 → 확장열
    ext = os.path.join(PROJECT_DIR, 'source', 'SIF_확장열.json')
    a = ['scripts/build_stage_a.py', '--xlsx', args.xlsx, '--out', ext]
    if args.sheet: a += ['--sheet', args.sheet]
    if args.allow_pending: a += ['--allow-pending']
    rc = run('A단계 — 공단 원본 → 확장열 28열', a)
    if rc == 2:
        sys.exit("\n중단: 미결 항목이 있습니다. scripts/out/미결_*.csv 를 보고 scripts/mapping/*.json 을 보완한 뒤 다시 실행하십시오.\n"
                 "      (일단 끝까지 보려면 --allow-pending)")
    if rc:
        sys.exit(f"\n중단: A단계 실패 (코드 {rc})")
    n = len(json.load(open(ext, encoding='utf-8')))
    final_ext = os.path.join(PROJECT_DIR, 'source', f'SIF_확장열_{n}건.json')
    os.replace(ext, final_ext)
    print(f"  → {os.path.relpath(final_ext, PROJECT_DIR)}")

    # [T] 하위유형·대표사례
    if run('테이블 — 하위유형 군집 · 대표사례 (T4·T4m)', ['scripts/build_tables.py', '--src', final_ext]):
        sys.exit("\n중단: 테이블 생성 실패")

    # [B] db.json
    if run('B단계 — 마스킹 · 병합 · db.json', ['scripts/build_dataset.py', '--src', final_ext]):
        sys.exit("\n중단: B단계 실패 (개인정보 금지 패턴 잔존이면 build_dataset.py 의 PII_RULES/PII_OVERRIDES 보완)")

    # 리포트
    after = summarize(json.load(open(DB, encoding='utf-8')))
    lines = [f"# 갱신 리포트 — {date.today().isoformat()}", "",
             f"- 원본: `{os.path.relpath(args.xlsx, PROJECT_DIR)}`",
             f"- 확장열: `{os.path.relpath(final_ext, PROJECT_DIR)}`", "",
             "## 요약", "", "| 항목 | 이전 | 이번 |", "|---|---:|---:|"]
    for k in ['건수', '대표사례', 'KOEN']:
        lines.append(f"| {k} | {before[k] if before else '-'} | {after[k]} |")
    yrs = sorted(after['연도'])
    byrs = sorted(before['연도']) if before else []
    prev_range = f"{byrs[0]}~{byrs[-1]}" if byrs else "-"
    lines += [f"| 발생연도 범위 | {prev_range} | {yrs[0]}~{yrs[-1]} |", ""]
    if before:
        lines += ["## 차이", ""]
        for k in ['공종', '기인물', '재해형태']:
            lines += diff_lines(k, before[k], after[k])
    lines += ["## 다음 할 일", "",
              "1. `scripts/out/build_report.md` · `pii_audit.csv` 확인 (마스킹이 과하거나 빠진 곳)",
              "2. 로컬에서 사이트 열어 대시보드 건수·드롭다운·추락높이 탭 확인",
              "3. `scripts/test_analytics.mjs` 는 이전 배포판 표를 기준으로 하므로 새 배포판에서는 참고만",
              "4. 문제없으면 커밋·푸시 (배포)", ""]
    rp = os.path.join(OUT_DIR, '갱신_리포트.md')
    with open(rp, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))
    print(f"\n{'═' * 70}\n갱신 완료 — {after['건수']:,}건 · 리포트 scripts/out/갱신_리포트.md\n{'═' * 70}")
    print("\n".join(lines[5:14]))


if __name__ == '__main__':
    main()
