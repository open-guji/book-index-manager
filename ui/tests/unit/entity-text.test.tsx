/**
 * 正文实体标注（overview#389 E1）：entity.json 适配、偏移换算、切分、EntityText 交互。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    adaptEntityJson,
    bookIndexUriToId,
    remapPlainOffsets,
    segmentEntities,
    type EntitySpan,
} from '../../src/core/entity-annotations';
import {
    EntityText,
    ENTITY_TEXT_CSS,
    summaryFromItem,
    transportSummaryLoader,
} from '../../src/components/EntityText';
import { LocaleProvider } from '../../src/i18n';

/** build_entity_json() 的输出形状（open-guji-cv render/entity_extract.py） */
const ENTITY_JSON = {
    $schema: 'https://open-guji.org/schema/entity/v0.1.json',
    version: '0.1.0',
    book_id: 'B1',
    volume: 1,
    metadata: { title: '漢書藝文志', creator: 'qwen-plus:ner_v1', base_edition: 'original' },
    stats: { total_entities: 3, matched: 2, new_candidates: 1 },
    entities: [
        {
            id: 'e0002', type: 'people', text: '劉向',
            anchor: { start: '1:1:4', end: '1:1:5' },
            span: { start_offset: 3, end_offset: 5 },
            target: { status: 'matched', entity_id: 'p1abc', canonical_name: '劉向', href: 'book-index://Entity/p1abc' },
            source: 'llm:qwen-plus',
        },
        {
            id: 'e0001', type: 'work', text: '別録',
            anchor: { start: '1:1:6', end: '1:1:7' },
            span: { start_offset: 5, end_offset: 7 },
            target: { status: 'matched', canonical_name: '別錄', href: 'book-index://Work/w9xyz' },
        },
        {
            id: 'e0003', type: 'place', text: '齊',
            anchor: { start: '1:1:11', end: '1:1:11' },
            span: { start_offset: 10, end_offset: 11 },
            target: { status: 'new_candidate', canonical_name: '齊' },
            confidence: 0.8,
        },
        { id: 'bad', type: 'people', text: 'x', span: { start_offset: 3, end_offset: 3 }, target: {} },
    ],
};

// 纯字：師古曰劉向別録云服氏齊人（偏移 0..11；劉向 3–5、別録 5–7、齊 10）
const PUNCTUATED = '師古曰：「劉向《別録》云：服氏，齊人。」';

describe('bookIndexUriToId', () => {
    it('book-index:// 各类 URI 转成站内 id', () => {
        expect(bookIndexUriToId('book-index://Work/w9xyz')).toBe('w9xyz');
        expect(bookIndexUriToId('book-index://Entity/p1abc/')).toBe('p1abc');
        expect(bookIndexUriToId('book-index://abc123')).toBe('abc123');
        expect(bookIndexUriToId('bid:\\\\abc123')).toBe('abc123');
        expect(bookIndexUriToId(' abc123 ')).toBe('abc123');
    });
    it('认不出的返回 null', () => {
        expect(bookIndexUriToId('https://example.com/x')).toBeNull();
        expect(bookIndexUriToId('')).toBeNull();
        expect(bookIndexUriToId(undefined)).toBeNull();
    });
});

describe('adaptEntityJson', () => {
    const spans = adaptEntityJson(ENTITY_JSON);

    it('按起点排序，丢弃非法区间', () => {
        expect(spans.map(s => s.key)).toEqual(['e0002', 'e0001', 'e0003']);
    });
    it('类别映射：people→person，work→work，place→place', () => {
        expect(spans.map(s => s.kind)).toEqual(['person', 'work', 'place']);
    });
    it('matched 取 entity_id，没有就从 href 解析；new_candidate 不给 targetId', () => {
        expect(spans[0].targetId).toBe('p1abc');
        expect(spans[1].targetId).toBe('w9xyz');
        expect(spans[2].targetId).toBeUndefined();
        expect(spans[2].confidence).toBe(0.8);
        expect(spans[1].canonicalName).toBe('別錄');
    });
    it('直接给 entities 数组、或不认识的输入', () => {
        expect(adaptEntityJson(ENTITY_JSON.entities)).toHaveLength(3);
        expect(adaptEntityJson(null)).toEqual([]);
        expect(adaptEntityJson({ foo: 1 })).toEqual([]);
        expect(adaptEntityJson([{ type: 'office', start_offset: 0, end_offset: 2 }])[0]).toMatchObject({ kind: 'office', key: 'e0' });
        expect(adaptEntityJson([{ type: '???', start_offset: 0, end_offset: 2 }])[0].kind).toBe('other');
    });
});

