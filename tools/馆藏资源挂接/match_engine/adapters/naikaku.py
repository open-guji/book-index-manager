"""国立公文書館内閣文庫「漢書」适配器（站点 id nat-archives-jp，group 前缀 naikaku-）。
najda 按册著录（每册一条）：按 extra.file_id 成组，一组＝一个藏本（請求番号），一组一条 Record；
题名取 file_level.title，缺则 booklet_title，再缺取 materialspec_path 末段（无 file_level 的组无责任者，必存疑）。
责任者「著者:陸佃（宋）；校訂者:…」：著者／編者／選者／訳者为主；注釈者只在没有主责任者时补用；其余角色不计。
承 D3 的 match_naikaku.py；叢書の部、N家 合集降级。"""
import glob
import json
import os
import re
import unicodedata

import era
from normalize import fold, PUNCT
from titleparse import cn2int

SOURCE = 'naikaku'
DIR = '国立公文書館内閣文庫漢籍'
PRIMARY = ('著者', '編者', '選者', '訳者')
SORTMAP = {'経の部': '經部', '史の部': '史部', '子の部': '子部', '集の部': '集部', '叢書の部': '叢書'}


def parse_author(s):
    """→ (主责任者名集合, 首个朝代标注)。"""
    prim, note, era_tok = set(), set(), None
    for p in re.split(r'[；;]', unicodedata.normalize('NFKC', s or '')):
        if ':' not in p:
            continue
        role, name = p.split(':', 1)
        m = re.search(r'[(（]([^)）]{1,4})[)）]\s*$', name)
        if m:
            name = name[:m.start()]
        nm = PUNCT.sub('', fold(re.sub(r'等$', '', name.strip())))
        if not 2 <= len(nm) <= 6 or nm in ('阙名', '不详', '佚名', '无名氏'):
            continue
        if role in PRIMARY:
            prim.add(nm)
            era_tok = era_tok or (m.group(1) if m else None)
        elif role == '注釈者':
            note.add(nm)
    return (prim or note), era_tok


def juan_of(version):
    tail = unicodedata.normalize('NFKC', version or '').split(':')[-1]
    m = re.search(r'(\d+)巻', tail)
    return int(m.group(1)) if m else None


def edition_label(version):
    """「刊本（序刊）::明崇禎:050000:広益堂」→「明崇禎5年刊本（序刊） 広益堂」；
    「刊本:明万暦26年:::」→「明万暦26年刊本」；「刊本:明:::」→「明刊本」。无法解析原样返回。"""
    if ':' not in (version or ''):
        return (version or '').strip()
    parts = [x.strip() for x in version.split(':')] + [''] * 5
    typ = parts[0]
    ep = parts[1] or parts[2]
    ymd = parts[3] if re.fullmatch(r'\d{6}', parts[3]) else ''
    pub = unicodedata.normalize('NFKC', parts[4]) if ep else ''
    y = int(ymd[:2]) if ymd else 0
    if ep and y and not re.search(r'\d+年', ep):
        ep = f"{ep}{y}年"
    out = f"{ep}{typ}"
    return f"{out} {pub}" if pub else out


def load(data_root, path=DIR):
    groups = {}
    for f in sorted(glob.glob(os.path.join(data_root, path, 'part-*.json'))):
        for r in json.load(open(f, encoding='utf-8')):
            groups.setdefault((r.get('extra') or {}).get('file_id') or r['source_record_id'], []).append(r)
    out = []
    for fid, rs in groups.items():
        r = rs[0]
        ex = r.get('extra') or {}
        fl = ex.get('file_level') or {}
        title = fl.get('title') or ex.get('booklet_title') or (ex.get('materialspec_path') or r.get('sort') or '').split(' > ')[-1]
        author = fl.get('creator_name') or r.get('author') or ''
        version = fl.get('biblio_info') or r.get('version') or ''
        names, era_tok = parse_author(author)
        sk = SORTMAP.get(next((x for x in (ex.get('materialspec_path') or r.get('sort') or '').split(' > ') if x in SORTMAP), ''), '')
        force = []
        if re.match(r'^[二三四五六七八九十]家', unicodedata.normalize('NFKC', title)):
            force.append('COLLECTION')
        if sk == '叢書':
            force.append('COLLECTION')
        img = next((x.get('image_url') for x in rs if x.get('image_url')), '')
        p = dict(wname='', names=names, era_token=era_tok, juan=juan_of(version), segs=[title], alts=[], sort=sk, force=force)
        out.append(dict(source=SOURCE, source_record_id=str(fid), group_key=str(fid), title_raw=title, author_raw=author,
                        version_raw=version, juan=p['juan'], class_raw=sk,
                        url='https://www.digital.archives.go.jp/file/' + str(fid), image_url=img, has_image=bool(img),
                        extra=dict(n_vols=len(rs), request_no=fl.get('request_no', ''), extent=fl.get('extent') or r.get('extent') or '',
                                   edition_label=edition_label(version)), parsed=p))
    return out
