"""跨進程唯一之 machine_id 分配。

## 為何需要

ID 之佈局中 machine_id 佔 11 位（0..2047），本意是區分不同節點。
舊制以 `machine_id=1` 硬編碼，於單進程無礙；一旦多進程並發生成 id 即出事：

- official 之時間戳是**秒**級（見 id_generator._get_current_timestamp）
- sequence 只存在於進程內存，跨進程不共享
- 於是同一秒內、兩個進程、同一 status/type，生成之 id **完全相同**

而 storage.save_item 撞號後之處置是「title 不同 → 視為改名 → unlink 舊檔」，
遂把先寫入者之檔案**靜默刪除**，僅留一行 warning。

2026-08-24 隋唐升格曾中此禍（撞號九組十八條）；當時之修只解了單進程內
draft/official 交替之撞號，未解跨進程。2026-09-04「坑32」修復專項再中，
三個 entity 被覆蓋（王冉→張闓、夏侯靖→盧元明、王敬→陳蟠隱）。

## 本模組之解法

以**檔案鎖保護之租約登記表**分配 machine_id：

- 登記表存於 `<storage_root>/.machine_ids.json`（storage_root 為 book-index 之父目錄）
- 申請時取鎖、掃描表中各號之租約，跳過仍存活者，取最小空閒號，寫入 pid + 時間戳
- 租約有 TTL（預設 6 小時）。逾期未續、或 pid 已不存在者，視為可回收
- 進程結束時（atexit）釋放自己那號

如此，**同一時刻兩個進程不會拿到同一個號**；號可回收復用，但不會被同時持有。

若顯式指定（`BOOK_INDEX_MACHINE_ID` 環境變數或建構參數），則直接用之、不走分配，
由調用方自負唯一性之責。
"""

from __future__ import annotations

import atexit
import json
import os
import time
from pathlib import Path
from typing import Optional

MAX_MACHINE_ID = 2047
LEASE_TTL_SECONDS = 6 * 3600
REGISTRY_NAME = ".machine_ids.json"

# 號釋放後之冷卻期（秒）。
#
# 何以需要：official id 之時間戳只到**秒**。若進程A剛釋放號 n 便由進程B取得，
# 而A在退出前最後一刻、B在啟動後第一刻恰落在同一秒內，兩者生成之 id 仍會相同
# ——號雖未被同時持有，跨越交接的那一秒依舊撞。
# 故釋放時記下時刻，冷卻期內不再發此號。冷卻期須大於 official 之時間粒度（1 秒），
# 取 3 秒以容時鐘抖動。
RELEASE_COOLDOWN_SECONDS = 3


class _FileLock:
    """跨平台之排他檔案鎖（標準庫實作，無第三方依賴）。"""

    def __init__(self, path: Path, timeout: float = 10.0):
        self.path = path
        self.timeout = timeout
        self._fh = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.time() + self.timeout
        while True:
            try:
                self._fh = open(self.path, "a+b")
                self._acquire(self._fh)
                return self
            except OSError:
                if self._fh is not None:
                    try:
                        self._fh.close()
                    except Exception:
                        pass
                    self._fh = None
                if time.time() >= deadline:
                    raise TimeoutError(f"Timed out acquiring lock: {self.path}")
                time.sleep(0.05)

    def __exit__(self, exc_type, exc, tb):
        if self._fh is not None:
            try:
                self._release(self._fh)
            finally:
                self._fh.close()
                self._fh = None
        return False

    @staticmethod
    def _acquire(fh):
        if os.name == "nt":
            import msvcrt

            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    @staticmethod
    def _release(fh):
        if os.name == "nt":
            import msvcrt

            fh.seek(0)
            try:
                msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
        else:
            import fcntl

            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def _pid_alive(pid: int) -> bool:
    """判斷 pid 是否尚存。判不準時一律當作「存活」，寧可少回收，不可誤搶。"""
    if pid <= 0:
        return False
    try:
        if os.name == "nt":
            import ctypes

            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            STILL_ACTIVE = 259
            handle = ctypes.windll.kernel32.OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION, False, pid
            )
            if not handle:
                return False
            try:
                code = ctypes.c_ulong()
                if ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
                    return code.value == STILL_ACTIVE
                return True
            finally:
                ctypes.windll.kernel32.CloseHandle(handle)
        else:
            os.kill(pid, 0)
            return True
    except PermissionError:
        # 存在但無權查詢
        return True
    except OSError:
        return False
    except Exception:
        return True


