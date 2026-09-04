# -*- coding: utf-8 -*-
"""machine_id 租約分配 與 撞號防護 之測試。

背景：official id 之時間戳僅到秒、sequence 只在進程內存，
若兩進程共用 machine_id 則同一秒內生成之 id 完全相同，
而舊 save_item 撞號後會 unlink 別人的檔（僅一行 warning）。
2026-08-24、2026-09-04 兩度因此靜默丟檔。
"""
import json

import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from book_index_manager.machine_id import (  # noqa: E402
    acquire_machine_id,
    _FileLock,
    _read_registry,
)
from book_index_manager.manager import BookIndexManager  # noqa: E402
from book_index_manager.id_generator import BookIndexType, BookIndexStatus  # noqa: E402
from book_index_manager.exceptions import StorageError  # noqa: E402


def test_acquire_gives_distinct_ids_within_process():
    """同一進程內連取兩個號，必不相同（前一個未釋放時）。"""
    with tempfile.TemporaryDirectory() as td:
        a, lease_a = acquire_machine_id(td)
        b, lease_b = acquire_machine_id(td)
        assert a != b, "两次分配拿到了同一个 machine_id"
        lease_a.release()
        lease_b.release()


def test_released_id_enters_cooldown_not_immediately_reused():
    """釋放後之號進入冷卻期，不得立刻再發。

    official id 之時間戳只到秒，若前任剛釋放、後任立刻取得同號，
    交接的那一秒內兩者生成之 id 仍會相同。
    """
    with tempfile.TemporaryDirectory() as td:
        a, lease_a = acquire_machine_id(td)
        lease_a.release()
        b, lease_b = acquire_machine_id(td)
        assert b != a, "刚释放的号在冷却期内不应被立刻复用"
        lease_b.release()


def test_released_id_reusable_after_cooldown(monkeypatch):
    """冷卻期滿後，號可回收復用（號池不會枯竭）。"""
    import book_index_manager.machine_id as m

    with tempfile.TemporaryDirectory() as td:
        a, lease_a = acquire_machine_id(td)
        lease_a.release()
        # 讓時間「前進」到冷卻期之後
        real_time = m.time.time
        monkeypatch.setattr(
            m.time, "time",
            lambda: real_time() + m.RELEASE_COOLDOWN_SECONDS + 1,
        )
        b, lease_b = acquire_machine_id(td)
        assert b == a, "冷却期满后应能回收复用"
        lease_b.release()


def test_explicit_id_bypasses_registry():
    """顯式指定時直接採用，不寫登記表。"""
    with tempfile.TemporaryDirectory() as td:
        mid, lease = acquire_machine_id(td, explicit=209)
        assert mid == 209
        assert lease is None
        assert not (Path(td) / ".machine_ids.json").exists()


def test_explicit_id_range_validated():
    with tempfile.TemporaryDirectory() as td:
        with pytest.raises(ValueError):
            acquire_machine_id(td, explicit=2048)
        with pytest.raises(ValueError):
            acquire_machine_id(td, explicit=-1)


def test_registry_records_pid():
    with tempfile.TemporaryDirectory() as td:
        mid, lease = acquire_machine_id(td)
        data = _read_registry(Path(td) / ".machine_ids.json")
        assert str(mid) in data
        assert data[str(mid)]["pid"] == os.getpid()
        lease.release()
        # 釋放後留下冷卻墓碑（非直接刪除），以防同秒交接撞號
        after = _read_registry(Path(td) / ".machine_ids.json")
        assert "released_at" in after[str(mid)]
        assert "pid" not in after[str(mid)]


_CHILD_SRC = r"""
import sys, json
sys.path.insert(0, {pkg_root!r})
from book_index_manager.machine_id import acquire_machine_id
mid, lease = acquire_machine_id({td!r})
# 打印自己拿到的号，然后等 stdin 收到放行信号才退出（退出即释放租约）
print(json.dumps({{"machine_id": mid}}), flush=True)
sys.stdin.readline()
"""


