# R9 年号封闭清单对账：库内 subtype=reign（index+Entity 快照）vs 维基年号表（源表）
# 用法：python3 -I recon.py <book-index 快照根> <朝代年号录入目录> <输出tsv>
import sys, os, json, glob, collections
sys.path.insert(0, os.path.join(sys.argv[2], 'scripts'))
from guji_norm import norm_name, parse_year
snap, rec, out = sys.argv[1], sys.argv[2], sys.argv[3]

idx = {}
for f in glob.glob(os.path.join(snap, 'index/entities/*.json')):
    idx.update(json.load(open(f, encoding='utf-8')))
dyn_name = {v['id']: v['primary_name'] for v in idx.values() if v.get('subtype') == 'dynasty'}
lib = []
for v in idx.values():
    if v.get('subtype') != 'reign': continue
    e = json.load(open(os.path.join(snap, v['path']), encoding='utf-8'))
    lib.append({'id': v['id'], 'name': e['primary_name'], 'dyn_id': e.get('dynasty_id', ''),
                'dyn': dyn_name.get(e.get('dynasty_id', ''), ''), 'ruler': e.get('ruler', {}).get('name', ''),
                'start': e.get('dates', {}).get('start'), 'tomb': bool(e.get('merged_into'))})

# 清单：维基年号表（源表）；映射表定朝代归属
mp = {}
for l in open(os.path.join(rec, '政权映射.tsv'), encoding='utf8'):
    if l.startswith('#') or l.startswith('来源') or not l.strip(): continue
    r = l.rstrip('\n').split('\t')
    if len(r) >= 3 and r[2]: mp.setdefault(r[1], r[2])
wp, skipped = [], collections.Counter()
for l in open(os.path.join(rec, '源表/zhwp_中国年号列表.tsv'), encoding='utf8'):
    if l.startswith('#') or l.startswith('来源') or not l.strip(): continue
    r = l.rstrip('\n').split('\t')
    if parse_year(r[5]) is None: skipped['空起年(存疑)'] += 1; continue
    wp.append({'raw': r[2], 'key': norm_name(r[2]), 'dyn_raw': r[3], 'dyn_id': mp.get(r[3], ''), 'start': parse_year(r[5]), 'ruler': r[4]})

# 配对键：(归一年号, 起年±1)；同名同起年多条时优先同朝代映射，再取起年最近
# 朝代只作依据记录，不作配对条件（朝代三向一致属 P-朝代年号，不在本表判）
bykey = collections.defaultdict(list)
for i, w in enumerate(wp): bykey[w['key']].append(i)
used_w, rows, both = set(), [], 0
libn = collections.defaultdict(list)
for L in lib: libn[norm_name(L['name'])].append(f"{L['dyn'] or '无映射'}{L['start']}")
def alt(n):
    k = norm_name(n)
    a = [f"{w['dyn_raw']}{w['start']}" for w in wp if w['key'] == k][:4]
    b = libn.get(k, [])[:4]
    return f"清单{'、'.join(a) or '无'} / 库{'、'.join(b) or '无'}"
for L in lib:
    lstart = L['start'] if L['start'] is not None else None
    cands = [i for i in bykey.get(norm_name(L['name']), []) if i not in used_w
             and (lstart is None or wp[i]['start'] is None or abs(wp[i]['start'] - lstart) <= 1)]
    if cands:
        i = min(cands, key=lambda j: (wp[j]['dyn_id'] != L['dyn_id'], abs((wp[j]['start'] or 0) - (lstart or 0))))
        used_w.add(i); w = wp[i]; both += 1
        diff_w = w['raw'] != L['name']
        diff_d = w['dyn_raw'] != L['dyn']
        dyn_note = ''
        if w['dyn_id'] and L['dyn_id'] and w['dyn_id'] != L['dyn_id']:
            dyn_note = f"；朝代归属不一：库「{L['dyn']}」/清单「{w['dyn_raw']}」（转 P-朝代年号 判）"
        elif diff_d:
            dyn_note = f"；朝代写法：库「{L['dyn']}」/清单「{w['dyn_raw']}」"
        j = '一致但写法不同' if diff_w else '一致'
        rows.append([L['name'], '两边', L['dyn'] or '（无映射）', j,
                     f"库{L['id']} 起{L['start']}｜清单 {w['raw']} 起{w['start']}" + (f"；名写法：库「{L['name']}」/清单「{w['raw']}」" if diff_w else '') + dyn_note])
    else:
        rows.append([L['name'], '库内', L['dyn'] or '（无映射）', '库内多余',
                     f"库{L['id']} 帝王「{L['ruler']}」起{L['start']}；清单无同名且起年±1的条目；清单同名条目：{alt(L['name'])}"])
for i, w in enumerate(wp):
    if i in used_w: continue
    rows.append([w['raw'], '清单', w['dyn_raw'] + ('' if w['dyn_id'] else '（映射缺）'), '清单缺',
                 f"维基 帝王「{w['ruler']}」起{w['start']}；库内无同名且起年±1的年号；库内同名年号：{alt(w['raw'])}"])

order = {'库内多余': 0, '清单缺': 1, '一致但写法不同': 2, '一致': 3}
rows.sort(key=lambda r: (order[r[3]], r[0]))
with open(out, 'w', encoding='utf8') as f:
    f.write('年号\t所在方\t朝代\t判定\t依据\n')
    for r in rows: f.write('\t'.join(x.replace('\t', ' ') for x in r) + '\n')
c = collections.Counter(r[3] for r in rows)
print('库内', len(lib), '（其中墓碑', sum(L['tomb'] for L in lib), '）')
print('清单总数（有起年）', len(wp), '｜清单跳过', dict(skipped))
print('交集（配对）', both, '｜库内多余', c['库内多余'], '｜清单缺', c['清单缺'], '｜写法不同', c['一致但写法不同'], '｜一致', c['一致'])
print('差集', c['库内多余'] + c['清单缺'])
