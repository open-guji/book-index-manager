/**
 * overview#516：VARIANT_SUPPLEMENT 公开导出（网站 simplify.ts 要引）——包入口与 `./variant-supplement` 子路径同源。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { VARIANT_SUPPLEMENT as fromIndex } from '../../src/index';
import { VARIANT_SUPPLEMENT as fromModule } from '../../src/i18n/variant-supplement';

describe('VARIANT_SUPPLEMENT 导出', () => {
    it('包入口与模块是同一张表', () => {
        expect(fromIndex).toBe(fromModule);
        expect(fromIndex['𠮓']).toBe('變');
    });

    it('package.json exports 有 ./variant-supplement，lib 构建有同名入口', () => {
        const root = path.join(__dirname, '..', '..');
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        expect(pkg.exports['./variant-supplement']).toEqual({
            types: './dist/variant-supplement.d.ts',
            import: './dist/variant-supplement.js',
            require: './dist/variant-supplement.cjs',
        });
        expect(fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')).toContain("'variant-supplement'");
    });
});
