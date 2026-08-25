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
from ._utils import (
    has_legacy_promotion_keys,
    mark_promoted,
    read_promoted_to,
    strip_promotion_marks,
)


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
    """读写 book-index-draft/promotions.json 的轻封装。

    **写出前必与磁盘现状合流**，只把本进程动过的那几目落下去，其余一概以
    磁盘为准。理由：`promotions.json` 是全库共用的**单一状态档**，而升格是
    长批次——本进程 load 之后、save 之前，别的进程尽可以改它。若照着自己
    load 时的那份整档写出，就把人家这段时间写进去的目**静默抹掉**。

    2026-08-25 实见其祸：`4122fc78e9`「先秦桶清零」把 `92d4092dde`
    异体归正所并五组的 `production_id` 全改回并条之前的旧值（那五个
    production 档已经删了，于是 E01 该报「production 档不存在」），
    靠后来一次 merge 才侥幸回正。
    """

    def __init__(self, draft_root: Path):
        self.path = draft_root / PROMOTIONS_FILENAME
        self._cache: Optional[Dict[str, PromotionRecord]] = None
        # 本进程动过的 key。save 时只有这些以内存为准，其余取磁盘。
        self._touched: Set[str] = set()

    def _read_disk(self) -> Dict[str, PromotionRecord]:
        if not self.path.exists():
            return {}
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            # 读不动就当空——save 会以内存为准写出，总比写坏强
            return {}
        promotions = data.get("promotions", {}) if isinstance(data, dict) else {}
        out: Dict[str, PromotionRecord] = {}
        for draft_id, rec in promotions.items():
            try:
                out[draft_id] = PromotionRecord.from_dict(rec)
            except (KeyError, TypeError):
                continue
        return out

    def load(self) -> Dict[str, PromotionRecord]:
        if self._cache is not None:
            return self._cache
        self._cache = self._read_disk()
        return self._cache

    def save(self):
        promotions = self.load()
        # 与磁盘现状合流：以磁盘为底，只覆盖本进程动过的那几目。
        merged = self._read_disk()
        for k in self._touched:
            if k in promotions:
                merged[k] = promotions[k]
            else:
                merged.pop(k, None)
        # 内存与合流之果对齐，免得同一个 store 后续再 save 时把别人的目又丢掉
        self._cache = merged
        self._touched = set()
        # key 字典序排序，git diff 友好
        sorted_items = {k: merged[k].to_dict() for k in sorted(merged.keys())}
        payload = {"version": PROMOTIONS_VERSION, "promotions": sorted_items}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            # 檔尾一個換行——SCHEMA〈JSON 書寫格式〉（2026-08-21 定，全庫一律）。
            # 少了它，每跑一次 promote 就把改寫過的每個檔去掉檔尾換行，於是
            # 「一個欄位一行、可自動合併」退化成整檔衝突——而那正是並行作業
            # 賴以不撞車的前提。實測一次 promote 波及 15 檔，13 檔中招。
            f.write("\n")

    def add(self, draft_id: str, record: PromotionRecord):
        self.load()
        if draft_id in self._cache:
            raise BookIndexError(
                f"{draft_id} already promoted to {self._cache[draft_id].production_id}"
            )
        self._cache[draft_id] = record
        self._touched.add(draft_id)

    def remove(self, draft_id: str):
        self.load()
        self._cache.pop(draft_id, None)
        self._touched.add(draft_id)

    def get(self, draft_id: str) -> Optional[PromotionRecord]:
        return self.load().get(draft_id)

    def invalidate(self):
        self._cache = None
        self._touched = set()


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
        f.write("\n")
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

    if read_promoted_to(draft_metadata):
        raise BookIndexError(
            f"{draft_id} already promoted to {read_promoted_to(draft_metadata)}"
        )

    promotions = PromotionsStore(storage.draft_root)
    if promotions.get(draft_id) is not None:
        # promotions.json 有但文件没标记——视为状态不一致，拒绝
        raise BookIndexError(
            f"{draft_id} appears in promotions.json but file has no promoted_to. "
            f"State inconsistent; manual fix required."
        )

    # ── Phase 1: 生成 P + 写 production ──
    prod_id_val, prod_id = _mint_unique_official_id(
        id_gen, storage, type_val, promotions
    )

    # 深拷贝并改 id
    prod_metadata = json.loads(json.dumps(draft_metadata))
    prod_metadata["id"] = prod_id
    # 保险：清掉万一被深拷贝带过来的 tombstone 字段（D 还没写呢，但稳健起见）
    strip_promotion_marks(prod_metadata)

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
        # 若拷贝来的 asset dir 含 collated_edition，给其 index.json 注入
        # 初始 revision/revised_at（M6，设计 §2026-05-版本控制与不可变性）。
        # 整理本版本号在 production 仓维护，draft 不要求。
        ce_index = prod_asset_dir / 'collated_edition' / 'collated_edition_index.json'
        if ce_index.is_file():
            try:
                with open(ce_index, 'r', encoding='utf-8') as f:
                    ce_data = json.load(f)
            except (OSError, json.JSONDecodeError):
                ce_data = None
            if isinstance(ce_data, dict) and 'revision' not in ce_data:
                from datetime import date as _date
                ce_data['revision'] = '1.0.0'
                ce_data['revised_at'] = _date.today().isoformat()
                with open(ce_index, 'w', encoding='utf-8') as f:
                    json.dump(ce_data, f, indent=2, ensure_ascii=False)
                    f.write("\n")

    # ── Phase 2: 写 tombstone ──
    promoted_at = _now_iso()
    mark_promoted(draft_metadata, prod_id, promoted_at)

    with open(draft_path, "w", encoding="utf-8") as f:
        json.dump(draft_metadata, f, indent=2, ensure_ascii=False)
        f.write("\n")

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
                f.write("\n")
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


