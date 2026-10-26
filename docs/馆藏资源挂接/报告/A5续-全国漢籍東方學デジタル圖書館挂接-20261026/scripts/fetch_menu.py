import json,time,urllib.request,os,re,html
rows=json.load(open('toho_top.json'))
outp='toho_menu.jsonl'; done=set()
if os.path.exists(outp):
    for l in open(outp): done.add(json.loads(l)['href'])
o=open(outp,'a')
for r in rows:
    if r['href'] in done: continue
    u=r['url'].replace('html/../','')
    h=None
    for k in range(3):
        try: h=urllib.request.urlopen(u,timeout=60).read().decode('utf-8','replace'); break
        except Exception as e: time.sleep(5*(k+1)); err=str(e)
    o.write(json.dumps({'href':r['href'],'url':u,'html':h[:6000] if h else None, 'n_links':len(re.findall(r'href=',h or '',re.I))},ensure_ascii=False)+'\n'); o.flush()
    time.sleep(1)
