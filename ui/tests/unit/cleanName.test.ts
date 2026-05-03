/**
 * cleanName 跨语言一致性测试
 *
 * 这是阻止两边漂移的护盾：fixtures/cleanname-cases.json 是 Python 端
 * 已经验证通过的"权威输出"。每条 case 包含 input + expected。
 * TS 端 cleanName 必须给出同样的 expected，否则 fail。
 *
 * 历史漂移案例（已修复）：
 *   - U+F98C「歷」（CJK 兼容汉字）— 旧 TS 正则 [一-龥] 仅到 U+9FA5，会漏
 *   - U+25BE8「𥯨」（SMP 扩展 B）— 旧 TS 正则未带 u flag，无法匹配 SMP
 *
 * 任何修改 cleanName 行为都必须先在 fixture 加 case 再改实现。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cleanName } from '../../src/core/storage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures/cleanname-cases.json');

interface Case { name: string; input: string; expected: string }
const cases: Case[] = JSON.parse(readFileSync(fixturePath, 'utf-8'));

describe('cleanName 跨语言一致性（与 Python storage.py _clean_name 对齐）', () => {
    for (const c of cases) {
        it(c.name, () => {
            expect(cleanName(c.input)).toBe(c.expected);
        });
    }

    it('防回归：旧版正则会漏掉 U+F98C「歷」（CJK 兼容汉字）', () => {
        const compat = String.fromCodePoint(0xF98C);
        expect(compat.codePointAt(0)).toBe(0xF98C);
        // 这个码点用旧正则 [一-龥] 会被吃掉，新正则保留
        expect(cleanName(compat)).toBe(compat);
    });

    it('防回归：旧版正则会漏掉 U+25BE8「𥯨」（SMP 扩展 B）', () => {
        const ext = String.fromCodePoint(0x25BE8);
        expect(ext.codePointAt(0)).toBe(0x25BE8);
        expect(cleanName(ext)).toBe(ext);
    });
});