def _mint_unique_official_id(id_gen, storage, type_val, promotions, max_tries: int = 512):
    """鑄一個**未被佔用**之 production id，占用即再鑄。

    何以要查：`BookIndexIdGenerator` 之 `(last_timestamp, sequence)` 是**進程內**狀態，
    而 official id 之時戳單位是**秒**（draft 是毫秒，見 `_get_current_timestamp`）。
    故同一秒內的兩次 CLI 調用，各自從 `sequence=0` 起，必得同號——
    而 `save_item` 見同 id 而題異，只印一行
    `Renaming file for <id>: <舊>.json -> <新>.json (title changed)`
    便把先升者之 production 檔**覆寫**。

    2026-08-24 南北朝升格實見：`promote --batch b2.txt && promote --batch b3.txt`
    二進程同秒，《文選》之 id 撞上前一進程之《宋書》，宋書之 production 條被覆蓋。
    同日另一會話升隋唐亦撞九組——**彼是進程內 status 交替所致**（已由
    `id_generator` 之 per-status 狀態修訖），**與此非一事**：那一支在進程內，
    這一支跨進程，per-status 狀態管不著。

    查兩處：`promotions.json` 已錄之 production_id，與兩倉之實檔。
    同進程內再鑄必使 sequence 遞增（同秒則 +1，跨秒則歸零而時戳已進），
    故必收斂；`max_tries` 只是防呆之底。
    """
    taken = {rec.production_id for rec in promotions.load().values()}
    for _ in range(max_tries):
        id_val = id_gen.next_id(BookIndexStatus.Official, type_val)
        id_str = base36_encode(id_val)
        if id_str in taken:
            continue
        if storage.find_file_by_id(id_str, quiet=True) is not None:
            continue
        return id_val, id_str
    raise BookIndexError(
        f"Failed to mint an unused production id after {max_tries} tries "
        f"(type={type_val.name}). This should be impossible: the sequence space "
        f"is 256 per second and the generator waits for the next second when it "
        f"wraps. Check for a corrupted promotions.json or a clock problem."
    )


