#!/usr/bin/env python3
"""存佚判別。輸出各書之存佚推定與其依據，只掃不改。

輸出用 SCHEMA 之 loss_status 枚舉：lost／partially_extant／extant／undetermined。
出土與真偽**不入本枚舉**——出土是路徑不是狀態（其事由 Book 與「出土簡帛」
Collection 承載），真偽是另一軸；二者只作旗標隨行，不改判定。

用法：python3 loss_status.py [--csv]

**為什麼不能只查描述裡的「佚」字**
舊法查「亡佚|已亡|久佚|散佚|今佚」有無，得三一四六條「全佚」，其中七七五條是今存之書。
四庫提要之文，「佚」字十之八九不指本書：
  《可閒老人集》「舊版久佚，流傳漸寡」——佚者版本，非書；
  《甬上耆舊詩》「宋袁燮之《絜齋集》……亡佚已久」——佚者他書；
  《集異記》「案：此書今佚」——佚者所引之《三水小牘》。

**四種騙人的寫法**
  甲 過去式之「尚存」：「梁時尚存，隋時已亡」「唐時尚存殘本，宋後全亡」
     「隋唐尚存，元明之際並亡」——皆全佚。
  乙 輯本非原書：「今存者為清孫星衍校輯本」「皆後人所輯，非漢時原書」——皆全佚。
  丙 他書之今本：「今本《竹書紀年》」「即今本《鬼谷子》」——所指非本書。
  丁 殘存：「《漢志》七十一篇，今存六十三篇」——有原數今數之差者為殘存。

**來源比文字可靠，但也有限度**
見於清以降之目錄（四庫總目、續修四庫、中國通俗小說書目）者，其時尚存，多非全佚。
**但書目答問是例外**——它著錄的往往是輯本而非原書
（《世本》《尸子》《傅子》《皇覽》《漢舊儀》皆然），故不足以證原書今存。
"""
import json, glob, re, sys, collections

LATE_STRONG = {'欽定四庫全書總目', '四庫全書總目', '續修四庫全書',
               '四庫全書存目叢書', '中國通俗小說書目'}
LATE_WEAK = {'書目答問'}          # 多著錄輯本，不足證原書今存
# UNEAR / FAKE 只用於旗標，不參與判定
NUM = r'[〇零一二三四五六七八九十百千0-9]'
LOST = re.compile(r'亡佚|已亡|久佚|佚已久|散佚|今佚|其書亡|不傳|亡於|全亡|並亡|遂亡|失傳|無傳本')
EXT = re.compile(r'今存|尚存|現存|傳世|存世|完帙|通行本|今傳|尚有傳本')
JIBEN = re.compile(r'輯本|校輯|所輯|輯佚|集本|輯錄|輯成|辑本')
PART = re.compile(rf'今存{NUM}+[篇卷]|存{NUM}+[篇卷]|殘存|殘缺|非完帙|闕文|脫簡|其中.{{0,8}}[亡佚]')
UNEAR = re.compile(r'出土|簡帛|帛書|竹簡|楚簡|漢簡|馬王堆|郭店|銀雀山')
FAKE = re.compile(r'偽書|偽託|依託.{0,4}作|後人偽|贗')


def judge_text(s):
    """依描述判存佚 → (類, 依據)。未見存佚之語者為「未詳」。"""
    if not s or not s.strip():
        return 'undetermined', ''
    cl = [c for c in re.split(r'[。；;]', s) if EXT.search(c) or LOST.search(c)]
    if not cl:
        return 'undetermined', ''
    for c in cl:                                   # 乙
        if EXT.search(c) and JIBEN.search(c):
            return 'lost', f'輯本非原書：{c[:40]}'
    for i, c in enumerate(cl):                     # 甲
        if EXT.search(c) and any(LOST.search(d) for d in cl[i:]):
            k = 'partially_extant' if PART.search(c) and not LOST.search(c) else 'lost'
            return k, f'先存後亡：{c[:30]}／{cl[-1][:30]}'
    for c in cl:                                   # 丁
        if PART.search(c) and EXT.search(c):
            return 'partially_extant', f'原數今數有差：{c[:40]}'
    last = cl[-1]
    if EXT.search(last) and not LOST.search(last):
        return 'extant', f'末語言存：{last[:40]}'
    if LOST.search(last):
        return 'lost', f'末語言亡：{last[:40]}'
    return 'undetermined', last[:40]


def judge(x):
    """合描述與來源而判 → (類, 依據, 疑)。"""
    ds = ((x.get('description') or {}).get('text') or '')
    kz = '\n'.join((e.get('summary') or '')
                   for e in (x.get('emendated_by') or []) + (x.get('indexed_by') or []))
    k, why = judge_text(ds or kz)
    src = {e.get('source') for e in (x.get('emendated_by') or []) + (x.get('indexed_by') or [])}
    doubt = ''
    if k == 'lost' and (src & LATE_STRONG):
        doubt = f'疑非 lost：見於{sorted(src & LATE_STRONG)}，其時尚存'
    # 出土不是存佚狀態而是路徑，真偽是另一軸——二者皆不入本枚舉，
    # 只作旗標隨行，供人工覆核時參考，不改 k。
    flag = []
    if UNEAR.search(ds): flag.append('出土相關')
    if FAKE.search(ds): flag.append('文中見偽字（多半不指本書，須逐條讀）')
    return k, why, doubt, '／'.join(flag)


def main():
    IW = {}
    for s in '0123456789abcdef':
        IW.update(json.load(open(f'index/works/{s}.json')))
    st = collections.Counter(); dou = []
    csv = '--csv' in sys.argv
    for w, m in IW.items():
        try: x = json.load(open(m['path']))
        except Exception: continue
        k, why, doubt, flag = judge(x)
        st[k] += 1
        if doubt: st['·其中疑非 lost'] += 1; dou.append((w, x.get('title'), doubt))
        if flag: st['·帶旗標'] += 1
        if csv: print(f'{w}\t{x.get("title")}\t{k}\t{doubt or why}\t{flag}')
    if csv: return
    for k, v in st.most_common(): print(f'  {k}: {v}')
    print(f'\n疑非 lost 者 {len(dou)}（前 20）：')
    for w, t, d in dou[:20]: print(f'  {w} 《{t}》 {d}')


if __name__ == '__main__':
    main()
