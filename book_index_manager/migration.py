"""Migration utilities: convert old text_resources/image_resources to unified resources."""

import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Tuple

from .schema import ResourceEntry, extract_id_from_url

logger = logging.getLogger(__name__)


def migrate_old_resource(item: dict, resource_type: str) -> dict:
    """Convert a single old-format resource item to new ResourceEntry dict.

    Old format: {"name"/"title": "...", "url": "...", "details": "..."}
    New format: ResourceEntry with id, name, url, type, etc.
    """
    name = item.get("name") or item.get("title") or ""
    url = item.get("url", "")
    details = item.get("details", "")
    res_id = extract_id_from_url(url)

    return ResourceEntry(
        id=res_id,
        name=name,
        url=url,
        type=resource_type,
        details=details,
    ).to_dict()


def migrate_metadata(metadata: dict) -> Tuple[dict, bool]:
    """Migrate a metadata dict from old schema to new unified resources.

    Returns (migrated_metadata, was_changed).
    If the metadata already has 'resources' and no old fields, returns unchanged.
    """
    has_old_text = "text_resources" in metadata
    has_old_image = "image_resources" in metadata
    has_new = "resources" in metadata

    if not has_old_text and not has_old_image:
        return metadata, False

    # Build unified resources list
    resources: List[dict] = list(metadata.get("resources", []))
    existing_urls = {r.get("url", "") for r in resources if r.get("url")}

    if has_old_text:
        for item in metadata["text_resources"]:
            url = item.get("url", "")
            if url and url in existing_urls:
                continue
            resources.append(migrate_old_resource(item, "text"))
            if url:
                existing_urls.add(url)

    if has_old_image:
        for item in metadata["image_resources"]:
            url = item.get("url", "")
            if url and url in existing_urls:
                continue
            resources.append(migrate_old_resource(item, "image"))
            if url:
                existing_urls.add(url)

    # Deduplicate resource ids within this entry
    _dedup_resource_ids(resources)

    metadata["resources"] = resources
    metadata.pop("text_resources", None)
    metadata.pop("image_resources", None)

    return metadata, True


def _dedup_resource_ids(resources: List[dict]):
    """If multiple resources share the same id, append a numeric suffix."""
    seen: Dict[str, int] = {}
    for r in resources:
        rid = r.get("id", "")
        if not rid:
            continue
        if rid in seen:
            seen[rid] += 1
            r["id"] = f"{rid}-{seen[rid]}"
        else:
            seen[rid] = 1


def migrate_file(file_path: Path, dry_run: bool = False) -> bool:
    """Migrate a single JSON file in-place. Returns True if file was changed."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
    except Exception as e:
        logger.warning(f"Skipping {file_path}: {e}")
        return False

    migrated, changed = migrate_metadata(metadata)
    if not changed:
        return False

    if dry_run:
        logger.info(f"[dry-run] Would migrate: {file_path}")
        return True

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(migrated, f, indent=2, ensure_ascii=False)
        logger.info(f"Migrated: {file_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to write {file_path}: {e}")
        return False


def migrate_directory(root: Path, dry_run: bool = False) -> Tuple[int, int]:
    """Migrate all JSON files under a directory tree.

    Returns (total_files, migrated_count).
    """
    total = 0
    migrated = 0
    for json_file in root.rglob("*.json"):
        if json_file.name == "index.json":
            continue
        total += 1
        if migrate_file(json_file, dry_run=dry_run):
            migrated += 1

    return total, migrated
