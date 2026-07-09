#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
자유서술 번역 배치 생성기.
 _todo_freetext.json (컬럼별 {ko, ids}) → 전역 고유 문자열에 gid 부여,
 문자 수 기준으로 배치 분할하여 scratchpad/batches/batch_NNN.json 생성.
 각 배치 = [{gid, col, ko}].  매니페스트도 저장.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODO = os.path.join(ROOT, "data", "i18n", "_todo_freetext.json")
OUTDIR = os.environ.get("BATCH_DIR")
if not OUTDIR:
    raise SystemExit("set BATCH_DIR env")
BATCHDIR = os.path.join(OUTDIR, "batches")
os.makedirs(BATCHDIR, exist_ok=True)

TARGET_CHARS = 28000  # 배치당 목표 문자 수
MAX_ITEMS = 300       # 배치당 최대 항목 수

def main():
    todo = json.load(open(TODO, encoding="utf-8"))
    items = []  # {gid, col, ko}
    gid = 0
    for col in ["재해개요", "재해유발요인", "위험성감소대책"]:
        for entry in todo[col]:
            items.append({"gid": gid, "col": col, "ko": entry["ko"]})
            gid += 1

    # 배치 분할
    batches = []
    cur, cur_chars = [], 0
    for it in items:
        cur.append(it)
        cur_chars += len(it["ko"])
        if cur_chars >= TARGET_CHARS or len(cur) >= MAX_ITEMS:
            batches.append(cur); cur, cur_chars = [], 0
    if cur:
        batches.append(cur)

    for i, b in enumerate(batches):
        with open(os.path.join(BATCHDIR, f"batch_{i:03d}.json"), "w", encoding="utf-8") as f:
            json.dump(b, f, ensure_ascii=False, indent=1)

    manifest = {"total_items": len(items), "num_batches": len(batches),
                "total_chars": sum(len(it["ko"]) for it in items)}
    json.dump(manifest, open(os.path.join(OUTDIR, "manifest.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(json.dumps(manifest, ensure_ascii=False))

if __name__ == "__main__":
    main()
