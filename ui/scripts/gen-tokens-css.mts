/**
 * 由 src/styles/tokens.ts 生成 src/styles/variables.css（发布为 book-index-ui/styles，兼容旧入口）、tokens.css（book-index-ui/tokens.css）、themes.css（book-index-ui/themes.css）。
 * 用法：npm run gen:tokens（需 Node ≥ 22.6，靠 --experimental-strip-types 直接跑 .ts）
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bimTokensCss } from '../src/styles/tokens.ts';

for (const [file, part] of [['variables.css', 'all'], ['tokens.css', 'tokens'], ['themes.css', 'themes'], ['palette.css', 'palette']] as const) {
    const out = fileURLToPath(new URL(`../src/styles/${file}`, import.meta.url));
    writeFileSync(out, bimTokensCss(part));
    console.log(`wrote ${out}`);
}