class MachineIdLease:
    """一個已分配之 machine_id 租約。進程退出時自動釋放。"""

    def __init__(self, registry_path: Path, machine_id: int):
        self.registry_path = registry_path
        self.machine_id = machine_id
        self._released = False

    def release(self) -> None:
        if self._released:
            return
        self._released = True
        lock_path = self.registry_path.with_suffix(self.registry_path.suffix + ".lock")
        try:
            with _FileLock(lock_path):
                data = _read_registry(self.registry_path)
                rec = data.get(str(self.machine_id))
                # 只釋放自己持有的那份，避免誤刪他人重新申得之同號。
                # 不逕行刪除，改記 released_at：號進入冷卻期，
                # 冷卻期滿方可再發（見 RELEASE_COOLDOWN_SECONDS 之說明）。
                if rec and rec.get("pid") == os.getpid():
                    data[str(self.machine_id)] = {"released_at": int(time.time())}
                    _write_registry(self.registry_path, data)
        except Exception:
            # 釋放失敗不應影響主流程；租約會因 TTL/pid 檢查被回收
            pass

    def heartbeat(self) -> None:
        """續租。長時間運行之進程可週期調用，免得租約逾期被他人回收。"""
        if self._released:
            return
        lock_path = self.registry_path.with_suffix(self.registry_path.suffix + ".lock")
        try:
            with _FileLock(lock_path):
                data = _read_registry(self.registry_path)
                rec = data.get(str(self.machine_id))
                if rec and rec.get("pid") == os.getpid():
                    rec["ts"] = int(time.time())
                    _write_registry(self.registry_path, data)
        except Exception:
            pass


def _read_registry(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_registry(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


def _is_free(rec: dict, now: int) -> bool:
    """此號當下是否可再分配。

    三種記錄：
    - 活躍租約 {pid, ts}：pid 尚存且未逾 TTL → 不可分配
    - 冷卻墓碑 {released_at}：距釋放未滿冷卻期 → 不可分配；滿了 → 可
    - 其餘（格式異常）→ 保守起見視為佔用
    """
    if "released_at" in rec:
        try:
            return now - int(rec["released_at"]) >= RELEASE_COOLDOWN_SECONDS
        except Exception:
            return True

    if "pid" not in rec:
        return False

    try:
        ts = int(rec.get("ts", 0))
    except Exception:
        ts = 0
    if now - ts > LEASE_TTL_SECONDS:
        return True
    pid = rec.get("pid")
    if isinstance(pid, int) and not _pid_alive(pid):
        # 進程已死：其最後一個 id 也可能落在本秒，同樣需冷卻
        return now - ts >= RELEASE_COOLDOWN_SECONDS
    return False


def acquire_machine_id(storage_root: str | os.PathLike,
                       explicit: Optional[int] = None) -> tuple[int, Optional[MachineIdLease]]:
    """取得本進程可用之 machine_id。

    Args:
        storage_root: 存儲根目錄（登記表置於其下）
        explicit: 顯式指定之號。給了就直接用，不走分配（唯一性由調用方自負）

    Returns:
        (machine_id, lease)。explicit 時 lease 為 None。
    """
    if explicit is not None:
        if not (0 <= explicit <= MAX_MACHINE_ID):
            raise ValueError(f"Machine ID must be between 0 and {MAX_MACHINE_ID}")
        return explicit, None

    root = Path(storage_root)
    registry_path = root / REGISTRY_NAME
    lock_path = registry_path.with_suffix(registry_path.suffix + ".lock")

    with _FileLock(lock_path):
        data = _read_registry(registry_path)
        now = int(time.time())

        # 清掉已可再分配之記錄（過期租約、冷卻期滿之墓碑）
        for key in [k for k, v in data.items() if isinstance(v, dict) and _is_free(v, now)]:
            data.pop(key, None)

        taken = set()
        for k in data:
            try:
                taken.add(int(k))
            except ValueError:
                continue

        chosen = None
        for candidate in range(MAX_MACHINE_ID + 1):
            if candidate not in taken:
                chosen = candidate
                break
        if chosen is None:
            raise RuntimeError(
                f"No free machine_id available: all {MAX_MACHINE_ID + 1} are held or "
                f"cooling down. Registry: {registry_path}"
            )

        data[str(chosen)] = {"pid": os.getpid(), "ts": now}
        _write_registry(registry_path, data)

    lease = MachineIdLease(registry_path, chosen)
    atexit.register(lease.release)
    return chosen, lease
