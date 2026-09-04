import logging
from pathlib import Path
from typing import Optional, Dict, List, Any

from .id_generator import BookIndexIdGenerator, BookIndexStatus, BookIndexType, base36_encode, smart_decode
from .storage import BookIndexStorage
from .exceptions import BookIndexError
from .machine_id import acquire_machine_id
from .promotion import (
    promote_to_official as _promote_to_official,
    resolve_id as _resolve_id,
    validate_promotions as _validate_promotions,
)

logger = logging.getLogger(__name__)


class BookIndexManager:
    """
    High-level manager for Book Index.
    Acts as a facade for Storage and ID Generator.
    """

    def __init__(self, storage_root: str, machine_id: Optional[int] = None):
        """
        Args:
            machine_id: 顯式指定之機器號（0..2047），唯一性由調用方自負。
                留空（預設）則從 `<storage_root>/.machine_ids.json` 租一個**當前無人持有**
                之號——這是多進程並發時的正確用法。

                何以必須：official id 之時間戳僅到**秒**，sequence 又只存在進程內存，
                若兩個進程共用同一 machine_id，同一秒內生成之 id 會完全相同；
                而 storage.save_item 撞號後之處置是「title 不同→視為改名→unlink 舊檔」，
                於是先寫入者被**靜默刪除**。2026-08-24 隋唐升格、2026-09-04「坑32」兩度中此禍。
                詳見 machine_id.py 之模組說明。
        """
        self.storage = BookIndexStorage(storage_root)
        self.machine_id, self._machine_id_lease = acquire_machine_id(storage_root, machine_id)
        self.id_gen = BookIndexIdGenerator(self.machine_id)

    def release_machine_id(self) -> None:
        """提前歸還機器號。進程結束時會自動歸還，一般無須手動調用。"""
        if getattr(self, "_machine_id_lease", None) is not None:
            self._machine_id_lease.release()
            self._machine_id_lease = None

    def generate_id(self, type_val: BookIndexType = BookIndexType.Book, status: BookIndexStatus = BookIndexStatus.Draft) -> int:
        """Generate a new unique ID."""
        return self.id_gen.next_id(status, type_val)

    def encode_id(self, id_val: int) -> str:
        return base36_encode(id_val)

    def decode_id(self, id_str: str) -> int:
        return smart_decode(id_str)

    def save_item(self, metadata: Dict, type_val: Optional[BookIndexType] = None, status: BookIndexStatus = BookIndexStatus.Draft, bump: Optional[str] = 'patch') -> Path:
        """Save a book/collection/work record. Auto-generates ID if not present.

        Args:
            bump: production 条目版本号 bump 级别。'patch'（默认）/ 'minor' / 'major' / None（不 bump）。
                draft 条目忽略此参数。production 内修改默认 patch；知识修改传 'minor'；
                评级跃迁传 'major'。详见
                项目进展/古籍索引网站/整体设计/2026-05-版本控制与不可变性.md
        """
        id_str = metadata.get("id") or metadata.get("ID")
        is_new = False
        if id_str:
            try:
                id_val = self.decode_id(id_str)
                components = BookIndexIdGenerator.parse(id_val)
                if type_val is None:
                    type_val = components.type
            except ValueError:
                raise BookIndexError(f"Invalid ID format: {id_str}")
        else:
            is_new = True
            if type_val is None:
                type_name = metadata.get("type", "book").capitalize()
                type_val = getattr(BookIndexType, type_name, BookIndexType.Book)
            id_val = self.id_gen.next_id(status, type_val)
            id_str = self.encode_id(id_val)
            metadata["id"] = id_str

        return self.storage.save_item(type_val, id_val, metadata, bump=bump, is_new=is_new)

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

    # ── Promotion (draft → production) ──

    def promote_to_official(self, draft_id: str, rewrite_refs: bool = True,
                            promotions=None) -> str:
        """Promote a draft entry to production. Returns the new production-id string.

        promotions 傳入則本函式不 save，由呼叫方掌 flush 時機（批量升格之用）。
        """
        return _promote_to_official(self.storage, self.id_gen, draft_id,
                                    rewrite_refs=rewrite_refs, promotions=promotions)

    def resolve_id(self, id_str: str):
        """Resolve a possibly-promoted draft ID to its canonical (production) form.

        Returns (canonical_id, redirected_from). If not promoted, redirected_from is None.
        """
        return _resolve_id(self.storage, id_str)

    def validate_promotions(self):
        """Return a list of PromotionIssue across the entire workspace."""
        return _validate_promotions(self.storage)
