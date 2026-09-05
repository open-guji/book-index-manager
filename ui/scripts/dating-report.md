# dating 生成报告（可复跑）

方案见 `overview/项目进展/古籍索引网站/整体设计/2026-09-刊刻年代方案.md`。

重新生成报告：把下面的脚本存成 `tests/unit/_dating-report.test.ts`，
`npx vitest run tests/unit/_dating-report.test.ts --testTimeout=300000`，
结果写到 `dating-report.txt`。跑完记得删掉临时文件（它会扫本地
`D:/workspace/book-index`，不适合留在常规测试里）。

最近一次结果存档：
`overview/项目进展/古籍索引网站/整体设计/2026-09-刊刻年代-生成报告.txt`
