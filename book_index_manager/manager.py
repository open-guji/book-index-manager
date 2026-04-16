import logging
from pathlib import Path
from typing import Optional, Dict, List, Any

from .id_generator import BookIndexIdGenerator, BookIndexStatus, BookIndexType, base36_encode, smart_decode
from .storage import BookIndexStorage
from .exceptions import BookIndexError

logger = logging.getLogger(__name__)


class BookIndexManager:
    """
    High-level manager for Book Index.
    Acts as a facade for Storage and ID Generator.
    """

    def __init__(self, storage_root: str, machine_id: int = 1):
        self.storage = BookIndexStorage(storage_root)
        self.id_gen = BookIndexIdGenerator(machine_id)

    def generate_id(self, type_val: BookIndexType = BookIndexType.Book, status: BookIndexStatus = BookIndexStatus.Draft) -> int:
        """Generate a new unique ID."""
        return self.id_gen.next_id(status, type_val)

    def encode_id(self, id_val: int) -> str:
        return base36_encode(id_val)

    def decode_id(self, id_str: str) -> int:
        return smart_decode(id_str)

    def save_item(self, metadata: Dict, type_val: Optional[BookIndexType] = None, status: BookIndexStatus = BookIndexStatus.Draft) -> Path:
        """Save a book/collection/work record. Auto-generates ID if not present."""
        id_str = metadata.get("id") or metadata.get("ID")
        if id_str:
            try:
                id_val = self.decode_id(id_str)
                components = BookIndexIdGenerator.parse(id_val)
                if type_val is None:
                    type_val = components.type
            except ValueError:
                raise BookIndexError(f"Invalid ID format: {id_str}")
        else:
            if type_val is None:
                type_name = metadata.get("type", "book").capitalize()
                type_val = getattr(BookIndexType, type_name, BookIndexType.Book)
            id_val = self.id_gen.next_id(status, type_val)
            id_str = self.encode_id(id_val)
            metadata["id"] = id_str

        return self.storage.save_item(type_val, id_val, metadata)

    def get_item(self, id_str: str) -> Optional[Dict]:
        """Retrieve metadata by ID string."""
        path = self.storage.find_file_by_id(id_str)
        if not path:
            return None
        return self.storage.load_metadata(path)

    def find_item_path(self, id_str: str) -> Optional[Path]:
        """Find the filesystem path for an ID."""
        return self.storage.find_file_by_id(id_str)

    def update_field(self, id_str: str, key: str, content: Any) -> bool:
        """Update a specific field in the JSON file."""
        file_path = self.find_item_path(id_str)
        if not file_path:
            logger.error(f"Could not find file for ID {id_str}")
            return False

        try:
            metadata = self.storage.load_metadata(file_path)

            # Section name mapping (Chinese → English key)
            mapping = {
                "基本信息": None,
                "介绍": "description",
                "资源": "resources",
                "收藏历史": "history",
                "其他版本": "related_books",
            }

            resolved_key = mapping.get(key, key)
            if resolved_key is None:
                logger.warning(f"Updating '基本信息' via update_field is not supported. Use save_item instead.")
                return False

            if resolved_key == "description" and isinstance(content, str):
                metadata[resolved_key] = {"text": content, "sources": metadata.get(resolved_key, {}).get("sources", [])}
            else:
                metadata[resolved_key] = content

            id_val = self.decode_id(id_str)
            self.storage.save_item(BookIndexIdGenerator.parse(id_val).type, id_val, metadata)
            logger.info(f"Updated field '{key}' for {id_str}")
            return True
        except Exception as e:
            logger.error(f"Failed to update field: {e}")
            return False

    def delete_item(self, id_str: str) -> bool:
        """Delete an entity by ID."""
        return self.storage.delete_item(id_str)

    def search(self, query: str, type_name: str = "book", status: Optional[BookIndexStatus] = None) -> List[Dict]:
        """Search entries with relevance ranking.

        Returns entries sorted by match score (title > author > other fields).
        """
        return self.storage.search_entries(query, type_name, status)

    # ── Asset Directory ──

    def get_asset_dir(self, id_str: str):
        """Get the asset directory path for an ID (without creating it)."""
        return self.storage.get_asset_dir(id_str)

    def init_asset_dir(self, id_str: str):
        """Create the asset directory for an ID. Returns the directory path."""
        return self.storage.init_asset_dir(id_str)

    def has_asset_dir(self, id_str: str) -> bool:
        """Check if asset directory exists."""
        return self.storage.has_asset_dir(id_str)

    def rebuild_indices(self):
        """Rebuild index.json for both official and draft."""
        self.storage.rebuild_index(BookIndexStatus.Official)
        self.storage.rebuild_index(BookIndexStatus.Draft)
