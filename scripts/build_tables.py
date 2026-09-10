#!/usr/bin/env python3
"""
시스템탑재 테이블 T1~T6 생성 (A단계 산출물 → 하위유형·대표사례 등)

사이트가 실제로 필요로 하는 것은 T4(대표사례)·T4m(사례→하위유형 소속) 두 개다 —
build_dataset.py 가 이 둘을 db.json 의 '하위유형번호'·'대표사례여부' 열로 병합한다.
T1·T2·T3·T5·T6 는 사이트가 실행 시점에 js/analytics.js 로 직접 계산하므로 참고용이다
(scripts/test_analytics.mjs 가 analytics.js 결과를 이 표들과 대조한다).

공단 배포판 가이드(scripts/docs/SIF_시스템탑재_테이블_변환가이드.html)의 코드를 그대로
스크립트로 옮긴 것이다. 하위유형은 재해유발요인 문장을 문자 n-gram TF-IDF 로 벡터화해
KMeans(random_state=0)로 묶고, 군집 안에서 평균 유사도가 가장 높은 사례(medoid)를
대표사례로 삼는다. 칸(기인물×재해형태) 건수 100 이상 5개 / 30 이상 3개 / 그 외 1개.

사용:
  python3 scripts/build_tables.py --src source/SIF_확장열_3459건.json [--out-dir source]

필요 패키지: pandas numpy scipy scikit-learn   (pip3 install pandas numpy scipy scikit-learn)
"""

import argparse
import json
import os
import sys

try:
    import numpy as np
    import pandas as pd
    from scipy.stats import chi2_contingency
    from sklearn.cluster import KMeans
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
except ImportError as e:
    sys.exit(f"패키지 누락: {e.name}\n  pip3 install pandas numpy scipy scikit-learn")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)


def build_T1(d):
    ct = pd.crosstab(d['기인물'], d['재해형태'])
    meta = d.drop_duplicates('기인물').set_index('기인물')[['기인물분류', '12대기인물']]
    rows = []
    for k in ct.index:
        r = ct.loc[k]; n = int(r.sum()); top = r.idxmax(); tp = r.max() / n
        유형 = '단일형' if tp >= .8 else ('혼합형' if tp >= .5 else '분산형')
        for f, c in r[r > 0].sort_values(ascending=False).items():
            rows.append([k, meta.loc[k, '기인물분류'], bool(meta.loc[k, '12대기인물']),
                         n, 유형, top, round(tp * 100, 1), f, int(c), round(c / n * 100, 1)])
    return pd.DataFrame(rows, columns=['기인물', '기인물분류', '12대기인물', '기인물건수', '프로파일유형',
                                       '1위재해형태', '1위비율', '재해형태', '건수', '비율'])


def build_T2(d):
    rows = []
    for (code, name), sub in d.groupby(['공종코드', '공종']):
        vc = sub['기인물'].value_counts(); cum = 0
        for k, (kk, c) in enumerate(vc.items(), 1):
            p = c / len(sub) * 100; cum += p
            rows.append([int(code), name, len(sub), k, kk, int(c), round(p, 1), round(cum, 1)])
    return pd.DataFrame(rows, columns=['공종코드', '공종', '공종건수', '순위', '기인물', '건수', '공종내비율', '누적비율'])


def build_T3(d):
    N = len(d)
    c = d.groupby(['공종코드', '공종', '기인물', '재해형태']).size().sort_values(ascending=False).reset_index()
    c.columns = ['공종코드', '공종', '기인물', '재해형태', '건수']
    c['비율'] = (c['건수'] / N * 100).round(2)
    c['누적비율'] = c['비율'].cumsum().round(1)
    c['등급'] = np.where(c['누적비율'] <= 50, 'A', np.where(c['누적비율'] <= 80, 'B', 'C'))
    ctg = pd.crosstab(d['공종'], d['기인물'])
    chi2, p, dof, exp = chi2_contingency(ctg)
    res = pd.DataFrame((ctg - exp) / np.sqrt(exp), index=ctg.index, columns=ctg.columns)
    c['공종기인물_표준화잔차'] = [round(res.loc[a, b], 1) for a, b in zip(c['공종'], c['기인물'])]
    c['특이조합'] = c['공종기인물_표준화잔차'] >= 3
    c.insert(0, '순위', range(1, len(c) + 1))
    return c


