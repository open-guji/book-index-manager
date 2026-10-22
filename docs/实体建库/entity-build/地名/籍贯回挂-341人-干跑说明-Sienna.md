# 籍贯回挂 341 人干跑说明（GUJI-237，Sienna）

- 输入：`籍贯回挂-341人-keeper重映射-Stella.tsv`；干跑表：`籍贯回挂-341人-干跑表-Sienna.tsv`（人物id／地名id／依据／结果）。
- 结果：**339 可挂、2 转人审**（賀德仁 hixhinhra3nl、孔紹安：朝代覆盖不足，不挂）。
- 同名地名按 keeper id（modern／上级）定，不按裸名；目标均为正式库现行条，无墓碑。
- 验收：基线 book-index main（含 #423／#424）；在临时副本给 339 个人物档只追加 `native_place_entity_id`，`check_v2 --root . --ref-root . --paths @清单 --summary` → **查 339 檔，ERROR 0／WARN 0／INFO 0（N03=0）**；试改已丢弃，未推任何 PR。
- 待 Sylvie 全查；建议加抽：仅朝代级精度的 139 人、置信「中」且与 CBDB 一致的 85 人。通过后再推纯数据 PR。
