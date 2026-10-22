#!/usr/bin/env python3
"""步3：从 zhwp／DILA 帝王写法机械提取「庙号」（仅「…祖／…宗」结尾、去 1 字朝代前缀），填 帝王年号对照.tsv 第2列。
谥号不能由源写法机械得出（源里多为「谥号式称呼」或俗称），留空待人工。须在 ruler_titles.py 之后运行。"""
import re
S2T=dict(zip('圣顺庄献显仪钦宁兴孝宪懿昭绍睿肃惠宣宗','聖順莊獻顯儀欽寧興孝憲懿昭紹睿肅惠宣宗'))
S2T.update(dict(zip('赵刘张杨吕爱觉载颙烨邺济浚构烈济钟马万历庆隆泽灵嗣宝坖袆础奕纪权亮皓芳髦奂炎炽邺谌邃懿师昭炯韩陈贺叡毓坦焘瞻祁钰镇厚熜熜检荣钧',  '趙劉張楊呂愛覺載顒燁鄴濟浚構烈濟鐘馬萬歷慶隆澤靈嗣寶坖禕礎奕紀權亮皓芳髦奐炎熾鄴諶邃懿師昭炯韓陳賀叡毓坦燾瞻祁鈺鎮厚熜熜檢榮鈞')))
S2T.update({'汉':'漢','辽':'遼','晋':'晉','后':'後','闽':'閩','吴':'吳','梁':'梁','隋':'隋','唐':'唐','宋':'宋','齐':'齊','燕':'燕'})
def t(s): return ''.join(S2T.get(c,c) for c in s)
L=open('帝王年号对照.tsv',encoding='utf8').read().split('\n')
out=[];fill=0;cnt={}
for i,l in enumerate(L):
    if l.startswith('#') or not l.strip() or l.startswith('本名\t'): out.append(l); continue
    f=l.split('\t')
    cand=set()
    for src in f[10].split('/'):  # 仅 zhwp 写法：须带人名且与库内本名吻合，防 ruler.name 与源帝王错位
        parts=src.split(' ')
        if len(parts)<2: continue
        pn=t(parts[-1])
        if not (pn==f[0] or f[0].endswith(pn) or pn in f[0]): continue
        tok=t(parts[0])
        if not re.search('[祖宗]$',tok) or tok==f[0]: continue
        m=tok if len(tok)==2 else tok[-2:] if len(tok)==3 else ''
        if m: cand.add(m)
    if len(cand)==1: f[1]=cand.pop(); fill+=1
    elif len(cand)>1: f[12]=(f[12]+'；' if f[12] else '')+'庙号候选不一:'+'/'.join(sorted(cand))
    out.append('\t'.join(f))
open('帝王年号对照.tsv','w',encoding='utf8').write('\n'.join(out))
print('庙号已填',fill)
