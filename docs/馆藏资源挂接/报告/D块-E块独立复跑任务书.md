# D 块匹配引擎 · E 块独立复跑任务书

> 写：Everett　｜　复跑人：Sol（与写入端分离）　｜　结果交 Silas，抄 Marlowe　｜　2026-10-13 06:50（洛杉矶）
> 目的：用 README 的步骤在另一台机器上从零跑一遍，证明引擎结果可复现（`matches.tsv` 去版本列后指纹一致）。**只读，不写 book-index／draft，不抓站。**

## 一、输入（全部钉死版本）
| 项 | 值 |
|---|---|
| 引擎 | overview main，目录 `scripts/馆藏资源挂接/match_engine/`，**commit `eb3ea351` 及以后**（只要 match_engine 目录无改动即可） |
| Work 库 | open-guji/book-index @ **`7e7247c8fa`**（131,696 个 Work） |
| 各源数据 | open-guji/book_index_json @ **`f36a4ab`** 的 `library_data/` |
| 朝代键表 | 在 book-index 该 commit 下 `python3 build/build_derived.py --root . --text-index <空目录> --out <DIR>`，取 `<DIR>/dynasty_reign_keys.json`，sha256 须以 **`9726ab13417d`** 开头；`export DYNASTY_KEYS=<该文件>` |
| 排除名单 | `--overview-root` 指向 overview 工作树（`先后规则.md`／R2·R3·R7 数据）。**该列 `excluded` 随 overview 内容变，不进指纹之外的验收；见下** |
| 环境 | Python 3.10+，`pip install opencc-python-reimplemented pytest`；每源约 1 分钟，<8 GB |

## 二、步骤
（测试里的 book-index 基线路径用环境变量 `BOOK_INDEX_ROOT` 指定，默认 /home/user/bi-7e72；未设且路径不存在则该用例跳过）
```
(cd scripts/馆藏资源挂接 && python3 -m pytest -q match_engine/tests)   # 192 passed
cd scripts/馆藏资源挂接/match_engine
for s in nlc kokusho ndl; do
  python3 engine.py --source $s --works-root <book-index@7e7247c8fa> \
     --data-root <book_index_json>/library_data --overview-root <overview> \
     --out OUT/$s --emit-write-plan
  python3 matches_digest.py OUT/$s/matches.tsv
  python3 plancheck.py --source $s --works-root <book-index> --dir OUT/$s
done
```

## 三、验收阈值
1. **指纹一致**（`matches_digest.py` 输出：行数 指纹）：
   - nlc `25574  46e26e0f75ba37ad`
   - kokusho `15126  8d6700c860fa66e0`
   - ndl `3232  197cb61e324a1965`
   指纹含 `excluded` 列，所以复跑时 overview `--overview-root` 须是固定在引擎提交 `a1be6aba` 的 overview 检出（nlc／kokusho／ndl 指纹 2026-10-13 更正，nlc 旧值 c2eaee00… 同样算于旧 overview 树：旧值 6ac5f63e…／aac32dd4… 算于未 pull 的旧 overview 树）；若 overview 已推进导致仅 `excluded` 列不同，按第 2 条判。
2. 指纹不一致时看**一致率**：除 `engine_version`、`excluded` 外各列逐行比，一致率 ≥ **90%** 视为通过但须列出差异行类别；档位数（确定／存疑／无）应与下表完全相同：
   - nlc 10909／7081／7584　kokusho 4115／5597／5414　ndl 625／909／1698
3. 写入计划：`stats.json` 的 write_plan／cap_dropped：nlc 54／22、kokusho 28／14、ndl 518／20（初版误写 526，是排除名单 R2 更新前的旧数；2026-10-13 更正）；`plancheck.json` 里 item 错误 0、超 3 藏本的 Work 0。
4. **未知 >40% 即停**：若 `无` 档比例超过 40%（参考值 nlc 29.7%、kokusho 35.8%、ndl 52.5%——ndl 本来偏高，以相对参考值上浮 10 个百分点为线）立即停并报，大概率是输入版本错了（Work 库或 library_data 取错）。

## 四、已知的非问题
- `engine_version` 列含运行时工作树哈希，每台机器不同，已在指纹中剔除。
- 本次复跑发现并修了一处不确定性：近似题名并列候选原按集合顺序取，已改为按 Work id 定序（`eb3ea351`）；在此之前的版本同一行可能在两次运行间不同。

## 四·补　2026-10-13 SUPPLEMENT 规则（Silas 抽检 kokusho 300092672）
引擎 commit 见 #583/ai-team#4 说明（新增 `SUPPLEMENT` 降级码）：记录自身题名带续／補遗／拾遺／後集等标记而 Work 题名无 → 降存疑。上方指纹、档位、写入计划数、测试数（192）已按新版更新；nlc 不变，kokusho 确定 −11（4115）、写入计划 29→28，ndl 档位不变（指纹变因部分存疑行多了 SUPPLEMENT 码）。**Sol 之前的复跑对应旧版，需用新版重跑 kokusho／ndl 的指纹核对。**

## 五、交付
在 #583 评论一条：三源指纹／档位数／plancheck 结果＋是否通过；差异另贴 `项目进展/馆藏资源挂接/计划/` 下一个小表。通过后 Everett 把 `排班.md` 的 D 行改「已释放」。
