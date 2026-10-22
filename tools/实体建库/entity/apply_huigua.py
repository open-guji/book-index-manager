# 用法：python3 apply_huigua.py <回挂清单.tsv>（在 book-index 仓根运行；root 写死 /home/user/book-index，换路径请改第2行）
# 清单列：作者名\tEntity id\tCBDB\t证据档\t动作\tWork id\tWork 题名；Entity 须已存在（先拷 Entity 文件）。只加 authors[].entity_id；先做 JSON 往返检查，失败的 Work 不动并在 bad 里报。
import csv,json,glob,os,sys,collections
tsv=sys.argv[1]; root='/home/user/book-index'
idx={}
for f in glob.glob(root+'/Work/*/*/*/*.json'):
    idx[os.path.basename(f).split('-')[0]]=f
ents=set()
for f in glob.glob(root+'/index/entities/*.json'): ents|=set(json.load(open(f,encoding='utf-8')))
rows=list(csv.DictReader(open(tsv,encoding='utf-8'),delimiter='\t'))
byw=collections.defaultdict(list)
for r in rows: byw[r['Work id']].append(r)
bad=[];changed=0;rt_bad=0
for wid,rs in byw.items():
    f=idx.get(wid)
    if not f: bad.append(('NOWORK',wid)); continue
    raw=open(f,encoding='utf-8').read()
    d=json.loads(raw)
    # roundtrip check
    if json.dumps(d,ensure_ascii=False,indent=2)+'\n'!=raw and json.dumps(d,ensure_ascii=False,indent=2)!=raw: rt_bad+=1; bad.append(('ROUNDTRIP',wid)); continue
    for r in rs:
        hit=[a for a in d.get('authors',[]) if (a.get('name') or '').strip()==r['作者名'] and not a.get('entity_id')]
        if len(hit)!=1: bad.append(('AUTHORMATCH',wid,r['作者名'],len(hit))); continue
        if r['Entity id'] not in ents: bad.append(('NOENT',r['作者名'],r['Entity id'])); continue
        hit[0]['entity_id']=r['Entity id']; changed+=1
    new=json.dumps(d,ensure_ascii=False,indent=2)+('\n' if raw.endswith('\n') else '')
    open(f,'w',encoding='utf-8').write(new)
print('works',len(byw),'changed authors',changed,'bad',len(bad)); print(bad[:20])
