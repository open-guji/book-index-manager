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
    type: str = "text"  # text | image | text+image | physical
    root_type: str = "catalog"  # catalog | search
    structure: Optional[List[str]] = None
    coverage: Optional[CoverageInfo] = None
    details: str = ""
    metadata: Optional[dict] = None  # key-value pairs for structured resource info

    def to_dict(self) -> dict:
        """Serialize to a JSON-compatible dict, omitting default/empty optional fields."""
        d = {"id": self.id, "name": self.name, "url": self.url, "type": self.type}
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
        # physical resources may have no url
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
            type=data.get("type", "text"),
            root_type=data.get("root_type", "catalog"),
            structure=data.get("structure"),
            coverage=coverage,
            details=data.get("details", ""),
            metadata=data.get("metadata"),
        )

    def validate(self) -> List[str]:
        """Return a list of validation errors (empty if valid)."""
        errors = []
        if not self.name:
            errors.append("name is required")
        if self.type not in VALID_TYPES:
            errors.append(f"invalid type '{self.type}', must be one of {VALID_TYPES}")
        if self.root_type not in VALID_ROOT_TYPES:
            errors.append(f"invalid root_type '{self.root_type}', must be one of {VALID_ROOT_TYPES}")
        if self.type != "physical" and not self.url:
            errors.append("url is required for non-physical resources")
        return errors
