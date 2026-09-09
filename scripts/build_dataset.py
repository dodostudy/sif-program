#!/usr/bin/env python3
"""
SIF 데이터셋 빌드 스크립트 (파이프라인 B단계)

A단계(공단 원본 → 확장열 28열)는 scripts/notebooks/SIF_변환_검증_노트북.ipynb 가 담당하고,
본 스크립트는 그 산출물을 사이트 배포용 데이터로 변환한다.

  입력  source/SIF_신버전_확장열_3459건.json   (A단계 산출물, 3,459건 × 28열)
        source/T4m_사례하위유형매핑.json        (사례 → 하위유형 소속)
        source/T4_대표사례.json                 (하위유형 → 대표사례 id, 정본)
  출력  data/db.json           (30열, minified)
        data/dropdown-ref.json (공종 계층 + 기인물분류 맵 + 12대기인물)
        scripts/out/build_report.md  검증 리포트
        scripts/out/pii_audit.csv    개인정보 마스킹 내역 (사람 확인용)

실행:  python3 scripts/build_dataset.py
"""

import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

SRC_MAIN = os.path.join(PROJECT_DIR, "source", "SIF_신버전_확장열_3459건.json")
SRC_T4M = os.path.join(PROJECT_DIR, "source", "T4m_사례하위유형매핑.json")
SRC_T4 = os.path.join(PROJECT_DIR, "source", "T4_대표사례.json")
DATA_DIR = os.path.join(PROJECT_DIR, "data")
OUT_DIR = os.path.join(SCRIPT_DIR, "out")
DB_JSON = os.path.join(DATA_DIR, "db.json")
DROPDOWN_JSON = os.path.join(DATA_DIR, "dropdown-ref.json")

EXPECTED_ROWS = 3459

# 확장열 28열 + 병합 2열 = db.json 30열 (순서 고정 — 프런트가 의존)
COLUMNS = [
    "id", "공종", "작업명", "단위작업명", "공종코드", "작업명코드", "단위작업코드",
    "KOEN공정", "기인물분류", "기인물", "12대기인물", "위험도순위", "3년간사고비중",
    "발생연도", "발생월", "계절", "혹서기", "재해형태", "재해종류", "재해정도",
    "복수재해자", "추락고_m", "재해개요", "재해유발요인", "위험성감소대책",
    "감소대책_항목수", "재해개요_글자수", "익명처리",
    "하위유형번호", "대표사례여부",
]

BOOL_COLS = {"KOEN공정", "12대기인물", "복수재해자", "익명처리", "대표사례여부"}
INT_COLS = {"id", "공종코드", "발생연도", "발생월", "감소대책_항목수", "재해개요_글자수", "하위유형번호"}
INT_NULLABLE_COLS = {"위험도순위"}
FLOAT_NULLABLE_COLS = {"추락고_m"}

TEXT_COLS = ["재해개요", "재해유발요인", "위험성감소대책"]


# ─────────────────────────────────────────────────────────────
# 개인정보 마스킹
#
# 공단 원본의 비식별 처리가 일관되지 않아(3,459건 중 224건 미처리) 실명·주소·업체명이
# 남아 있다. 본 사이트는 공개 GitHub Pages 이므로 배포 전 반드시 제거한다.
#
#  · PII_RULES     : 클래스 단위 정규식. 차기 공단 배포판에도 그대로 적용된다.
#  · PII_OVERRIDES : 규칙으로 안전하게 잡히지 않는 고유명사(업체·건물·사업명)를
#                    레코드별로 명시 치환. 원문 조각을 그대로 적어 검수 가능하게 둔다.
#  · PII_FORBIDDEN : 마스킹 후 남아 있으면 빌드를 실패시키는 패턴.
# ─────────────────────────────────────────────────────────────

# 역할을 가리키는 단어 — 이름이 아니므로 마스킹 대상에서 제외
ROLE_WORDS = "재해자|피재자|근로자|작업자|사망자|피해자|부상자|신호수|운전원|관리자"

