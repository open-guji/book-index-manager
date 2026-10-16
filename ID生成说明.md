# ID 是怎么生成的、脚本怎么用

本文说明古籍索引（Work / Book / Collection / Entity）的 ID 如何生成，以及怎样用命令行和 Python 生成 ID，**尤其是怎样指定机器码**。规范真源是 `book-index` 仓根目录的 `SCHEMA.md`「ID 类型编码」，代码在 `book_index_manager/id_generator.py`。

## 一、ID 的结构

ID 是 64 位整数（Snowflake 风格），再用 **base36**（`0-9a-z`，全小写，大小写不敏感安全）编码成字符串，如 `d59f2nfhf8cg`。

| 位 | 位数 | 含义 |
|---|---|---|
| 63 | 1 | 符号位，固定 0 |
| 62 | 1 | status：0 = 正式（Official），1 = 草稿（Draft） |
| 59–61 | 3 | 类型：0 = Book，2 = Collection，3 = Work，4 = Entity（1、5–7 预留） |
| 19–58 | 40 | 时间戳：草稿用**毫秒**，正式用**秒** |
| 8–18 | 11 | **机器码**（0–2047，共 2048 个节点） |
| 0–7 | 8 | 序号：同一时间单位内的第几个（0–255） |

要点：

- 草稿 ID 与正式 ID 的 status 位不同，升格（`promote`）时会**换一个新的正式 ID**，旧草稿 ID 变墓碑，对照写入 `promotions.json`。
- 正式 ID 的时间戳只到秒，所以同一秒内由不同进程、用同一机器码生成的 ID 会**完全相同**。这就是机器码存在的意义：不同节点用不同机器码，ID 永不相撞。
- 文件路径由 ID **末三位**字符分片：`{Type}/{c1}/{c2}/{c3}/{ID}-{名称}.json`，一律经 `storage.shard_dirs()` 推算，勿自拼。
- 旧 base58 ID（含大写字母）只保留解码兼容，`smart_decode` 自动识别。
- 同一生成器内，草稿与正式各自维护「上次时间戳＋序号」，两种状态交替生成也不会撞号；时钟回拨会直接报错拒绝生成。

## 二、机器码怎么定（重点）

### 1. 优先级（高到低）

1. 命令行参数 `--machine-id N`（0–2047）
2. 环境变量 `BOOK_INDEX_MACHINE_ID=N`
3. 配置文件（`--config` 指定）里 `[Storage]` 段的 `machine_id = N`
4. 都没给：自动**租约分配**——在 `<root>/.machine_ids.json` 里取当前无人持有的**最小号**，所以单人单机时实际就是 **0**

给了 1/2/3 任一种，就是**显式指定**：直接使用，不走租约，**唯一性由调用方自己保证**。

### 2. 两个人（或两台机器）各自生成 ID

约定好号段，各用各的，例如：

- 用户甲：不指定，或 `--machine-id 0`
- 用户乙：`--machine-id 1`，或在 shell 里 `export BOOK_INDEX_MACHINE_ID=1`

这样即使两人在同一秒生成了同类型 ID，机器码位不同，结果也不同。租约登记表 `.machine_ids.json` 只存在本机的 workspace 目录里，**管不到别的机器**，所以跨机器必须靠显式不同的机器码。

### 3. 同一台机器的多进程

不要给多个并发进程手动指定同一个号。不指定机器码时，每个进程会向登记表租到互不相同的号（带文件锁、6 小时 TTL、释放后 3 秒冷却），可放心并发。这是 2026-08-24 隋唐升格撞号 9 组、2026-09-04 三个 entity 被覆盖之后加的保护，细节见 `book_index_manager/machine_id.py` 开头的说明。

### 4. 一个注意事项（2026-10-16 改动）

此前命令行里有一处写死：带 `--root` 时机器码固定为 **1**，不走租约。本次改为：不指定则租约分配（通常 0），要用 1 请显式写 `--machine-id 1`。已有 ID 不受影响，机器码是写进 ID 里的，不会回改。

## 三、命令行用法

安装后命令是 `book-index`（或 `python -m book_index_manager`）。所有子命令都支持下列公共参数：

