// 把一组字逐个过 opencc t2cn（与 src/i18n/simplified-converter.ts 同口径），供 build.py 调用。
// 用法：node t2cn.mjs in.json out.json   （in.json 是字的数组）
import { readFileSync, writeFileSync } from 'node:fs';
import { Converter } from 'opencc-js/t2cn';

const [inp, out] = process.argv.slice(2);
const conv = Converter({ from: 't', to: 'cn' });
const map = {};
for (const c of JSON.parse(readFileSync(inp, 'utf8'))) map[c] = conv(c);
writeFileSync(out, JSON.stringify(map));