PII_RULES = [
    # 1) 전체 주소 — 시도 + 하위 행정구역 반복 (+ 지번). 시도 뒤에 행정구역이
    #    반드시 하나 이상 따라와야 하므로 "대전차 저지", "부산물", "부산에서" 는 걸리지 않는다.
    (
        "주소",
        re.compile(
            r"(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)"
            r"(?:특별시|광역시|특별자치시|특별자치도|시|도)?"
            r"(?:\s*[가-힣]{1,6}(?:시|군|구|읍|면|동|리))+"
            r"(?:\s*\d+가)?(?:\s*\d+(?:-\d+)?(?:번지)?)?"
            r"(?:\s*소재)?\s*"
        ),
        "○○ ",
    ),
    # 1-1) 시도 없이 "○○시 소재" 형태로만 남은 지명
    ("지명+소재", re.compile(r"[가-힣]{2,5}(?:시|군|구)\s*소재\s*"), "○○ "),
    # 2) 이름(성+이름) + 나이 조합 — "김○○(39세, 남, 사망)" 형태
    (
        "실명+나이",
        re.compile(r"(?<![가-힣])(?!(?:" + ROLE_WORDS + r"))[가-힣]{2,4}\s*\(\s*(?:만\s*)?\d{1,2}\s*세"),
        "○○○(○○세",
    ),
    # 3) 괄호 안 이름 + 나이 — "(최○○,34세,남)" / "(이○○, 남, 만 63세)"
    (
        "괄호내 실명",
        re.compile(
            r"\(\s*(?!(?:" + ROLE_WORDS + r"))([가-힣]{2,4})\s*,\s*"
            r"(?=(?:[남여]\s*,\s*)?(?:만\s*)?\d{1,2}\s*세)"
        ),
        "(○○○, ",
    ),
    # 4) 역할어 + 실명 — "근로자 서○○(사망자)"
    (
        "역할어+실명",
        re.compile(r"(?<=근로자\s)(?!(?:" + ROLE_WORDS + r"))[가-힣]{2,4}(?=\s*\(사망자\))"),
        "○○○",
    ),
    # 5) 남은 나이 표기
    ("나이", re.compile(r"(?:만\s*)?\d{1,2}\s*세(?=\s*[,)])"), "○○세"),
    # 6) 법인 표기가 붙은 업체명.
    #    접두형((주)○○)을 먼저 시도하고, 접미형(○○(주))은 뒤에 상호가 이어지지 않을 때만
    #    매칭한다. 그렇지 않으면 "소재 (주)호반건설"에서 "소재 (주)"만 먹고 상호가 남는다.
    (
        "업체명",
        re.compile(
            r"(?:\(주\)|㈜|주식회사)\s*[가-힣A-Za-z0-9]{2,12}"
            r"|[가-힣A-Za-z0-9]{2,12}\s*(?:\(주\)|㈜)(?![가-힣])"
        ),
        "○○사",
    ),
    # 7) 상세 일자 표기 — "2020.10.24.(토) 11:20경"
    ("상세일자", re.compile(r"\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*(?:\([월화수목금토일]\))?\s*(?:\d{1,2}:\d{2}\s*(?:분)?경)?"), ""),
]

# 규칙으로 안전하게 일반화할 수 없는 고유명사 (업체·건물·사업명·잔여 표기)
PII_OVERRIDES = {
    367: [("○○현장에서㈜", "○○현장에서")],
    529: [("한강씨엠(주) 기존공장", "○○사 기존공장")],
    3109: [
        ("(주)더 사옥 신축공사", "○○ 신축공사"),
        ("효성타워(타워크레인설치)", "○○사(타워크레인설치)"),
        (".21.(월) 12:30분경 ", ""),
    ],
    3125: [
        ("시흥배곧신도시 B-11블럭 호반베르디움 신축공사", "○○ 신축공사"),
        (". 26(월) 11:30경 ", ""),
    ],
    3185: [
        ("대성동 LJ빌딩 신축공사", "○○ 신축공사"),
        (" 17일(금) 15:40분경 ", ""),
    ],
    2800: [("다가구주택 개축공사", "○○ 개축공사")],
}

# 마스킹 후 남아 있으면 안 되는 것 — 빌드 실패 조건
PII_FORBIDDEN = [
    ("실명(확인된 4건)", re.compile(r"김태우|최준영|서순정|이관모")),
    ("업체·건물 고유명", re.compile(r"익수종합건설|호반건설|신학산기공|엘케이종합건설|한강씨엠|효성타워|호반베르디움|LJ빌딩")),
    ("지번", re.compile(r"\d+\s*-\s*\d+\s*번지|삼선동|성북구|양정동|대성동")),
    ("나이", re.compile(r"(?:만\s*)?\d{1,2}\s*세\s*[,)]")),
    ("법인표기", re.compile(r"㈜|\(주\)|주식회사")),
]