def build_T4(d):
    """하위유형 군집 + 대표사례(medoid). (T4, T4m) 반환"""
    vec = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 4), min_df=1)
    rows, memb = [], []
    for (k, f), cell in d.groupby(['기인물', '재해형태']):
        cell = cell.reset_index(drop=True); n = len(cell)
        X = vec.fit_transform(cell['재해유발요인'].fillna('')); S = cosine_similarity(X)
        kk = 5 if n >= 100 else (3 if n >= 30 else 1)
        labels = KMeans(n_clusters=kk, n_init=10, random_state=0).fit(X).labels_ if kk > 1 else np.zeros(n, dtype=int)
        for g in range(kk):
            idx = np.where(labels == g)[0]
            if len(idx) == 0:            # 빈 군집(드묾) — 건너뛴다
                continue
            typ = S[np.ix_(idx, idx)].mean(axis=1)          # 군집 내 평균 유사도 = 전형성
            # medoid — 동률(2건 군집은 항상 동률)이면 id 가 작은 쪽. 공단 배포판(2026-04)과 같은 규칙이라
            # 같은 원본을 다시 돌리면 대표사례가 바뀌지 않는다.
            best = typ.max()
            cands = [i for i in idx if abs(typ[list(idx).index(i)] - best) < 1e-9]
            m = min(cands, key=lambda i: int(cell.loc[i, 'id']))
            rows.append([k, f, n, g, len(idx), int(cell.loc[m, 'id']), cell.loc[m, '재해유발요인'],
                         None if len(idx) <= 2 else round(float(best), 3)])
            for i in idx:
                memb.append([int(cell.loc[i, 'id']), k, f, g, bool(i == m)])
    T4 = pd.DataFrame(rows, columns=['기인물', '재해형태', '칸건수', '하위유형번호', '하위유형건수',
                                     '대표사례id', '대표사례_재해유발요인', '전형성'])
    T4['하위유형명'] = ''          # 사람이 붙임 (Phase 5)
    T4m = pd.DataFrame(memb, columns=['id', '기인물', '재해형태', '하위유형번호', '대표사례여부']).sort_values('id')
    return T4, T4m


def build_T5(d):
    rows = []
    for _, x in d.iterrows():
        items = [s.replace('▶', '').strip() for s in str(x['위험성감소대책']).split('\n') if s.strip()]
        for j, s in enumerate(items, 1):
            rows.append([int(x['id']), j, s])
    T5 = pd.DataFrame(rows, columns=['id', '항목순번', '감소대책문장'])
    T5['문장출현건수'] = T5['감소대책문장'].map(T5['감소대책문장'].value_counts())
    return T5


def build_T6(d, T1, recent_from):
    g = d.groupby('기인물'); ct = pd.crosstab(d['기인물'], d['재해형태'])
    prof = T1.drop_duplicates('기인물').set_index('기인물')['프로파일유형']
    T6 = pd.DataFrame({
        '사망건수': g.size(),
        '기인물분류': g['기인물분류'].first(),
        '12대기인물': g['12대기인물'].first().astype(bool),
        '위험도순위': g['위험도순위'].first(),
        '1위재해형태': ct.idxmax(axis=1),
        '1위비율': (ct.max(axis=1) / ct.sum(axis=1) * 100).round(1),
        '프로파일유형': prof,
        '주요공종': g['공종'].agg(lambda s: s.value_counts().index[0].split('. ', 1)[-1]),
        '최근5년건수': d[d['발생연도'] >= recent_from].groupby('기인물').size(),
    }).fillna({'최근5년건수': 0})
    T6['최근5년건수'] = T6['최근5년건수'].astype(int)
    T6['비율'] = (T6['사망건수'] / len(d) * 100).round(1)
    T6 = T6.sort_values(['사망건수', '최근5년건수'], ascending=False).reset_index()
    T6.insert(0, '순위', range(1, len(T6) + 1))
    T6['표시명'] = T6.apply(lambda r: f"{r['기인물']} ({r['사망건수']}건{' ·12대' if r['12대기인물'] else ''})", axis=1)
    return T6[['순위', '기인물', '표시명', '사망건수', '비율', '최근5년건수', '기인물분류', '12대기인물',
               '위험도순위', '1위재해형태', '1위비율', '프로파일유형', '주요공종']]


