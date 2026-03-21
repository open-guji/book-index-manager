"""
GitHub read-only storage implementation.
Fetches index.json and individual JSON files from GitHub / jsDelivr CDN.
Port of TypeScript GithubStorage.
"""

import json
import urllib.request
import urllib.error
from typing import Optional, Dict, List, Any
from .storage_base import IndexStorage, PageResult, LoadOptions
from .exceptions import StorageError


DEFAULT_BASE_URL = "https://raw.githubusercontent.com"
DEFAULT_CDN_URLS = [
    "https://fastly.jsdelivr.net/gh",
    "https://cdn.jsdelivr.net/gh",
]
DEFAULT_TIMEOUT = 5


class GithubStorageConfig:
    def __init__(
        self,
        org: str,
        repos: Dict[str, str],
        base_url: str = DEFAULT_BASE_URL,
        cdn_urls: Optional[List[str]] = None,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        self.org = org
        self.repos = repos  # {"draft": "book-index-draft", "official": "book-index"}
        self.base_url = base_url
        self.cdn_urls = cdn_urls or DEFAULT_CDN_URLS
        self.timeout = timeout


class GithubStorage(IndexStorage):
    """
    Read-only storage that fetches data from GitHub repositories.
    Supports jsDelivr CDN fallback for users in mainland China.
    Write operations (save_item, delete_item, generate_id) raise StorageError.
    """

    def __init__(self, config: GithubStorageConfig):
        self.config = config
        self._cache: Optional[List[Dict]] = None
        self._path_map: Dict[str, Dict[str, Any]] = {}

    def _fetch_json(self, url: str) -> Any:
        """Fetch and parse JSON from a URL."""
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "book-index-manager"})
            with urllib.request.urlopen(req, timeout=self.config.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
            raise StorageError(f"Failed to fetch {url}: {e}")

    def _fetch_index(self, repo: str) -> dict:
        """Fetch index.json from GitHub raw or CDN fallback."""
        github_url = f"{self.config.base_url}/{self.config.org}/{repo}/main/index.json"
        try:
            return self._fetch_json(github_url)
        except StorageError:
            pass

        for cdn in self.config.cdn_urls:
            cdn_url = f"{cdn}/{self.config.org}/{repo}@main/index.json"
            try:
                return self._fetch_json(cdn_url)
            except StorageError:
                continue

        raise StorageError(f"Failed to fetch index.json for {repo} from all sources")

    def _ensure_loaded(self) -> List[Dict]:
        """Ensure index data is loaded into cache."""
        if self._cache is not None:
            return self._cache

        all_entries: List[Dict] = []
        type_map = {"books": "book", "collections": "collection", "works": "work"}

        for is_draft in [True, False]:
            repo = self.config.repos["draft"] if is_draft else self.config.repos["official"]
            try:
                data = self._fetch_index(repo)
            except StorageError:
                continue

            for section_key, type_name in type_map.items():
                items = data.get(section_key, {})
                for item_id, item in items.items():
                    entry = {
                        "id": item.get("id", item_id),
                        "title": item.get("title") or item.get("name") or item_id,
                        "type": type_name,
                        "isDraft": is_draft,
                        "author": item.get("author", ""),
                        "dynasty": item.get("dynasty", ""),
                        "role": item.get("role", ""),
                        "path": item.get("path", ""),
                    }
                    all_entries.append(entry)
                    self._path_map[entry["id"]] = {"path": item.get("path", ""), "isDraft": is_draft}

        # De-duplicate by id (later entries override earlier)
        seen: Dict[str, Dict] = {}
        for e in all_entries:
            seen[e["id"]] = e
        self._cache = list(seen.values())
        return self._cache

    def load_entries(self, type_name: str, options: Optional[LoadOptions] = None) -> PageResult:
        opts = options or LoadOptions()
        all_entries = self._ensure_loaded()
        filtered = [e for e in all_entries if e["type"] == type_name]

        # Sort
        sort_key = opts.sort_by
        reverse = opts.sort_order == "desc"
        filtered.sort(key=lambda e: str(e.get(sort_key, "")), reverse=reverse)

        # Paginate
        total = len(filtered)
        start = (opts.page - 1) * opts.page_size
        sliced = filtered[start:start + opts.page_size]
        return PageResult(sliced, total, opts.page, opts.page_size)

    def search(self, query: str, type_name: str, options: Optional[LoadOptions] = None) -> PageResult:
        opts = options or LoadOptions()
        all_entries = self._ensure_loaded()
        lower_q = query.lower()

        filtered = [
            e for e in all_entries
            if e["type"] == type_name and (
                lower_q in e.get("title", "").lower() or
                lower_q in e.get("id", "").lower() or
                lower_q in e.get("author", "").lower()
            )
        ]

        total = len(filtered)
        start = (opts.page - 1) * opts.page_size
        sliced = filtered[start:start + opts.page_size]
        return PageResult(sliced, total, opts.page, opts.page_size)

    def get_item(self, id_str: str) -> Optional[Dict]:
        self._ensure_loaded()
        info = self._path_map.get(id_str)
        if not info:
            return None

        repo = self.config.repos["draft"] if info["isDraft"] else self.config.repos["official"]
        path = info["path"]

        # Try GitHub raw first
        github_url = f"{self.config.base_url}/{self.config.org}/{repo}/main/{path}"
        try:
            return self._fetch_json(github_url)
        except StorageError:
            pass

        # CDN fallback
        for cdn in self.config.cdn_urls:
            cdn_url = f"{cdn}/{self.config.org}/{repo}@main/{path}"
            try:
                return self._fetch_json(cdn_url)
            except StorageError:
                continue

        return None

    def save_item(self, metadata: Dict) -> Dict:
        raise StorageError("GithubStorage is read-only, save is not supported")

    def delete_item(self, id_str: str) -> bool:
        raise StorageError("GithubStorage is read-only, delete is not supported")

    def generate_id(self, type_name: str, status: str = "draft") -> str:
        raise StorageError("GithubStorage is read-only, ID generation is not supported")

    def clear_cache(self):
        """Clear cached data (for refreshing after external changes)."""
        self._cache = None
        self._path_map.clear()
