#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
整理倪燦《宋史藝文志補》经部 collated_edition
从原文提取 → 切分类目 → 切分条目 → 匹配Work → 生成JSON

匹配策略：
1. 精确标题匹配 + 作者校验（必须）
2. 异体字替换后匹配 + 作者校验
3. 无匹配则新建 Work
"""
import json
import os
import re
import subprocess
import sys
import glob as globmod

ROOT = "D:/workspace/book-index-draft"
WORK_DIR = os.path.join(ROOT, "Work")
SOURCE_BID = "1evfyhtrdkbnk"  # 宋史藝文志補 Work ID
OUTPUT_DIR = os.path.join(WORK_DIR, "1/e/v", SOURCE_BID, "collated_edition")

# Variant character pairs for title matching
VARIANT_PAIRS = [
    ('僃', '備'), ('注', '註'), ('淸', '清'), ('眞', '真'),
    ('説', '說'), ('爲', '為'), ('羣', '群'), ('啓', '啟'),
    ('臺', '台'), ('叢', '丛'), ('裏', '裡'), ('塲', '場'),
    ('鑑', '鑒'), ('愨', '慤'), ('吿', '告'),
]

# Author name variants (original text form -> possible forms in Work files)
AUTHOR_VARIANTS = {
    '辥季宣': ['辥季宣', '薛季宣'],
    '眞德秀': ['眞德秀', '真德秀'],
    '莆陽二鄭': ['莆陽二鄭', '二鄭'],
    '蔡謨': ['蔡謨', '蔡模'],  # 蔡模 is the correct Song dynasty author
    '晏兼善': ['晏兼善'],
    '方慤': ['方慤', '方愨'],
}


def title_variants(title):
    """Generate all variant forms of a title."""
    variants = {title}
    for a, b in VARIANT_PAIRS:
        new_variants = set()
        for v in variants:
            if a in v:
                new_variants.add(v.replace(a, b))
            if b in v:
                new_variants.add(v.replace(b, a))
        variants.update(new_variants)
    return variants


def author_matches(target_author, work_data):
    """Check if target author matches the work's author info.
    Checks both authors list and indexed_by summary for author name.
    Returns True if match found.
    """
    if not target_author:
        return False

    work_authors = work_data.get('authors', [])

    # Get all name variants for the target
    target_names = list(AUTHOR_VARIANTS.get(target_author, [target_author]))
    # Handle multi-author like '李樗、黃櫄'
    for tn in list(target_names):
        target_names.extend(re.split(r'[、，]', tn))
    # Remove empty strings
    target_names = [tn for tn in target_names if tn]

    # Also generate variant-char forms of target names
    all_target_names = set(target_names)
    for tn in target_names:
        for va, vb in VARIANT_PAIRS:
            if va in tn:
                all_target_names.add(tn.replace(va, vb))
            if vb in tn:
                all_target_names.add(tn.replace(vb, va))

    # Check against work's authors list
    for a in work_authors:
        a_name = a.get('name', '')
        if not a_name:
            continue
        for tn in all_target_names:
            if tn == a_name or tn in a_name or a_name in tn:
                return True

    # If authors list is empty, check indexed_by summaries for author name
    if not work_authors:
        indexed_by = work_data.get('indexed_by', [])
        for entry in indexed_by:
            summary = entry.get('summary', '')
            author_info = entry.get('author_info', '')
            comment = entry.get('comment', '')
            search_text = summary + author_info + comment
            for tn in all_target_names:
                if tn in search_text:
                    return True

    return False


def search_work(title, author):
    """Search for an existing Work by title + author.
    Returns (work_id, work_data, file_path) or (None, None, None).
    """
    variants = title_variants(title)

    # Search in both Work directories
    for prefix_dir in ['1/e/v', '3/1/h']:
        work_path = os.path.join(WORK_DIR, prefix_dir)
        if not os.path.isdir(work_path):
            continue

        for tv in variants:
            # Exact title match in filename
            pattern = os.path.join(work_path, f'*-{tv}.json')
            matches = globmod.glob(pattern)

            for m in matches:
                try:
                    with open(m, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    # MUST verify author
                    if author_matches(author, data):
                        return data['id'], data, m
                except (json.JSONDecodeError, KeyError):
                    continue

    return None, None, None


def gen_work_id():
    """Generate a new Work ID using the CLI."""
    result = subprocess.run(
        ['python', '-m', 'book_index_manager', 'gen-id', '--root', '/d/workspace'],
        capture_output=True, text=True, encoding='utf-8',
        env={**os.environ, 'PYTHONUTF8': '1'}
    )
    match = re.search(r'Generated ID: (\S+)', result.stdout)
    if match:
        return match.group(1)
    raise ValueError(f"Failed to gen-id: {result.stdout} {result.stderr}")


def id_to_path(work_id):
    """Convert a Work ID to its file directory path."""
    return os.path.join(WORK_DIR, work_id[0], work_id[1], work_id[2])


def create_work_file(work_id, title, author, dynasty='宋', juan=None):
    """Create a new Work JSON file."""
    work_data = {
        "id": work_id,
        "type": "work",
        "title": title,
        "authors": [
            {
                "name": author,
                "role": "撰",
                "dynasty": dynasty
            }
        ],
        "indexed_by": [
            {
                "source": "宋史藝文志補",
                "source_bid": SOURCE_BID
            }
        ]
    }

    if juan is not None:
        work_data["juan_count"] = {"number": juan}

    dir_path = id_to_path(work_id)
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, f"{work_id}-{title}.json")

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(work_data, f, ensure_ascii=False, indent=2)

    return file_path


def add_indexed_by(work_data, file_path):
    """Add indexed_by entry to an existing Work file."""
    indexed_by = work_data.get('indexed_by', [])

    # Check if already indexed by this source
    for entry in indexed_by:
        if entry.get('source_bid') == SOURCE_BID:
            return False  # Already indexed

    indexed_by.append({
        "source": "宋史藝文志補",
        "source_bid": SOURCE_BID
    })
    work_data['indexed_by'] = indexed_by

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(work_data, f, ensure_ascii=False, indent=2)

    return True


def _num_to_chinese(n):
    """Convert integer to Chinese numeral string for volume counts."""
    if n is None:
        return ''
    digits = '零一二三四五六七八九'
    if n == 0:
        return '零'
    result = ''
    if n >= 100:
        result += digits[n // 100] + '百'
        n %= 100
        if n > 0 and n < 10:
            result += '零'
    if n >= 10:
        tens = n // 10
        if tens > 1 or result:
            result += digits[tens]
        result += '十'
        n %= 10
    if n > 0:
        result += digits[n]
    return result


def build_category_json(cat_name, entries, summary):
    """Build the collated edition JSON for a category."""
    full_title = f"經部·{cat_name}"
    sections = []

    # Category header
    sections.append({
        "level": 2,
        "type": "门",
        "title": full_title,
        "content": ""
    })

    # Entries
    for e in entries:
        section = {
            "level": 3,
            "type": "书",
            "title": e['title_display'],
            "content": e['content']
        }
        if e.get('work_id'):
            section["work_id"] = e['work_id']
        sections.append(section)

    # Category summary
    sections.append({
        "level": 2,
        "type": "序",
        "title": f"右{cat_name}",
        "content": summary
    })

    return {
        "title": full_title,
        "source_juan": "正文",
        "sections": sections
    }


# ========================================================
# 手动解析经部94家条目
# ========================================================

def get_jingbu_entries():
    """Return all 11 categories with their entries.

    Each entry is a dict with:
        author: str - author name
        books: list of (title, juan_count_or_None, note)
    """

    categories = []

    # ===== 1. 易類 (17家) =====
    categories.append({
        'name': '易類',
        'entries': [
            {'author': '朱元昇', 'books': [('三易僃遺', 10, '字日華，永嘉人。梓行。')]},
            {'author': '何基', 'books': [('周易朱氏本義發揮', 7, ''), ('繫辭發揮', 2, '')]},
            {'author': '胡方平', 'books': [('周易啟蒙通釋', 2, ''), ('外易', 4, '')]},
            {'author': '董楷', 'books': [('周易程朱傳義附錄', 18, ''), ('圖說', 1, '')]},
            {'author': '陳普', 'books': [('易解', 2, '')]},
            {'author': '熊禾', 'books': [('易學圖傳', 1, '')]},
            {'author': '吳霞舉', 'books': [('易管窺', 60, ''), ('筮易', 7, '')]},
            {'author': '任士林', 'books': [('中易', None, '')]},
            {'author': '陳深', 'books': [('淸全齋讀易編', 3, '')]},
            {'author': '王申子', 'books': [('大易緝說', 10, '')]},
            {'author': '邱富國', 'books': [('周易輯解', 10, ''), ('易學說約', None, '五篇。')]},
            {'author': '胡一桂', 'books': [('周易本義附錄纂疏', 14, ''), ('周易啟蒙翼傳', 4, '')]},
            {'author': '何夢桂', 'books': [('易衍', 2, '')]},
            {'author': '朱鑑', 'books': [('文公易說', 23, '')]},
            {'author': '田疇', 'books': [('學易蹊徑', 20, '')]},
            {'author': '昝如愚', 'books': [('古易便覽', 1, '')]},
            {'author': '羅大經', 'books': [('易解', 10, '')]},
        ],
        'summary': '右易類十七家，二百十六卷。'
    })

    # ===== 2. 書類 (6家) =====
    categories.append({
        'name': '書類',
        'entries': [
            {'author': '陳大猷', 'books': [('書傳會通', 11, ''), ('書集說或問', 2, '')]},
            {'author': '辥季宣', 'books': [('書古文訓', 16, '')]},
            {'author': '王應麟', 'books': [('尚書草木鳥獸譜集解', None, ''), ('周書王會篇', 1, '')]},
            {'author': '陳普', 'books': [('書傳補遺', None, '')]},
            {'author': '熊禾', 'books': [('尚書口義', 30, '')]},
            {'author': '毛晃', 'books': [('禹貢指南', 1, '')]},
        ],
        'summary': '右書類六家六十一卷。'
    })

    # ===== 3. 詩類 (10家) =====
    categories.append({
        'name': '詩類',
        'entries': [
            {'author': '段昌武', 'books': [('叢桂毛詩集解', 30, '')]},
            {'author': '陳煥', 'books': [('詩傳微', None, '')]},
            {'author': '陳深', 'books': [('淸全齋讀詩編', None, '')]},
            {'author': '趙德', 'books': [('詩辨疑', 7, '')]},
            {'author': '曹粹中', 'books': [('放齋詩說', 10, '')]},
            {'author': '朱鑑', 'books': [('詩傳遺說', 6, '')]},
            {'author': '胡一桂', 'books': [('詩傳纂疏附錄', 8, '')]},
            {'author': '李樗、黃櫄', 'books': [('毛詩集解', 36, '')]},
            {'author': '王應麟', 'books': [('詩辨', None, '')]},
            {'author': '毛直方', 'books': [('詩學大成', None, '')]},
        ],
        'summary': '右詩類十家，九十七卷。'
    })

    # ===== 4. 春秋類 (14家) =====
    categories.append({
        'name': '春秋類',
        'entries': [
            {'author': '趙鹏飛', 'books': [('木訥先生春秋經筌', 16, '')]},
            {'author': '家鉉翁', 'books': [('春秋集傳詳說', 30, ''), ('綱領', 1, '')]},
            {'author': '陳則通', 'books': [('鐵山先生春秋提綱', 10, '')]},
            {'author': '陳深', 'books': [('淸全齋讀春秋編', 12, '')]},
            {'author': '王申子', 'books': [('春秋類傳', None, '')]},
            {'author': '林堯叟', 'books': [('春秋左傳句解', 70, '')]},
            {'author': '程公說', 'books': [('左氏始終', 30, ''), ('春秋比事', 10, '')]},
            {'author': '晏兼善', 'books': [('春秋透天關', 12, '')]},
            {'author': '吳思齊', 'books': [('左傳缺疑', None, '')]},
            {'author': '熊禾', 'books': [('春秋論考', None, '')]},
            {'author': '朱申', 'books': [('春秋左傳節解', 35, '')]},
            {'author': '呂大圭', 'books': [('春秋五論', 1, '')]},
            {'author': '句龍傳', 'books': [('春秋三傳分國紀事本末', None, '')]},
            {'author': '徐晉卿', 'books': [('春秋經傳類對賦', 1, '')]},
        ],
        'summary': '右春秋類十四家，二百二十八卷。'
    })

    # ===== 5. 三禮類 (11家) =====
    categories.append({
        'name': '三禮類',
        'entries': [
            {'author': '葉時', 'books': [('禮經會元', 4, '')]},
            {'author': '朱申', 'books': [('周禮句解', 12, '')]},
            {'author': '林希逸', 'books': [('考工記圖解', 4, '')]},
            {'author': '朱申', 'books': [('禮記詳解', 10, '')]},
            {'author': '鄭樸翁', 'books': [('禮記正義', 1, '')]},
            {'author': '陳煥', 'books': [('禮記釋', None, '')]},
            {'author': '方慤', 'books': [('禮記解', None, '')]},
            {'author': '黎立武', 'books': [('中庸指歸', 1, ''), ('提網', 1, ''), ('大學發微', 1, ''), ('提綱', 1, '')]},
            {'author': '王奎文', 'books': [('中庸發明', 1, '')]},
            {'author': '馬端臨', 'books': [('大學集傳', None, '')]},
            {'author': '熊禾', 'books': [('大學口義', None, ''), ('大學廣義', None, ''), ('三禮考異', None, '')]},
        ],
        'summary': '右三禮類十一家三十六卷。'
    })

    # ===== 6. 禮樂書類 (2家) =====
    categories.append({
        'name': '禮樂書類',
        'entries': [
            {'author': '車垓', 'books': [('内外服制通釋', 9, '')]},
            {'author': '歐陽士秀', 'books': [('律通', 2, '')]},
        ],
        'summary': '右禮樂書類二家十一卷。'
    })

    # ===== 7. 孝經類 (1家) =====
    categories.append({
        'name': '孝經類',
        'entries': [
            {'author': '朱申', 'books': [('孝經句解', 1, '')]},
        ],
        'summary': '右孝經類一家一卷。'
    })

    # ===== 8. 論語類 (1家) =====
    categories.append({
        'name': '論語類',
        'entries': [
            {'author': '蔡節', 'books': [('論語集說', 10, ''), ('石洞紀聞', 10, '')]},
        ],
        'summary': '右論語類一家二十卷。'
    })

    # ===== 9. 孟子類 (3家) =====
    categories.append({
        'name': '孟子類',
        'entries': [
            {'author': '蔡謨', 'books': [('孟子集疏', 14, '')]},
            {'author': '施德操', 'books': [('孟子發題', 1, '')]},
            {'author': '熙時子', 'books': [('注孟子外書', None, '四篇。')]},
        ],
        'summary': '右孟子類三家十九卷。'
    })

    # ===== 10. 經解類 (16家) =====
    # Note: 朱申 appears in 三禮類 and 孝經類 too, but here we're counting
    # 家 = distinct authors within each category. The total is 94 家.
    # Let me recount: 17+6+10+14+11+2+1+1+3+16+12 = 93? We need 94.
    # Looking at the original text again:
    # 經解類 text: 葉時(1),陳埴(2),黃淵(3),曹涇(4),梅寬(5),馬廷鸞(6),
    # 張惟政(7),莆陽二鄭(8),錢時(9),眞德秀(10),陳普(11),熊禾(12),
    # 鄭樸翁(13),張霆松(14),祝泳(15)
    # Wait, that's 15 家, but the original says 16家. Let me re-read the source.
    # "祝泳四書集注附錄十一册。" -> This is entry 15.
    # The summary says "右經解類十六家一百五十一卷。" So we're missing one.
    # Looking more carefully at the source text:
    # "莆陽二鄭六經雅言圖辨十卷" - 莆陽二鄭 could count as 2 家?
    # No, that doesn't make sense. Let me look at the original more carefully.
    #
    # Actually re-reading: after 張惟政 line, "莆陽二鄭六經雅言圖辨十卷。" is entry 8
    # Then "錢時融堂四書管見十三卷。" is entry 9
    # But wait - there's also the 六經奥論 entry which could be a separate work by a different author.
    # Let me look at: "張惟政編次四經、六經奥論六卷"
    # This is one author with two books.
    #
    # Actually let me re-read more carefully from line 8-9:
    # "莆陽二鄭六經雅言圖辨十卷。錢時融堂四書管見十三卷。眞德秀四書集編二十六卷。
    #  陳普四書集解，熊禾四書標題。鄭樸翁四書要指二十卷，張霆松四書朱、陸會同注釋
    #  二十九卷，舉要一卷。"
    # Line 9: "祝泳四書集注附錄十一册。"
    #
    # Count: 葉時,陳埴,黃淵,曹涇,梅寬,馬廷鸞,張惟政,莆陽二鄭,錢時,眞德秀,
    #         陳普,熊禾,鄭樸翁,張霆松,祝泳 = 15家
    #
    # Hmm, 15 not 16. Let me look at the text more carefully.
    # "張惟政編次四經、六經奥論六卷，莆陽二鄭六經雅言圖辨十卷。"
    # Wait - is "莆陽二鄭" a reference to two people (二鄭)?
    # If 莆陽二鄭 = 2 家, then 15 + 1 = 16. That could explain it.
    # But the convention is to count 莆陽二鄭 as 1 entry.
    #
    # Another possibility: "張惟政編次四經" and "六經奥論六卷" might be two different authors.
    # Let me re-read: "張惟政編次四經、六經奥論六卷"
    # The 、 connects two works by the same author.
    #
    # OR: maybe there's an author I'm missing in the text.
    # Let me check if 舉要 belongs to a different author than 張霆松.
    # "張霆松四書朱、陸會同注釋二十九卷，舉要一卷。"
    # The comma after 卷 suggests 舉要 is by the same author.
    #
    # I think the count of 16 might include 莆陽二鄭 = 2家.
    # But for our purposes, we'll proceed with 15 entries and note the discrepancy.

    categories.append({
        'name': '經解類',
        'entries': [
            {'author': '葉時', 'books': [('對制談經', 13, '')]},
            {'author': '陳埴', 'books': [('潛室木鍾集', 11, '')]},
            {'author': '黃淵', 'books': [('四書六經講稿', 6, '')]},
            {'author': '曹涇', 'books': [('講義', 4, '')]},
            {'author': '梅寬', 'books': [('天裕堂講義', 1, '')]},
            {'author': '馬廷鸞', 'books': [('六經集傳', None, '')]},
            {'author': '張惟政', 'books': [('編次四經', None, ''), ('六經奥論', 6, '')]},
            {'author': '莆陽二鄭', 'books': [('六經雅言圖辨', 10, '')]},
            {'author': '錢時', 'books': [('融堂四書管見', 13, '')]},
            {'author': '眞德秀', 'books': [('四書集編', 26, '')]},
            {'author': '陳普', 'books': [('四書集解', None, '')]},
            {'author': '熊禾', 'books': [('四書標題', None, '')]},
            {'author': '鄭樸翁', 'books': [('四書要指', 20, '')]},
            {'author': '張霆松', 'books': [('四書朱陸會同注釋', 29, ''), ('舉要', 1, '')]},
            {'author': '祝泳', 'books': [('四書集注附錄', None, '十一册。')]},
            # 莆陽二鄭 = 2家? If so, total = 16 家
        ],
        'summary': '右經解類十六家一百五十一卷。'
    })

    # ===== 11. 小學類 (12家) =====
    # Re-reading the source for this category:
    # "毛晃禮部韻略五卷，黃公紹古今韻會舉要三十卷，歐陽德宏押韻釋疑五卷，
    #  楊俊韻譜三卷，張有復古編二卷，李從周字通一卷。蔣捷小學詳斷，
    #  秦九韶數學九章九卷，陳錄善誘文一卷。羅黃裳發蒙宏綱二冊。
    #  方逢辰名物蒙求一卷，虞俊達齋吿蒙一卷。"
    # Count: 毛晃,黃公紹,歐陽德宏,楊俊,張有,李從周,蔣捷,秦九韶,陳錄,
    #         羅黃裳,方逢辰,虞俊 = 12家 ✓
    categories.append({
        'name': '小學類',
        'entries': [
            {'author': '毛晃', 'books': [('禮部韻略', 5, '')]},
            {'author': '黃公紹', 'books': [('古今韻會舉要', 30, '')]},
            {'author': '歐陽德宏', 'books': [('押韻釋疑', 5, '')]},
            {'author': '楊俊', 'books': [('韻譜', 3, '')]},
            {'author': '張有', 'books': [('復古編', 2, '')]},
            {'author': '李從周', 'books': [('字通', 1, '')]},
            {'author': '蔣捷', 'books': [('小學詳斷', None, '')]},
            {'author': '秦九韶', 'books': [('數學九章', 9, '')]},
            {'author': '陳錄', 'books': [('善誘文', 1, '')]},
            {'author': '羅黃裳', 'books': [('發蒙宏綱', None, '二冊。')]},
            {'author': '方逢辰', 'books': [('名物蒙求', 1, '')]},
            {'author': '虞俊', 'books': [('達齋吿蒙', 1, '')]},
        ],
        'summary': '右小學類十二家六十卷。'
    })

    return categories


def main():
    print("=" * 60)
    print("整理倪燦《宋史藝文志補》经部 collated_edition")
    print("=" * 60)

    categories = get_jingbu_entries()

    # Count totals
    total_jia = sum(len(c['entries']) for c in categories)
    total_books = sum(sum(len(e['books']) for e in c['entries']) for c in categories)
    print(f"总计: {len(categories)} 类, {total_jia} 家, {total_books} 书目")

    matched_count = 0
    created_count = 0
    issues = []

    # For all categories, process entries
    all_output = {}

    for cat in categories:
        cat_name = cat['name']
        print(f"\n--- {cat_name} ({len(cat['entries'])}家) ---")

        cat_entries = []  # list of flat entries for JSON output

        for entry in cat['entries']:
            author = entry['author']

            for title, juan, note in entry['books']:
                print(f"  [{author}] {title}" + (f" {juan}卷" if juan else ""))

                # Search for existing Work
                work_id, work_data, file_path = search_work(title, author)

                if work_id:
                    # Verify file exists
                    if os.path.isfile(file_path):
                        print(f"    -> 匹配: {work_id} ({work_data.get('title', '')})")
                        matched_count += 1
                        # Add indexed_by
                        added = add_indexed_by(work_data, file_path)
                        if added:
                            print(f"       (已添加 indexed_by)")
                    else:
                        print(f"    !! 文件缺失: {file_path}")
                        issues.append(f"文件缺失: {work_id} {title}")
                        work_id = None
                else:
                    # Create new Work
                    new_id = gen_work_id()
                    new_path = create_work_file(new_id, title, author, '宋', juan)
                    print(f"    ++ 新建: {new_id}")
                    work_id = new_id
                    created_count += 1

                    # Verify the file was created
                    if not os.path.isfile(new_path):
                        issues.append(f"新建文件创建失败: {new_id} {title}")

                # Build display title with Chinese numerals
                if juan is not None:
                    title_display = f"{title}{_num_to_chinese(juan)}卷"
                else:
                    title_display = title

                # Build content
                content_parts = [f"{author}撰。"]
                if note:
                    content_parts.append(note)
                content = ''.join(content_parts)

                cat_entries.append({
                    'title_display': title_display,
                    'content': content,
                    'work_id': work_id
                })

        all_output[cat_name] = {
            'entries': cat_entries,
            'summary': cat['summary']
        }

    # Generate JSON files
    print(f"\n{'=' * 60}")
    print("生成 JSON 文件...")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    juan_files = []

    for cat_name, cat_data in all_output.items():
        json_data = build_category_json(
            cat_name, cat_data['entries'], cat_data['summary']
        )

        filename = f"經部·{cat_name}.json"
        filepath = os.path.join(OUTPUT_DIR, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)

        entry_count = len(cat_data['entries'])
        print(f"  {filename} ({entry_count}条)")
        juan_files.append(filename)

    # Create collated_edition_index.json (canonical: inside collated_edition/)
    index = {
        "work_id": SOURCE_BID,
        "type": "catalog",
        "total_juan": 1,
        "juan_files": juan_files,
        "juan_groups": [
            {
                "label": "經部",
                "files": [],
                "children": [
                    {"label": cat['name'], "files": [f"經部·{cat['name']}.json"]}
                    for cat in categories
                ]
            }
        ],
        "text_quality": {
            "grade": "rough",
            "source_note": "識典古籍，經過通篇人工校對"
        }
    }
    with open(os.path.join(OUTPUT_DIR, "collated_edition_index.json"), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print("整理报告")
    print(f"{'=' * 60}")
    print(f"类目数: {len(categories)}")
    print(f"著录家数: {total_jia}")
    print(f"书目总条数: {total_books}")
    print(f"匹配已有Work: {matched_count}")
    print(f"新建Work: {created_count}")

    if issues:
        print(f"\n问题 ({len(issues)}):")
        for iss in issues:
            print(f"  - {iss}")

    # Final check: count 94 家
    # 17+6+10+14+11+2+1+1+3+15+12 = 92? or 93?
    # The source says 94家. Our count is {total_jia}.
    # If 莆陽二鄭 counts as 2: 92 + 1 = 93, still not 94
    # Need to investigate where the discrepancy is.
    if total_jia != 94:
        print(f"\n注意: 家数统计为 {total_jia}，与原文94家有 {94 - total_jia} 的差异。")
        print("  可能原因：莆陽二鄭計爲2家；或某些同作者條目在不同類目被重複計數。")


if __name__ == '__main__':
    main()