describe('remapPlainOffsets', () => {
    it('纯字偏移换算成带标点正文的下标', () => {
        const mapped = remapPlainOffsets(PUNCTUATED, adaptEntityJson(ENTITY_JSON));
        expect(mapped.map(s => PUNCTUATED.slice(s.start, s.end))).toEqual(['劉向', '別録', '齊']);
    });
    it('plainBase：本段只是整卷的一部分；超出本段的区间丢弃', () => {
        const part = '服氏，齊人。';  // 整卷纯字下标 8 起
        const mapped = remapPlainOffsets(part, adaptEntityJson(ENTITY_JSON), 8);
        expect(mapped.map(s => part.slice(s.start, s.end))).toEqual(['齊']);
    });
});

describe('segmentEntities', () => {
    const sp = (start: number, end: number, extra: Partial<EntitySpan> = {}): EntitySpan =>
        ({ key: `k${start}`, kind: 'person', start, end, ...extra });

    it('按区间切成文字 / 实体片段，拼回原文不变', () => {
        const text = '甲乙丙丁戊';
        const segs = segmentEntities(text, [sp(1, 3), sp(4, 5)]);
        expect(segs.map(s => [s.type, s.text])).toEqual([
            ['text', '甲'], ['entity', '乙丙'], ['text', '丁'], ['entity', '戊'],
        ]);
        expect(segs.map(s => s.text).join('')).toBe(text);
    });
    it('重叠时保留先开始的（同起点取长的）', () => {
        const segs = segmentEntities('甲乙丙丁', [sp(1, 2), sp(0, 3), sp(2, 4)]);
        expect(segs.filter(s => s.type === 'entity').map(s => s.text)).toEqual(['甲乙丙']);
    });
    it('偏移与原文对不上时就近找回，找不到丢弃', () => {
        const segs = segmentEntities('某某曰司馬遷著書', [
            sp(2, 4, { text: '司馬遷' }),
            sp(0, 1, { text: '班固' }),
        ]);
        expect(segs.filter(s => s.type === 'entity').map(s => s.text)).toEqual(['司馬遷']);
    });
    it('越界的区间截到正文范围', () => {
        const segs = segmentEntities('甲乙', [sp(1, 9)]);
        expect(segs.map(s => s.text)).toEqual(['甲', '乙']);
    });
});

describe('summaryFromItem', () => {
    it('人物：取 primary_name、朝代、生卒、籍贯、提要', () => {
        const s = summaryFromItem('p1', {
            type: 'entity', primary_name: '劉向', title: '劉向', dynasty: '西漢',
            birth_year: -77, death_year: -6, native_place: '沛縣',
            description: { text: '字子政，本名更生。'.repeat(20) },
        });
        expect(s.title).toBe('劉向');
        expect(s.meta).toBe('西漢 · -77–-6 · 沛縣');
        expect(Array.from(s.description!).length).toBe(121);
        expect(s.description!.endsWith('…')).toBe(true);
    });
    it('作品：作者行', () => {
        const s = summaryFromItem('w1', {
            type: 'work', title: '別錄', authors: [{ name: '劉向', dynasty: '漢', role: '撰' }],
        });
        expect(s.meta).toBe('〔漢〕劉向撰');
        expect(s.description).toBeUndefined();
    });
});

function makeTransport(items: Record<string, Record<string, unknown>>) {
    return { getItem: vi.fn(async (id: string) => items[id] ?? null) };
}

describe('transportSummaryLoader', () => {
    it('getItem 取不到时退到 getEntry', async () => {
        const load = transportSummaryLoader({
            getItem: async () => null,
            getEntry: async (id: string) => ({ id, type: 'work', title: '史記', author: '司馬遷' }),
        });
        expect(await load('w1')).toMatchObject({ title: '史記', meta: '司馬遷' });
    });
});

