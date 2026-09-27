#!/usr/bin/env node
/**
 * 校验一份全文目录里的 `:::table` 块（guji-table-v1）能否无瑕疵解析。
 *
 * 用法（Node ≥ 22.18，直接跑 TS）：
 *   node scripts/check-guji-tables.mts <全文目录>...
 *   # 如：node scripts/check-guji-tables.mts ../../book-text/Work/7/s/y/d59f2gonq7sy/full_text/wikisource-01
 *
 * 目录下须有 index.json；逐章读 md，统计表块数、行数、合并格，列出解析 warnings。
 * 目录未声明 `table_notation: guji-table-v1` 时照样解析，但会提示「网站不会按表格渲染」。
 * 有 warning 或有未闭合的 `:::table` 时退出码为 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import { splitFullTextTables, hasGujiTableNotation } from '../src/core/guji-table.ts';

let bad = 0;
for (const dir of process.argv.slice(2)) {
    const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    console.log(`== ${dir}`);
    if (!hasGujiTableNotation(index)) console.log('  ⚠ index.json 未声明 table_notation: guji-table-v1，网站不会按表格渲染');
    let blocks = 0, rows = 0, colspans = 0, rowspans = 0, chapters = 0;
    for (const ch of index.chapters as { file: string; title: string }[]) {
        const p = path.join(dir, ch.file);
        if (!fs.existsSync(p)) continue;
        const md = fs.readFileSync(p, 'utf8');
        if (!/^:::table/m.test(md)) continue;
        const segs = splitFullTextTables(md);
        const tables = segs.flatMap(s => (s.type === 'table' ? [s.table] : []));
        const opens = (md.match(/^:::table/gm) ?? []).length;
        chapters++;
        blocks += tables.length;
        if (opens !== tables.length) {
            bad++;
            console.log(`  ✗ ${ch.file} ${ch.title}：${opens} 个 :::table，只闭合了 ${tables.length} 个`);
        }
        tables.forEach((t, i) => {
            rows += t.rows.length;
            for (const r of t.rows) for (const c of r.cells) {
                if (c.colspan > 1) colspans++;
                if (c.rowspan > 1) rowspans++;
            }
            if (t.warnings.length) {
                bad++;
                console.log(`  ✗ ${ch.file} 表${i + 1}（${t.rows.length} 行 × ${t.columns} 列）：`);
                for (const w of t.warnings.slice(0, 10)) console.log(`      ${w}`);
                if (t.warnings.length > 10) console.log(`      ……共 ${t.warnings.length} 条`);
            }
        });
    }
    console.log(`  含表章 ${chapters}，表块 ${blocks}，数据行 ${rows}，跨列格 ${colspans}，跨行格 ${rowspans}`);
}
console.log(bad ? `有 ${bad} 处问题` : '全部无瑕疵');
process.exit(bad ? 1 : 0);
