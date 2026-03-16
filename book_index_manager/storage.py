import os
import json
import re
from pathlib import Path
from typing import Optional, Dict, List, Any
from .id_generator import BookIndexType, BookIndexStatus, BookIndexIdGenerator, base58_encode, base58_decode
from .logger import logger
from .exceptions import StorageError
from .migration import migrate_metadata


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
        id_str = base58_encode(id_val)
        root = self.get_root_by_id(id_val)

        prefix = id_str.ljust(3, '_')[:3]
        c1, c2, c3 = prefix[0], prefix[1], prefix[2]

        clean_name = re.sub(r'[^\u4e00-\u9fa5a-zA-Z0-9]', '', name)
        if not clean_name:
            clean_name = "Undefined"

        return root / type_val.name / c1 / c2 / c3 / f"{id_str}-{clean_name}.json"

    def save_item(self, type_val: BookIndexType, id_val: int, metadata: dict):
        """Save an item (book, collection, or work) and update the index."""
        name = metadata.get("title") or metadata.get("书名") or metadata.get("名称") or "未命名"
        file_path = self.get_path(type_val, id_val, name)
        id_str = base58_encode(id_val)

        # Check if ID already exists and handle rename if needed
        existing_path = self.find_file_by_id(id_str)
        if existing_path and existing_path.resolve() != file_path.resolve():
            logger.info(f"Renaming/Moving existing file for {id_str}: {existing_path} -> {file_path}")
            try:
                existing_path.unlink()
            except Exception as e:
                logger.warning(f"Failed to remove old file {existing_path}: {e}")

        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)

            metadata["id"] = id_str
            metadata["type"] = type_val.name.lower()
            if "title" not in metadata and ("书名" in metadata or "名称" in metadata):
                metadata["title"] = metadata.get("书名") or metadata.get("名称")

            self._migrate_keys(metadata)

            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            root = self.get_root_by_id(id_val)
            rel_path = str(file_path.relative_to(root)).replace("\\", "/")
            self.update_index_entry(root, metadata, type_val, rel_path)

            logger.info(f"Saved {type_val.name}: {name} -> {file_path}")
            return file_path
        except Exception as e:
            raise StorageError(f"Failed to save item {name}: {e}")

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
            "册数": "volume_count",
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
                    metadata[en_key] = {"year": str(val), "details": "", "source": None}
                elif en_key == "current_location":
                    metadata[en_key] = {"name": str(val), "source": None}
                elif en_key in ("page_count", "volume_count"):
                    try:
                        num = int(val) if val and str(val).isdigit() else 0
                        metadata[en_key] = {"number": num, "description": str(val) if not str(val).isdigit() else "", "source": None}
                    except Exception:
                        metadata[en_key] = {"number": 0, "description": str(val), "source": None}
                elif en_key == "contained_in":
                    if isinstance(val, str):
                        metadata[en_key] = [val]
                    else:
                        metadata[en_key] = val
                else:
                    metadata[en_key] = val

        # Migrate old text_resources/image_resources → unified resources
        migrate_metadata(metadata)

    def update_index_entry(self, root: Path, metadata: dict, type_val: BookIndexType, relative_path: str):
        index_file = root / "index.json"
        index = self._load_index(index_file)

        id_str = metadata.get("id") or metadata.get("ID")
        if not id_str:
            return

        type_key = type_val.name.lower() + "s"
        if type_key not in index:
            index[type_key] = {}

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

        entry: dict = {
            "id": id_str,
            "title": title,
            "type": type_val.name,
            "path": relative_path,
            "author": author_name,
            "year": year,
            "holder": holder,
        }
        if author_dynasty:
            entry["dynasty"] = author_dynasty
        if author_role:
            entry["role"] = author_role
        index[type_key][id_str] = entry
        self._save_index(index_file, index)

    def _load_index(self, index_file: Path) -> dict:
        default_index = {"books": {}, "collections": {}, "works": {}}
        if index_file.exists():
            try:
                with open(index_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for k in default_index:
                        if k not in data:
                            data[k] = {}
                    return data
            except Exception as e:
                logger.error(f"Error loading index {index_file}: {e}")
        return default_index

    def _save_index(self, index_file: Path, index_data: dict):
        try:
            with open(index_file, "w", encoding="utf-8") as f:
                json.dump(index_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving index {index_file}: {e}")

    def rebuild_index(self, status: BookIndexStatus = BookIndexStatus.Official):
        root = self.get_root_by_status(status)
        index_file = root / "index.json"
        logger.info(f"Rebuilding index in {root}...")

        index = {"books": {}, "collections": {}, "works": {}}
        for type_val in [BookIndexType.Book, BookIndexType.Collection, BookIndexType.Work]:
            type_dir = root / type_val.name
            type_key = type_val.name.lower() + "s"
            if not type_dir.exists():
                continue

            for json_file in type_dir.glob("**/*.json"):
                if json_file.name == "index.json":
                    continue
                try:
                    metadata = self.load_metadata(json_file)
                    id_str = metadata.get("id") or metadata.get("ID")
                    if not id_str:
                        if "-" in json_file.name:
                            id_str = json_file.name.split("-")[0]

                    if id_str:
                        rel_path = str(json_file.relative_to(root)).replace("\\", "/")

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

                        entry: dict = {
                            "id": id_str,
                            "title": title,
                            "type": type_val.name,
                            "path": rel_path,
                            "author": author_name,
                            "year": metadata.get("publication_info", {}).get("year", "") if isinstance(metadata.get("publication_info"), dict) else "",
                            "holder": metadata.get("current_location", {}).get("name", "") if isinstance(metadata.get("current_location"), dict) else "",
                        }
                        if author_dynasty:
                            entry["dynasty"] = author_dynasty
                        if author_role:
                            entry["role"] = author_role
                        index[type_key][id_str] = entry
                except Exception as e:
                    logger.warning(f"Error processing {json_file}: {e}")

        self._save_index(index_file, index)
        total = sum(len(v) for v in index.values())
        logger.info(f"Index for {status.name} rebuilt with {total} entries.")

    def delete_item(self, id_str: str):
        """Delete an item and remove it from the index."""
        file_path = self.find_file_by_id(id_str)
        if not file_path:
            logger.warning(f"No file found for ID {id_str} to delete.")
            return False

        try:
            id_val = base58_decode(id_str)
            components = BookIndexIdGenerator.parse(id_val)
            root = self.get_root_by_status(components.status)
            index_file = root / "index.json"

            if index_file.exists():
                index = self._load_index(index_file)
                type_key = components.type.name.lower() + "s"
                if type_key in index and id_str in index[type_key]:
                    del index[type_key][id_str]
                    self._save_index(index_file, index)

            file_path.unlink()
            logger.info(f"Deleted {id_str}: {file_path}")
            return True
        except Exception as e:
            raise StorageError(f"Failed to delete item {id_str}: {e}")

    def find_file_by_id(self, id_str: str) -> Optional[Path]:
        """Search for a book file in both official and draft roots."""
        try:
            id_val = base58_decode(id_str)
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
