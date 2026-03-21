"""
Abstract base class for index storage backends.
Mirrors the TypeScript IndexStorage interface.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, List, Any


class PageResult:
    """Paginated result container."""

    def __init__(self, entries: List[Dict], total: int, page: int, page_size: int):
        self.entries = entries
        self.total = total
        self.page = page
        self.page_size = page_size

    def to_dict(self) -> dict:
        return {
            "entries": self.entries,
            "total": self.total,
            "page": self.page,
            "pageSize": self.page_size,
        }


class LoadOptions:
    """Options for loading entries."""

    def __init__(
        self,
        page: int = 1,
        page_size: int = 50,
        sort_by: str = "title",
        sort_order: str = "asc",
    ):
        self.page = page
        self.page_size = page_size
        self.sort_by = sort_by
        self.sort_order = sort_order


class IndexStorage(ABC):
    """
    Abstract storage interface for book index data.
    Implementations: LocalStorage (file system), GithubStorage (read-only).
    """

    @abstractmethod
    def load_entries(self, type_name: str, options: Optional[LoadOptions] = None) -> PageResult:
        """Load entries of a given type with pagination."""
        ...

    @abstractmethod
    def search(self, query: str, type_name: str, options: Optional[LoadOptions] = None) -> PageResult:
        """Search entries by query string."""
        ...

    @abstractmethod
    def get_item(self, id_str: str) -> Optional[Dict]:
        """Get a single item's full metadata by ID."""
        ...

    @abstractmethod
    def save_item(self, metadata: Dict) -> Dict:
        """Save metadata. Returns dict with 'id' and 'path'."""
        ...

    @abstractmethod
    def delete_item(self, id_str: str) -> bool:
        """Delete an item by ID."""
        ...

    @abstractmethod
    def generate_id(self, type_name: str, status: str = "draft") -> str:
        """Generate a new Base58 ID."""
        ...