def mask_pii(records):
    """개인정보 마스킹. (마스킹된 레코드 수, 감사 로그) 반환"""
    audit = []

    for rec in records:
        for col in TEXT_COLS:
            original = rec[col] or ""
            text = original

            # 1) 레코드별 명시 치환 먼저 (규칙보다 구체적)
            for frag, repl in PII_OVERRIDES.get(rec["id"], []):
                if frag in text:
                    text = text.replace(frag, repl)
                    audit.append([rec["id"], col, "override", frag, repl])

            # 2) 클래스 규칙
            for name, pat, repl in PII_RULES:
                while True:
                    m = pat.search(text)
                    if not m:
                        break
                    audit.append([rec["id"], col, name, m.group(0), repl])
                    text = text[: m.start()] + repl + text[m.end() :]

            if text != original:
                # 마스킹으로 생긴 중복 공백 정리
                text = re.sub(r"[ \t]{2,}", " ", text).strip()
                rec[col] = text

    # 검증 — 금지 패턴 잔존 시 빌드 실패
    violations = []
    for rec in records:
        for col in TEXT_COLS:
            for name, pat in PII_FORBIDDEN:
                m = pat.search(rec[col] or "")
                if m:
                    violations.append((rec["id"], col, name, m.group(0)))

    return audit, violations


# ─────────────────────────────────────────────────────────────
# 정렬 — "13.1.10. 안전가시설" 처럼 다단 번호를 숫자 순으로
# ─────────────────────────────────────────────────────────────
def sort_key(name):
    m = re.match(r"(\d+(?:\.\d+)*)", str(name))
    if not m:
        return ((999,), str(name))
    return (tuple(int(p) for p in m.group(1).split(".")), str(name))


def build_dropdown_ref(records):
    """공종→작업명→단위작업명 계층 + 기인물분류 맵 + 12대기인물 목록"""
    hierarchy = defaultdict(lambda: defaultdict(set))
    class_map = defaultdict(set)
    twelve = []
    gongjong, causes = set(), set()

    for r in records:
        gz, work, unit = r["공종"], r["작업명"], r["단위작업명"]
        cause, cls = r["기인물"], r["기인물분류"]

        if gz:
            gongjong.add(gz)
            if work:
                if unit:
                    hierarchy[gz][work].add(unit)
                else:
                    hierarchy[gz][work]
            else:
                hierarchy[gz]
        if cause:
            causes.add(cause)
            if cls:
                class_map[cls].add(cause)
            if r["12대기인물"] and cause not in twelve:
                twelve.append(cause)

    result = {
        "hierarchy": {
            gz: {
                w: sorted(hierarchy[gz][w], key=sort_key)
                for w in sorted(hierarchy[gz], key=sort_key)
            }
            for gz in sorted(hierarchy, key=sort_key)
        },
        "기인물분류": {k: sorted(class_map[k]) for k in sorted(class_map)},
        "12대기인물": twelve,
        "공종목록": sorted(gongjong, key=sort_key),
        "기인물목록": sorted(causes),
    }
    return result


def check_types(records):
    """db.json 스키마·타입 검증 — 프런트의 === 비교가 조용히 깨지는 것을 막는다"""
    errors = []
    for r in records:
        if list(r.keys()) != COLUMNS:
            errors.append(f"id {r['id']}: 컬럼 구성 불일치")
            break
        for c in BOOL_COLS:
            if not isinstance(r[c], bool):
                errors.append(f"id {r['id']}: {c} 가 bool 아님 ({type(r[c]).__name__})")
        for c in INT_COLS:
            if not isinstance(r[c], int) or isinstance(r[c], bool):
                errors.append(f"id {r['id']}: {c} 가 int 아님 ({type(r[c]).__name__})")
        for c in INT_NULLABLE_COLS:
            if r[c] is not None and (not isinstance(r[c], int) or isinstance(r[c], bool)):
                errors.append(f"id {r['id']}: {c} 가 int|null 아님")
        for c in FLOAT_NULLABLE_COLS:
            if r[c] is not None and not isinstance(r[c], (int, float)):
                errors.append(f"id {r['id']}: {c} 가 float|null 아님")
    return errors[:20]


