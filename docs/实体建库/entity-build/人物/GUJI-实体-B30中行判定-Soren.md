# B-30 回挂对照表「中」行判定

2026-10-14，Soren。卡 #483。对象：`批B-回挂对照表.tsv` 中 Entity 合入 commit＝231642c5ce 且置信＝中的行，共 42 行（21 位人物，各 2 部 Work）。

## 结论

| 判定 | 行数 | 说明 |
|---|---|---|
| 挂（已挂） | 41 | 草稿库 #329「批B-30 回挂：41 部 Work 作者补 entity_id」（Elias，13afb824f）已全部落地；机检：Work 存在、authors[authors_index] 名＝Entity 主名、entity_id＝对照表 entity_id，朝代与 Entity 不矛盾（任一方空算通过） |
| 不挂（入遗留） | 1 | 孫森 Work 1exn8agmvxfr7：总目「清」与 Entity hixi5n9n4aaw（CBDB 285150，明）不一致，疑二人同名；该 Work 作者未补 entity_id。孫森另一部 1exmux87ozwui（明）一致，已挂 |

无需再出新的回挂 PR（41 行已全在 #329；不动已合 Entity，不并条）。

## 逐行（挂）

人物（entity_id；CBDB；两部 Work）：同裕 a9u；吳保齡 a9v；吳贊誠 a9x；邵瑞彭 aa2；都守仁 aa4；夏啓瑞 aan；鮑鼎 aaq；夏辛銘 aat；孫森 aaw（仅 1exmux87ozwui）；徐春和 ab7；朱栻之 abi；李寶淦 abl；李銘漢 abo；汪鎣 abx；王檢心 ac6；田步蟾 ace；翁斌孫 acm；范泰衡 acs；董桂新 acx；蔣予蒲 ad0；袁希濤 ad4（entity_id 均为 hixi5n9n4 + 后缀；完整行见对照表）。

- 弱项（已挂，供复看）：邵瑞彭（aa2，Entity 清）、李寶淦（abl，Entity 清）两人的 4 部 Work 总目无朝代，仅凭「CBDB 唯一同名＋作者名一致」挂载，无朝代旁证；如要求「Work 侧须有朝代相符」才挂，这 4 部应撤。
- 其余 18 位人物的 Work 朝代均与 Entity 一致（清）。

## 入遗留

- 孫森（hixi5n9n4aaw）Work 1exn8agmvxfr7：见上，待人审定是否另立清代 Entity。
