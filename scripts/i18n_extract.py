#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n 추출기: db.json에서 번역 대상 문자열을 뽑아 작업목록을 생성한다.
 - 범주형 컬럼: 컬럼별 고유값 목록  -> data/i18n/_todo_categories.json
 - 자유서술 컬럼: 고유 문단 + 사용 id  -> data/i18n/_todo_freetext.json
정규화: _x000D_ 제거. ▶ 불릿/\n 개행은 보존.
"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "db.json")
OUT = os.path.join(ROOT, "data", "i18n")
os.makedirs(OUT, exist_ok=True)

CAT_COLS = ["공종", "작업명", "단위작업명", "기인물분류", "기인물",
            "3년간사고비중", "혹서기", "재해형태"]
TEXT_COLS = ["재해개요", "재해유발요인", "위험성감소대책"]


def norm(s):
    if not isinstance(s, str):
        return s
    return s.replace("_x000D_", "").strip()


def main():
    with open(DB, encoding="utf-8") as f:
        data = json.load(f)

    # 범주형: 컬럼별 고유값
    cats = {c: sorted({norm(r[c]) for r in data if isinstance(r.get(c), str) and norm(r[c])})
            for c in CAT_COLS}

    # 자유서술: 고유 문단 -> 사용 id 목록
    text_uses = {c: defaultdict(list) for c in TEXT_COLS}
    for r in data:
        for c in TEXT_COLS:
            v = norm(r.get(c))
            if isinstance(v, str) and v:
                text_uses[c][v].append(r["id"])

    # 저장
    with open(os.path.join(OUT, "_todo_categories.json"), "w", encoding="utf-8") as f:
        json.dump(cats, f, ensure_ascii=False, indent=2)

    freetext = {c: [{"ko": k, "ids": v} for k, v in text_uses[c].items()]
                for c in TEXT_COLS}
    with open(os.path.join(OUT, "_todo_freetext.json"), "w", encoding="utf-8") as f:
        json.dump(freetext, f, ensure_ascii=False, indent=2)

    # 통계
    print("records:", len(data))
    print("--- 범주형 고유값 ---")
    total_cat = 0
    for c in CAT_COLS:
        print(f"  {c}: {len(cats[c])}")
        total_cat += len(cats[c])
    print("  범주형 합계:", total_cat)

    print("--- 자유서술 고유 문단 / 총 문자 ---")
    total_txt = 0
    total_chars = 0
    for c in TEXT_COLS:
        uniq = len(text_uses[c])
        chars = sum(len(k) for k in text_uses[c])
        total_txt += uniq
        total_chars += chars
        print(f"  {c}: 고유 {uniq} / 문자 {chars:,}")
    print("  자유서술 고유 합계:", total_txt, "/ 총 문자:", f"{total_chars:,}")
    # 대략 한글 1자 ~= 1.4 토큰(입력) 추정
    print("  입력 토큰 대략 추정:", f"{int(total_chars*1.4):,}")


if __name__ == "__main__":
    main()
