import { describe, expect, it } from 'vitest';
import { convertChars } from '../../src/components/Reader/GujiTextViewer';
import { ENTITY_TEXT_CSS } from '../../src/components/EntityText/entity-text-css';

// 假转换器：整段「頭髮」→「头发」（词组），单字「髮」→「发」，同时模拟会改字数的转换
const conv = (s: string) => s.replace(/頭髮/g, '头发').replace(/髮/g, '髪').replace(/欽/g, '钦').replace(/XX/g, 'Y');

describe('convertChars（对读正文繁简）', () => {
    it('整段转换后字数不变：按位取，词组转换得以保留', () => {
        expect(convertChars(['頭', '髮', '欽'], conv)).toEqual(['头', '发', '钦']);
    });
    it('转换改了字数：退回逐字转换，不错位', () => {
        expect(convertChars(['X', 'X', '欽'], conv)).toEqual(['X', 'X', '钦']);
    });
    it('含多码点字：逐字转换', () => {
        expect(convertChars(['\u{20000}', '欽'], conv)).toEqual(['\u{20000}', '钦']);
    });
});

describe('专名线样式', () => {
    it('地名双线，人名单线，书名波浪线，官职朝代单线', () => {
        expect(ENTITY_TEXT_CSS).toMatch(/\.bim-et-place\s*\{[^}]*double[^}]*3px/);
        expect(ENTITY_TEXT_CSS).toMatch(/\.bim-et-person,[^{]*\{[^}]*solid/);
        expect(ENTITY_TEXT_CSS).not.toMatch(/\.bim-et-person,[^{]*\.bim-et-place/);
        expect(ENTITY_TEXT_CSS).toMatch(/\.bim-et-work\s*\{[^}]*wavy/);
    });
});
