import json,time,os
A="0123456789abcdefghijklmnopqrstuvwxyz"
def enc(v):
    o=""
    while v: o=A[v%36]+o; v//=36
    return o
def shard(i):
    h=0
    for c in i: h=((h*31)+ord(c))&0xFFFFFFFF
    return '%x'%(h%16)
TYPE={'book':0,'collection':2,'work':3,'entity':4}
# 索引目錄名不是一律加 s：entity 的目錄是 index/entities（曾因此寫成 index/entitys 而 FileNotFoundError）
DIR={'book':'books','collection':'collections','work':'works','entity':'entities'}
# 索引分片之縮排：works 用 1，其餘用 2；與庫中既有檔一致，否則整片重排而生假 diff
IND={'books':2,'collections':2,'works':1,'entities':2}
_seq={'n':0}
def newid(kind):
    ts=int(time.time()*1000)&((1<<40)-1)
    _seq['n']+=1
    return enc((1<<62)|(TYPE[kind]<<59)|(ts<<19)|(1<<8)|(_seq['n']%256))
def load_idx(kind):
    if kind=='collection': return json.load(open('index/collections.json'))
    d={}
    for s in '0123456789abcdef': d.update(json.load(open(f'index/{DIR[kind]}/{s}.json')))
    return d
def put_idx(kind,entry):
    i=entry['id']
    if kind=='collection':
        p='index/collections.json'; x=json.load(open(p)); x[i]=entry
        json.dump(x,open(p,'w'),ensure_ascii=False,indent=2); return
    d=DIR[kind]
    p=f'index/{d}/{shard(i)}.json'; x=json.load(open(p)); x[i]=entry
    with open(p,'w') as f:
        json.dump(x,f,ensure_ascii=False,indent=IND[d]); f.write('\n')
def wpath(i,t): return f'Work/{i[-3]}/{i[-2]}/{i[-1]}/{i}-{t}.json'  # 分片取尾 3 字元
def bpath(i,t): return f'Book/{i[-3]}/{i[-2]}/{i[-1]}/{i}-{t}.json'
def cpath(i,t): return f'Collection/{i[-3]}/{i[-2]}/{i[-1]}/{i}-{t}.json'
def epath(i,t): return f'Entity/{i[-3]}/{i[-2]}/{i[-1]}/{i}-{t}.json'
def save(p,d):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    json.dump(d,open(p,'w'),ensure_ascii=False,indent=2)
