# 全朝帝王重出扫描（Soren，2026-10-14 洛杉矶；只报不改）

- 输入：`origin/main`（b500a75d3f，含 #376／#378）`index/entities` 全部 people 条（36,366，剔除已有 `merged_into` 墓碑）；需求单 323 名。
- 方法（廟號／本名／alt_names 三路）：①凡 primary_name 为「廟號／謚號／帝号」形态的条目（以「X祖／X宗／X帝／皇帝／主」收尾，共 275 条候选，人工剔除「何宗、周宗」类普通人名后余 38 条真帝王称谓条）；②逐条按史实对应到该帝的本名条；③查对应本名条是否存在、有无 CBDB／生卒、称谓条挂了几部 Work。清代 9 帝已在 `清帝重出核查-Soren.md` 单独处理，此处不重复。
- 局限：对应关系靠史实判断，非机器唯一匹配；alt_names 在批 A/B/C 新建条里很少写廟號（多数为空），所以仅靠 alt_names 查不到，必须以称谓名扫。已知漏网风险：称谓条用了生僻写法（如「粱元帝」）或带前缀碎片的，本次未穷尽。

## 一、高置信：称谓条＝需求单已建的本名条（建议并）
| 称谓条 id | 称谓名 | Work | 对应本名条 id | 本名条朝代／生卒／CBDB | 建议 |
|---|---|---|---|---|---|
| hixhd2h9biu8 | 周武帝 | 2 | hixhd2h9bv3r 宇文邕 | 北周／542／31773 | 并，keeper＝周武帝（廟號为称）或宇文邕，请 Mirren 定口径；补 dynasty |
| hixhd2h9bpo1 | 唐文宗 | 1 | hixi5v85erk0 李昂 | 唐／808／189272 | 已由 Mirren 定：keeper＝唐文宗（已纳入 Elias 批） |
| hixhd2h9bufr | 隋高祖 | 1 | hixi4watiiqc 楊堅 | 隋／—／— | 并，补 dynasty（隋高祖条无朝代） |
| hixhjac0jksh | 齊武帝 | 1 | hixhjht6jfnk 蕭賾 | 南朝齊／440／34005 | 并，补 dynasty |
| hixhd2h9bl2k | 遼道宗 | 1 | hixi4watiipw 耶律洪基 | 遼 | 并 |
| hixhjhthgqo2 | 太武帝（北魏） | 1 | hixi4wwpzygl 拓跋燾 | 北魏／31007 | 并 |
| hixhjhtkl43k | 孝文帝（北魏） | 1 | hixi4wwpzygp 拓跋宏 | 北魏 | 并 |
| hixhjhatet50 | 明元帝（北魏） | 1 | hixi4wwpzygk 拓跋嗣 | 北魏／31006 | 并 |
| hixhjhthgqo1 | 道武帝（北魏） | 1 | hixi4wwpzygj 拓跋珪 | 北魏／371／31005 | 并 |
| hixhjtcxe1hc | 晋明帝 | 1 | hixhd2h9bpbr 司馬紹 | 晉／299／30903 | 并（同批另有 hixhjxro6qki「明帝」晉，也是司馬紹，并入同 keeper） |
| hixhjxro6qki | 明帝（晉，无前缀） | 1 | hixhd2h9bpbr 司馬紹 | 同上 | 并；「明帝」无前缀，须看 Work 确认是晉明帝 |
| hixhjtd5tg5c | 晋哀帝 | 1 | hixhjtdhzpc0 司馬丕 | 晉／30908 | 并 |
| hixhgyrw4vy6 | 成宗（无朝代） | 1 | hixi4wwpzyfe 鐵穆耳 | 元／134481 | 并前须核 Work 的朝代：「成宗」可为元成宗，但也可能是別朝，待核 |

