# 內閣全量确定档扣减（Rowan 版，Everett，2026-10-15 洛杉矶）

- **基线**：book-index main `a9ef3f9d0983`（#500 已合；#517 的 499＝批2，在途 PR 未合；#519 无关）；引擎 2a0a44ae 版 `--source naikaku --emit-write-plan`；plancheck（含 R1–R3/R7 占用）全过：item_errors 空，占用 0，超 3 的 Work 0。
- **文件**：`naikaku_确定档扣减表.tsv`（逐条）、`naikaku_write_plan_剩余可写.jsonl`（**2,120 行／1,381 Work**，sha256 前12位 `621073055a33`，已扣在途 #517 的 499）、`naikaku_占用清单-给Marlowe.tsv`（228 行／136 个 Work）。
- **去向（互斥先后，合计 4,516）**：无影像 53｜已落库（含 #500）1,044｜在途 #517 499｜并条 0｜K13④ 0｜占用 R7 183、R2 44、R2+R7 1（共 228）｜K9 超 3 572｜**可写 2,120**。
- 占用清单列：R2 行附 ledger hold 原因＋块，R7 行附 dupx 同题异作者清单对应行；占用 Work 在去重／录入 hold 中，等其结论再补。
