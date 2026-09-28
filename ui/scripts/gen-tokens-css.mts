/**
 * 由 src/styles/tokens.ts 生成 src/styles/variables.css（发布为 book-index-ui/styles）。
 * 用法：npm run gen:tokens（需 Node ≥ 22.6，靠 --experimental-strip-types 直接跑 .ts）
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bimTokensCss } from '../src/styles/tokens.ts';

const out = fileURLToPath(new URL('../src/styles/variables.css', import.meta.url));
writeFileSync(out, bimTokensCss());
console.log(`wrote ${out}`);