## 二、高置信：称谓条＝库内早有的本名条（非需求单，早期已建）
| 称谓条 id | 称谓名 | Work | 对应本名条 id | 本名条朝代／生卒／CBDB | 建议 |
|---|---|---|---|---|---|
| hixhd2h9bqtw、hixhgyrw4w1c、hixho5puw1g5 | 明 太祖（名带空格）、明太祖×2 | 0／1／0 | hixhd2h9bgd5 朱元璋 | 明／1328／30148 | 并（3 条称谓条重出本身也是重复）；其中两条 0 Work |
| hixhd2h9bqtx | 明仁宗 | 1 | hixhd2h9bgd3 朱高熾 | 明／1378／30152 | 并 |
| hixhgyrw4w1d、hixhd2h9bjv8 | 明宣宗、宣宗皇帝 | 2／6 | hixhd2h9bgh5 朱瞻基 | 明／1398／30153 | 并（两个称谓条也互为重复） |
| hixhd2h9bqu1 | 明憲宗 | 1 | hixhd2h9bgia 朱見深 | 明／1447／30156 | 并 |
| hixhd2h9bjq9 | 成祖文皇帝 | 1 | hixhd2h9bgll 朱棣 | 明／1360／30151 | 并 |
| hixhd2h9bn32 | 景皇帝（明） | 2 | hixhd2h9bv54 朱祁鈺 | 明／1428／30155 | 并 |
| hixhd2h9bk8h | 梁簡文帝 | 4 | hixhd2f8wal1 蕭綱 | 南朝梁／503／33251 | 并 |
| hixhd2h9bkm2、hixhd2h9bsp8 | 梁元帝、粱元帝（異體字） | 7／1 | hixhd2h9bhg1 蕭繹 | 南朝梁／508／33252 | 并 |
| hixhd2h9brzu | 漢明帝 | 1 | hixhd2h9bgte 劉莊 | 東漢／29／24662 | 并；注意库内还有 hixhd2h9bnv7「劉莊」（南朝宋），是另一人，别混 |
| hixhd2h9bufq | 隋煬帝 | 2 | hixhd2h9brk2 楊廣 | 隋 | 并 |
| hixhd2h9buqr | 魏明帝 | 1 | hixhd2h9bkoa 曹叡 | 三國魏 | 并 |
| hixhjeq2oiyp | 周明帝 | 3 | hixhd2h9bq04 宇文毓 | 北周 | 并 |
| hixhd2h9bq1q | 宋神宗 | 1 | hixhd2h9btm1 趙頊 | 北宋／1048／9006 | 并 |
| hixhd2h9bjsh | 仁宗皇帝（趙宋） | 1 | hixhd2h9bhj6 趙禎 | 北宋／1010／9004 | 并 |
| hixhd2h9bq1g | 宋明帝（南朝宋） | 6 | hixhd2h9bnd2 劉彧 | 南朝宋／339540 | 并；库内另有 hixhd2h9bi8u 劉彧（晉），疑另一人，不并 |

## 三、待核（身份或对应不唯一，先不动）
| 称谓条 id | 称謂名 | 原因 |
|---|---|---|
| hixhd2h9bq0z | 宋太宗（北宋） | 库内无「趙光義」条（可能名「趙炅」或未建），需先查本名条 |
| hixhjvgyx9mo、hixhjtdjv4lf | 宣帝、晉宣帝 | 司馬懿（追尊宣帝），库内无其本名条；是否应有帝王条另议 |
| hixhjxro6qkh | 文帝（晉） | 司馬昭（追尊文帝），对应本名条 hixhd2h9bny3 朝代「西晉」，身份未核 |
| hixhd2h9bko3 | 魏武帝 | 曹操（追尊），本名条 hixhd2h9bhxe 在库；是否算帝王条，Mirren 定 |
| hixhgyrw4x7w | 興獻皇帝 | 朱祐杬（追尊），本名条 hixhd2h9br0b 无朝代；追尊皇帝，非在位 |
| hixhd2h9bhwt | 黃帝 | 上古，21 部 Work，无本名条重出，不动 |
| hixhd2h9bm3n | 尹帝 | 疑碎片名，不动 |

## 四、结论
1. **库内早期（手工／自动建）的帝号称谓条广泛与本名条重出**：高置信约 31 条称谓条可并入 17 位帝王的本名条；其中明太祖 3 条、明宣宗 2 条、梁元帝 2 条为称谓条之间的自重。
2. 这类称谓条大多**无朝代**（None），且无 CBDB／生卒；keeper 取称谓条（廟號）的话，必须把本名条的 CBDB、生卒、朝代带过去，否则并后 keeper 反而更空；keeper 取本名条则 Work 全部改繫即可，更简单。**这是与清代口径的冲突点，请 Mirren 对非清朝代统一定 keeper 口径**（我建议：非清朝代取「已有 CBDB／生卒的本名条」为 keeper，称谓写入 alt_names；理由是两者重出率不同，且本名条是 CBDB 配对的载体）。
3. 本报告只报不改；并条需 Elias 执行。建议按朝代切批：明（9 条）、南北朝（12 条）、北魏（4）、两宋（3）、其他。
