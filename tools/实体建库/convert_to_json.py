import os
import re
import json


def strip_nulls(obj):
    """递归移除 dict 中值为 None 的字段。"""
    if isinstance(obj, dict):
        return {k: strip_nulls(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [strip_nulls(item) for item in obj]
    return obj

def parse_md(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Determine type based on path
    if 'Book' in filepath:
        etype = 'book'
    elif 'Collection' in filepath:
        etype = 'collection'
    elif 'Work' in filepath:
        etype = 'work'
    else:
        return None

    # Title
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else ""

    # ID
    id_match = re.search(r'^ID[：:]\s*(\S+)$', content, re.MULTILINE)
    eid = id_match.group(1).strip() if id_match else os.path.basename(filepath).split('-')[0]

    # Sections
    sections = re.split(r'^##\s+', content, flags=re.MULTILINE)
    
    data = {
        "id": eid,
        "type": etype,
        "title": title,
        "sources": [{
            "id": "src_manual",
            "version": "1.0",
            "processor_version": "script-v1"
        }]
    }

    basic_info = {}
    description_text = ""
    resources_text = []
    resources_image = []
    history_list = []
    related_items = []
    contained_in = []

    for section in sections:
        lines = section.strip().split('\n')
        header = lines[0].strip()
        body = '\n'.join(lines[1:]).strip()

        if header == "基本信息":
            for line in lines[1:]:
                m = re.match(r'^- ([^：:]+)[：:](.+)$', line.strip())
                if m:
                    key = m.group(1).strip()
                    val = m.group(2).strip()
                    basic_info[key] = val
        elif header == "介绍":
            description_text = body
        elif header == "文字资源":
            for line in lines[1:]:
                m = re.match(r'^- \[(.+)\]\((.+)\)(.*)$', line.strip())
                if m:
                    resources_text.append({
                        "name": m.group(1).strip(),
                        "url": m.group(2).strip(),
                        "details": m.group(3).strip().lstrip('：:').strip()
                    })
        elif header == "图片资源":
            for line in lines[1:]:
                m = re.match(r'^- \[(.+)\]\((.+)\)(.*)$', line.strip())
                if m:
                    resources_image.append({
                        "name": m.group(1).strip(),
                        "url": m.group(2).strip(),
                        "details": m.group(3).strip().lstrip('：:').strip()
                    })
        elif header == "收藏历史":
            # Can be numbered or bulleted
            for line in lines[1:]:
                m = re.match(r'^(\d+\.|-)\s*(.+)$', line.strip())
                if m:
                    history_list.append(m.group(2).strip())
        elif header in ["版本", "其他版本", "包含书籍"]:
            for line in lines[1:]:
                m = re.match(r'^- \[(.+)\]\(bid:\\\\(\w+)\)(.*)$', line.strip())
                if not m:
                    m = re.match(r'^- \[(.+)\]\((\?|bid:)\)(.*)$', line.strip())
                
                if m:
                    bid = m.group(2) if m.group(2) != "?" else ""
                    related_items.append(bid)

    # Authors mapping
    authors_raw = basic_info.get("作者", "")
    author_list = []
    if authors_raw:
        # Split by semicolon or comma
        parts = re.split(r'[；;，,]', authors_raw)
        for p in parts:
            p = p.strip()
            if not p: continue
            role_match = re.search(r'（(.+)）', p)
            role = role_match.group(1) if role_match else "author"
            name = re.sub(r'（.+）', '', p).strip()
            author_list.append({
                "name": name,
                "role": role,
                "dynasty": "", # Hard to parse from this format consistently
                "source": "src_manual"
            })
    
    # Map to schema
    data["description"] = {
        "text": description_text,
        "sources": ["src_manual"]
    }
    data["authors"] = author_list

    if etype == 'work':
        data["books"] = [r for r in related_items if r]
    
    elif etype == 'collection':
        data["contained_in"] = [basic_info.get("收录于", "")] if basic_info.get("收录于") else []
        data["publication_info"] = {
            "year": basic_info.get("出版年份", ""),
            "details": basic_info.get("出版年份", ""),
            "source": "src_manual"
        }
        data["current_location"] = {
            "name": basic_info.get("现藏于", ""),
            "description": "",
            "source": "src_manual"
        }
        data["juan_count"] = {
            "number": 0, # Placeholder
            "description": basic_info.get("页数/册数", ""),
            "source": "src_manual"
        }
        data["history"] = history_list
        data["books"] = [r for r in related_items if r]

    elif etype == 'book':
        work_match = re.search(r'\[.+\]\(bid:\\\\(\w+)\)', basic_info.get("作品名", ""))
        data["work_id"] = work_match.group(1) if work_match else ""
        data["contained_in"] = [basic_info.get("收录于", "")] if basic_info.get("收录于") else []
        data["publication_info"] = {
            "year": basic_info.get("出版年份", ""),
            "details": basic_info.get("出版年份", ""),
            "source": "src_manual"
        }
        data["current_location"] = {
            "name": basic_info.get("现藏于", ""),
            "description": "",
            "start_date": "",
            "end_date": "",
            "source": "src_manual"
        }
        data["juan_count"] = {
            "number": 0,
            "description": basic_info.get("页数/册数", basic_info.get("册数", "")),
            "source": "src_manual"
        }
        data["page_count"] = {
            "number": 0,
            "description": "",
            "source": "src_manual"
        }
        data["text_resources"] = resources_text
        data["image_resources"] = resources_image
        
        loc_history = []
        for h in history_list:
            loc_history.append({
                "name": h.split('：')[0] if '：' in h else h,
                "description": h,
                "source": "src_manual"
            })
        data["location_history"] = loc_history
        data["related_books"] = [r for r in related_items if r]

    return data

def main():
    for root, dirs, files in os.walk("."):
        if any(x in root for x in ["Book", "Collection", "Work"]):
            for file in files:
                if file.endswith(".md"):
                    path = os.path.join(root, file)
                    print(f"Converting {path}...")
                    json_data = parse_md(path)
                    if json_data:
                        json_path = os.path.join(root, json_data["id"] + ".json")
                        with open(json_path, 'w', encoding='utf-8') as f:
                            json.dump(strip_nulls(json_data), f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