def test_two_processes_never_share_id():
    """核心用例：兩個進程**同時持有**的號必不相同。

    用真子進程（subprocess）而非 multiprocessing，免受 pytest 下
    spawn 重導入之擾——這個保證太重要，測試不能時靈時不靈。
    """
    import subprocess

    pkg_root = str(Path(__file__).resolve().parents[1])
    with tempfile.TemporaryDirectory() as td:
        procs = []
        try:
            for _ in range(2):
                src = _CHILD_SRC.format(pkg_root=pkg_root, td=td)
                p = subprocess.Popen(
                    [sys.executable, "-c", src],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    text=True, encoding="utf-8",
                )
                procs.append(p)

            ids = []
            for p in procs:
                line = p.stdout.readline()
                assert line, "子进程未能启动或未输出 machine_id"
                ids.append(json.loads(line)["machine_id"])

            # 两个子进程此刻都还持有各自的租约
            assert ids[0] != ids[1], f"两个进程拿到了同一个 machine_id: {ids}"
        finally:
            for p in procs:
                try:
                    p.stdin.write("go\n")
                    p.stdin.flush()
                except Exception:
                    pass
                try:
                    p.wait(timeout=30)
                except Exception:
                    p.kill()


def test_file_lock_is_exclusive():
    with tempfile.TemporaryDirectory() as td:
        lock_path = Path(td) / "x.lock"
        with _FileLock(lock_path):
            with pytest.raises(TimeoutError):
                with _FileLock(lock_path, timeout=0.3):
                    pass


# --- 撞號防護 ---

def _make_manager(root):
    (Path(root) / "book-index").mkdir(parents=True, exist_ok=True)
    return BookIndexManager(root)


def test_collision_on_new_id_raises_not_overwrite():
    """新生成之 id 若已有檔，必須報錯，且不得刪除既有檔。"""
    with tempfile.TemporaryDirectory() as td:
        mgr = _make_manager(td)
        p1 = mgr.save_item({"type": "entity", "subtype": "people", "primary_name": "甲"},
                           type_val=BookIndexType.Entity,
                           status=BookIndexStatus.Official, bump=None)
        victim_id = json.loads(p1.read_text(encoding="utf-8"))["id"]
        assert p1.exists()

        # 偽造撞號：讓下一個新 id 恰好等於已存在的那個
        mgr.id_gen.next_id = lambda status, type_val: mgr.decode_id(victim_id)

        with pytest.raises(StorageError, match="ID collision"):
            mgr.save_item({"type": "entity", "subtype": "people", "primary_name": "乙"},
                          type_val=BookIndexType.Entity,
                          status=BookIndexStatus.Official, bump=None)

        # 原檔必須still在，且內容未被改成「乙」
        assert p1.exists(), "撞号时原文件被删除了"
        assert json.loads(p1.read_text(encoding="utf-8"))["primary_name"] == "甲"


def test_rename_still_works_for_existing_id():
    """既有條目改名（調用方帶 id）不受影響，仍走正常改名路徑。"""
    with tempfile.TemporaryDirectory() as td:
        mgr = _make_manager(td)
        p1 = mgr.save_item({"type": "entity", "subtype": "people", "primary_name": "原名"},
                           type_val=BookIndexType.Entity,
                           status=BookIndexStatus.Official, bump=None)
        eid = json.loads(p1.read_text(encoding="utf-8"))["id"]

        meta = json.loads(p1.read_text(encoding="utf-8"))
        meta["primary_name"] = "新名"
        p2 = mgr.save_item(meta, type_val=BookIndexType.Entity,
                           status=BookIndexStatus.Official, bump=None)

        assert json.loads(p2.read_text(encoding="utf-8"))["primary_name"] == "新名"
        assert json.loads(p2.read_text(encoding="utf-8"))["id"] == eid
        assert not p1.exists() or p1.resolve() == p2.resolve()
