"""通用：从 collated_edition/*.json 批量生成 text/*.md 框架。

第一遍用，不识别 ⟨...⟩ 小注。类标题保持 json 原样，不去前缀。
默认扫描所有 Work 下的 collated_edition 目录，已有对应 md 则跳过。
"""
import json
import sys
from pathlib import Path


def render_juan(juan_path: Path) -> str:
    j = json.loads(juan_path.read_text(encoding='utf-8'))
    if isinstance(j, list):
        top_title = juan_path.stem
        sections = j
    else:
        top_title = j.get('title', juan_path.stem)
        sections = j.get('sections', [])
    lines = [f'# {top_title}', '']
    prev_book_content = None  # 连续书目 content 去重
    for sec in sections:
        level = sec.get('level', 3)
        title = sec.get('title', '').strip()
        content = sec.get('content', '').strip()
        typ = sec.get('type', '')
        if typ == '类':
            lines += [f'{"#" * max(2, level)} {title}', '']
            if content:
                lines += [content, '']
            prev_book_content = None
        elif typ == '书':
            if content:
                # title 若不含于 content（考证体，title 是书名、content 是引证），单独作粗体小标题
                if title and title not in content:
                    # 即使 content 与上一个相同（去重），仍输出 title（每本书是独立的）
                    if content == prev_book_content:
                        lines += [f'**{title}**', '']
                    else:
                        lines += [f'**{title}**', '', content, '']
                        prev_book_content = content
                else:
                    if content == prev_book_content:
                        continue
                    lines += [content, '']
                    prev_book_content = content
            elif title:
                rendered = title + ('。' if not title.endswith('。') else '')
                if rendered == prev_book_content:
                    continue
                lines += [rendered, '']
                prev_book_content = rendered
        elif typ == '考证':
            # 考证类：若 title 不在 content（content 不含书名）则先作粗体
            if content:
                if title and title not in content:
                    lines += [f'**{title}**', '']
                for p in content.split('\n'):
                    if p.strip():
                        lines += [p.strip(), '']
            elif title:
                lines += [f'**{title}**', '']
            prev_book_content = None
        else:  # 序/结语/其他
            if content:
                for p in content.split('\n'):
                    if p.strip():
                        lines += [p.strip(), '']
            prev_book_content = None
    while lines and lines[-1] == '':
        lines.pop()
    return '\n'.join(lines) + '\n'


def process_work(ce_dir: Path, overwrite: bool = False) -> int:
    text_dir = ce_dir / 'text'
    text_dir.mkdir(exist_ok=True)
    count = 0
    for jf in sorted(ce_dir.glob('*.json')):
        if 'index' in jf.stem:
            continue
        md_file = text_dir / f'{jf.stem}.md'
        if md_file.exists() and not overwrite:
            continue
        md = render_juan(jf)
        md_file.write_text(md, encoding='utf-8')
        count += 1
    return count


def main():
    overwrite = '--overwrite' in sys.argv
    ce_dirs = sorted(Path('Work').glob('**/collated_edition'))
    total = 0
    for d in ce_dirs:
        n = process_work(d, overwrite=overwrite)
        if n:
            print(f'{d}: {n} md files written')
            total += n
    print(f'Total: {total}')


if __name__ == '__main__':
    main()
