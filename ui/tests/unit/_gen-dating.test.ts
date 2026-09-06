/**
 * 全库 dating 生成器（Phase B 第一步：算，不写）。
 *
 * 不是测试——借 vitest 的 TS 工具链跑一段脚本，免得为一次性任务引 tsx 依赖。
 * 默认 skip，只有给了 DATING_ROOT 才跑：
 *
 *     DATING_ROOT=D:/workspace/book-index \
 *       npx vitest run tests/unit/_gen-dating.test.ts --testTimeout=900000
 *
 * 产出 ui/dating.json（{id: DatingInfo}）与统计报告。dating.json 是派生
 * 产物、不入库；写入用 scripts/apply-dating.py。完整说明见 scripts/dating-report.md。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deriveDating } from '../../src/core/detail-model';

const ROOT = process.env.DATING_ROOT;

/** 递归收集 Book 下的顶层条目文件 `<id>-<title>.json`。 */
function collectBooks(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) collectBooks(p, out);
        // 带「-」的才是条目文件；collated_edition/ 等辅助文件不带
        else if (name.endsWith('.json') && name.includes('-')) out.push(p);
    }
    return out;
}

describe.skipIf(!ROOT)('生成全库 dating', () => {
    it('扫描 Book 并写出 dating.json', () => {
        const files = collectBooks(join(ROOT!, 'Book'));
        const out: Record<string, unknown> = {};
        const stats = {
            total: 0, generated: 0, year: 0, range: 0,
            basedOn: 0, repair: 0, sortable: 0,
            attested: 0, inferred: 0, uncertain: 0,
        };
        /** 朝代—年份自洽哨兵：越界的挑出来人工看，不静默放过。 */
        const BOUND: Record<string, [number, number]> = {
            漢: [-206, 220], 三國: [220, 280], 晉: [265, 420], 南北朝: [420, 589],
            隋: [581, 618], 唐: [618, 907], 五代: [907, 979], 宋: [960, 1279],
            遼: [916, 1125], 金: [1115, 1234], 元: [1206, 1368],
            明: [1368, 1662], 清: [1616, 1911], 民國: [1912, 1980],
        };
        const inconsistent: string[] = [];

        for (const f of files) {
            let meta: Record<string, unknown>;
            try { meta = JSON.parse(readFileSync(f, 'utf-8')); } catch { continue; }
            if (meta?.type !== 'book') continue;
            stats.total++;

            // 重算时必须无视已落盘的 dating，否则回退链会直接把旧值原样返回
            const d = deriveDating({ ...meta, dating: undefined } as never);
            if (!d || (!d.era && !d.reign && d.year == null && !d.yearRange)) continue;

            const rec: Record<string, unknown> = {};
            if (d.era) rec.era = d.era;
            if (d.reign) rec.reign = d.reign;
            if (d.reignYear != null) rec.reign_year = d.reignYear;
            if (d.year != null) rec.year = d.year;
            if (d.yearRange) rec.year_range = [d.yearRange.from, d.yearRange.to];
            rec.certainty = d.certainty;
            rec.source = d.source;
            if (d.basis) rec.basis = d.basis;
            if (d.basedOn) rec.based_on = d.basedOn;
            if (d.laterRepair) rec.later_repair = d.laterRepair;

            out[meta.id as string] = rec;
            stats.generated++;
            if (d.year != null) stats.year++;
            if (d.yearRange) stats.range++;
            if (d.basedOn) stats.basedOn++;
            if (d.laterRepair) stats.repair++;
            if (d.year != null || d.yearRange || d.era) stats.sortable++;
            stats[d.certainty]++;

            const b = d.era ? BOUND[d.era] : undefined;
            if (b && d.year != null && (d.year < b[0] || d.year > b[1])) {
                inconsistent.push(`${meta.id} ${d.era} ${d.year} 「${meta.edition ?? meta.title}」`);
            }
        }

        writeFileSync(join(__dirname, '../../dating.json'), JSON.stringify(out, null, 0), 'utf-8');

        const pct = (n: number) => `${((n / stats.total) * 100).toFixed(1)}%`;
        // 写文件而不只 console.log —— vitest 的 reporter 会吞掉 stdout
        const report = `
Book 总数        ${stats.total}
生成 dating      ${stats.generated}  (${pct(stats.generated)})
  确切年份       ${stats.year}  (${pct(stats.year)})
  年代区间       ${stats.range}  (${pct(stats.range)})
  底本 based_on  ${stats.basedOn}
  后修 repair    ${stats.repair}
  可排序         ${stats.sortable}  (${pct(stats.sortable)})
certainty       attested ${stats.attested} / inferred ${stats.inferred} / uncertain ${stats.uncertain}
朝代—年份不自洽  ${inconsistent.length}
${inconsistent.join('\n')}`;
        writeFileSync(join(__dirname, '../../dating-stats.txt'), report, 'utf-8');
        console.log(report);

        expect(stats.generated).toBeGreaterThan(0);
    });
});
