// build:lib 收尾：把 src/i18n/variant-chars.json 原样拷进 dist，另出一份 ESM 模块（book-index-ui/variant-chars），
// 给不方便 import JSON 的打包环境（如网站的检索边缘函数）用。两份内容逐字相同。
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const src = 'src/i18n/variant-chars.json';
const table = JSON.parse(readFileSync(src, 'utf8'));
copyFileSync(src, 'dist/variant-chars.json');
writeFileSync('dist/variant-chars-data.js', `/** 异体字 → 正字（overview#350），由 src/i18n/variant-chars.json 生成 */\nexport default ${JSON.stringify(table)};\n`);
writeFileSync('dist/variant-chars-data.d.ts', 'declare const VARIANT_CHARS: Readonly<Record<string, string>>;\nexport default VARIANT_CHARS;\n');
