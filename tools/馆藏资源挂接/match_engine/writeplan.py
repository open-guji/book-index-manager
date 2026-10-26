"""确定档 → resources[] 草案（口径 K1–K11）。只出计划，不写库；由 E 块执行写入。

policy（口径.md）：id/group 前缀/metadata 键见 SITES；每 Work 每来源 ≤MAX_ITEMS 个藏本，
取舍序＝有全本影像＞版本信息明确＞卷数完整（K9）；被舍行在 matches.tsv 标 CAP_DROPPED；
Work 层绝不出 physical（K4）；只写确定档（K11）；无影像条不写（write_no_image=False）。
"""
import re
import unicodedata

MAX_ITEMS = 3

SITES = {
    'nlc': dict(id='nlc', name='中華古籍資源庫（國家圖書館）', short_name='國圖', prefix='nlc-', label='國圖藏本：{edition}'),
    # C3 台湾国图（2026-10-26）：url＝按書號的 GET 检索（详情页带会话令牌）；记录号＝書號
    'ncltw': dict(id='ncl-tw', name='古籍與特藏文獻資源（臺灣國家圖書館）', short_name='臺灣國圖', prefix='ncltw-',
                  label='臺灣國家圖書館藏本：{edition}'),
    'kokusho': dict(id='kokusho', name='國書データベース（國文學研究資料館）', short_name='國書', prefix='kokusho-',
                    label='國書·{holder}藏{edition}'),
    'naikaku': dict(id='nat-archives-jp', name='國立公文書館デジタルアーカイブ（內閣文庫）', short_name='內閣文庫', prefix='naikaku-',
                    label='內閣文庫藏本：{edition}（{req}，{extent}）'),
    'waseda': dict(id='waseda', name='早稲田大学図書館 古典籍総合データベース', short_name='早稲田', prefix='waseda-', label='早稲田藏本{edition}'),
    'ndl': dict(id='ndl', name='國立國會圖書館デジタルコレクション', short_name='NDL', prefix='ndl-', label='NDL藏本：{edition}'),
    # A8 欧美六馆（2026-10-26）：url＝站方影像阅览页（bnf 用 Gallica、onb 用 ABO 阅览器；书目页无影像），记录号 <site>_record
    'bnf': dict(id='bnf', name='Gallica（法國國家圖書館）', short_name='法國國圖', prefix='bnf-', label='法國國家圖書館藏本：{edition}'),
    'bsb': dict(id='bsb', name='MDZ 數字館藏（巴伐利亞州立圖書館）', short_name='巴伐利亞', prefix='bsb-', label='巴伐利亞州立圖書館藏本：{edition}'),
    'sbb': dict(id='sbb', name='柏林國家圖書館數字館藏', short_name='柏林國圖', prefix='sbb-', label='柏林國家圖書館藏本：{edition}'),
    'loc': dict(id='loc', name='美國國會圖書館數字館藏', short_name='美國國會', prefix='loc-', label='美國國會圖書館藏本：{edition}'),
    'cudl': dict(id='cudl', name='劍橋大學數字圖書館', short_name='劍橋', prefix='cudl-', label='劍橋大學圖書館藏本：{edition}'),
    'onb': dict(id='onb', name='奧地利國家圖書館 Austrian Books Online', short_name='奧地利國圖', prefix='onb-', label='奧地利國家圖書館藏本：{edition}'),
}
EURO = ('bnf', 'bsb', 'sbb', 'loc', 'cudl', 'onb')
VAGUE_EDITION = {'', '刊', '写', '寫', '刻', '抄', '鈔'}


def _waseda_edition(v):
    """早稲田出版事项：去罗马字、去‘不明’占位，如 `寿陽 : 祁寯藻, 咸豊8[1858]序 juyō : kishunsō` → `寿陽 : 祁寯藻, 咸豊8[1858]序`。"""
    from adapters.waseda import LAT
    v = unicodedata.normalize('NFKC', v or '')
    v = re.sub(r'\[(?:出版地|出版者|出版年)不明\]', '', v)
    parts = []
    for seg in v.split(' : '):
        seg = re.sub(r'\s+', ' ', LAT.sub(' ', seg)).strip(' :,，')
        if seg:
            parts.append(seg)
    v = ' : '.join(parts)
    return v


def _pid(rec):
    m = re.search(r'/pid/(\d+)', rec.get('image_url') or '')
    return m.group(1) if m else ''


