"""块 D 步 5：先后规则（Silas 先后规则.md）R2／R3／R7 的 `--exclude-works` 钩子。

只读 overview 里的现成文件，不自己推断：
  R2  ledger.json 里 action=hold 且 reason 前缀为 near_dup:／suspect_same_edition:／work_class_conflict: 的记录所指 Work
  R3  ledger.json 里 work_side=draft 的 work_id（尚未升格到正式库）
  R7  计划/dupx-同题异作者清单.tsv 每行里的 Work 路径（同一资源 url 挂在不同责任者同题名 Work 上）
返回 {work_id: {'R2','R3','R7'}}；引擎在 matches.tsv 加列 excluded（空＝不排除）。本模块不改判定，只标注。
"""
import collections
import glob
import json
import os
import re

HOLD_PREFIX = ('near_dup:', 'suspect_same_edition:', 'work_class_conflict:')
_ID = re.compile(r'\b[0-9a-z]{12,13}\b')


def load_ledgers(progress_dir, known_ids=None):
    out = collections.defaultdict(set)
    for f in glob.glob(os.path.join(progress_dir, '**', 'ledger.json'), recursive=True):
        try:
            recs = json.load(open(f, encoding='utf-8')).get('records') or {}
        except Exception:
            continue
        for v in (recs.values() if isinstance(recs, dict) else recs):
            reason = v.get('reason') or ''
            if v.get('action') == 'hold' and reason.startswith(HOLD_PREFIX):
                ids = [v['work_id']] if v.get('work_id') else [i for i in _ID.findall(reason) if known_ids is None or i in known_ids]
                for i in ids:
                    out[i].add('R2')
            if v.get('work_side') == 'draft' and v.get('work_id'):
                out[v['work_id']].add('R3')
    return out


def load_dupx(tsv):
    out = collections.defaultdict(set)
    for line in open(tsv, encoding='utf-8'):
        for col in line.rstrip('\n').split('\t')[1:]:
            m = re.search(r'/([0-9a-z]{12,13})(?:-[^/]*)?\.json$', col)
            if m:
                out[m.group(1)].add('R7')
    return out


DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')   # tools/馆藏资源挂接/data（GUJI-361 切换后的真源）


def default_plan_dir(overview_root=None):
    """dupx／合刻组白名单等计划类数据所在目录：本仓 tools/馆藏资源挂接/data 优先，缺则回退 overview 旧路径。"""
    if os.path.exists(os.path.join(DATA_DIR, 'dupx-同题异作者清单.tsv')) or os.path.exists(os.path.join(DATA_DIR, '合刻组白名单.tsv')):
        return DATA_DIR
    return os.path.join(overview_root, '项目进展', '馆藏资源挂接', '计划') if overview_root else None


def default_paths(overview_root):
    pd = default_plan_dir(overview_root)
    return (os.path.join(overview_root, '项目进展', '古籍目录', '进度') if overview_root else None,
            os.path.join(pd, 'dupx-同题异作者清单.tsv') if pd else None)


def load_exclusions(overview_root, known_ids=None, ledger_dir=None, dupx=None):
    """ledger_dir／dupx 显式给出时优先；缺省按 overview_root 的旧路径（GUJI-361 参数化，默认行为不变）。"""
    dl, dd = default_paths(overview_root)
    ledger_dir, dupx = ledger_dir or dl, dupx or dd
    ex = collections.defaultdict(set)
    for part in (load_ledgers(ledger_dir, known_ids) if ledger_dir else {}, load_dupx(dupx) if dupx else {}):
        for k, v in part.items():
            ex[k] |= v
    return ex
