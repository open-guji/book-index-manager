import csv,json,glob,sys,importlib,math
csv.field_size_limit(10**9)
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
BI='/home/user/book-index'
NM={'naikaku':'内閣','ndl':'NDL','kokusho':'国書'}
SITE={'naikaku':'nat-archives-jp','ndl':'ndl','kokusho':'kokusho'}
def load(wid):
    g=glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}*.json'); return json.load(open(g[0])) if g else None
def wdesc(wid,src):
    w=load(wid)
    if not w: return f'{wid}:缺'
    if w.get('merged_into'):
        k=w['merged_into']; w=load(k) or w; wid=k
    au='、'.join(f"{a.get('name','')}({a.get('dynasty','')}){a.get('role','')}" for a in (w.get('authors') or []) if isinstance(a,dict))
    jc=w.get('juan_count',{}).get('number','') if isinstance(w.get('juan_count'),dict) else ''
    ib='；'.join(f"{i.get('source','')}:{i.get('title_info','')}{i.get('author_info','')}" for i in (w.get('indexed_by') or [])[:2])
    nres=sum(1 for x in (w.get('resources') or []) if x.get('id')==SITE[src])
    return f"[{wid}] {w.get('title','')} | {au} | 卷{jc} | {ib[:150]} | 已挂{NM[src]}{nres}"
def make(items,src,out_prefix,n):
    A=importlib.import_module('adapters.'+src)
    recs={r['source_record_id']:r for r in A.load('/home/user/book_index_json/library_data')}
    M={r['source_record_id']:r for r in csv.DictReader(open(f'/tmp/w/{src}/matches.tsv'),delimiter='\t')}
    rows=[]
    for rid,wid in items:
        c=recs.get(rid,{}); m=M.get(rid,{})
        rows.append([rid,c.get('title_raw',m.get('lib_title','')),c.get('author_raw',m.get('lib_author','')),c.get('version_raw',''),c.get('class_raw',''),json.dumps(c.get('extra',{}),ensure_ascii=False)[:200],wdesc(wid,src),''])
    hdr=['record_id',f'{NM[src]}题名',f'{NM[src]}责任者',f'{NM[src]}版本',f'{NM[src]}分类',f'{NM[src]}其他','候选Work（[id] 题名|著者(朝代)|卷数|著录|已挂数）','其他同题Work（仅供参考，不能挂）']
    sz=math.ceil(len(rows)/n); files=[]
    for i in range(n):
        fn=f'{out_prefix}{i+1}.tsv'; files.append(fn)
        with open(fn,'w') as f:
            w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['序号']+hdr)
            for k,x in enumerate(rows[i*sz:(i+1)*sz],1): w.writerow([k]+x)
    return files
if __name__=='__main__':
    by={}
    for l in open('/tmp/w/certain_final.jsonl'):
        p=json.loads(l); by.setdefault(p['source'],[]).append((p['record_id'],p['work_id']))
    for s,n in (('naikaku',3),('ndl',1),('kokusho',1)):
        print(s,len(by[s]),make(by[s],s,f'盲检A_{s}_',n))