def make_item(source, rec, types=('image',)):
    """一条确定记录 → (resource 项, 组键, 组 label)。无影像或缺记录号返回 None。"""
    s = SITES[source]
    edition = (rec.get('version_raw') or '').strip()
    if source == 'waseda':
        edition = _waseda_edition(edition)
    md = {}
    if source == 'nlc':
        rid = rec['source_record_id']
        md = dict(nlc_fid=rid)
        url = rec['url']
    elif source == 'ncltw':
        rid = rec['source_record_id']
        md = dict(ncltw_bookno=rid)
        hid = (rec.get('extra') or {}).get('holding_id') or ''
        if hid:
            md['call_number'] = hid
        url = rec['url']
    elif source == 'kokusho':
        rid = rec['source_record_id']
        holder = (rec.get('extra') or {}).get('holder', '')
        md = dict(kokusho_bid=rid, holder=holder)
        url = rec['url']
    elif source == 'naikaku':
        rid = rec['source_record_id']
        ex = rec.get('extra') or {}
        md = dict(naikaku_file_id=rid, request_no=ex.get('request_no', ''))
        url = rec['url']
    elif source == 'waseda':      # 口径 K12：url＝所选记录页（多册书用分册页，顶层页 404），group＝顶层册，不取 image_url，不要求 image_url
        rid = rec['group_key']
        md = dict(waseda_id=rid)
        url = rec['url']      # 多册书顶层 /html/<pre>/<gid>/index.html 实测 404（只有分册页 <gid>_NNNN 200）：用所选记录自己的页面；group 仍按顶层册 gid
        if rec['source_record_id'] == rid:
            url = re.sub(r'/html/([^/]+)/[^/]+/index\.html$', lambda m: f'/html/{m.group(1)}/{rid}/index.html', url)
        types = ('image',)
    elif source in EURO:
        rid = rec['source_record_id']
        md = {source + '_record': rid}
        ex = rec.get('extra') or {}
        gid = ex.get('set_id') or rid      # 多册书：group 用整套记录号（bsb parent_b3kat_id／柏林 parent_ppn）；无整套号时用首册号
        url = rec['image_url'] if source in ('bnf', 'onb') else rec['url']
        if source == 'bnf':
            md['bnf_catalogue'] = rec['url']
        if source in ('bsb', 'sbb', 'loc', 'cudl'):
            md['iiif_manifest'] = rec['image_url']
        hid = (rec.get('extra') or {}).get('holding_id') or ''
        if hid:
            md['shelfmark'] = hid
        url = url.replace('http://', 'https://', 1)
        if ex.get('set_size', 1) > 1:
            md['volume_count'] = ex['set_size']
    else:
        rid = _pid(rec)
        if not rid:
            return None
        md = dict(ndl_record='pid' + rid)
        url = 'https://dl.ndl.go.jp/pid/' + rid
    if not rid or (source != 'waseda' and not rec.get('has_image')):
        return None
    md['edition'] = edition
    if source in ('kokusho', 'naikaku'):
        md['iiif_manifest'] = rec['image_url']
    if source == 'naikaku':
        md['extent'] = (rec.get('extra') or {}).get('extent', '')
    grp = s['prefix'] + (gid if source in EURO else rid)
    item = dict(id=s['id'], group=grp, group_role='origin', name=s['name'], short_name=s['short_name'], url=url,
                types=list(types), metadata=md)
    if source in EURO and md.get('volume_count'):
        item['details'] = f'多冊本，站方分 {md["volume_count"]} 條著錄；此處鏈接其中排序最前一條（{rid}），其餘各冊見站方'
    ex = rec.get('extra') or {}
    if source == 'waseda' and edition:
        edition = '：' + edition
    label = s['label'].format(edition=ex.get('edition_label') or edition, holder=md.get('holder', ''),
                              req=unicodedata.normalize('NFKC', ex.get('request_no', '')).replace('－', '-'), extent=ex.get('extent', ''))
    return item, grp, label


def rank_key(rec):
    """K9 取舍序：影像 > 版本明确 > 卷数；再以记录号定序，保证确定性。"""
    ed = (rec.get('version_raw') or '').strip()
    return (-int(bool(rec.get('has_image'))), -int(ed not in VAGUE_EDITION), -(rec.get('juan') or 0),
            (rec.get('extra') or {}).get('set_order', 0), rec['source_record_id'])


def build(source, rows, existing=None):
    """rows: engine 的行（rec/tier/work_id/codes/excluded）。返回 (plan, dropped_ids, linked)；linked＝已挂行按同一规则重出的草案（只用于与库内现有项比对形状）。
    existing: {work_id: {group 键}}，该 Work 已有的同来源藏本（不在本批确定行里的，占额）。
    被排除（excluded）、非确定、已挂（linked）的行不进 plan；已挂者仍参与排名占额（保证与既有写入同形）。"""
    by_work = {}
    for x in rows:
        if x['tier'] != '确定' or not x['work_id'] or x.get('excluded'):
            continue
        by_work.setdefault(x['work_id'], []).append(x)
    plan, dropped, linked = [], [], []
    for wid, xs in by_work.items():
        xs.sort(key=lambda x: (-int(bool(x.get('already_linked'))),) + rank_key(x['rec']))   # 已挂者先占额（稳定、不重排旧写入）
        mine = {m[1] for m in (make_item(source, x['rec']) for x in xs) if m}
        kept = len((existing or {}).get(wid, set()) - mine)
        seen_grp = set()
        for x in xs:
            made = make_item(source, x['rec'])
            if made is None:
                continue
            if source == 'waseda' or source in EURO:        # 匹配单位是记录、写入单位是顶层册／整套：同 Work 同组只留排序最前的一条
                if made[1] in seen_grp:
                    continue
                seen_grp.add(made[1])
            if kept >= MAX_ITEMS and not x.get('already_linked'):
                dropped.append(x['rec']['source_record_id'])
                x['codes'].append('CAP_DROPPED')
                continue
            kept += 1
            item, grp, label = made
            row = dict(work_id=wid, source=source, record_id=x['rec']['source_record_id'], resource=item,
                       resource_group={grp: {'label': label}})
            (linked if x.get('already_linked') else plan).append(row)
    return plan, dropped, linked
