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
import { BIM_LAYOUTS, BIM_THEMES, BIM_TOKENS, bim, bimRootValue, bimTokensCss } from '../../src/styles/tokens';

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
        const css = bimTokensCss().split('/* ==== 主题：')[0];
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

describe('主题（朱砂默认 / 靛蓝）', () => {
    const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const lum = (h: string) => {
        const [r, g, b] = hex(h).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
    };
    const val = (name: keyof typeof BIM_TOKENS, theme?: keyof typeof BIM_THEMES): string =>
        ((theme && (BIM_THEMES[theme] as Record<string, string>)[name]) || BIM_TOKENS[name].value);

    it('生成 :root[data-theme="indigo"]，且只覆盖已定义的变量', () => {
        const css = bimTokensCss();
        expect(css).toContain(':root[data-theme="indigo"] {');
        for (const name of Object.keys(BIM_THEMES.indigo)) expect(BIM_TOKENS).toHaveProperty(name);
    });

    for (const theme of [undefined, 'indigo', 'ink'] as const) {
        it(`${theme ?? 'vermilion'}：强调色在各底色上文字对比度 ≥ 4.5（AA），白字主按钮同`, () => {
            for (const bg of ['page-bg', 'zebra-bg', 'card-bg', 'tint-bg'] as const) {
                expect(contrast(val('accent', theme), val(bg))).toBeGreaterThanOrEqual(4.5);
                expect(contrast(val('accent-deep', theme), val(bg))).toBeGreaterThanOrEqual(4.5);
            }
            expect(contrast(val('accent', theme), val('on-color-fg'))).toBeGreaterThanOrEqual(4.5);
            // 「有影印」块：强调色字在 flag-bg 之上（靛蓝是实色 #e3eaec；朱砂是 8% 朱色叠在纸上，取与纸色的近似）
            const flag = theme ? val('flag-bg', theme) : val('page-bg');
            expect(contrast(val('accent', theme), flag)).toBeGreaterThanOrEqual(4.5);
        });
    }

    // v4：墨换了一整套中性灰，各层文字在各层底上都要 ≥4.5，不能只查强调色
    for (const theme of [undefined, 'indigo', 'ink'] as const) {
        it(`${theme ?? 'vermilion'}：正文／次要／元数据／标签各层文字在各底色上对比度 ≥ 4.5`, () => {
            for (const fg of ['ink', 'body-fg', 'quiet-fg', 'meta-fg', 'label-fg', 'aux-fg', 'hint-fg'] as const) {
                for (const bg of ['page-bg', 'zebra-bg', 'card-bg', 'tint-bg', 'row-hover-bg'] as const) {
                    expect(contrast(val(fg, theme), val(bg, theme)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
                }
            }
        });
    }

    it('墨：强调色与正文色接近（都是近黑）——所以不能靠颜色区分链接（组件里另加下划线）', () => {
        expect(contrast(val('accent', 'ink'), val('ink', 'ink'))).toBeLessThan(1.5);
    });

    it('生成 :root[data-theme="ink"] 与 :root[data-layout="boxed"]，且只覆盖已定义的变量', () => {
        const css = bimTokensCss();
        expect(css).toContain(':root[data-theme="ink"] {');
        expect(css).toContain(':root[data-layout="boxed"] {');
        for (const name of Object.keys(BIM_THEMES.ink)) expect(BIM_TOKENS).toHaveProperty(name);
        for (const name of Object.keys(BIM_LAYOUTS.boxed)) expect(BIM_TOKENS).toHaveProperty(name);
    });

    it('疏朗（默认）不画框：默认值即无框无内边距；界栏才有 1px 框线与卡面底', () => {
        expect(BIM_TOKENS['fr-bd'].value).toMatch(/^0 /);
        expect(BIM_TOKENS['fr-bd-pad'].value).toBe('0');
        expect(BIM_LAYOUTS.boxed['fr-bd']).toContain('1px solid');
        expect(BIM_LAYOUTS.boxed['fr-bg']).toContain('--bim-card-bg');
    });
});