def main():
    print("SIF 데이터셋 빌드 (B단계)\n")
    for p in (SRC_MAIN, SRC_T4M, SRC_T4):
        if not os.path.exists(p):
            sys.exit(f"오류: 입력 파일 없음 — {p}")
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    # ── 1. 입력 로드
    print("[1/6] 입력 로드")
    records = json.load(open(SRC_MAIN, encoding="utf-8"))
    t4m = json.load(open(SRC_T4M, encoding="utf-8"))
    t4 = json.load(open(SRC_T4, encoding="utf-8"))
    assert len(records) == EXPECTED_ROWS, f"확장열 행수 불일치: {len(records)}"
    assert len(t4m) == EXPECTED_ROWS, f"T4m 행수 불일치: {len(t4m)}"
    print(f"  확장열 {len(records):,}건 × {len(records[0])}열 · T4m {len(t4m):,}행 · T4 {len(t4):,}행")

    # ── 2. PII 마스킹
    print("[2/6] 개인정보 마스킹")
    audit, violations = mask_pii(records)
    masked_ids = sorted({a[0] for a in audit})
    print(f"  치환 {len(audit)}건 / 대상 레코드 {len(masked_ids)}건")
    if violations:
        for v in violations[:10]:
            print(f"  ✗ id {v[0]} [{v[1]}] {v[2]}: {v[3]!r}")
        sys.exit(f"\n빌드 중단 — 금지 패턴 {len(violations)}건 잔존. 규칙을 보완하십시오.")
    print("  금지 패턴 잔존 0건 ✓")

    with open(os.path.join(OUT_DIR, "pii_audit.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "컬럼", "규칙", "원문", "치환"])
        w.writerows(audit)

    # ── 3. 대표사례 하위유형 병합
    #    하위유형 소속은 T4m, 대표사례 지정은 T4를 정본으로 쓴다.
    #    T4m의 대표사례여부 플래그는 구성원 2건짜리 하위유형 28곳에서 양쪽 모두 True로
    #    표시돼 있어(전형성 동률) 신뢰할 수 없다. T4는 하위유형당 정확히 1건이다.
    print("[3/6] 대표사례 하위유형 병합 (T4m 소속 + T4 대표)")
    sub = {int(r["id"]): r for r in t4m}
    rep_ids = {int(r["대표사례id"]) for r in t4}
    assert len(rep_ids) == len(t4), "T4 대표사례id 중복"

    for rec in records:
        m = sub.get(rec["id"])
        assert m is not None, f"T4m 에 id {rec['id']} 없음"
        assert m["기인물"] == rec["기인물"] and m["재해형태"] == rec["재해형태"], f"id {rec['id']} 키 불일치"
        rec["하위유형번호"] = int(m["하위유형번호"])
        rec["대표사례여부"] = rec["id"] in rep_ids

    n_rep = sum(1 for r in records if r["대표사례여부"])
    assert n_rep == len(t4), f"대표사례 수 불일치: {n_rep} != {len(t4)}"
    # 하위유형마다 대표가 정확히 1건인지
    per_group = Counter(
        (r["기인물"], r["재해형태"], r["하위유형번호"]) for r in records if r["대표사례여부"]
    )
    bad = [k for k, v in per_group.items() if v != 1]
    assert not bad, f"하위유형당 대표사례가 1건이 아님: {bad[:5]}"
    n_groups = len({(r["기인물"], r["재해형태"], r["하위유형번호"]) for r in records})
    assert n_groups == len(per_group), f"대표 없는 하위유형 존재: {n_groups - len(per_group)}개"
    print(f"  대표사례 {n_rep}건 · 하위유형 {n_groups}개 (전부 대표 1건) · 전건 소속 부여 ✓")

    # ── 4. 스키마 정렬·검증
    print("[4/6] 스키마 검증")
    records = [{c: r[c] for c in COLUMNS} for r in records]
    errs = check_types(records)
    if errs:
        for e in errs:
            print("  ✗", e)
        sys.exit("\n빌드 중단 — 타입 오류")
    print(f"  {len(COLUMNS)}열 · 타입 검증 통과 ✓")

    # ── 5. 산출물 저장
    print("[5/6] 산출물 저장")
    with open(DB_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, separators=(",", ":"))
    dropdown = build_dropdown_ref(records)
    with open(DROPDOWN_JSON, "w", encoding="utf-8") as f:
        json.dump(dropdown, f, ensure_ascii=False, indent=2)
    print(f"  data/db.json           {os.path.getsize(DB_JSON)/1024/1024:.2f}MB")
    print(f"  data/dropdown-ref.json {os.path.getsize(DROPDOWN_JSON)/1024:.0f}KB")

    # ── 6. 검증 리포트
    print("[6/6] 검증 리포트")
    uniq = {c: len({r[c] for r in records if r[c]}) for c in
            ["공종", "작업명", "단위작업명", "기인물", "기인물분류", "재해형태", "재해종류"]}
    koen = sum(1 for r in records if r["KOEN공정"])
    twelve = sum(1 for r in records if r["12대기인물"])
    fall = [r for r in records if r["재해형태"] == "떨어짐"]
    fall_h = [r for r in fall if r["추락고_m"] is not None]
    years = Counter(r["발생연도"] for r in records)
    degree = Counter(r["재해정도"] for r in records)
    dtype = Counter(r["재해형태"] for r in records)

    lines = [
        "# SIF 데이터셋 빌드 리포트", "",
        f"- 입력: `source/SIF_신버전_확장열_3459건.json` + `source/T4m_사례하위유형매핑.json`",
        f"- 산출: `data/db.json` ({os.path.getsize(DB_JSON)/1024/1024:.2f}MB, {len(COLUMNS)}열) · `data/dropdown-ref.json`", "",
        "## 건수", "",
        f"| 항목 | 값 |", "|---|---:|",
        f"| 총 레코드 | {len(records):,} |",
        f"| KOEN(발전소) 공정 | {koen:,} ({koen/len(records)*100:.1f}%) |",
        f"| 12대 기인물 | {twelve:,} ({twelve/len(records)*100:.1f}%) |",
        f"| 대표사례 | {n_rep:,} (하위유형 {n_groups}개 × 1건) |",
        f"| 떨어짐 | {len(fall):,} (추락고 보유 {len(fall_h):,} · {len(fall_h)/len(fall)*100:.1f}%) |", "",
        "## 고유값", "", "| 컬럼 | 종수 |", "|---|---:|",
    ]
    lines += [f"| {k} | {v} |" for k, v in uniq.items()]
    lines += [
        "", "## 파생 채움률", "", "| 컬럼 | 결측 |", "|---|---:|",
        f"| 위험도순위 | {sum(1 for r in records if r['위험도순위'] is None):,} (12대 아닌 기인물) |",
        f"| 추락고_m | {sum(1 for r in records if r['추락고_m'] is None):,} (원문에 높이 표기 없음) |",
        f"| 발생연도·발생월 | {sum(1 for r in records if not r['발생연도']):,} |",
        f"| 기인물분류 | {sum(1 for r in records if not r['기인물분류']):,} |",
        "", "## 재해정도", "",
        " · ".join(f"{k} {v:,}" for k, v in degree.most_common()),
        "", "## 재해형태", "",
        " · ".join(f"{k} {v:,}" for k, v in dtype.most_common()),
        "", "## 발생연도", "",
        " · ".join(f"{y} {years[y]:,}" for y in sorted(years)),
        "", "## 개인정보 마스킹", "",
        f"- 치환 {len(audit)}건 / 레코드 {len(masked_ids)}건 — id {', '.join(str(i) for i in masked_ids)}",
        f"- 금지 패턴(실명·업체명·지번·나이·법인표기) 잔존 **0건**",
        f"- 상세: `scripts/out/pii_audit.csv`", "",
        "## 드롭다운 참조", "",
        f"- 공종 {len(dropdown['공종목록'])} · 기인물 {len(dropdown['기인물목록'])} "
        f"· 기인물분류 {len(dropdown['기인물분류'])} · 12대기인물 {len(dropdown['12대기인물'])}",
    ]
    report = "\n".join(lines) + "\n"
    with open(os.path.join(OUT_DIR, "build_report.md"), "w", encoding="utf-8") as f:
        f.write(report)
    print("  scripts/out/build_report.md\n")
    print(report)
    print("빌드 완료.")


if __name__ == "__main__":
    main()