| 参数 | 说明 |
|---|---|
| `--root PATH` | workspace **父目录**（如 `D:/workspace`），不是某个仓；也可设环境变量 `BOOK_INDEX_STORAGE_ROOT` |
| `--machine-id N` | 机器码 0–2047，见上节 |
| `--config FILE` | 配置文件路径 |
| `--debug` | 调试日志 |

### 生成 ID（不写文件）

```bash
# 默认：草稿、Book 类型
book-index gen-id --root /d/workspace

# 指定类型与状态，只输出 ID 本身（脚本里常用）
book-index gen-id --root /d/workspace --type work --status draft --raw

# 正式 ID
book-index gen-id --root /d/workspace --type entity --status official --raw

# 指定机器码 1（另一个用户这么用）
book-index gen-id --root /d/workspace --type work --machine-id 1 --raw

# 用环境变量指定
BOOK_INDEX_MACHINE_ID=1 book-index gen-id --root /d/workspace --type book --raw
```

`--type` 取 `book / work / collection / entity`；`--status` 取 `draft（默认） / official`。

### 解码 ID（看机器码、时间、类型）

```bash
book-index parse-id --root /d/workspace d59f2nfhf8cg
```

输出 Status、Type、创建时间、Machine ID、Sequence，方便核对「这个 ID 是谁生成的」。

### 生成并落盘

```bash
# 建草稿：生成 ID 并写最小 metadata
book-index draft "史記" --type work --root /d/workspace --machine-id 1

# 写入完整 metadata（没有 id 时自动生成；含中文的 JSON 建议走 Python API）
book-index save '{"title":"史記","type":"work"}' --root /d/workspace

# 草稿升格为正式：为每条生成新的正式 ID（用到机器码），写墓碑和 promotions.json
book-index promote <草稿ID> [<草稿ID> ...] --root /d/workspace --machine-id 1
book-index promote --batch ids.txt --dry-run --root /d/workspace
```

升格 `promote` 会批量生成正式 ID，**多人并行升格时务必各用不同机器码**，否则同一秒撞号会覆盖对方的条目。

### 其他常用命令

```bash
book-index get --bid <ID> --root ...          # 读条目
book-index reindex --target draft --root ...  # 完整重建索引
book-index shadow-reindex --root ...          # 增量补索引
book-index check-index --root ...             # 检查每个条目都有索引
book-index validate-promotions --root ...     # 校验 promotions.json 与墓碑
```

完整列表见 `book-index --help`。

## 四、Python 用法

```python
from book_index_manager import BookIndexManager, BookIndexType, BookIndexStatus

# 不指定机器码：租约分配（通常 0），进程退出自动归还
mgr = BookIndexManager("/d/workspace")

# 显式指定机器码 1（唯一性自负）
mgr = BookIndexManager("/d/workspace", machine_id=1)

id_val = mgr.generate_id(BookIndexType.Work, BookIndexStatus.Draft)
id_str = mgr.encode_id(id_val)          # base36 字符串
```

只想用生成器本身（不碰存储）：

```python
from book_index_manager.id_generator import BookIndexIdGenerator, BookIndexType, BookIndexStatus, base36_encode

gen = BookIndexIdGenerator(machine_id=1)
id_str = base36_encode(gen.next_id(BookIndexStatus.Draft, BookIndexType.Work))

comp = BookIndexIdGenerator.parse(id_val)   # → status / type / timestamp / machine_id / sequence
```

TypeScript 端（`ui/src/core/id-generator.ts`）的 `IdGenerator(machineId)` 位布局相同，`BookIndexManager` 的默认机器码目前仍是 1，需要时在构造函数里显式传入。

## 五、常见坑

- 同一个机器码**不要**同时给两个并发进程或两个人用，正式 ID 精度只到秒，撞号后后写入者会覆盖先写入者的文件。
- `--root` 要指 workspace 父目录，传成某个仓会静默报 Item not found。
- 用 `--machine-id` 显式指定后，登记表里不会留记录，换了机器或换了人时，请自己维护「谁用几号」的约定，建议记在团队文档里。
- 机器码范围 0–2047，超出会直接报错。
