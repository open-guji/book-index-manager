# 内閣死链 Book 988g9bwr9l 重找（Silas，2026-10-15）
- 原 url `https://www.digital.archives.go.jp/das/meta/F1000000000000107735.html`：404（旧式目录页，已废）。
- 站内检索（`/search?kw=英雄譜`、`kw=精鐫合刻三國水滸全傳`，间隔≥3s）命中唯一一册：**`https://www.digital.archives.go.jp/file/1083262`**。
- 页面核对（`/file/1083262`，页面 158KB，非空壳）：簿冊標題「精鐫合刻三国水滸全伝」、請求番号 附００１－００１０、内閣文庫 漢書 集の部、旧蔵者 紅葉山文庫、人名 編者:熊飛（明）、書誌事項「刊本:明崇禎:::雄飛館」、数量 12冊；関連事項「総合書名『英雄譜』を版心・封面に記す。朱墨套印。２０巻 三国志２４０回 水滸伝１１０回 首１巻 図１巻」——与库内 details「水滸 110 回 + 三國 240 回 + 圖 1 卷」及 Book 题名（雄飛館英雄譜本）完全一致，且无同名其他册（检索 1 件）。
- 补丁：仅替换该 resource（id=nat-archives-jp）的 `url`，其余不动，见 `内閣死链-988g9bwr9l-补丁diff-Silas.diff`。未开 PR，等用户对资源挂接类写入的裁定后 Sylvie 重放→Marlowe 合。
- 附：库内其他 naikaku 旧式 `/das/meta/F…` url 仅此一处（grep 全库 `das/meta/F`）。
