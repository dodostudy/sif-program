#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
번역 결과 병합기: out/batch_*.json ([{gid, en}]) + _todo_freetext.json
 → data/i18n/db_en.json  ({"<id>": {"재해개요": "...", ...}})

QA 자동검사 포함:
 - gid 전량 커버리지 (누락 배치/항목 보고)
 - 숫자 보존율(원문 숫자 토큰이 번역에 존재하는지)
 - ▶ 불릿 개수 일치
 - 빈 번역/한글 잔존 검사
"""
import json, glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODO = os.path.join(ROOT, "data", "i18n", "_todo_freetext.json")
OUT_DB = os.path.join(ROOT, "data", "i18n", "db_en.json")
BATCH_OUT = os.environ.get("BATCH_OUT")
if not BATCH_OUT:
    raise SystemExit("set BATCH_OUT env (dir with batch_*.json translations)")

COLS = ["재해개요", "재해유발요인", "위험성감소대책"]


def build_gid_index():
    todo = json.load(open(TODO, encoding="utf-8"))
    idx = []  # gid -> {col, ko, ids}
    for col in COLS:
        for entry in todo[col]:
            idx.append({"col": col, "ko": entry["ko"], "ids": entry["ids"]})
    return idx


def main():
    idx = build_gid_index()
    total = len(idx)

    # 번역 로드
    en_by_gid = {}
    for path in sorted(glob.glob(os.path.join(BATCH_OUT, "batch_*.json"))):
        try:
            arr = json.load(open(path, encoding="utf-8"))
        except Exception as e:
            print(f"[FAIL] {os.path.basename(path)}: JSON parse error: {e}")
            continue
        for it in arr:
            g = it.get("gid")
            en = (it.get("en") or "").strip()
            if g is not None and en:
                en_by_gid[g] = en

    missing = [g for g in range(total) if g not in en_by_gid]
    print(f"coverage: {len(en_by_gid)}/{total} (missing {len(missing)})")
    if missing:
        print("missing gids (first 20):", missing[:20])

    # QA 검사
    num_re = re.compile(r"\d+(?:[.,]\d+)?")
    bad_nums, bad_bullets, has_korean = [], [], []
    for g, en in en_by_gid.items():
        ko = idx[g]["ko"]
        ko_nums = set(num_re.findall(ko.replace(",", "")))
        en_norm = en.replace(",", "")
        miss_n = [n for n in ko_nums if n not in en_norm]
        if miss_n:
            bad_nums.append((g, miss_n[:3]))
        if ko.count("▶") != en.count("▶"):
            bad_bullets.append(g)
        if re.search(r"[가-힣]", en):
            has_korean.append(g)
    print(f"QA — number preservation issues: {len(bad_nums)}")
    print(f"QA — bullet count mismatches:   {len(bad_bullets)}")
    print(f"QA — korean remaining in en:    {len(has_korean)}")
    if bad_nums[:5]:
        print("  sample num issues:", bad_nums[:5])
    if has_korean[:10]:
        print("  sample korean-remaining gids:", has_korean[:10])

    # id 기반 db_en.json 생성
    db_en = {}
    filled = 0
    for g, en in en_by_gid.items():
        col = idx[g]["col"]
        for rid in idx[g]["ids"]:
            db_en.setdefault(str(rid), {})[col] = en
            filled += 1
    json.dump(db_en, open(OUT_DB, "w", encoding="utf-8"), ensure_ascii=False)
    size = os.path.getsize(OUT_DB)
    print(f"db_en.json written: {len(db_en)} records, {filled} fields, {size:,} bytes")
    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main())
