"""A2 存疑升档（全国漢籍佐证）：包一层 engine.run，只对「存疑」且原因码⊆允许集、且候选中恰一个 Work 在 A5 佐证表（全国漢籍载该馆藏此书而 Work 未挂该站）的记录，改判确定并指向该 Work。
允许集：A_MISSING（须同时 T_EXACT）、T_AUTHOR_NEAR、A_ALIAS_ONLY。其余（COLLECTION、ERA_CONFLICT、A_DIFF、MULTI_*、DUP_WORK_SUSPECT、SUPPLEMENT、JUAN_GAP…）一律不动。
python3 upgrade_engine.py <source> <out>"""
import sys, os, csv, collections, dataclasses
ME = '/home/claude/open-guji/book-index-manager/tools/馆藏资源挂接/match_engine'
sys.path.insert(0, ME); os.chdir(ME)
import tier, engine
src, out = sys.argv[1], sys.argv[2]
SITE = {'naikaku': 'nat-archives-jp', 'ndl': 'ndl'}[src]
A5 = set()
for r in csv.DictReader(open('/home/claude/book_index_json/library_data/_匹配/全国漢籍/A5-研究-20261025/日本馆佐证-内閣国会.tsv'), delimiter='\t'):
    if r['site_id_missing'] == SITE: A5.add(r['work_id'])
ALLOW = {'A_MISSING', 'T_AUTHOR_NEAR', 'A_ALIAS_ONLY'}
BASE = {'T_EXACT', 'A_EQ', 'W_UNIQUE', 'ERA_OK'}
tier.TEXT['A5_KANSEKI_CORROB'] = '全国漢籍佐证该馆藏此书（A2 升档）'
orig = tier.judge
stat = collections.Counter()
def judge(r, wi, pol):
    j = orig(r, wi, pol)
    if j.tier != '存疑':
        return dataclasses.replace(j, tier='存疑_原' + j.tier) if j.tier == '确定' else j   # 原确定档已在上一轮处理，本轮不重出
    codes = set(j.codes)
    extra = codes - BASE
    hit = [c for c in j.candidates if c in A5]
    if len(hit) == 1 and extra and extra <= ALLOW and ('A_MISSING' not in extra or 'T_EXACT' in codes):
        stat['upgrade'] += 1
        return dataclasses.replace(j, tier='确定', work_id=hit[0], codes=list(j.codes) + ['A5_KANSEKI_CORROB'])
    return j
tier.judge = judge
engine.tier.judge = judge
engine.run(src, '/home/claude/book-index', '/home/claude/book_index_json/library_data', out, '/home/claude/overview', None, os.environ['DYNASTY_KEYS'], True)
print(src, dict(stat))
