#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
match_cbdb.py - 为 book-index-draft Entity 文件补全 CBDB 人物 ID

用法:
    python match_cbdb.py [选项]

选项:
    --root ROOT         book-index-draft 根目录（默认 D:/workspace/book-index-draft）
    --cbdb CBDB         CBDB SQLite 路径（默认 D:/workspace/cbdb/cbdb_sqlite/latest.db）
    --dynasty DYNASTY   只处理指定朝代（如 "宋" "明" "清"）
    --limit N           最多处理 N 个 Entity
    --dry-run           只输出结果，不写文件
    --review-only       只显示 pending_review 清单
    --min-score SCORE   自动接受最低分数（默认 70）

输出:
    - 直接更新 Entity JSON 文件（写入 external_ids.cbdb_id / cbdb_match / cbdb_source）
    - 打印 pending_review 清单供人工审核
"""

import argparse
import json
import glob
import os
import sqlite3
import unicodedata
from pathlib import Path

# ────────────────────────────────────────────────────
# 朝代映射：Entity.dynasty → CBDB c_dy 码列表
# ────────────────────────────────────────────────────
DYNASTY_MAP = {
    '周': [1],
    '先秦': [1],
    '漢前': [1],
    '秦': [61],
    '秦漢': [2, 29, 83, 25],
    '漢': [83, 29, 25, 2],
    '西漢': [29, 83, 2],
    '東漢': [25, 83, 2],
    '東漢末': [25, 83],
    '新': [46, 29, 25],
    '三國': [3, 26, 53, 42],
    '三國魏': [26, 3],
    '三國蜀': [53, 3],
    '三國吳': [42, 3],
    '晉': [82, 23, 27],
    '西晉': [23, 82],
    '東晉': [27, 82],
    '南北朝': [4, 28, 32, 44, 37, 24, 30, 41, 40, 35, 31, 68],
    '南朝': [4, 28, 32, 44, 24],
    '宋(劉)': [28, 4],
    '劉宋': [28, 4],
    '南齊': [32, 4],
    '梁': [44, 4],
    '南梁': [44, 4],
    '西梁': [37, 4],
    '陳': [24, 4],
    '北魏': [30, 4],
    '東魏': [41, 4],
    '西魏': [40, 4],
    '北齊': [35, 4],
    '北周': [31, 4],
    '隋': [5, 6],
    '隋唐': [5, 6],
    '唐': [6, 5, 77],
    '武周': [77, 6],
    '五代': [7, 34, 47, 48, 52, 49],
    '後梁': [34, 7],
    '後唐': [47, 7],
    '後晉': [48, 7],
    '後漢': [52, 7],
    '後周': [49, 7],
    '宋': [15, 28],   # 含 宋(劉) — 歷史上「宋」有時指劉宋
    '北宋': [15],
    '南宋': [15],
    '宋末元初': [15, 18],
    '遼': [16],
    '金': [17],
    '元': [18, 79],
    '元末明初': [18, 19],
    '明': [19, 80],
    '南明': [80, 19],
    '明末清初': [19, 20],
    '清': [20],
    '清末': [20, 21],
    '民國': [21, 20, 22],
    '現代': [22, 21],
    '未詳': [0],
}

# 常見異體字正規化（查詢前雙向規整）
# 我方 Entity 用字 → CBDB 用字
CHAR_VARIANTS = {
    # 姓氏常見異體
    '範': '范',   # 範純仁 → 范純仁（最高頻）
    '薑': '姜',   # 薑夔 → 姜夔
    '盧': '盧',   # 已相同，保留佔位
    # 通用異體
    '甯': '寧', '説': '說', '徳': '德', '戸': '戶',
    '脩': '修', '眞': '真', '爲': '為',
    '竝': '並', '廼': '乃', '鄕': '鄉',
    '踈': '疏', '梔': '梔', '滙': '匯',
    '鄜': '鄜', '祐': '祐',
}

def normalize_name(name: str) -> str:
    name = unicodedata.normalize('NFC', name)
    return ''.join(CHAR_VARIANTS.get(ch, ch) for ch in name)


class CBDBMatcher:
    def __init__(self, cbdb_path: str, root: str, auto_threshold: int = 70):
        self.db = sqlite3.connect(cbdb_path)
        self.db.row_factory = sqlite3.Row
        self.root = root
        self.auto_threshold = auto_threshold
        self._work_titles: dict = {}     # work_id → title
        self._cbdb_by_name: dict = {}    # name → [(personid, dy)]
        self._cbdb_works: dict = {}      # personid → [title, ...]
        self._cbdb_alts: dict = {}       # personid → [alt_name, ...]
        print('加载 work 索引...', flush=True)
        self._load_work_index()
        print('加载 CBDB 人名索引...', flush=True)
        self._load_cbdb_index()
        print('加载完成。', flush=True)

    def _load_work_index(self):
        idx_path = os.path.join(self.root, 'index.json')
        if os.path.exists(idx_path):
            with open(idx_path, encoding='utf-8') as f:
                idx = json.load(f)
            works = idx.get('works', {})
            if isinstance(works, dict):
                for wid, entry in works.items():
                    self._work_titles[wid] = entry.get('title', '')
            elif isinstance(works, list):
                for entry in works:
                    self._work_titles[entry['id']] = entry.get('title', '')

    def _load_cbdb_index(self):
        # 预加载 BIOG_MAIN 名字索引
        for row in self.db.execute("SELECT c_personid, c_name_chn, c_dy FROM BIOG_MAIN"):
            n = row['c_name_chn']
            if n:
                self._cbdb_by_name.setdefault(n, []).append((row['c_personid'], row['c_dy']))
        # 别名索引（从 BIOG_MAIN join，获取 personid → dy 映射）
        pid_to_dy = {}
        for row in self.db.execute("SELECT c_personid, c_dy FROM BIOG_MAIN"):
            pid_to_dy[row['c_personid']] = row['c_dy']
        for row in self.db.execute("SELECT c_personid, c_alt_name_chn FROM ALTNAME_DATA"):
            n = row['c_alt_name_chn']
            pid = row['c_personid']
            dy = pid_to_dy.get(pid, 0)
            if n:
                self._cbdb_by_name.setdefault(n, []).append((pid, dy))
            self._cbdb_alts.setdefault(pid, []).append(n or '')
        # 著作索引
        for row in self.db.execute(
            "SELECT bt.c_personid, t.c_title_chn FROM BIOG_TEXT_DATA bt "
            "JOIN TEXT_CODES t ON bt.c_textid = t.c_textid"
        ):
            t = row['c_title_chn']
            if t:
                self._cbdb_works.setdefault(row['c_personid'], []).append(t)

    def _get_cbdb_works(self, personid: int) -> list:
        return self._cbdb_works.get(personid, [])

    def _get_cbdb_altnames(self, personid: int) -> list:
        return self._cbdb_alts.get(personid, [])

    def _get_dynasty_codes(self, dynasty: str) -> list:
        return DYNASTY_MAP.get(dynasty, [])

    def _query_candidates(self, name: str, dynasty_codes: list) -> list:
        norm = normalize_name(name)
        candidates = {}

        # 搜索名字集合：(search_name, match_type)
        name_searches = [(name, 'name_exact'), (norm, 'name_exact')]
        if name.startswith('僧') or name.startswith('釋'):
            stripped = name[1:]
            norm_stripped = norm[1:] if (norm.startswith('僧') or norm.startswith('釋')) else norm
            name_searches += [(stripped, 'name_exact'), (norm_stripped, 'name_exact')]

        for search_name, match_type in name_searches:
            if not search_name:
                continue
            for pid, dy in self._cbdb_by_name.get(search_name, []):
                if pid not in candidates:
                    candidates[pid] = {'personid': pid, 'name': search_name, 'dy': dy, 'match_type': match_type}
                elif match_type == 'name_exact' and candidates[pid]['match_type'] == 'altname':
                    candidates[pid]['match_type'] = 'name_exact'

        # 朝代预筛
        if dynasty_codes and candidates:
            filtered = {pid: c for pid, c in candidates.items() if c['dy'] in dynasty_codes}
            if filtered:
                candidates = filtered

        return list(candidates.values())

    def _score_candidate(self, candidate: dict, entity_name: str,
                         entity_alt_names: list[str], entity_work_titles: list[str],
                         dynasty_codes: list[int], all_candidates: list[dict]) -> tuple[int, str]:
        score = 0
        sources = []
        norm_name = normalize_name(entity_name)
        cbdb_name = candidate['name']

        # B. 名字匹配（含僧/釋前缀剥离）
        entity_base = entity_name[1:] if (entity_name.startswith('僧') or entity_name.startswith('釋')) else entity_name
        entity_base_norm = normalize_name(entity_base)
        if cbdb_name in (entity_name, norm_name, entity_base, entity_base_norm):
            score += 40
            sources.append('name_exact')
        elif candidate['match_type'] == 'altname':
            score += 30
            sources.append('altname_match')
        elif entity_name in cbdb_name or cbdb_name in entity_name:
            score += 10
            sources.append('name_contains')

        # 别名 vs Entity alt names
        cbdb_alts = self._get_cbdb_altnames(candidate['personid'])
        for alt in entity_alt_names:
            alt_norm = normalize_name(alt)
            if alt_norm in cbdb_alts or alt in cbdb_alts:
                score += 20
                sources.append(f'entity_alt_match:{alt}')
                break

        # A'. 朝代匹配
        if dynasty_codes:
            if candidate['dy'] in dynasty_codes[:2]:
                score += 15     # 精确朝代 +15（名字+朝代+唯一 = 40+15+15 = 70 达到自动接受）
                sources.append('dy_match')
            elif candidate['dy'] in dynasty_codes:
                score += 5
                sources.append('dy_adjacent')
        else:
            # 无朝代信息，不加分也不扣分
            sources.append('dy_unknown')

        # C. 著作重合
        cbdb_works = self._get_cbdb_works(candidate['personid'])
        if entity_work_titles and cbdb_works:
            cbdb_norm = {normalize_name(w) for w in cbdb_works}
            ours_norm = {normalize_name(w) for w in entity_work_titles}
            # Jaccard
            inter = len(cbdb_norm & ours_norm)
            union = len(cbdb_norm | ours_norm)
            jaccard = inter / union if union > 0 else 0
            work_score = int(jaccard * 50)
            score += work_score
            if work_score > 0:
                sources.append(f'work_overlap_{jaccard:.2f}')

        # D. 独占性
        if len(all_candidates) == 1:
            score += 15     # 唯一候选 +15
            sources.append('unique')
        elif len(all_candidates) > 1:
            score -= 5
            sources.append('ambiguous')

        return score, '+'.join(sources)

    def match_entity(self, entity: dict) -> dict | None:
        name = entity.get('primary_name', '')
        dynasty = entity.get('dynasty', '')
        entity_id = entity.get('id', '')
        alt_names = [a['name'] for a in entity.get('alt_names', [])]
        work_ids = [w['work_id'] for w in entity.get('works', [])]
        work_titles = [self._work_titles.get(wid, '') for wid in work_ids if self._work_titles.get(wid)]

        if not name:
            return None

        dynasty_codes = self._get_dynasty_codes(dynasty)
        candidates = self._query_candidates(name, dynasty_codes)

        if not candidates:
            return {'status': 'no_candidates', 'entity_id': entity_id, 'name': name, 'dynasty': dynasty}

        # 对每个候选打分
        scored = []
        for cand in candidates:
            score, source = self._score_candidate(
                cand, name, alt_names, work_titles, dynasty_codes, candidates
            )
            scored.append({**cand, 'score': score, 'source': source})

        scored.sort(key=lambda x: -x['score'])
        best = scored[0]

        if best['score'] >= self.auto_threshold:
            status = 'auto'
        elif best['score'] >= 40:
            status = 'pending_review'
        else:
            status = 'low_score'

        return {
            'status': status,
            'entity_id': entity_id,
            'name': name,
            'dynasty': dynasty,
            'cbdb_id': best['personid'],
            'cbdb_name': best['name'],
            'cbdb_dy': best['dy'],
            'score': best['score'],
            'source': best['source'],
            'all_candidates': [(c['personid'], c['name'], c['dy'], c['score'])
                               for c in scored[:5]],
        }

    def run(self, dynasty_filter: str = None, limit: int = None,
            dry_run: bool = False, review_only: bool = False):
        entity_files = glob.glob(
            os.path.join(self.root, 'Entity', '**', '*.json'),
            recursive=True
        )

        results = {'auto': [], 'pending_review': [], 'no_candidates': [], 'low_score': [], 'errors': []}
        processed = 0

        for fpath in entity_files:
            with open(fpath, encoding='utf-8') as f:
                entity = json.load(f)

            if entity.get('type') != 'entity':
                continue
            if entity.get('external_ids', {}).get('cbdb_id'):
                continue  # 已有 cbdb_id，跳过
            if dynasty_filter and entity.get('dynasty', '') != dynasty_filter:
                continue

            try:
                result = self.match_entity(entity)
            except Exception as e:
                results['errors'].append({'entity_id': entity.get('id'), 'error': str(e)})
                continue

            if result is None:
                continue

            results[result['status']].append(result)
            processed += 1

            # 自动接受：写回文件
            if result['status'] == 'auto' and not dry_run and not review_only:
                if 'external_ids' not in entity:
                    entity['external_ids'] = {}
                entity['external_ids']['cbdb_id'] = result['cbdb_id']
                entity['external_ids']['cbdb_match'] = 'auto'
                entity['external_ids']['cbdb_source'] = result['source']
                with open(fpath, 'w', encoding='utf-8') as f:
                    json.dump(entity, f, ensure_ascii=False, indent=2)

            if limit and processed >= limit:
                break

        return results


def print_results(results: dict, verbose: bool = False):
    auto = results['auto']
    pending = results['pending_review']
    no_cand = results['no_candidates']
    low = results['low_score']

    print(f'\n=== CBDB 匹配结果 ===')
    print(f'  自动接受 (≥70分): {len(auto)}')
    print(f'  待人工审阅 (40-69分): {len(pending)}')
    print(f'  低分/无候选: {len(low) + len(no_cand)}')
    if results['errors']:
        print(f'  错误: {len(results["errors"])}')

    if auto and verbose:
        print(f'\n--- 自动接受 ---')
        for r in auto:
            print(f'  {r["name"]}[{r["dynasty"]}] → cbdb:{r["cbdb_id"]} {r["cbdb_name"]} '
                  f'score={r["score"]} ({r["source"]})')

    if pending:
        print(f'\n--- 待人工审阅（请确认后手动写入） ---')
        for r in pending:
            print(f'  {r["name"]}[{r["dynasty"]}] entity:{r["entity_id"]}')
            print(f'    候选: cbdb_id={r["cbdb_id"]} name={r["cbdb_name"]} dy={r["cbdb_dy"]} score={r["score"]}')
            if len(r.get('all_candidates', [])) > 1:
                print(f'    其他候选: {r["all_candidates"][1:3]}')


def main():
    parser = argparse.ArgumentParser(description='为 Entity 补全 CBDB 人物 ID')
    parser.add_argument('--root', default='D:/workspace/book-index-draft')
    parser.add_argument('--cbdb', default='D:/workspace/cbdb/cbdb_sqlite/latest.db')
    parser.add_argument('--dynasty', help='只处理指定朝代')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--review-only', action='store_true')
    parser.add_argument('--min-score', type=int, default=70)
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args()

    print(f'加载 CBDB: {args.cbdb}')
    print(f'数据根目录: {args.root}')
    if args.dynasty:
        print(f'朝代过滤: {args.dynasty}')
    if args.dry_run:
        print('【dry-run 模式，不写文件】')

    matcher = CBDBMatcher(args.cbdb, args.root, auto_threshold=args.min_score)
    results = matcher.run(
        dynasty_filter=args.dynasty,
        limit=args.limit,
        dry_run=args.dry_run,
        review_only=args.review_only,
    )
    print_results(results, verbose=args.verbose)


if __name__ == '__main__':
    import sys
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
