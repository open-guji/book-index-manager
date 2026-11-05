"""book-text 元数据 → 目录库（GUJI-755 第 4 步）。

进库的三种文件（正文 NNN.md、char／cord 逐格数据等不进）：
  {Work,Book}/c1/c2/c3/<id>/manifest.json         → BtItem（bt_item、bt_manifest_version）
  {Work,Book}/c1/c2/c3/<id>/<版本key>/index.json   → BtVersion（bt_version、bt_chapter、bt_heading、bt_other_source）
  Work/c1/c2/c3/<id>/fragments/<书名>.json         → Fragment（fragment 及六张明细表）
  <版本key>/NNN.json（整理本各章）                  → BtCollated（bt_collated、bt_section、bt_section_work、bt_section_alt_title）
  <版本key>/NNN.entity.json（original 专名层）      → BtEntityLayer（bt_entity_layer、bt_entity_span）
除 manifest 外的文件没有 id（或 id 另有含义），装库时补：「条目id/版本key」「Work id/文件名（去 .json）」
「条目id/版本key/NNN」；还原时去掉即原文件内容。
"""
import glob
import json
import os

from .mapping import BT_RECORDS

NOT_VERSION = ('fragments', 'sources', 'extra', 'proof')


def bt_paths(root):
    """{记录名: [(补的 id 或 None, 相对路径)]}，按路径排序。"""
    out = {n: [] for n in BT_RECORDS}
    for t in ('Work', 'Book'):
        for item in sorted(glob.glob(os.path.join(root, t, '*', '*', '*', '*'))):
            if not os.path.isdir(item):
                continue
            iid = os.path.basename(item)
            rel = os.path.relpath(item, root)
            if os.path.isfile(os.path.join(item, 'manifest.json')):
                out['BtItem'].append((None, os.path.join(rel, 'manifest.json')))
            for key in sorted(os.listdir(item)):
                if key in NOT_VERSION:
                    continue
                if os.path.isfile(os.path.join(item, key, 'index.json')):
                    out['BtVersion'].append(('%s/%s' % (iid, key), os.path.join(rel, key, 'index.json')))
                    vdir = os.path.join(item, key)
                    for f in sorted(os.listdir(vdir)):
                        stem, _, ext = f.partition('.')
                        if not (stem.isdigit() and len(stem) == 3):
                            continue
                        if ext == 'json':
                            out['BtCollated'].append(('%s/%s/%s' % (iid, key, stem), os.path.join(rel, key, f)))
                        elif ext == 'entity.json':
                            out['BtEntityLayer'].append(('%s/%s/%s' % (iid, key, stem), os.path.join(rel, key, f)))
            for f in sorted(glob.glob(os.path.join(item, 'fragments', '*.json'))):
                out['Fragment'].append(('%s/%s' % (iid, os.path.basename(f)[:-5]), os.path.relpath(f, root)))
    return out


def bt_docs(root, name, paths):
    """读文件、补 id。回 [doc]。"""
    docs = []
    for iid, rel in paths:
        with open(os.path.join(root, rel), encoding='utf-8') as f:
            d = json.load(f)
        if iid is not None:
            if 'id' in d:
                raise ValueError('%s 自带 id，与补的 id 冲突' % rel)
            d = dict({'id': iid}, **d)
        docs.append(d)
    return docs


def strip_id(name, d):
    """还原出的 doc 去掉补的 id。"""
    if name == 'BtItem':
        return d
    return {k: v for k, v in d.items() if k != 'id'}
