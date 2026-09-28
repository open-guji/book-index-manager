/**
 * N2（2026-09-28）：颜色全部走 --bim-* 变量。
 *
 * 1. variables.css 与 tokens.ts 同步（variables.css 由 `npm run gen:tokens` 生成）
 * 2. bim() 产出带统一回退值的 var()，未定义的名字抛错
 * 3. 守门：src 下除 tokens.ts / variables.css 外不许再出现颜色字面量，
 *    也不许手写 var(--bim-x, 回退值)（字体除外），引用的变量名都须在 tokens.ts 定义
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIM_TOKENS, bim, bimRootValue, bimTokensCss } from '../../src/styles/tokens';

// jsdom 环境下 import.meta.url 不是 file: 协议，用 __dirname
const SRC = resolve(__dirname, '../../src');
const TOKEN_FILES = new Set(['styles/tokens.ts', 'styles/variables.css']);

function listFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? listFiles(p) : [p];
    });
}

const SOURCES = listFiles(SRC)
    .filter(p => /\.(tsx?|css)$/.test(p))
    .map(p => ({ file: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }))
    .filter(s => !TOKEN_FILES.has(s.file));

/** 在全部源文件里找匹配，返回 `文件:行 片段` */
function findAll(re: RegExp): string[] {
    const hits: string[] = [];
    for (const { file, text } of SOURCES) {
        text.split('\n').forEach((line, i) => {
            for (const m of line.matchAll(re)) hits.push(`${file}:${i + 1} ${m[0]}`);
        });
    }
    return hits;
}

describe('tokens', () => {
    it('variables.css 与 tokens.ts 同步（不同步请跑 npm run gen:tokens）', () => {
        const css = readFileSync(join(SRC, 'styles/variables.css'), 'utf8');
        expect(css).toBe(bimTokensCss());
    });

    it('bim() 产出 var(--bim-x, 默认值)', () => {
        expect(bim('fg')).toBe('var(--bim-fg, #333333)');
        expect(bim('accent')).toBe('var(--bim-accent, #9c3a2c)');
        // VS Code 联动的变量：:root 先取 --vscode-*，内联回退值仍是字面默认值
        expect(bimRootValue(BIM_TOKENS['desc-fg'])).toBe('var(--vscode-descriptionForeground, #717171)');
        expect(bim('desc-fg')).toBe('var(--bim-desc-fg, #717171)');
    });

    it('未定义的变量名抛错', () => {
        expect(() => bim('no-such-token' as never)).toThrow(/--bim-no-such-token/);
    });

    it('生成的 :root 覆盖全部变量（root:false 的除外）且无重复', () => {
        const css = bimTokensCss();
        const declared = [...css.matchAll(/^\s*--bim-([a-z0-9-]+):/gm)].map(m => m[1]);
        expect(new Set(declared).size).toBe(declared.length);
        const expected = Object.entries(BIM_TOKENS).filter(([, t]) => t.root !== false).map(([k]) => k);
        expect(declared.sort()).toEqual(expected.sort());
    });
});

describe('守门：颜色只在 tokens.ts 定义', () => {
    it('没有 #hex 颜色字面量', () => {
        // 排除 HTML 实体 &#9654; 之类
        expect(findAll(/(?<![&\w])#[0-9a-fA-F]{3,8}\b/g)).toEqual([]);
    });

    it('没有 rgb()/rgba()/hsl()/hsla()', () => {
        expect(findAll(/\b(?:rgba?|hsla?)\(/g)).toEqual([]);
    });

    it('没有常见命名色（用作样式值时）', () => {
        const named = 'white|black|red|blue|green|gray|grey|silver|orange|yellow|purple|pink|brown|navy|teal|gold';
        expect(findAll(new RegExp(`(?:color|background|border|fill|stroke|outline|shadow)[\\w-]*['"]?\\s*:\\s*['"\`]?[^;'"\`]*\\b(?:${named})\\b`, 'gi')))
            .toEqual([]);
    });

    it('不再手写 var(--bim-x, 回退值)（字体变量除外），一律 bim()', () => {
        expect(findAll(/var\(--bim-(?!font-)[a-z0-9-]+\s*,/g)).toEqual([]);
    });

    it("引用的 --bim-* / bim('x') 都在 tokens.ts 定义", () => {
        const names = new Set<string>();
        for (const { text } of SOURCES) {
            for (const m of text.matchAll(/--bim-([a-z0-9]+(?:-[a-z0-9]+)*)(?![-*\w])/g)) names.add(m[1]);
            for (const m of text.matchAll(/\bbim\('([a-z0-9-]+)'\)/g)) names.add(m[1]);
        }
        const unknown = [...names].filter(n => !(n in BIM_TOKENS));
        expect(unknown).toEqual([]); // 注释里的 --bim-type-* 通配写法不计
    });
});
