"""抽取 zh.wikipedia「中国年号列表」页 HTML 里的年号表 → 源表 TSV（只作对勘参照）。
用法: python3 -I extract_wp.py wp.html out.tsv "<取数时刻>"
列: 来源｜源内键｜年号｜朝代(源写法)｜帝王(源写法)｜起｜止｜备注
朝代=表前最近的 h2/h3/h4 标题；帝王=表内单格行（「汉光武帝 劉秀（在位…）」）或「君主」列。
"""
import re,sys
from bs4 import BeautifulSoup
src,out,when=sys.argv[1],sys.argv[2],sys.argv[3]
soup=BeautifulSoup(open(src,encoding='utf-8').read(),'html.parser')
def yr(m):
    neg=bool(m.group(1)); n=int(m.group(2)); return -n if neg else n
Y=re.compile(r'(前|公元前)?\s*(\d{1,4})\s*年')
def span(txt):
    t=re.sub(r'\[[^\]]*\]','',txt)
    parts=re.split(r'[－—–~至]',t)
    ys=[]
    for p in parts:
        m=Y.search(p)
        if m: ys.append(yr(m))
        elif ys and re.search(r'[月正閏闰]',p): ys.append(ys[-1]) if False else None
    if not ys: return '',''
    return ys[0], (ys[-1] if len(ys)>1 else ys[0])
rows=[];n=0
for t in soup.find_all('table',class_='wikitable'):
    h=t.find_previous(['h2','h3','h4']); dyn=h.get_text(strip=True).replace('[编辑]','').replace('[編輯]','') if h else ''
    trs=t.find_all('tr'); hdr=[c.get_text(strip=True) for c in trs[0].find_all(['th','td'])]
    if not hdr or hdr[0]!='年号': continue
    ruler=''
    for tr in trs[1:]:
        cells=[c.get_text(' ',strip=True) for c in tr.find_all(['th','td'])]
        if len(cells)==1: ruler=re.split(r'（',cells[0])[0].strip(); continue
        d=dict(zip(hdr,cells))
        if not d.get('起讫时间'): continue
        s,e=span(d['起讫时间']); n+=1
        r=d.get('君主') or ruler
        note=(d.get('备注','') or '').replace('\t',' ').replace('\n',' ')
        rows.append([ 'zhwp-中国年号列表', f'r{n}', re.sub(r'\s+','',d['年号']), dyn, r, str(s), str(e), d['起讫时间']+' | '+note[:80] ])
with open(out,'w',encoding='utf-8') as f:
    f.write(f'# 来源: https://zh.wikipedia.org/wiki/中国年号列表  取数: {when}（洛杉矶）  仅作对勘参照，不入数据仓\n')
    f.write('来源\t源内键\t年号\t朝代(源写法)\t帝王(源写法)\t起\t止\t备注\n')
    for r in rows: f.write('\t'.join(r)+'\n')
print(len(rows),'rows; distinct names',len({r[2] for r in rows}),'; blank start',sum(1 for r in rows if r[5]==''))
