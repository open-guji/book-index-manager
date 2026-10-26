"""三个外部仓与朝代键表的缺省位置（2026-10-25 A1 新增，取代各脚本里写死的 /home/user/… 路径）。

优先级：命令行参数 ＞ 环境变量 ＞ 与 book-index-manager 并列的同名目录。
  BOOK_INDEX       正式库 open-guji/book-index 检出（不是 draft；ID 空间不同）
  BOOK_INDEX_JSON  open-guji-core/book_index_json 检出（各源原档在其 library_data/）
  OVERVIEW_ROOT    open-guji-core/overview 检出（古籍目录进度台账、政权映射.tsv）
  DYNASTY_KEYS     朝代键表 dynasty_reign_keys.json（book-index 派生，见 match_engine/README.md「朝代键表」；
                   缺省 tools/馆藏资源挂接/.cache/dynasty_reign_keys.json）
"""
import os

TOOLS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))     # tools/馆藏资源挂接
WORKSPACE = os.path.dirname(os.path.dirname(os.path.dirname(TOOLS)))    # book-index-manager 的上一级
KEYS_CACHE = os.path.join(TOOLS, '.cache', 'dynasty_reign_keys.json')


def _pick(env, sibling):
    v = os.environ.get(env)
    if v:
        return v
    p = os.path.join(WORKSPACE, sibling)
    return p if os.path.isdir(p) else None


def book_index():
    return _pick('BOOK_INDEX', 'book-index')


def book_index_json():
    return _pick('BOOK_INDEX_JSON', 'book_index_json')


def library_data():
    r = book_index_json()
    return os.path.join(r, 'library_data') if r else None


def overview():
    return _pick('OVERVIEW_ROOT', 'overview')


def dynasty_keys():
    return os.environ.get('DYNASTY_KEYS') or KEYS_CACHE
