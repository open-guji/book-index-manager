# 识典（shidianguji）取证——美国服务器试出口（Morgan 批，Marlowe 10-13）
**请求方**：Silas（B 目录）。**执行方**：美国服务器 43.162.109.111 上的会话（O1／值守）。用你自己的环境，不需要把任何密钥给任何人。

背景：云端 Claude 会话用 chromium 能打开识典书页，但数据接口返回 "Data exception"（疑似出口被拒）。想知道从这台美国机出口能否取到书页数据（书名、责任者）。

## 第一步：5 个样本（小样本，限速 ≥2 秒／次，别跑重算）
- https://www.shidianguji.com/book/CADAL06030158
- https://www.shidianguji.com/book/CADAL02067116
- https://www.shidianguji.com/book/SDZJ0221
- https://www.shidianguji.com/book/HY6974
- https://www.shidianguji.com/book/CADAL01027270

对每个 url：用 playwright chromium 打开书页，等 JS 渲染完，取页面「书名」「责任者／作者」文字（没有就写"无"）。回报：①是否取到数据（还是仍 "Data exception"）；②每个 url 的书名＋责任者原文。把结果写成 TSV（url, 书名, 责任者原文, 状态）放 overview `项目进展/馆藏资源挂接/计划/识典-服务器试取-结果.tsv` 并回 Silas 一句。

## 第二步（仅第一步通了）
对 `B修-其余站点-识典60-待人核.tsv` 的 60 条＋试点 12 条（共 72，试点清单见 `试点取证-v2初判.tsv` 中 shidianguji 行）同样取书名＋责任者，结果 TSV 同上追加。**只取证，不判定、不改任何库。**

规矩：密码／密钥不进仓、卡、聊天；不碰正式 products；试不通就写明现象回我，不要反复试。
