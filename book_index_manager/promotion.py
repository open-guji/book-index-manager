"""Draft → Production promotion: 把 draft 条目升格为 official，并维护 promotions.json 映射。

主流程见 d:\\workspace\\overview\\项目进展\\古籍索引网站\\整体设计\\
2026-05-Draft到Production升级流程.md。
"""

from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from .id_generator import (
    BookIndexIdGenerator,
    BookIndexStatus,
    BookIndexType,
    base36_encode,
    smart_decode,
)
from .exceptions import BookIndexError


PROMOTIONS_FILENAME = "promotions.json"
PROMOTIONS_VERSION = 1

# Base36 ID 形状：12-13 字符纯小写字母数字。base58 老 ID 升级前已经全量迁完，
# 这里只匹配 base36。匹配 12-13 是因为 timestamp 高位补零后通常 12 位。
_ID_SHAPE = re.compile(r"^[0-9a-z]{12,13}$")


@dataclass(frozen=True)
class PromotionRecord:
    production_id: str
    type: str
    promoted_at: str

    def to_dict(self) -> dict:
        return {
            "production_id": self.production_id,
            "type": self.type,
            "promoted_at": self.promoted_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "PromotionRecord":
        return cls(
            production_id=d["production_id"],
            type=d["type"],
            promoted_at=d["promoted_at"],
        )


class PromotionsStore:
    """读写 book-index-draft/promotions.json 的轻封装。"""

    def __init__(self, draft_root: Path):
        self.path = draft_root / PROMOTIONS_FILENAME
        self._cache: Optional[Dict[str, PromotionRecord]] = None

    def load(self) -> Dict[str, PromotionRecord]:
        if self._cache is not None:
            return self._cache
        if not self.path.exists():
            self._cache = {}
            return self._cache
        with open(self.path, "r", encoding="utf-8") as f:
            data = json.load(f)
        promotions = data.get("promotions", {}) if isinstance(data, dict) else {}
        self._cache = {
            draft_id: PromotionRecord.from_dict(rec)
            for draft_id, rec in promotions.items()
        }
        return self._cache

    def save(self):
        promotions = self.load()
        # key 字典序排序，git diff 友好
        sorted_items = {k: promotions[k].to_dict() for k in sorted(promotions.keys())}
        payload = {"version": PROMOTIONS_VERSION, "promotions": sorted_items}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

    def add(self, draft_id: str, record: PromotionRecord):
        self.load()
        if draft_id in self._cache:
            raise BookIndexError(
                f"{draft_id} already promoted to {self._cache[draft_id].production_id}"
            )
        self._cache[draft_id] = record

    def remove(self, draft_id: str):
        self.load()
        self._cache.pop(draft_id, None)

    def get(self, draft_id: str) -> Optional[PromotionRecord]:
        return self.load().get(draft_id)

    def invalidate(self):
        self._cache = None


# ── ID rewriting (在 JSON tree 内做引用替换) ──

def _rewrite_in_value(value, mapping: Dict[str, str]):
    """递归把出现在 mapping 里的字符串替换掉。dict key 也替换。"""
    if isinstance(value, str):
        return mapping.get(value, value)
    if isinstance(value, list):
        return [_rewrite_in_value(item, mapping) for item in value]
    if isinstance(value, dict):
        return {
            (mapping.get(k, k) if isinstance(k, str) else k):
            _rewrite_in_value(v, mapping)
            for k, v in value.items()
        }
    return value


def _rewrite_file(path: Path, mapping: Dict[str, str]) -> bool:
    """重写单个 JSON 文件。返回是否真有变更。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return False

    new_data = _rewrite_in_value(data, mapping)
    if new_data == data:
        return False

    with open(path, "w", encoding="utf-8") as f:
        json.dump(new_data, f, indent=2, ensure_ascii=False)
    return True


# 实体内容文件所在的顶级子目录。
# 不扫 index/（自动生成的 shard）和根级 promotions.json（状态文件，key 是 draft_id，
# 不能被映射替换掉）。Phase 4 后 caller 该调 reindex 重建 shard。
_CONTENT_SUBDIRS = ("Book", "Work", "Collection", "Entity")


def rewrite_references(
    roots: List[Path],
    mapping: Dict[str, str],
    skip_files: Optional[Set[Path]] = None,
) -> int:
    """把 mapping 里所有 D→P 应用到 roots 下的实体 JSON 文件。返回改动文件数。

    只扫 roots/<Book|Work|Collection|Entity>/**/*.json 这些实体文件。
    显式不碰：
      - index/**/*.json：自动生成的 shard，应由 reindex 重建。
      - promotions.json：状态文件，key 是 draft_id 不能被替换。

    `skip_files`：额外的绝对路径集合，跳过这些文件（典型：tombstone 自己 + 新写的 P）。
    """
    skip_files = {p.resolve() for p in (skip_files or set())}
    changed = 0
    for root in roots:
        if not root.exists():
            continue
        for subdir in _CONTENT_SUBDIRS:
            sub = root / subdir
            if not sub.exists():
                continue
            for json_file in sub.rglob("*.json"):
                if json_file.resolve() in skip_files:
                    continue
                if _rewrite_file(json_file, mapping):
                    changed += 1
    return changed


# ── 主 promote 流程 ──

def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _validate_draft_id(draft_id: str) -> Tuple[int, BookIndexType]:
    """校验 draft_id 形状和 status 位。返回 (id_val, type)。"""
    if not _ID_SHAPE.match(draft_id):
        raise BookIndexError(f"Invalid base36 ID shape: {draft_id}")
    id_val = smart_decode(draft_id)
    components = BookIndexIdGenerator.parse(id_val)
    if components.status != BookIndexStatus.Draft:
        raise BookIndexError(
            f"{draft_id} is not a draft ID (status={components.status.name})"
        )
    return id_val, components.type


def promote_to_official(
    storage,
    id_gen: BookIndexIdGenerator,
    draft_id: str,
    rewrite_refs: bool = True,
) -> str:
    """把单个 draft 条目升级为 production。返回新 production-id 字符串。

    步骤：
      0. 校验 draft_id；从 storage 加载 D 的 JSON。
      1. 生成 P；深拷贝内容到 book-index/<...>/<P>-<title>.json；asset dir 整体物理拷贝。
      2. 在 D 上追加 promoted_to/promoted_at；更新 draft shard 的 entry。
      3. 写 promotions.json。
      4. 若 rewrite_refs：在两个仓全量改 D→P（跳过 D 自身和新写的 P）。
    """
    from .storage import type_key_of  # 延后导入避免循环

    # ── Phase 0: 校验 + 加载 ──
    _, type_val = _validate_draft_id(draft_id)

    draft_path = storage.find_file_by_id(draft_id)
    if draft_path is None:
        raise BookIndexError(f"Draft file not found: {draft_id}")

    with open(draft_path, "r", encoding="utf-8") as f:
        draft_metadata = json.load(f)

    if draft_metadata.get("promoted_to"):
        raise BookIndexError(
            f"{draft_id} already promoted to {draft_metadata['promoted_to']}"
        )

    promotions = PromotionsStore(storage.draft_root)
    if promotions.get(draft_id) is not None:
        # promotions.json 有但文件没标记——视为状态不一致，拒绝
        raise BookIndexError(
            f"{draft_id} appears in promotions.json but file has no promoted_to. "
            f"State inconsistent; manual fix required."
        )

    # ── Phase 1: 生成 P + 写 production ──
    prod_id_val = id_gen.next_id(BookIndexStatus.Official, type_val)
    prod_id = base36_encode(prod_id_val)

    # 深拷贝并改 id
    prod_metadata = json.loads(json.dumps(draft_metadata))
    prod_metadata["id"] = prod_id
    # 保险：清掉万一被深拷贝带过来的 tombstone 字段（D 还没写呢，但稳健起见）
    prod_metadata.pop("promoted_to", None)
    prod_metadata.pop("promoted_at", None)

    # storage.save_item 会自动按 prod_id_val 的 status 路由到 book-index/
    # 但 save_item 内部要查 find_file_by_id 看有没有同 ID 文件——刚生成的 P 必然没有，OK。
    prod_path = storage.save_item(type_val, prod_id_val, prod_metadata)

    # Asset dir 物理拷贝
    draft_asset_dir = draft_path.parent / draft_id
    if draft_asset_dir.is_dir():
        prod_asset_dir = prod_path.parent / prod_id
        if prod_asset_dir.exists():
            # 极不可能（新 ID 全新分配），但稳健起见
            raise BookIndexError(
                f"Production asset dir already exists: {prod_asset_dir}"
            )
        shutil.copytree(str(draft_asset_dir), str(prod_asset_dir))

    # ── Phase 2: 写 tombstone ──
    promoted_at = _now_iso()
    draft_metadata["promoted_to"] = prod_id
    draft_metadata["promoted_at"] = promoted_at

    with open(draft_path, "w", encoding="utf-8") as f:
        json.dump(draft_metadata, f, indent=2, ensure_ascii=False)

    # 更新 draft shard：在原 entry 上挂 promoted_to
    _mark_draft_shard_promoted(storage, draft_id, type_val, prod_id)

    # ── Phase 3: 写 promotions.json ──
    record = PromotionRecord(
        production_id=prod_id,
        type=type_val.name.lower(),
        promoted_at=promoted_at,
    )
    promotions.add(draft_id, record)
    promotions.save()

    # ── Phase 4: 改引用 ──
    if rewrite_refs:
        rewrite_references(
            roots=[storage.draft_root, storage.official_root],
            mapping={draft_id: prod_id},
            skip_files={draft_path, prod_path},
        )

    # ── Phase 5: dedupe Work.books（仅当升 Book 时） ──
    # 修复：Phase 1 save_item 触发 _sync_work_books_link append P + Phase 4 rewrite
    # 把 D 改 P，造成 Work.books 出现 [P, ..., P]。这里清一次。
    if type_val == BookIndexType.Book:
        _dedupe_work_books_after_promote(storage, prod_metadata.get("work_id"))

    return prod_id


def _dedupe_work_books_after_promote(storage, work_id: Optional[str]):
    """promote Book 后清理对应 Work.books 数组的重复条目（保序）。"""
    if not work_id:
        return
    try:
        work_path = storage.find_file_by_id(work_id)
        if work_path is None:
            return
        with open(work_path, "r", encoding="utf-8") as f:
            work_data = json.load(f)
        books = work_data.get("books", [])
        if not isinstance(books, list):
            return
        seen: Set[str] = set()
        deduped: List[str] = []
        for x in books:
            if x in seen:
                continue
            seen.add(x)
            deduped.append(x)
        if deduped != books:
            work_data["books"] = deduped
            with open(work_path, "w", encoding="utf-8") as f:
                json.dump(work_data, f, indent=2, ensure_ascii=False)
    except Exception:
        # 失败不阻塞 promote 主流程；下次 reindex 也能拿到正确状态
        pass


def _mark_draft_shard_promoted(
    storage,
    draft_id: str,
    type_val: BookIndexType,
    prod_id: str,
):
    """在 draft 的 shard entry 里挂 promoted_to。"""
    from .storage import type_key_of  # 延后导入

    type_key = type_key_of(type_val)
    shard_data = storage._load_shard(storage.draft_root, type_key, draft_id)
    if draft_id in shard_data:
        shard_data[draft_id]["promoted_to"] = prod_id
        storage._save_shard(storage.draft_root, type_key, draft_id, shard_data)


# ── Validation ──

@dataclass
class PromotionIssue:
    """validate_promotions 报出的单个问题。"""

    severity: str  # "error" | "warning"
    code: str
    draft_id: Optional[str]
    production_id: Optional[str]
    path: Optional[str]
    message: str

    def to_dict(self) -> dict:
        return {
            "severity": self.severity,
            "code": self.code,
            "draft_id": self.draft_id,
            "production_id": self.production_id,
            "path": self.path,
            "message": self.message,
        }


def validate_promotions(storage) -> List[PromotionIssue]:
    """全仓校验 promotion 状态一致性。返回 issue 列表（空表示一切 OK）。

    检查项：
      [E01] promotions.json 里的每条 entry，production 文件存在
      [E02] promotions.json 里的每条 entry，draft 文件 promoted_to 与之一致
      [E03] draft 文件带 promoted_to，但 promotions.json 没对应记录
      [E04] 全仓出现裸引用：某 JSON 内容里出现已 promoted 的 draft-id
            （tombstone 文件自身和 promotions.json 不算）
      [E05] promotions.json 里 production_id 不是 official status 位
    """
    issues: List[PromotionIssue] = []
    promotions = PromotionsStore(storage.draft_root)
    records = promotions.load()
    promoted_ids: Set[str] = set(records.keys())

    # E01 + E05: 反向校验 promotions.json 里每条 entry
    for draft_id, rec in records.items():
        prod_path = storage.find_file_by_id(rec.production_id)
        if prod_path is None:
            issues.append(PromotionIssue(
                severity="error", code="E01",
                draft_id=draft_id, production_id=rec.production_id,
                path=None,
                message=f"Production file not found for {rec.production_id}",
            ))
            continue
        if "book-index-draft" in str(prod_path).replace("\\", "/").split("/"):
            # 不该发生（production 应在 book-index/）
            issues.append(PromotionIssue(
                severity="error", code="E05",
                draft_id=draft_id, production_id=rec.production_id,
                path=str(prod_path),
                message=f"Promotion target {rec.production_id} resides in draft repo",
            ))

    # E02 + E03: draft 端校验
    draft_root = storage.draft_root
    for subdir in _CONTENT_SUBDIRS:
        sub = draft_root / subdir
        if not sub.exists():
            continue
        for json_file in sub.rglob("*.json"):
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(data, dict):
                continue
            promoted_to = data.get("promoted_to")
            if not promoted_to:
                continue
            file_id = data.get("id", "")
            rec = records.get(file_id)
            if rec is None:
                issues.append(PromotionIssue(
                    severity="error", code="E03",
                    draft_id=file_id, production_id=promoted_to,
                    path=str(json_file),
                    message=f"Tombstone {file_id} has promoted_to but promotions.json has no record",
                ))
            elif rec.production_id != promoted_to:
                issues.append(PromotionIssue(
                    severity="error", code="E02",
                    draft_id=file_id, production_id=promoted_to,
                    path=str(json_file),
                    message=(
                        f"Tombstone says promoted_to={promoted_to}, "
                        f"but promotions.json says {rec.production_id}"
                    ),
                ))

    # E04: 裸引用扫描——任何实体 JSON 出现 promoted-draft-id 字符串都算
    if promoted_ids:
        # 准备 skip 集合：每个 tombstone 自己
        skip_paths: Set[Path] = set()
        for draft_id in promoted_ids:
            p = storage.find_file_by_id(draft_id)
            if p is not None:
                skip_paths.add(p.resolve())

        for root in (storage.draft_root, storage.official_root):
            for subdir in _CONTENT_SUBDIRS:
                sub = root / subdir
                if not sub.exists():
                    continue
                for json_file in sub.rglob("*.json"):
                    if json_file.resolve() in skip_paths:
                        continue
                    try:
                        with open(json_file, "r", encoding="utf-8") as f:
                            content = f.read()
                    except OSError:
                        continue
                    hits = _scan_naked_refs(content, promoted_ids)
                    for hit in hits:
                        issues.append(PromotionIssue(
                            severity="error", code="E04",
                            draft_id=hit, production_id=records[hit].production_id,
                            path=str(json_file),
                            message=f"Naked reference to promoted draft-id {hit}",
                        ))

    return issues


def _scan_naked_refs(content: str, promoted_ids: Set[str]) -> Set[str]:
    """在 JSON 内容字符串里找出所有 promoted draft-id 出现。

    用字符串包含判断（够用）：promoted-id 是 12-13 字符 base36，碰撞概率可忽略。
    返回命中的 draft-id 集合。
    """
    hits: Set[str] = set()
    for pid in promoted_ids:
        # 用引号包裹以避免子串误命中（例如 D 是 P 的前缀的极端情况）
        if f'"{pid}"' in content:
            hits.add(pid)
    return hits


# ── Lookup helper ──

def resolve_id(storage, id_str: str) -> Tuple[str, Optional[str]]:
    """返回 (canonical_id, redirected_from)。

    若 id 已 promoted：返回 (production_id, draft_id)。
    否则：返回 (id_str, None)。
    """
    promotions = PromotionsStore(storage.draft_root)
    rec = promotions.get(id_str)
    if rec is None:
        return id_str, None
    return rec.production_id, id_str