def validate_promotions(storage) -> List[PromotionIssue]:
    """全仓校验 promotion 状态一致性。返回 issue 列表（空表示一切 OK）。

    检查项：
      [E01] promotions.json 里的每条 entry，production 文件存在
      [E02] promotions.json 里的每条 entry，draft 文件 promoted_to 与之一致
            （含 tombstone 文件整个丢掉 promoted_to 的情形——E02/E03 原先只遍历
            「文件带 promoted_to」者，恰好漏掉这一种，而这正是外部脚本直接 json.dump
            重写 tombstone 时最常见的破坏方式）
      [E03] draft 文件带 promoted_to，但 promotions.json 没对应记录
      [E04] 全仓出现裸引用：某 JSON 内容里出现已 promoted 的 draft-id
            （tombstone 文件自身和 promotions.json 不算）
      [E05] promotions.json 里 production_id 不是 official status 位
      [E06] (warning) tombstone 还在用无前缀的 promoted_to/promoted_at——
            派生栏应带 `_` 前缀（SCHEMA.md §記錄之共通欄位）
      [E08] production 条之 revision 仍是 1.0.0（升格之后从未改过）而其内容与
            draft 墓碑不同——**一方是从陈旧快照写出来的**。
            立此验之由：2026-08-25 遼金元轮实见，并行会话之 4,421 条批次升格，
            其 git 工作区落后于 main，于是 production 档与 draft 墓碑写的都是
            改正之前的内容，把已推上 main 的改正抹掉；而 E01–E04 全都对得上
            ——**它们只验「指向」，不验「内容是否新」**，故非专验不能见。
            门槛取 revision == 1.0.0：升格之后正常改 production 必 bump，
            一 bump 二者本就该不同，验之即噪；未 bump 而不同，方是此病。
            见 known-issues/升格用陳舊快照-20260825.md。

      [E07] 同一 production_id 被两条以上 draft 记录占用（一对多映射）——
            这是 id 撞号之痕：后升者之文件覆盖了先升者，production 凭空少一条，
            而 E01/E02/E03 全都对得上（各自的墓碑都指得对，production 文件也在），
            故非专验不能见。2026-08-24 隋唐九组、汉代一组、南北朝一组皆此型。

            **但一对多本身不足以断为撞号**：production 内并条（异体归正之类）
            也生一对多——甲并入乙、甲之 production 档删去后，甲之 draft 墓碑
            必须改指乙，否则 E01 反而要报「production 档不存在」。这是应然的
            记账，不是缺陷。2026-08-25 初版 E07 不辨此二者，在真库上把
            `92d4092dde` 异体归正所并之五组全报成撞号，而其「回收之法」
            （清墓碑再升一次）若照做，会把已并掉的条目重新变出来。

            故判据取二重，皆以并条之痕为凭：
              1. 存者若**全无** `merged_from` —— 断为撞号（error）。并条工具
                 必写此栏，撞号则无人写。
              2. 存者有 `merged_from`，而某条 draft 记录之题**不在**存者的
                 题集（title ＋ additional_titles；entity 则 primary_name ＋
                 alt_names）之内 —— 并是并了，但这一条像是另一回事，
                 报 warning 待人看。并条之所以生一对多，正因二者同题
                 （异体、繁简），故题不相涉者可疑。
              3. 二者皆合 —— 应然之并，不报。
    """
    issues: List[PromotionIssue] = []
    promotions = PromotionsStore(storage.draft_root)
    records = promotions.load()
    promoted_ids: Set[str] = set(records.keys())

    # id → 檔路徑之表，兩倉一趟掃出。
    # 不用 storage.find_file_by_id 逐個查者：分片已退化——draft 之 Work 幾乎
    # 全落在 `1/e/v` 一格（id 由時間戳生，同一批匯入的前綴相同），該目錄現有
    # 七萬一千餘檔，於是每查一次就得列它一遍，實測 53 ms；E01＋E02 各查一遍，
    # 兩萬三千次即二十分鐘，整驗因此跑不完。改為一趟掃（十萬檔，數秒）。
    id_paths: Dict[str, Path] = {}
    for root in (storage.official_root, storage.draft_root):
        for subdir in _CONTENT_SUBDIRS:
            sub = root / subdir
            if not sub.exists():
                continue
            for json_file in sub.rglob("*.json"):
                fid = json_file.name.split("-", 1)[0]
                id_paths.setdefault(fid, json_file)

    # E01 + E05: 反向校验 promotions.json 里每条 entry
    for draft_id, rec in records.items():
        prod_path = id_paths.get(rec.production_id)
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

        # E02 正向：从 promotions.json 出发查 tombstone，捕捉「文件整个丢掉
        # promoted_to」——下面 E02/E03 的反向遍历只看得到「文件带 promoted_to」者。
        draft_path = id_paths.get(draft_id)
        if draft_path is None:
            issues.append(PromotionIssue(
                severity="error", code="E02",
                draft_id=draft_id, production_id=rec.production_id,
                path=None,
                message=f"Tombstone file for {draft_id} not found",
            ))
            continue
        try:
            with open(draft_path, "r", encoding="utf-8") as f:
                draft_data = json.load(f)
        except (OSError, json.JSONDecodeError):
            draft_data = {}
        if not isinstance(draft_data, dict) or not read_promoted_to(draft_data):
            issues.append(PromotionIssue(
                severity="error", code="E02",
                draft_id=draft_id, production_id=rec.production_id,
                path=str(draft_path),
                message=(
                    f"Tombstone {draft_id} has no promoted_to, "
                    f"but promotions.json says {rec.production_id}"
                ),
            ))

    # E07: production_id 一对多——须辨「撞号」与「并条之应然记账」，见 docstring
    by_prod: Dict[str, List[str]] = {}
    for draft_id, rec in records.items():
        by_prod.setdefault(rec.production_id, []).append(draft_id)
    for prod_id, draft_ids in sorted(by_prod.items()):
        if len(draft_ids) < 2:
            continue
        draft_ids = sorted(draft_ids)
        prod_data = _read_json(id_paths.get(prod_id))
        if not _merge_marks(prod_data):
            issues.append(PromotionIssue(
                severity="error", code="E07",
                draft_id=",".join(draft_ids), production_id=prod_id,
                path=str(promotions.path),
                message=(
                    f"production id {prod_id} is claimed by {len(draft_ids)} draft records "
                    f"({', '.join(draft_ids)}) and the production entry bears no merged_from "
                    f"— an id collision: the later promote overwrote the earlier one's "
                    f"production file. Recover by clearing the loser's _promoted_to and its "
                    f"promotions.json entry, then promoting it again (draft content survives "
                    f"promotion, so nothing is lost). Do NOT do this if the entry turns out to "
                    f"have been merged — check for merge evidence first."
                ),
            ))
            continue
        names = _name_set(prod_data)
        odd = [d for d in draft_ids
               if (_read_json(id_paths.get(d)).get("title")
                   or _read_json(id_paths.get(d)).get("primary_name")) not in names]
        if odd:
            issues.append(PromotionIssue(
                severity="warning", code="E07",
                draft_id=",".join(odd), production_id=prod_id,
                path=str(promotions.path),
                message=(
                    f"production id {prod_id} is claimed by {len(draft_ids)} draft records; "
                    f"the entry does carry merged_from, so this is likely a production-side "
                    f"merge — but {', '.join(odd)} has a title not among the survivor's "
                    f"title/additional_titles, so it may be an unrelated record that collided. "
                    f"Worth a look; do not auto-recover."
                ),
            ))

    # E08: production 未 bump 而其内容与 draft 墓碑不同——一方出自陈旧快照
    # 比对之欄取「知识栏」：promote 是深拷贝，除 id 与升格印记外本该逐字相同。
    _SKIP = {'id', 'updated_at', 'revision', 'revised_at', '_promoted_to',
             '_promoted_at', 'promoted_to', 'promoted_at', 'merged_from',
             '_has_text', '_has_image', '_has_collated', '_path'}
    e08_hits: List[Tuple[str, str, str]] = []
    for draft_id, rec in sorted(records.items()):
        prod_path = id_paths.get(rec.production_id)
        draft_path = id_paths.get(draft_id)
        if prod_path is None or draft_path is None:
            continue                      # E01／E02 已另报
        pd = _read_json(prod_path)
        dd = _read_json(draft_path)
        if not pd or not dd:
            continue
        if pd.get('revision') not in (None, '1.0.0'):
            continue                      # 升格后改过 production，二者本该不同
        # 只比**兩側俱有**之欄。墓碑經 `stub-tombstones.py` 精簡者只剩
        # {id,type,title,promoted_to,promoted_at} 五欄，那是有意為之
        # （production 才是 canonical），若比聯集則每條 stub 都報，噪不可用。
        keys = (set(pd) & set(dd)) - _SKIP
        diff = []
        for k in sorted(keys):
            if pd.get(k) is None and dd.get(k) is None:
                continue
            a = json.dumps(_drop_nulls(pd.get(k)), sort_keys=True, ensure_ascii=False)
            b = json.dumps(_drop_nulls(dd.get(k)), sort_keys=True, ensure_ascii=False)
            if a == b:
                continue
            # 墓碑之引用仍是 draft id，而 production 之引用已由 sweep-promoted-refs
            # 改寫為 production id——這一路之不同是**應然**，不是陳舊快照。
            # 故比對前先把墓碑側之 draft id 一律換成其 production id。
            b2 = _DRAFT_REF_RE.sub(
                lambda m: '"%s"' % (records[m.group(1)].production_id
                                    if m.group(1) in records else m.group(1)), b)
            if a != b2:
                diff.append(k)
        if not diff:
            continue
        e08_hits.append((draft_id, rec.production_id, ', '.join(diff)))

    # 聚為一則。逐條報則一千餘行，把別的驗全埋了——此驗之用在「有多少、哪幾欄」，
    # 逐條之明細由 --json 或另跑腳本取。
    if e08_hits:
        by_field: Dict[str, int] = {}
        for _, _, f in e08_hits:
            by_field[f] = by_field.get(f, 0) + 1
        top = sorted(by_field.items(), key=lambda x: -x[1])[:6]
        eg = '; '.join(f'{d}→{p} ({f})' for d, p, f in e08_hits[:3])
        issues.append(PromotionIssue(
            severity="warning", code="E08",
            draft_id=e08_hits[0][0], production_id=e08_hits[0][1],
            path=None,
            message=(
                f"{len(e08_hits)} production entries are still at revision 1.0.0 "
                f"(never edited since promotion) yet differ from their draft tombstones. "
                f"Top differing field-sets: "
                + '; '.join(f'{f} ×{n}' for f, n in top)
                + f". Examples: {eg}. One side was written from a stale snapshot "
                f"(or the tombstone was edited after promotion and production never followed). "
                f"CAVEAT: while another lane's promotion is half-landed — its production files "
                f"pushed but its promotions.json not yet — every reference it rewrote reads as a "
                f"diff here, because this map cannot resolve those draft-ids. Re-run after that "
                f"lane pushes before acting on the count. "
                f"See known-issues/升格用陳舊快照-20260825.md."
            ),
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
            promoted_to = read_promoted_to(data)
            if not promoted_to:
                continue
            if has_legacy_promotion_keys(data):
                issues.append(PromotionIssue(
                    severity="warning", code="E06",
                    draft_id=data.get("id", ""), production_id=promoted_to,
                    path=str(json_file),
                    message=(
                        f"Tombstone {data.get('id', '')} still uses un-prefixed "
                        f"promoted_to/promoted_at; derived fields take the `_` prefix "
                        f"(SCHEMA.md §記錄之共通欄位)"
                    ),
                ))
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
        # 跳過每個 tombstone 自己。檔名之式為 `<id>-<題>.json`（見 ITEM_FILE_RE），
        # 故由檔名取 id 即可判，與舊法（逐 id 呼 find_file_by_id 再比 resolve()）
        # 同效——find_file_by_id 本就是照這個檔名約定反查的。舊法為 11,106 次
        # 目錄 glob ＋ 十萬次 Path.resolve()，二者皆是系統呼叫大戶。
        for root in (storage.draft_root, storage.official_root):
            is_draft = (root == storage.draft_root)
            for subdir in _CONTENT_SUBDIRS:
                sub = root / subdir
                if not sub.exists():
                    continue
                for json_file in sub.rglob("*.json"):
                    if is_draft and json_file.name.split("-", 1)[0] in promoted_ids:
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


# 溯源栏：其值**本来就该是 draft id**，记的是「这条著录当初出自哪个 draft 记录」，
# 不是活引用，从不被解引用。promote 把记录整份拷到 production 时它照抄过去，
# 于是 E04 把它当裸引用报出来——2026-08-23《潛夫論》即此例（merged_from 指向自己
# 升格前的 draft id）。把它改写成 P 会毁掉审计线索：那次合并确实发生在 draft。
# 故扫描前先剔除这类键值对。
def _read_json(path: Optional[Path]) -> dict:
    """讀一個 JSON，讀不著就給空 dict——E07 的判據取自 production 檔，
    檔缺者 E01 已另有一報，此處不重複作聲。"""
    if path is None:
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _drop_nulls(v):
    """去 null 欄——`strip_nulls` 於落盤時已去之，兩側之有無不算差異。"""
    if isinstance(v, dict):
        return {k: _drop_nulls(x) for k, x in v.items() if x is not None}
    if isinstance(v, list):
        return [_drop_nulls(x) for x in v]
    return v


def _merge_marks(data: dict) -> bool:
    """此條是否帶並條之痕。頂層 `merged_from`，或 indexed_by 之節上的同名欄。"""
    if data.get("merged_from"):
        return True
    for entry in data.get("indexed_by") or []:
        if isinstance(entry, dict) and entry.get("merged_from"):
            return True
    return False


def _name_set(data: dict) -> Set[str]:
    """一條之題集：Work/Book/Collection 取 title ＋ additional_titles，
    Entity 取 primary_name ＋ alt_names[].name。"""
    names: Set[str] = set()
    for k in ("title", "primary_name"):
        if data.get(k):
            names.add(data[k])
    for t in data.get("additional_titles") or []:
        if isinstance(t, str):
            names.add(t)
    for a in data.get("alt_names") or []:
        if isinstance(a, dict) and a.get("name"):
            names.add(a["name"])
        elif isinstance(a, str):
            names.add(a)
    return names


_PROVENANCE_KEYS = ("merged_from",)

# 「整個被引號包住的簡單 token」——JSON 之鍵、及不含空白標點之字串值。
_QUOTED_TOKEN_RE = re.compile(r'"([0-9A-Za-z_-]+)"')
# 引用之形：整個被引號包住的 base36 id。E08 比對前用它把墓碑側之 draft id
# 換成 production id——production 之引用已由 sweep-promoted-refs 改寫過。
_DRAFT_REF_RE = re.compile(r'"([0-9a-z]{10,13})"')


def _scan_naked_refs(content: str, promoted_ids: Set[str]) -> Set[str]:
    """在 JSON 内容字符串里找出所有 promoted draft-id 出现。

    用字符串包含判断（够用）：promoted-id 是 12-13 字符 base36，碰撞概率可忽略。
    返回命中的 draft-id 集合。

    溯源栏（`_PROVENANCE_KEYS`）先剔除——那些是历史记录不是活引用，见上。
    """
    for k in _PROVENANCE_KEYS:
        content = re.sub(r'"%s"\s*:\s*"[0-9a-z]{10,13}"' % k, '', content)
    # 一趟取出全文所有「整個被引號包住的簡單 token」，再與 promoted_ids 取交集。
    # 語義與舊法（逐 id 判 f'"{pid}"' in content）等價：pid 皆 base36，凡以
    # `"pid"` 之形出現者必是這樣一個 token；而交集保證只有真 pid 命中。
    # 舊法是 O(檔數 × id 數) 之子串搜——11,106 個 id × 十萬檔 ≈ 十一億次，
    # 實測全倉一驗跑逾半時而未竟。今改 O(檔數)。
    tokens = set(_QUOTED_TOKEN_RE.findall(content))
    return tokens & promoted_ids


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
