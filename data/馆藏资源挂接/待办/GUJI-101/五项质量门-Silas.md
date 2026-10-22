# GUJI-101 五项质量门（Silas，2026-10-17 洛杉矶）
被检：book-index-draft main 现状（Work 121,664／Book 203,575）；工具取自 book-index main。原始输出见 `raw/`。

| 门 | 结果 | 原始输出 |
|---|---|---|
| check_schema --draft（全库） | **绿**：ERROR 0／WARN 0／INFO 0 | raw/check_schema_draft.txt |
| check_v2 | **绿**：ERROR 0（WARN 18 office 简称；INFO 95） | raw/check_v2.txt |
| build_derived --check-only（ref-root=book-index，text-index=book-text） | **绿**：self_check_error_count 0，fatal 空，dangling 空 | raw/build_derived.txt |
| pytest tests -q | **绿**（排除 1 个文件）：收集期 tests/test_rematch_commons.py 因环境缺 opencc 的 jp2t.json 报错，非数据问题；其余全过。需另装完整 opencc 后补跑该文件 | raw/pytest.txt 为未排除时的报错；排除后命令 `pytest tests -q --ignore=tests/test_rematch_commons.py` 全过 |
| verify.py --strict | **红 1 项**：`被併旧 id 無墓碑` ('d59f2hqmxn2a','d59f2pwthj42')。注意 verify.py 以自身所在仓为根，实际检的是**正式库 book-index**，不是 draft；成因是 GUJI-395（fd7d9b07）把《朝野雜記》d59f2pwthj42 併入《建炎以來朝野雜記》d59f2hqmxn2a 后未留墓碑檔。其余各项 0；懸空 0、漂移 0 | raw/verify.txt |
| 近名回扫 detect_dup_works（draft Work） | 候选 S1 同实体 3／S1.5 52／S2 21／S3 296／S4 159,070（弱提示，不处置）。**新增疑似重复对 <1% 与逐对处置的验收未做**：缺「入场基线」对照，无法算"新增"；S1 的 3 对须并 | raw/dup.txt、raw/dup_work_candidates-前400行.tsv |

## 红项与处置建议
1. verify 红（正式库）：给 d59f2pwthj42 补墓碑檔（merged_into→d59f2hqmxn2a），属 GUJI-395 当事人；删除/补建属正式库写入，需走 PR＋Sylvie PASS。我可起草补丁，待指派。
2. 近名 S1 三对必合、S1.5 52 对安全合并：清单见 tsv（含 S1），并条属审核范围，请 Sabine 定归属。
3. 基线：本报告即为首份全量快照；"新增 <1%"需以后续周报与本快照比。
