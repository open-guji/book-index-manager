# C3 PR 清单

> 块 C3（宋至清）｜Sloane｜2026-10-12 洛杉矶｜账本 `verdicts-C3.jsonl` 618 行（adopt 6／reject 39／open 573），`verdict_check.py` 0 错

## 正式库 book-index
| PR | 内容 | 状态 |
|---|---|---|
| open-guji/book-index#168 | 西夏 3 条 reign 区间修正：天賜禮盛國慶 起 1070→1069；天安禮定 止 1089→1086；天儀治平 1090–1093→1087–1090（description.text、basis 同步）；大安经评审撤回 | 已合（7e7247c8） |

## 白名单（史载例外）
至元（hixi1ubppfs1）、中統（hixi1ubppfrz）、顯道（hixi1ubp2yo4）三条已由 C1 PR 合入 `check_v2_allow.txt`，C3 不另带。

## 草稿库
不改（未标记遗留副本，与正式库同内容）。

## 遗留
- 天儀治平起年：zhwp 1087／DILA 1086-09，标「单源，待补」。
- 《宋史·夏國傳》引文为 Wikisource 转录，Sylvie 已核页面原文无不符（#580），仍非纸本。
- 合并后 Edwin 跑 `regen_keys.sh`。
- 573 条 open 的主因见 #580 评论：单源 220、转块 E 171、单源口径差约 106、异体 56、重名 17、库有源无 4。
