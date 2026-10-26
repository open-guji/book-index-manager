"""已写入的臺灣國圖资源里藏馆不是國圖（合作馆）的：补 metadata.holder，改 resource_groups label 的藏馆名。"""
import json,os,sys,subprocess
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
from writeplan import NCLTW_HOLDER
d=json.load(open('/home/user/book_index_json/library_data/臺灣國家圖書館古籍影像.json'))
own={(r.get('extra') or {}).get('book_no'):(r.get('extra') or {}).get('owner') for r in d if (r.get('extra') or {}).get('book_no')}
files=subprocess.run(['git','-c','core.quotepath=off','grep','-l','"id": "ncl-tw"','--','Work/'],capture_output=True,text=True).stdout.split()
n=0;fl=[]
def bump(rev):
    a,b,_=(rev or '1.0.0').split('.'); return '%s.%d.0'%(a,int(b)+1)
for fp in files:
    raw=open(fp,encoding='utf-8').read(); w=json.loads(raw); ch=0
    for it in w.get('resources',[]):
        if it.get('id')!='ncl-tw': continue
        bno=it['metadata'].get('ncltw_bookno'); o=own.get(bno) or '國家圖書館'
        if o=='國家圖書館' or it['metadata'].get('holder'): continue
        h=NCLTW_HOLDER.get(o,o); it['metadata']['holder']=h
        g=w['resource_groups'][it['group']]; assert g['label'].startswith('臺灣國家圖書館藏本：'),fp
        g['label']=h+g['label'][len('臺灣國家圖書館'):]; ch+=1
    if ch:
        w['revision']=bump(w.get('revision')); w['revised_at']='2026-10-26'
        w['ai_note']=(w.get('ai_note','')+'\n\n2026-10-26 C3续 更正：臺灣國圖資源中 %d 條為合作館藏本（影像經臺灣國圖平臺發佈），label 與 metadata.holder 改寫實際藏館。'%ch).strip()
        ind=len(raw.split('\n')[1])-len(raw.split('\n')[1].lstrip(' '))
        open(fp,'w',encoding='utf-8').write(json.dumps(w,ensure_ascii=False,indent=ind or 2)+'\n'); n+=ch; fl.append(fp)
print('items',n,'works',len(fl)); open(os.environ['FILES_OUT'],'w').write('\n'.join(fl)+'\n')
