"""関西大学 KU-ORCAS 漢籍（经 Japan Search ukansai，kansai；L5，2026-11-12）。泊園文庫、内藤文庫等；按册著录
（题名「莊子南華眞經 巻5」「欽定禮記義疏 巻第81-82」「論語徴 甲」），每册各有 IIIF。
unit＝（去册次的题名, 责任者, 版本）相同者＝一个藏本；册次不当卷数（juan=None），也不当残本。
分类 sort 为四部分类（經部春秋類等），含「叢書」者 → COLLECTION。"""
import re
import unicodedata

from adapters.jpc1 import finalize, load_json, parse_author, parse_title, record

SOURCE = 'kansai'
FILE = '関西大学KU-ORCAS.json'
VOL = re.compile(r'\s+(?:[巻卷]\s*)?(?:第\s*)?[\d０-９一二三四五六七八九十百〜～\-－ー・,，、上中下前後續続正附甲乙丙丁戊己庚辛壬癸首末]+(?:\s*[-－〜～ー]\s*[\d０-９]+)?\s*$|\s+\[\d+\]\s*$')


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        bn = unicodedata.normalize('NFKC', r['bookName'])
        stem = bn
        for _ in range(2):
            stem = VOL.sub('', stem)
        stem = re.sub(r'\s+[巻卷][^\s]*$', '', stem).strip() or bn
        title, juan, force, _ = parse_title(stem)
        names, lead, era = parse_author(r.get('author'))
        if '叢書' in (r.get('sort') or ''):
            force.append('COLLECTION')
        unit = 'u:' + '|'.join((stem, r.get('author') or '', r.get('version') or ''))
        out.append(record(SOURCE, r, title, None, names, lead, era, force, unit, sort=r.get('sort') or '',
                          extra=dict(call_no=r.get('holding_id', ''))))
    return finalize(out)
