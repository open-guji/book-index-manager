"""对汉志 4 略（諸子/詩賦/兵書/數術）json 里 type='书' 的 content 做小注 ⟨⟩ 识别。

启发式规则：
- 主干模式：`（作者?）《X》Y篇/卷`（Y 是数字汉字）
- 主干后跟 "，X家。" (家派/版本说明) → 把"，X家"改为"。⟨X家⟩"
- 主干后跟 "。rest。" 且 rest 不以《开头 → 把 rest 包裹为 "⟨rest⟩"
- 主干含多个《》（复合书目） → 不处理，保留原样
- 主干无卷数篇数 → 不处理

已手工精修的卷（六藝略/方技略/總序）不动。
"""
import os as _os, sys as _sys
def _find_sectype():
    """自本檔往上尋 `book-index-draft/.claude/.../scripts`。

    **不可用 `expanduser('~/...')`**：本環境之 $HOME 是 /root 而工作區在
    /home/user，`~` 展開即落空，一跑就 ImportError。亦不可寫死相對層數——
    諸腳本散在不同深度。故自本檔之目錄逐級上溯尋之。"""
    d = _os.path.dirname(_os.path.abspath(__file__))
    for _ in range(8):
        for c in (_os.path.join(d, '.claude', 'skills', 'hanzhi-curation', 'scripts'),
                  _os.path.join(d, 'book-index-draft', '.claude', 'skills',
                                'hanzhi-curation', 'scripts')):
            if _os.path.exists(_os.path.join(c, 'sectype.py')):
                return c
        nd = _os.path.dirname(d)
        if nd == d:
            break
        d = nd
    raise ImportError('尋不著 sectype.py——工作區佈局變了？')
_sys.path.insert(0, _find_sectype())
import sectype   # 節之 type 新舊兩制之歸一（2026-08 英文枚舉遷移期）
import json
import re
from pathlib import Path

NUMERAL = r'[\d一二三四五六七八九十百千萬兩零]+'
MAIN_STRICT = r'(?:[^《。，]*?)?《[^》]+》' + NUMERAL + r'[篇卷]'
# 诗赋略等无书名号的主干：一串中文 + 数字 + 篇/卷
MAIN_LOOSE = r'[一-鿿]+?' + NUMERAL + r'[篇卷]'

RE_MAIN_JIA = re.compile(r'^(' + MAIN_STRICT + r')，([^《。]+家)。\s*$')
RE_MAIN_NOTE_STRICT = re.compile(r'^(' + MAIN_STRICT + r')。\s*(\S.+?)。\s*$')
RE_MAIN_NOTE_LOOSE = re.compile(r'^(' + MAIN_LOOSE + r')。\s*(\S.+?)。\s*$')


def _check_rest(rest: str) -> bool:
    """rest 合法（可作为注）的条件：不以《开头，不含"。《"（避免吞掉下一个书目）"""
    return not rest.startswith('《') and '。《' not in rest


def annotate(content: str) -> str:
    content = content.strip()
    if not content.endswith('。'):
        return content
    # Case 1: "《X》Y篇，...家。"
    m = RE_MAIN_JIA.match(content)
    if m:
        return f'{m.group(1)}。⟨{m.group(2)}。⟩'
    # Case 2: "《X》Y篇。rest。" (严格主干带书名号)
    m = RE_MAIN_NOTE_STRICT.match(content)
    if m:
        main, rest = m.group(1), m.group(2)
        if _check_rest(rest):
            return f'{main}。⟨{rest}。⟩'
    # Case 3: "XY篇。rest。" (诗赋略风格，主干不带书名号)
    m = RE_MAIN_NOTE_LOOSE.match(content)
    if m:
        main, rest = m.group(1), m.group(2)
        if _check_rest(rest):
            return f'{main}。⟨{rest}。⟩'
    return content


def process(juan_path: Path) -> int:
    j = json.loads(juan_path.read_text(encoding='utf-8'))
    changed = 0
    for sec in j.get('sections', []):
        if sectype.is_book(sec.get('type')):
            original = sec.get('content', '')
            annotated = annotate(original)
            if annotated != original:
                sec['content'] = annotated
                changed += 1
    if changed:
        juan_path.write_text(
            json.dumps(j, ensure_ascii=False, indent=2) + '\n',
            encoding='utf-8',
        )
    return changed


def main():
    base = Path('Work/1/e/u/1euhm19a23jsw/collated_edition')
    for name in ['諸子略', '詩賦略', '兵書略', '數術略']:
        n = process(base / f'{name}.json')
        print(f'{name}: {n} sections annotated')


if __name__ == '__main__':
    main()