describe('<EntityText>', () => {
    const spans = adaptEntityJson(ENTITY_JSON);

    it('画线：人名直线、书名波浪（补隐藏书名号）、未收录不成链接；文字不丢', () => {
        const { container } = render(<EntityText text={PUNCTUATED} entities={spans} offsets="plain" />);
        expect(container.textContent).toBe(ENTITY_TEXT_CSS + PUNCTUATED);
        const person = container.querySelector('a.bim-et-person')!;
        expect(person.textContent).toBe('劉向');
        expect(person.getAttribute('href')).toBe('/item/p1abc');
        const work = container.querySelector('a.bim-et-work')!;
        expect(work.getAttribute('href')).toBe('/item/w9xyz');
        // 正文已带《》，不再补隐藏书名号
        expect(work.querySelector('.bim-et-sr')).toBeNull();
        const place = container.querySelector('.bim-et-place')!;
        expect(place.tagName).toBe('SPAN');
        expect(place.textContent).toBe('齊');
        expect(container.querySelector('style')!.textContent).toBe(ENTITY_TEXT_CSS);
    });

    it('正文无书名号时，书名补上视觉隐藏的《》（复制仍带书名号）', () => {
        const { container } = render(
            <EntityText text="讀史記" entities={[{ key: 'a', kind: 'work', start: 1, end: 3, targetId: 'w1' }]} injectStyles={false} />,
        );
        expect(container.querySelector('a.bim-et-work')!.textContent).toBe('《史記》');
        expect(container.querySelectorAll('.bim-et-work .bim-et-sr')).toHaveLength(2);
        expect(container.querySelector('style')).toBeNull();
    });

    it('悬停出卡并取摘要；移开收起；同一 transport 只取一次', async () => {
        vi.useFakeTimers();
        try {
            const transport = makeTransport({
                p1abc: { type: 'entity', primary_name: '劉向', dynasty: '西漢', description: { text: '經學家、目錄學家。' } },
            });
            render(<EntityText text={PUNCTUATED} entities={spans} offsets="plain" transport={transport} hoverDelayMs={200} />);
            const link = screen.getByRole('link', { name: '劉向' });
            fireEvent.mouseEnter(link.parentElement!);
            expect(screen.queryByRole('tooltip')).toBeNull();
            await act(async () => { vi.advanceTimersByTime(200); });
            const card = screen.getByRole('tooltip');
            expect(card.textContent).toContain('人名');
            await act(async () => { await Promise.resolve(); });
            expect(card.textContent).toContain('西漢');
            expect(card.textContent).toContain('經學家、目錄學家。');
            expect(link.getAttribute('aria-describedby')).toBe(card.id);

            fireEvent.mouseLeave(link.parentElement!);
            expect(screen.queryByRole('tooltip')).toBeNull();
            fireEvent.mouseEnter(link.parentElement!);
            await act(async () => { vi.advanceTimersByTime(200); });
            expect(transport.getItem).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('键盘：Tab 只停在已收录实体，聚焦即出卡，Esc 收起，失焦收起', async () => {
        const user = userEvent.setup();
        const transport = makeTransport({ w9xyz: { type: 'work', title: '別錄', authors: [{ name: '劉向' }] } });
        render(<EntityText text={PUNCTUATED} entities={spans} offsets="plain" transport={transport} />);
        await user.tab();
        expect(document.activeElement).toBe(screen.getByRole('link', { name: '劉向' }));
        expect(screen.getByRole('tooltip').textContent).toContain('劉向');
        await user.tab();
        expect(document.activeElement).toBe(screen.getByRole('link', { name: '別録' }));
        await waitFor(() => expect(screen.getByRole('tooltip').textContent).toContain('別錄'));
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('tooltip')).toBeNull();
        await user.tab();
        expect(document.activeElement).toBe(document.body);
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('点击走 onNavigate（宿主可拦截做站内路由），buildHref 可改', () => {
        const onNavigate = vi.fn((_id: string, e: React.MouseEvent) => e.preventDefault());
        render(
            <EntityText
                text={PUNCTUATED} entities={spans} offsets="plain"
                buildHref={id => `/x/${id}`} onNavigate={onNavigate}
            />,
        );
        const link = screen.getByRole('link', { name: '劉向' });
        expect(link.getAttribute('href')).toBe('/x/p1abc');
        fireEvent.click(link);
        expect(onNavigate).toHaveBeenCalledWith('p1abc', expect.anything());
    });

    it('没有数据源时卡片用规范名；取数失败显示失败提示', async () => {
        const user = userEvent.setup();
        const { unmount } = render(<EntityText text={PUNCTUATED} entities={spans} offsets="plain" />);
        await user.tab();
        expect(screen.getByRole('tooltip').textContent).toBe('人名劉向');
        unmount();

        const loadSummary = vi.fn(async () => { throw new Error('boom'); });
        render(<EntityText text={PUNCTUATED} entities={spans} offsets="plain" loadSummary={loadSummary} />);
        await user.tab();
        await waitFor(() => expect(screen.getByRole('tooltip').textContent).toContain('摘要載入失敗'));
    });

    it('简体模式下卡片文字转简', async () => {
        const user = userEvent.setup();
        render(
            <LocaleProvider locale="zh-Hans">
                <EntityText text={PUNCTUATED} entities={spans} offsets="plain" />
            </LocaleProvider>,
        );
        await user.tab();
        await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('人名刘向'));
    });
});
