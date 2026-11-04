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

# resources[].types 闭集（schema/common.md）：影像｜文本｜实物馆藏记录｜书目入口｜带注释的整理本
VALID_TYPE_ATOMS = {"text", "image", "physical", "catalog", "annotated"}
# 旧单值 type 的合法值（只读兼容；新数据不再写 type）
VALID_TYPES = {"text", "image", "text+image", "physical", "catalog", "annotated"}


def split_type_atoms(value: str) -> list:
    """把单值 type（可含 `text+image` 组合）拆成 types 原子数组；不识别的值原样保留一项。

    写入端用：`add-resource --type text+image` → `["text", "image"]`。
    """
    if not value:
        return []
    return [a for a in value.split("+") if a]


def normalize_resource_types(entry: dict) -> list:
    """从 resource entry dict 提取规范化的 types 列表（只认 `types`；旧单值 `type` 数据已清空，不再回退）。"""
    types = entry.get("types")
    if isinstance(types, list):
        return [t for t in types if t in VALID_TYPE_ATOMS]
    return []


VALID_ROOT_TYPES = {"catalog"}  # 与 JSON Schema 一致（const catalog）


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
    # 旧单值 type：只读兼容（from_dict 可读、validate 可校），to_dict 不再写出。
    type: str = ""  # text | image | text+image | physical
    # 现行写法：闭集 text | image | physical | catalog | annotated 的数组
    types: Optional[List[str]] = None
    root_type: str = "catalog"  # catalog | search
    structure: Optional[List[str]] = None
    coverage: Optional[CoverageInfo] = None
    details: str = ""
    metadata: Optional[dict] = None  # key-value pairs for structured resource info

    def to_dict(self) -> dict:
        """Serialize to a JSON-compatible dict, omitting default/empty optional fields."""
        d = {"id": self.id, "name": self.name, "url": self.url}
        # 只写 types 数组；旧单值 type（含 text+image）转成 types 写出，不再写 type
        if self.types:
            d["types"] = list(self.types)
        elif self.type:
            d["types"] = split_type_atoms(self.type)
        else:
            d["types"] = ["text"]
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
        return normalize_resource_types({"types": self.types or split_type_atoms(self.type)})

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


@dataclass
class BookLineage:
    """Book 的存佚信息（lineage）。所出之本见 base_edition，关联见 related_books，年代见 dating（版本关系 06 稿）。"""
    status: Optional[str] = None  # extant | fragment | lost
    extant_juan: Optional[str] = None  # 存世卷数，如 "16/120"
    alias: Optional[List[str]] = None  # 简称、俗称
    note: Optional[str] = None

    def to_dict(self) -> dict:
        d = {}
        if self.status:
            d["status"] = self.status
        if self.extant_juan:
            d["extant_juan"] = self.extant_juan
        if self.alias:
            d["alias"] = list(self.alias)
        if self.note:
            d["note"] = self.note
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "BookLineage":
        return cls(
            status=data.get("status"),
            extant_juan=data.get("extant_juan"),
            alias=data.get("alias"),
            note=data.get("note"),
        )
