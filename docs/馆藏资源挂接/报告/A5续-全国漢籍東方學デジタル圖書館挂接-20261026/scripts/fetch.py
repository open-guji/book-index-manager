import json,time,urllib.request,os,sys
inp,outp=sys.argv[1],sys.argv[2]
done=set()
if os.path.exists(outp):
    for l in open(outp): done.add(json.loads(l)['source_id'])
o=open(outp,'a')
for l in open(inp):
    r=json.loads(l)
    if r['source_id'] in done: continue
    for k in range(4):
        try:
            h=urllib.request.urlopen(r['url'],timeout=60).read().decode('utf-8','replace');break
        except Exception as e:
            h=None;time.sleep(5*(k+1))
    o.write(json.dumps({'source_id':r['source_id'],'html':h},ensure_ascii=False)+'\n');o.flush()
    time.sleep(1.5)