def dump(df, path):
    recs = json.loads(df.to_json(orient='records', force_ascii=False))
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(recs, f, ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', required=True, help='A단계 확장열 JSON')
    ap.add_argument('--out-dir', default=os.path.join(PROJECT_DIR, 'source'),
                    help='T4·T4m 저장 위치 (기본 source/). 참고용 T1·T2·T3·T5·T6 는 scripts/out/tables/ 에 저장')
    ap.add_argument('--recent-from', type=int, default=None,
                    help='T6 최근5년 기준 연도 (기본: 최대 발생연도 - 4)')
    args = ap.parse_args()

    d = pd.DataFrame(json.load(open(args.src, encoding='utf-8')))
    n = len(d)
    # 최근5년 기준: 건수가 충분한(50건 이상) 마지막 연도 - 4. 2024년 1건처럼 표기 오류로 튄 해는 무시한다.
    yc = d['발생연도'].value_counts()
    last_full = int(yc[yc >= 50].index.max())
    recent_from = args.recent_from or last_full - 4
    print(f"시스템탑재 테이블 생성 — {n:,}건 · 최근5년 기준 {recent_from}년~\n")

    T1 = build_T1(d);              print(f"  T1 기인물프로파일   {len(T1):>6,}행")
    T2 = build_T2(d);              print(f"  T2 공종기인물후보   {len(T2):>6,}행")
    T3 = build_T3(d);              print(f"  T3 고위험조합       {len(T3):>6,}행")
    T4, T4m = build_T4(d);         print(f"  T4 대표사례         {len(T4):>6,}행 (하위유형) · T4m {len(T4m):,}행")
    T5 = build_T5(d);              print(f"  T5 감소대책항목     {len(T5):>6,}행")
    T6 = build_T6(d, T1, recent_from); print(f"  T6 기인물마스터     {len(T6):>6,}행")

    assert len(T4m) == n, f"T4m 행수({len(T4m)}) ≠ 원본({n})"
    assert T4['대표사례id'].is_unique, "대표사례id 중복"
    assert T4m.groupby(['기인물', '재해형태', '하위유형번호'])['대표사례여부'].sum().eq(1).all(), "하위유형당 대표 1건 아님"

    os.makedirs(args.out_dir, exist_ok=True)
    dump(T4, os.path.join(args.out_dir, 'T4_대표사례.json'))
    dump(T4m, os.path.join(args.out_dir, 'T4m_사례하위유형매핑.json'))
    ref = os.path.join(SCRIPT_DIR, 'out', 'tables'); os.makedirs(ref, exist_ok=True)
    for name, df in [('T1_기인물프로파일', T1), ('T2_공종기인물후보', T2), ('T3_고위험조합', T3),
                     ('T5_감소대책항목', T5), ('T6_기인물마스터_사망순', T6)]:
        dump(df, os.path.join(ref, f'{name}.json'))
    print(f"\n  {os.path.relpath(args.out_dir, PROJECT_DIR)}/T4_대표사례.json · T4m_사례하위유형매핑.json (사이트용)")
    print(f"  scripts/out/tables/T1·T2·T3·T5·T6 (참고용)\n테이블 생성 완료.")


if __name__ == '__main__':
    main()
