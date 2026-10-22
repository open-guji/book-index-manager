# K2 Book 层候选清单（Everett，2026-10-13 洛杉矶）

- 生成：`scripts/馆藏资源挂接/match_engine/book_candidates.py`（只读，不改 matches.tsv 与指纹；输入 a1be6aba 钉定引擎的三来源 matches.tsv＋book-index@7e7247c8fa 的 Book/）。
- 清单：`K2-Book层候选清单.tsv`（75 行，末列「人工判」留空，由 Silas 填：挂／不挂／改挂另一本）。只含确定档、未排除、有影像、且库内该 Work 已有 Book 的行。
- 档位：STRONG＝年号＋年数＋刊抄类型都相同且库内符合的 Book 恰 1 本；MEDIUM＝年号与类型相同但一方没写年数；AMBIG＝符合的 Book 多本（列全）。年号相同但年数不同的直接剔除（例：站方嘉慶21 vs 库嘉慶八年）。
- 备查（不要求人工判）：站方只写到年号、未写刊抄类型的 ERA_ONLY／ERA_AMBIG（nlc 约 3660、ndl 55、kokusho 0）不出清单，因 K2 要求版本信息明确一致；若要放宽须先改口径。
- 数量：nlc 2（nlc 站方版本多数缺刊抄类型，所以少）、kokusho 29、ndl 44。
- 不新建 Book／Work；人工判「挂」后由 E 块按 K2 写 Book 层 resources（本引擎不写）。
