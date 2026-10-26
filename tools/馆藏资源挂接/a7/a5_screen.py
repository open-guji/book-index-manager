"""A7：A5 全国漢籍「库内无同题」候选粗分档（归一后同题已有／日本近人／无著者／同作者有近题／同作者无近题／作者不在库）。
    python3 a5_screen.py <工作目录>
"""
import pickle,sys,re,collections
sys.path.insert(0,'/home/claude/book-index-manager/tools/馆藏资源挂接/match_engine')
from normalize import norm_title
S = sys.argv[1]  # 工作目录：works.pkl（screen.py 生成）、a5-cand.tsv（A5 组级表 top_code=N_NOTITLE 且 n_old>0 的行）
w=pickle.load(open(f'{S}/works.pkl','rb'))
FOLD=str.maketrans({'攷':'考','畧':'略','稾':'稿','藳':'稿','槁':'稿','敍':'叙','敘':'叙','郞':'郎','淸':'清','眞':'真','冨':'富','衞':'卫','麤':'粗','鈔':'抄','钞':'抄','编':'编','註':'注','疎':'疏','蹟':'迹','跡':'迹','彙':'汇','匯':'汇'})
def N(t): return (norm_title(t) or t).translate(FOLD)
idx=collections.defaultdict(list); byauth=collections.defaultdict(list)
for x in w:
    for n in x[3]|{N(x[1])}: idx[n.translate(FOLD)].append(x)
    for a in x[2].split('/'):
        if a: byauth[a].append(x)
DYN=r'^(淸|清|明|宋|元|唐|漢|晉|魏|梁|陳|隋|五代|南唐|後漢|東漢|西漢|東晉|劉宋|南朝\S|北魏|北齊|北周|遼|金|周|秦|吳|蜀|三國\S?|南宋|北宋|姚秦|苻秦|後秦|北涼|蕭齊|齊|□|後周|後唐|後晉|前秦|西晉|曹魏|蜀漢|元魏|戰國|春秋)[　\s]*'
NUM='一二三四五六七八九十百千〇零兩廿卅\\d'
def core(t):
    t=t.strip(); t=re.sub(r'^（[^）]*）','',t); t=re.sub(r'^〔|〕','',t)
    t=re.split(r'[　\s]',t)[0]
    t=re.sub(r'(殘|存|闕|缺).*$','',t)
    t=re.sub(r'(卷第?['+NUM+r']+.*|['+NUM+r']+卷.*|不分卷.*|卷首.*|['+NUM+r']+册.*|全)$','',t)
    return t
def bg(s): return {s[i:i+2] for i in range(len(s)-1)} or {s}
def dice(a,b):
    A,B=bg(a),bg(b); return 2*len(A&B)/(len(A)+len(B))
FRAG=re.compile(r'殘|存卷|卷[一二三四五六七八九十\d]+至|闕|缺')
c=collections.Counter(); out=[]
for l in open(f'{S}/a5-cand.tsv'):
    f=l.rstrip('\n').split('\t')
    nrec,nold,ninst,ts,au=int(f[4]),int(f[5]),int(f[6]),f[10],f[11].strip()
    t=core(ts); n=N(t)
    frag=bool(FRAG.search(ts))
    m=re.match(DYN,au); a0=au.split('　')[0]
    a=re.sub(DYN,'',a0).strip(); a=re.sub(r'\s*(等)?\s*(撰|編|著|輯|注|註|譯|述|校|纂|選|批評|評|同輯|敕撰|錄|撰並註|集解|疏)$','',a).strip()
    modern_or_jp = bool(au) and not m and not au.startswith('□')
    if not t or len(n)<2: cls='E空或过短'
    elif idx.get(n): cls='A归一后同题已有'
    elif modern_or_jp: cls='J日本/近人/无朝代著者'
    elif not au or au.startswith('□'):
        hits=[x for x in w if False]
        cls='U无著者'
    else:
        cand=byauth.get(a,[])
        best=max((dice(n,list(x[3])[0] if x[3] else x[1]) for x in cand),default=0)
        if not cand: cls='C中国著者·作者不在库'
        elif best>=0.5: cls='K中国著者·同作者有近题(待人判)'
        else: cls='B中国著者·同作者无近题'
    if cls[0] in 'BC' and frag: cls=cls+'·残本'
    c[cls]+=1; out.append((cls,str(nrec),str(nold),str(ninst),ts,au,f[0]))
for k,v in sorted(c.items()): print(v,k)
with open(f'{S}/a5-cls2.tsv','w') as fo:
    for o in out: fo.write('\t'.join(o)+'\n')
