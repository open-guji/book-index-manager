import csv,json,time,urllib.parse,urllib.request,html,sys,os
from opencc import OpenCC
D=os.path.dirname(os.path.abspath(__file__))+'/../'
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'ws_resolve.jsonl')
done={json.loads(l)['title'] for l in open(out)} if os.path.exists(out) else set()
rows=list(csv.DictReader(open(D+'死链表.tsv'),delimiter='\t'))
def title(u):
    u=html.unescape(u)
    if 'title=' in u: return urllib.parse.unquote(u.split('title=')[1].split('&')[0])
    return urllib.parse.unquote(u.split('/wiki/')[-1]).replace('_',' ')
titles=sorted({title(r['url']) for r in rows})
s2t,t2s=OpenCC('s2t'),OpenCC('t2s')
H={'User-Agent':'open-guji-linkaudit/1.0 (lisdpku@gmail.com)'}
def api(**p):
    p['format']='json';u='https://zh.wikisource.org/w/api.php?'+urllib.parse.urlencode(p)
    while True:
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=30))
        except urllib.error.HTTPError as e:
            if e.code==429: time.sleep(900);continue   # Reid 2026-10-15：429 后固定等 15 分钟再发 1 个探路请求（见 CHANGELOG-Reid.md）
            return {'err':e.code}
        except Exception as e: return {'err':str(e)}
f=open(out,'a')
for t in titles:
    if t in done: continue
    cands=[]
    vs=[x for x in dict.fromkeys([s2t.convert(t),t2s.convert(t)]) if x!=t]
    if vs:
        j=api(action='query',titles='|'.join(vs),redirects=1)
        for p in j.get('query',{}).get('pages',{}).values():
            if 'missing' not in p and 'invalid' not in p: cands.append(('variant',p['title']))
        time.sleep(4)
    j=api(action='opensearch',search=t,limit=8)
    if isinstance(j,list) and len(j)>1:
        cands+= [('search',x) for x in j[1]]
    time.sleep(4)
    f.write(json.dumps({'title':t,'cands':cands},ensure_ascii=False)+'\n');f.flush()
