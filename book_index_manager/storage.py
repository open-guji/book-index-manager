import os
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional, Dict, List, Any
from .id_generator import BookIndexType, BookIndexStatus, BookIndexIdGenerator, base36_encode, base36_decode, smart_decode
from .logger import logger
from .exceptions import StorageError
from .migration import migrate_metadata


NUM_SHARDS = 16


def shard_of(id_str: str, n: int = NUM_SHARDS) -> int:
    """Deterministic hash: same result in Python and JS (Math.imul+>>>0)."""
    h = 0
    for c in id_str:
        h = ((h * 31) + ord(c)) & 0xFFFFFFFF
    return h % n


def strip_nulls(obj):
    """递归移除 dict 中值为 None 的字段。"""
    if isinstance(obj, dict):
        return {k: strip_nulls(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [strip_nulls(item) for item in obj]
    return obj


class BookIndexStorage:
    def __init__(self, workspace_root: str):
        """
        Initialize the storage with a workspace root.
        Official: workspace_root/book-index
        Draft: workspace_root/book-index-draft
        """
        logger.debug(f"Input workspace_root: {workspace_root}")
        # Handle WSL UNC paths from Windows
        if os.name != 'nt' and (workspace_root.startswith('\\\\') or workspace_root.startswith('//')):
            norm_root = workspace_root.replace('\\', '/')
            parts = norm_root.split('/')
            logger.debug(f"WSL normalized parts: {parts}")
            if len(parts) > 4 and ('wsl' in parts[2].lower()):
                workspace_root = '/' + '/'.join(parts[4:])
                logger.info(f"Converted WSL path to local: {workspace_root}")

        self.workspace_root = Path(workspace_root).resolve()
        self.official_root = self.workspace_root / "book-index"
        self.draft_root = self.workspace_root / "book-index-draft"

        logger.debug(f"Resolved paths: root={self.workspace_root}, official={self.official_root}, draft={self.draft_root}")

        try:
            if not self.workspace_root.exists():
                logger.warning(f"Workspace root does not exist: {self.workspace_root}")

            self.official_root.mkdir(parents=True, exist_ok=True)
            self.draft_root.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            raise StorageError(f"Failed to create storage directories: {e}")

    def get_root_by_status(self, status: BookIndexStatus) -> Path:
        return self.draft_root if status == BookIndexStatus.Draft else self.official_root

    def get_root_by_id(self, id_val: int) -> Path:
        try:
            components = BookIndexIdGenerator.parse(id_val)
            return self.get_root_by_status(components.status)
        except Exception as e:
            raise StorageError(f"Invalid ID for root lookup: {id_val} ({e})")

    def get_path(self, type_val: BookIndexType, id_val: int, name: str) -> Path:
        id_str = base36_encode(id_val)
        root = self.get_root_by_id(id_val)

        prefix = id_str.ljust(3, '_')[:3]
        c1, c2, c3 = prefix[0], prefix[1], prefix[2]

        # 保留 CJK 统一汉字全范围（含扩展 A-G、兼容、兼容补充）+ ASCII 字母数字
        # 去标点符号（包括全角括号）
        # 基本: U+4E00-U+9FFF, 扩展 A: U+3400-U+4DBF, 兼容: U+F900-U+FAFF,
        # 扩展 B-G (SMP): U+20000-U+3134F, 兼容补充: U+2F800-U+2FA1F
        clean_name = re.sub(
            r'[^\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaffa-zA-Z0-9\U00020000-\U0003134f]',
            '', name)
        if not clean_name:
            clean_name = "Undefined"

        return root / type_val.name / c1 / c2 / c3 / f"{id_str}-{clean_name}.json"

    def save_item(self, type_val: BookIndexType, id_val: int, metadata: dict):
        """Save an item (book, collection, or work) and update the index."""
        name = metadata.get("title") or metadata.get("书名") or metadata.get("名称") or "未命名"
        edition = metadata.get("edition") or ""
        if edition:
            name = f"{name}{edition}"
        file_path = self.get_path(type_val, id_val, name)
        id_str = base36_encode(id_val)

        # Check if ID already exists and handle rename if needed
        existing_path = self.find_file_by_id(id_str)
        if existing_path and existing_path.resolve() != file_path.resolve():
            # 历史兼容：保留现有文件路径，避免不必要的改名
            # 许多历史录入的文件名有不同的规范（如带"（作者）"注释、CJK扩展字符处理等），
            # 每次 save_item 重新生成路径会导致 git 中 delete+add，误以为"Work 被删"。
            # 只有 title/edition 真正变化时才会进入此分支；但在内容追加场景（如加 indexed_by）
            # 下 title 没变，应保留旧路径。
            #
            # 判断条件：若旧文件名去掉全角括号注释后等于新文件名，或二者"id 相同"
            # （通过 find_file_by_id 保证），都视为同一逻辑实体，保留旧路径。
            existing_stem = existing_path.stem
            # 去掉全角括号内容: "<id>-<title>（<注>）" → "<id>-<title>"
            normalized = re.sub(r'（[^（）]*）', '', existing_stem)
            if normalized == file_path.stem:
                logger.info(f"Keeping existing file path for {id_str}: {existing_path} (bracket-annotated, equivalent to {file_path.name})")
                file_path = existing_path
            else:
                # 真正的 title 变更——允许改名但谨慎记录
                logger.warning(f"Renaming file for {id_str}: {existing_path.name} -> {file_path.name} (title changed)")
                try:
                    existing_path.unlink()
                except Exception as e:
                    logger.warning(f"Failed to remove old file {existing_path}: {e}")

        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)

            # On case-insensitive filesystems (Windows), a file with a
            # different-case ID but the same title would silently collide.
            # Detect and raise early to avoid overwriting another entry.
            for f in file_path.parent.iterdir():
                if f.suffix == '.json' and f.name != file_path.name and f.name.lower() == file_path.name.lower():
                    raise StorageError(
                        f"Case collision: {f.name} already exists, cannot create {file_path.name}. "
                        f"On case-insensitive filesystems these map to the same file."
                    )

            metadata["id"] = id_str
            # 只在 metadata 没有显式 type 字段时用 type_val 填充。
            # 历史遗留的 Work（如 31hyr4yqu8xk9）ID 位段里 type=Reserved1，
            # 但元数据 type="work" 才是权威。不能用 type_val 覆盖 metadata 里既有的 type。
            if not metadata.get("type"):
                metadata["type"] = type_val.name.lower()
            if "title" not in metadata and ("书名" in metadata or "名称" in metadata):
                metadata["title"] = metadata.get("书名") or metadata.get("名称")

            self._migrate_keys(metadata)

            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(strip_nulls(metadata), f, indent=2, ensure_ascii=False)

            root = self.get_root_by_id(id_val)
            rel_path = str(file_path.relative_to(root)).replace("\\", "/")
            self.update_index_entry(root, metadata, type_val, rel_path)

            logger.info(f"Saved {type_val.name}: {name} -> {file_path}")

            # Bidirectional link: Book.work_id → Work.books
            if type_val == BookIndexType.Book:
                self._sync_work_books_link(id_str, metadata)

            return file_path
        except Exception as e:
            raise StorageError(f"Failed to save item {name}: {e}")

    def _sync_work_books_link(self, book_id: str, book_metadata: dict):
        """When saving a Book with work_id, ensure the Work's books array includes this Book."""
        work_id = book_metadata.get("work_id")
        if not work_id:
            return
        try:
            work_id_val = smart_decode(work_id)
            work_path = self.find_file_by_id(work_id)
            if not work_path:
                logger.warning(f"Work {work_id} not found for bidirectional link from Book {book_id}")
                return
            with open(work_path, "r", encoding="utf-8") as f:
                work_data = json.load(f)
            books = work_data.get("books", [])
            if book_id not in books:
                books.append(book_id)
                work_data["books"] = books
                with open(work_path, "w", encoding="utf-8") as f:
                    json.dump(work_data, f, indent=2, ensure_ascii=False)
                logger.info(f"Added Book {book_id} to Work {work_id}.books")
        except Exception as e:
            logger.warning(f"Failed to sync Work.books link for Book {book_id} -> Work {work_id}: {e}")

    def _migrate_keys(self, metadata: dict):
        """Migrate old Chinese keys and old resource format to new schema."""
        # Chinese key → English key
        key_mapping = {
            "书名": "title",
            "作品名": "title",
            "作者": "authors",
            "收录于": "contained_in",
            "出版年份": "publication_info",
            "现藏于": "current_location",
            "页数": "page_count",
            "册数": "juan_count",
            "首页图片": "first_image",
            "介绍": "description",
        }

        for zh_key, en_key in key_mapping.items():
            if zh_key in metadata and en_key not in metadata:
                val = metadata.pop(zh_key)
                if en_key == "authors":
                    if isinstance(val, str):
                        metadata[en_key] = [{"name": val, "role": "author"}]
                    else:
                        metadata[en_key] = val
                elif en_key == "description":
                    if isinstance(val, str):
                        metadata[en_key] = {"text": val, "sources": metadata.get(en_key, {}).get("sources", [])}
                    else:
                        metadata[en_key] = val
                elif en_key == "publication_info":
                    metadata[en_key] = {"year": str(val), "details": ""}
                elif en_key == "current_location":
                    metadata[en_key] = {"name": str(val)}
                elif en_key in ("page_count", "juan_count"):
                    try:
                        num = int(val) if val and str(val).isdigit() else 0
                        metadata[en_key] = {"number": num, "description": str(val) if not str(val).isdigit() else ""}
                    except Exception:
                        metadata[en_key] = {"number": 0, "description": str(val)}
                elif en_key == "contained_in":
                    if isinstance(val, str):
                        metadata[en_key] = [val]
                    else:
                        metadata[en_key] = val
                else:
                    metadata[en_key] = val

        # Migrate old English key: volume_count → juan_count
        if "volume_count" in metadata and "juan_count" not in metadata:
            metadata["juan_count"] = metadata.pop("volume_count")

        # Migrate old text_resources/image_resources → unified resources
        migrate_metadata(metadata)

    def update_index_entry(self, root: Path, metadata: dict, type_val: BookIndexType, relative_path: str):
        id_str = metadata.get("id") or metadata.get("ID")
        if not id_str:
            return

        type_key = type_val.name.lower() + "s"
        shard_data = self._load_shard(root, type_key, id_str)

        title = metadata.get("title", "未命名")

        author_name = ""
        author_dynasty = ""
        author_role = ""
        authors = metadata.get("authors", [])
        if isinstance(authors, list) and len(authors) > 0:
            if isinstance(authors[0], dict):
                author_name = authors[0].get("name", "")
                author_dynasty = authors[0].get("dynasty", "")
                author_role = authors[0].get("role", "")
            else:
                author_name = str(authors[0])
        elif isinstance(authors, str):
            author_name = authors

        year = ""
        pub = metadata.get("publication_info")
        if isinstance(pub, dict):
            year = pub.get("year", "")
        elif isinstance(pub, str):
            year = pub

        holder = ""
        loc = metadata.get("current_location")
        if isinstance(loc, dict):
            holder = loc.get("name", "")
        elif isinstance(loc, str):
            holder = loc

        # n_juan: 从 juan_count 提取卷数
        n_juan = 0
        vc = metadata.get("juan_count")
        if isinstance(vc, dict):
            n_juan = vc.get("number", 0) or 0

        entry: dict = {"id": id_str, "title": title, "type": type_val.name, "path": relative_path}
        if author_name:
            entry["author"] = author_name
        if year:
            entry["year"] = year
        if holder:
            entry["holder"] = holder
        if author_dynasty:
            entry["dynasty"] = author_dynasty
        if author_role:
            entry["role"] = author_role
        if n_juan:
            entry["n_juan"] = n_juan
        edition = metadata.get("edition", "")
        if edition:
            entry["edition"] = edition
        shard_data[id_str] = entry
        self._save_shard(root, type_key, id_str, shard_data)

    # ── Sharded index I/O ──

    def _shard_path(self, root: Path, type_key: str, shard: int) -> Path:
        """Return path for a shard file: root/index/{type_key}/{shard_hex}.json"""
        if type_key == "collections":
            return root / "index" / "collections.json"
        return root / "index" / type_key / f"{shard:x}.json"

    def _load_shard(self, root: Path, type_key: str, id_str: str) -> dict:
        """Load the shard file that contains the given ID."""
        shard = shard_of(id_str)
        path = self._shard_path(root, type_key, shard)
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading shard {path}: {e}")
        return {}

    def _save_shard(self, root: Path, type_key: str, id_str: str, data: dict):
        """Save data to the shard file for the given ID."""
        shard = shard_of(id_str)
        path = self._shard_path(root, type_key, shard)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving shard {path}: {e}")

    def _load_all_shards(self, root: Path, type_key: str) -> dict:
        """Load and merge all shards for a type. Returns flat {id: entry}."""
        merged = {}
        if type_key == "collections":
            path = self._shard_path(root, type_key, 0)
            if path.exists():
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        merged = json.load(f)
                except Exception as e:
                    logger.error(f"Error loading {path}: {e}")
            return merged
        for shard in range(NUM_SHARDS):
            path = self._shard_path(root, type_key, shard)
            if path.exists():
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        merged.update(json.load(f))
                except Exception as e:
                    logger.error(f"Error loading shard {path}: {e}")
        return merged

    # ── Asset Directory ──

    def get_asset_dir(self, id_str: str) -> Path:
        """Get asset directory path: {root}/{Type}/{c1}/{c2}/{c3}/{ID}/"""
        id_val = smart_decode(id_str)
        components = BookIndexIdGenerator.parse(id_val)
        root = self.get_root_by_status(components.status)
        prefix = id_str.ljust(3, '_')[:3]
        c1, c2, c3 = prefix[0], prefix[1], prefix[2]
        return root / components.type.name / c1 / c2 / c3 / id_str

    def init_asset_dir(self, id_str: str) -> Path:
        """Create asset directory for an ID. Returns the directory path."""
        asset_dir = self.get_asset_dir(id_str)
        asset_dir.mkdir(parents=True, exist_ok=True)
        return asset_dir

    def has_asset_dir(self, id_str: str) -> bool:
        """Check if asset directory exists."""
        return self.get_asset_dir(id_str).is_dir()

    # ── Entry extraction ──

    @staticmethod
    def _extract_titles_list(raw) -> List[str]:
        if not isinstance(raw, list):
            return []
        result = []
        for t in raw:
            if isinstance(t, str) and t:
                result.append(t)
            elif isinstance(t, dict) and t.get("book_title"):
                result.append(t["book_title"])
        return result

    def _build_index_entry(self, metadata: dict, type_val: BookIndexType, rel_path: str) -> dict:
        """Extract all index fields from a metadata dict. Returns the index entry."""
        id_str = metadata.get("id") or metadata.get("ID", "")
        title = metadata.get("title", "未命名")

        author_name = ""
        author_dynasty = ""
        author_role = ""
        authors = metadata.get("authors", [])
        if isinstance(authors, list) and len(authors) > 0:
            if isinstance(authors[0], dict):
                author_name = authors[0].get("name", "")
                author_dynasty = authors[0].get("dynasty", "")
                author_role = authors[0].get("role", "")
            else:
                author_name = str(authors[0])
        elif isinstance(authors, str):
            author_name = authors

        year = ""
        pub = metadata.get("publication_info")
        if isinstance(pub, dict):
            year = pub.get("year", "")
        elif isinstance(pub, str):
            year = pub

        holder = ""
        loc = metadata.get("current_location")
        if isinstance(loc, dict):
            holder = loc.get("name", "")
        elif isinstance(loc, str):
            holder = loc

        juan_count = 0
        vc = metadata.get("juan_count")
        if isinstance(vc, dict):
            juan_count = vc.get("number", 0) or 0
        elif isinstance(vc, (int, float)):
            juan_count = int(vc)

        measure_info = metadata.get("measure_info", "") or ""

        edition = metadata.get("edition", "")
        additional_titles = self._extract_titles_list(metadata.get("additional_titles", []))
        attached_texts = self._extract_titles_list(metadata.get("attached_texts", []))

        has_text = False
        has_image = False
        resources = metadata.get("resources", [])
        if isinstance(resources, list):
            for r in resources:
                if isinstance(r, dict):
                    rt = r.get("type", "")
                    if rt in ("text", "text+image"):
                        has_text = True
                    if rt in ("image", "text+image"):
                        has_image = True

        entry: dict = {"id": id_str, "title": title, "type": type_val.name, "path": rel_path}
        if author_name:
            entry["author"] = author_name
        if year:
            entry["year"] = year
        if holder:
            entry["holder"] = holder
        if author_dynasty:
            entry["dynasty"] = author_dynasty
        if author_role:
            entry["role"] = author_role
        if juan_count:
            entry["juan_count"] = juan_count
        if measure_info:
            entry["measure_info"] = measure_info
        if additional_titles:
            entry["additional_titles"] = additional_titles
        if attached_texts:
            entry["attached_texts"] = attached_texts
        if has_text:
            entry["has_text"] = True
        if has_image:
            entry["has_image"] = True
        if edition:
            entry["edition"] = edition
        return entry

    def _process_type_for_rebuild(self, root: Path, type_val: BookIndexType) -> Dict[int, Dict]:
        """Scan one type directory and return shard_num → {id: entry} for deep reindex."""
        type_key = type_val.name.lower() + "s"
        type_dir = root / type_val.name
        num_shards = 1 if type_key == "collections" else NUM_SHARDS
        type_shards: Dict[int, Dict] = {i: {} for i in range(num_shards)}

        if not type_dir.exists():
            return type_shards

        index_dir = root / "index"
        for json_file in type_dir.glob("**/*.json"):
            # Skip files inside the index directory
            try:
                json_file.relative_to(index_dir)
                continue
            except ValueError:
                pass
            try:
                metadata = self.load_metadata(json_file)
                id_str = metadata.get("id") or metadata.get("ID")
                if not id_str:
                    if "-" in json_file.name:
                        id_str = json_file.name.split("-")[0]
                if not id_str:
                    continue

                rel_path = str(json_file.relative_to(root)).replace("\\", "/")
                entry = self._build_index_entry(metadata, type_val, rel_path)

                collated_dir = json_file.parent / id_str / "collated_edition"
                if collated_dir.is_dir():
                    entry["has_collated"] = True

                shard_num = 0 if type_key == "collections" else shard_of(id_str)
                type_shards[shard_num][id_str] = entry
            except Exception as e:
                logger.warning(f"Error processing {json_file}: {e}")

        return type_shards

    def rebuild_index(self, status: BookIndexStatus = BookIndexStatus.Official, workers: int = 4):
        """Deep reindex: fully rebuild index from all JSON files in parallel."""
        root = self.get_root_by_status(status)
        logger.info(f"Deep reindex in {root} (workers={workers})...")

        types = [BookIndexType.Book, BookIndexType.Collection, BookIndexType.Work]
        # Run each type in parallel
        results: Dict[str, Dict[int, Dict]] = {}
        with ThreadPoolExecutor(max_workers=min(workers, len(types))) as ex:
            futures = {ex.submit(self._process_type_for_rebuild, root, t): t for t in types}
            for fut in as_completed(futures):
                type_val = futures[fut]
                type_key = type_val.name.lower() + "s"
                try:
                    results[type_key] = fut.result()
                except Exception as e:
                    logger.error(f"Error processing type {type_val.name}: {e}")
                    num_shards = 1 if type_key == "collections" else NUM_SHARDS
                    results[type_key] = {i: {} for i in range(num_shards)}

        # Write all shard files
        total = 0
        for type_key, type_shards in results.items():
            for shard_num, data in type_shards.items():
                path = self._shard_path(root, type_key, shard_num)
                path.parent.mkdir(parents=True, exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                total += len(data)

        logger.info(f"Deep reindex for {status.name} complete: {total} entries.")

    def shadow_reindex(self, status: BookIndexStatus = BookIndexStatus.Official, workers: int = 8):
        """Shadow reindex: add only files missing from the index, without re-reading existing entries.

        For each item file whose ID is not yet in the index, parse its JSON and add it.
        Existing index entries are preserved as-is (no title/author refresh).
        Processing is parallelised per shard bucket.
        """
        root = self.get_root_by_status(status)
        index_dir = root / "index"
        logger.info(f"Shadow reindex in {root} (workers={workers})...")

        # Load current index into memory: type_key → shard_num → {id: entry}
        current: Dict[str, Dict[int, Dict]] = {
            "books": {},
            "collections": {0: {}},
            "works": {},
        }
        for type_key in ("books", "works"):
            type_dir = index_dir / type_key
            if type_dir.exists():
                for shard_file in type_dir.glob("*.json"):
                    try:
                        sn = int(shard_file.stem, 16)
                    except ValueError:
                        continue
                    try:
                        with open(shard_file, encoding="utf-8") as f:
                            current[type_key][sn] = json.load(f)
                    except Exception as e:
                        logger.error(f"Error loading shard {shard_file}: {e}")
                        current[type_key][sn] = {}
            # Initialise missing shards
            for sn in range(NUM_SHARDS):
                current[type_key].setdefault(sn, {})
        col_path = index_dir / "collections.json"
        if col_path.exists():
            try:
                with open(col_path, encoding="utf-8") as f:
                    current["collections"][0] = json.load(f)
            except Exception as e:
                logger.error(f"Error loading collections index: {e}")

        # Build set of already-indexed IDs for fast lookup
        indexed_ids: set = set()
        for type_shards in current.values():
            for shard_data in type_shards.values():
                indexed_ids.update(shard_data.keys())

        ITEM_FILE_RE = re.compile(r'^[A-Za-z0-9]{11,13}-.+\.json$')

        # Collect all unindexed files grouped by (type_val, shard_num)
        # so we can parallelise per bucket
        # bucket_key → list of (json_file, type_val)
        buckets: Dict[tuple, List] = {}
        for type_val in [BookIndexType.Book, BookIndexType.Collection, BookIndexType.Work]:
            type_dir = root / type_val.name
            if not type_dir.exists():
                continue
            type_key = type_val.name.lower() + "s"
            for json_file in type_dir.glob("**/*.json"):
                try:
                    json_file.relative_to(index_dir)
                    continue
                except ValueError:
                    pass
                if not ITEM_FILE_RE.match(json_file.name):
                    continue
                id_str = json_file.name.split('-', 1)[0]
                if id_str in indexed_ids:
                    continue
                shard_num = 0 if type_key == "collections" else shard_of(id_str)
                bucket_key = (type_key, shard_num)
                buckets.setdefault(bucket_key, []).append((json_file, type_val, id_str))

        if not buckets:
            logger.info("Shadow reindex: index is up-to-date, nothing to add.")
            return

        total_missing = sum(len(v) for v in buckets.values())
        logger.info(f"Shadow reindex: {total_missing} unindexed files across {len(buckets)} buckets.")

        def _process_bucket(bucket_key: tuple, files: List) -> tuple:
            """Parse unindexed files for one bucket. Returns (bucket_key, list_of_(id, entry))."""
            added = []
            for json_file, type_val, id_str in files:
                try:
                    metadata = self.load_metadata(json_file)
                    rel_path = str(json_file.relative_to(root)).replace("\\", "/")
                    entry = self._build_index_entry(metadata, type_val, rel_path)
                    collated_dir = json_file.parent / id_str / "collated_edition"
                    if collated_dir.is_dir():
                        entry["has_collated"] = True
                    added.append((id_str, entry))
                except Exception as e:
                    logger.warning(f"Shadow reindex error {json_file}: {e}")
            return bucket_key, added

        # Parallelise across buckets
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futures = {ex.submit(_process_bucket, bk, files): bk for bk, files in buckets.items()}
            for fut in as_completed(futures):
                bucket_key, added = fut.result()
                type_key, shard_num = bucket_key
                for id_str, entry in added:
                    current[type_key][shard_num][id_str] = entry

        # Write only the modified shards
        modified_shards: set = set(buckets.keys())
        written = 0
        for type_key, shard_num in modified_shards:
            data = current[type_key][shard_num]
            path = self._shard_path(root, type_key, shard_num)
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            written += len(data)

        logger.info(f"Shadow reindex for {status.name} complete: added {total_missing} entries.")

    def check_index(self, status: BookIndexStatus = BookIndexStatus.Draft) -> List[Dict]:
        """Check that every item file has a corresponding index entry.

        Returns a list of dicts with keys 'id' and 'path' for each missing item.
        An empty list means the index is consistent.
        """
        import re
        ITEM_FILE_RE = re.compile(r'^[A-Za-z0-9]{11,13}-.+\.json$')

        root = self.get_root_by_status(status)

        # Load all indexed IDs
        indexed: set = set()
        index_dir = root / "index"

        col_path = index_dir / "collections.json"
        if col_path.exists():
            with open(col_path, encoding="utf-8") as f:
                indexed.update(json.load(f).keys())

        for type_key in ["books", "works"]:
            type_dir = index_dir / type_key
            if not type_dir.exists():
                continue
            for shard_file in type_dir.glob("*.json"):
                with open(shard_file, encoding="utf-8") as f:
                    indexed.update(json.load(f).keys())

        # Scan item files
        missing = []
        for type_val in [BookIndexType.Book, BookIndexType.Collection, BookIndexType.Work]:
            type_dir = root / type_val.name
            if not type_dir.exists():
                continue
            for json_file in type_dir.glob("**/*.json"):
                if ITEM_FILE_RE.match(json_file.name):
                    id_str = json_file.name.split('-', 1)[0]
                    if id_str not in indexed:
                        missing.append({
                            "id": id_str,
                            "path": str(json_file.relative_to(root)).replace("\\", "/"),
                        })

        return missing

    def load_entries(self, type_name: str, status: Optional[BookIndexStatus] = None) -> List[Dict]:
        """Load entries of a given type from sharded index files."""
        type_key = type_name.lower() + "s"
        roots = (
            [self.get_root_by_status(status)]
            if status is not None
            else [self.official_root, self.draft_root]
        )
        entries = []
        for root in roots:
            section = self._load_all_shards(root, type_key)
            for id_str, entry in section.items():
                item = dict(entry)
                item["id"] = id_str
                item["type"] = type_name
                entries.append(item)
        return entries

    def search_entries(self, query: str, type_name: str, status: Optional[BookIndexStatus] = None) -> List[Dict]:
        """Search entries with relevance ranking.

        Scoring:
        - title exact 100, startswith 80, contains 60
        - author exact 50, contains 40
        - other fields (dynasty/role/id) contains 20
        """
        all_entries = self.load_entries(type_name, status)
        return rank_by_relevance(all_entries, query)

    def delete_item(self, id_str: str):
        """Delete an item and remove it from the index."""
        file_path = self.find_file_by_id(id_str)
        if not file_path:
            logger.warning(f"No file found for ID {id_str} to delete.")
            return False

        try:
            id_val = smart_decode(id_str)
            components = BookIndexIdGenerator.parse(id_val)
            root = self.get_root_by_status(components.status)
            type_key = components.type.name.lower() + "s"

            shard_data = self._load_shard(root, type_key, id_str)
            if id_str in shard_data:
                del shard_data[id_str]
                self._save_shard(root, type_key, id_str, shard_data)

            file_path.unlink()
            logger.info(f"Deleted {id_str}: {file_path}")
            return True
        except Exception as e:
            raise StorageError(f"Failed to delete item {id_str}: {e}")

    def find_file_by_id(self, id_str: str) -> Optional[Path]:
        """Search for a book file in both official and draft roots."""
        try:
            id_val = smart_decode(id_str)
            logger.debug(f"Searching for ID: {id_str} (decoded={id_val})")
        except Exception as e:
            logger.error(f"Failed to decode ID {id_str}: {e}")
            return None

        prefix = id_str.ljust(3, '_')[:3]
        c1, c2, c3 = prefix[0], prefix[1], prefix[2]

        for root in [self.official_root, self.draft_root]:
            for type_dir in ["Book", "Collection", "Work"]:
                search_dir = root / type_dir / c1 / c2 / c3
                logger.debug(f"Checking directory: {search_dir}")
                if search_dir.exists():
                    pattern = f"{id_str}-*.json"
                    matches = list(search_dir.glob(pattern))
                    logger.debug(f"Matches in {search_dir} with pattern {pattern}: {matches}")
                    if matches:
                        return matches[0]
        logger.warning(f"No file found for ID {id_str}")
        return None

    def load_metadata(self, file_path: Path) -> dict:
        """Load metadata from a JSON file."""
        if not file_path.exists():
            return {}
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading metadata from {file_path}: {e}")
            return {}


# ── 搜索评分 ──

def _score_entry(entry: Dict, query: str) -> int:
    """Calculate relevance score for a single entry against query."""
    q = query.lower()
    score = 0

    # title（权重最高）
    title = entry.get("title", "").lower()
    if title == q:
        score += 100
    elif title.startswith(q):
        score += 80
    elif q in title:
        score += 60

    # author（权重次之）
    author = entry.get("author", "").lower()
    if author:
        if author == q:
            score += 50
        elif q in author:
            score += 40

    # 其他字段：dynasty, role, id
    for val in [entry.get("dynasty", ""), entry.get("role", ""), entry.get("id", "")]:
        if val and q in val.lower():
            score += 20
            break  # 其他字段只加一次

    return score


def rank_by_relevance(entries: List[Dict], query: str) -> List[Dict]:
    """Filter and sort entries by relevance score (descending)."""
    scored = [(e, _score_entry(e, query)) for e in entries]
    scored = [(e, s) for e, s in scored if s > 0]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [e for e, _ in scored]
