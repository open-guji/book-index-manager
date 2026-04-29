"""Resource schema definitions and validation for book index entries."""

from dataclasses import dataclass, field, asdict
from typing import Optional, List
from urllib.parse import urlparse
import re


# Well-known domain → id mapping
DOMAIN_ID_MAP = {
    "wikisource": "wikisource",
    "shidianguji": "shidianguji",
    "archive": "archive",
    "ctext": "ctext",
    "nlc": "nlc",
    "read.nlc": "nlc",
    "db.sido": "sido",
    "guji.artx": "guji-artx",
    "digital.library": "digital-library",
}

VALID_TYPES = {"text", "image", "text+image", "physical"}
VALID_TYPE_ATOMS = {"text", "image", "physical"}


def normalize_resource_types(entry: dict) -> list:
    """从 resource entry dict 提取规范化的 types 列表（原子类型组合）。

    优先读 'types'（list），回退到 'type'（str，旧格式）。
    'text+image' → ['text', 'image']
    """
    types = entry.get("types")
    if isinstance(types, list) and types:
        return [t for t in types if t in VALID_TYPE_ATOMS]
    t = entry.get("type")
    if not t:
        return []
    if t == "text+image":
        return ["text", "image"]
    if t in VALID_TYPE_ATOMS:
        return [t]
    return []
VALID_ROOT_TYPES = {"catalog", "search"}


def extract_id_from_url(url: str) -> str:
    """Extract a short identifier from a URL's domain.

    Takes the second-level domain (e.g. 'wikisource' from 'zh.wikisource.org').
    Falls back to full hostname if extraction fails.
    """
    if not url:
        return ""
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        # Try well-known mappings first
        for pattern, id_val in DOMAIN_ID_MAP.items():
            if pattern in hostname:
                return id_val
        # Generic: take second-level domain
        parts = hostname.split(".")
        # Remove common TLDs and subdomains
        if len(parts) >= 2:
            # For domains like "zh.wikisource.org", take "wikisource"
            # For domains like "archive.org", take "archive"
            # Remove known public suffixes
            public_suffixes = {"com", "org", "net", "cn", "edu", "gov", "io", "jp", "tw", "hk"}
            meaningful = [p for p in parts if p not in public_suffixes and len(p) > 2]
            if meaningful:
                return meaningful[-1]
            # Fallback: second to last
            return parts[-2] if len(parts) >= 2 else parts[0]
        return hostname
    except Exception:
        return ""


@dataclass
class CoverageInfo:
    """Coverage range for a resource."""
    level: int = 0
    ranges: str = ""

    def to_dict(self) -> dict:
        return {"level": self.level, "ranges": self.ranges}

    @classmethod
    def from_dict(cls, data: dict) -> "CoverageInfo":
        if not data:
            return cls()
        return cls(
            level=data.get("level", 0),
            ranges=data.get("ranges", ""),
        )


@dataclass
class ResourceEntry:
    """A unified resource entry for a book index item.

    Replaces the old separate text_resources / image_resources arrays.
    """
    id: str = ""
    name: str = ""
    url: str = ""
    # 旧格式（保留兼容读写）。新数据请使用 types。
    type: str = ""  # text | image | text+image | physical
    # 新格式：自由组合 ['text', 'image', 'physical']
    types: Optional[List[str]] = None
    root_type: str = "catalog"  # catalog | search
    structure: Optional[List[str]] = None
    coverage: Optional[CoverageInfo] = None
    details: str = ""
    metadata: Optional[dict] = None  # key-value pairs for structured resource info

    def to_dict(self) -> dict:
        """Serialize to a JSON-compatible dict, omitting default/empty optional fields."""
        d = {"id": self.id, "name": self.name, "url": self.url}
        # types 优先；若没有则回退到 type
        if self.types:
            d["types"] = list(self.types)
        elif self.type:
            d["type"] = self.type
        else:
            d["type"] = "text"
        if self.root_type != "catalog":
            d["root_type"] = self.root_type
        if self.structure:
            d["structure"] = self.structure
        if self.coverage and self.coverage.ranges:
            d["coverage"] = self.coverage.to_dict()
        if self.details:
            d["details"] = self.details
        if self.metadata:
            d["metadata"] = self.metadata
        # physical-only resources may have no url
        if not self.url:
            d.pop("url", None)
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "ResourceEntry":
        coverage = None
        if "coverage" in data and data["coverage"]:
            coverage = CoverageInfo.from_dict(data["coverage"])
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            url=data.get("url", ""),
            type=data.get("type", ""),
            types=data.get("types"),
            root_type=data.get("root_type", "catalog"),
            structure=data.get("structure"),
            coverage=coverage,
            details=data.get("details", ""),
            metadata=data.get("metadata"),
        )

    @property
    def normalized_types(self) -> List[str]:
        """规范化 types 列表（兼容新旧）。"""
        return normalize_resource_types({"type": self.type, "types": self.types})

    def validate(self) -> List[str]:
        """Return a list of validation errors (empty if valid)."""
        errors = []
        if not self.name:
            errors.append("name is required")
        # 优先校验 types
        is_physical_only = False
        if self.types is not None:
            if not isinstance(self.types, list) or not self.types:
                errors.append("types must be a non-empty list when present")
            else:
                for t in self.types:
                    if t not in VALID_TYPE_ATOMS:
                        errors.append(f"invalid types atom '{t}', must be one of {VALID_TYPE_ATOMS}")
                is_physical_only = self.types == ["physical"]
        elif self.type:
            if self.type not in VALID_TYPES:
                errors.append(f"invalid type '{self.type}', must be one of {VALID_TYPES}")
            is_physical_only = self.type == "physical"
        else:
            errors.append("either type or types is required")
        if self.root_type not in VALID_ROOT_TYPES:
            errors.append(f"invalid root_type '{self.root_type}', must be one of {VALID_ROOT_TYPES}")
        if not is_physical_only and not self.url:
            errors.append("url is required for non-physical resources")
        return errors
