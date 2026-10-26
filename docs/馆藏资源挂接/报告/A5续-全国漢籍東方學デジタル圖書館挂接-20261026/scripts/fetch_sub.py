import json,re,html,time,urllib.request,os
from urllib.parse import urljoin
top=json.load(open('toho_top.json'))
seen={}
for l in open('toho_menu.jsonl'):
    r=json.loads(l); seen[r['url']]=r
outp='toho_sub.jsonl'
if os.path.exists(outp):
    for l in open(outp): r=json.loads(l); seen[r['url']]=r
o=open(outp,'a')
queue=[]
def subs(r):
    h=r.get('html') or ''
    out=[]
    for m in re.finditer(r'<a href=["\']?([A-Za-z0-9_./]+menu[0-9]*\.html)["\']?>(.*?)</a>(.*?)<(?:br|/p|p)',h,re.I|re.S):
        href,t,rest=m.groups()
        out.append((urljoin(r['url'],href),html.unescape(re.sub('<[^>]+>','',t)).strip(),html.unescape(re.sub('<[^>]+>','',rest)).strip()))
    return out
for r in list(seen.values()):
    for u,t,rest in subs(r): queue.append((r['url'],u,t,rest))
meta=[]
while queue:
    p,u,t,rest=queue.pop(0)
    meta.append(dict(parent=p,url=u,title=t,rest=rest))
    if u in seen: continue
    h=None
    for k in range(3):
        try: h=urllib.request.urlopen(u,timeout=60).read().decode('utf-8','replace'); break
        except Exception: time.sleep(5*(k+1))
    r={'href':u.split('/')[-1],'url':u,'html':h[:20000] if h else None}
    seen[u]=r; o.write(json.dumps(r,ensure_ascii=False)+'\n'); o.flush()
    for x in subs(r): queue.append((u,)+x)
    time.sleep(1)
json.dump(meta,open('toho_sub_meta.json','w'),ensure_ascii=False,indent=0)
print('done',len(meta))
