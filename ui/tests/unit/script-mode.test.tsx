/**
 * 阅读器字形三态（overview#514）：原字（不转换，保留异体字）／通行繁体（异体字归一）／简体。
 * 默认偏好（scriptMode=null）下输出与改动前一致。
 */
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n';
import { ScriptModeScope, scriptConverter } from '../../src/i18n/script-scope';
import type { ScriptMode } from '../../src/i18n/script-scope';
import { useI18n } from '../../src/i18n/use-i18n';
import { getSimplifiedConverter } from '../../src/i18n/simplified-converter';
import { normalizeVariants } from '../../src/i18n/variant-chars';
import { TextReader } from '../../src/components/TextReader';
import { renderHighlighted } from '../../src/components/CollatedEdition';
import { fakeTextTransport } from './helpers/text-transport';

// 同一段含异体字的文本：㫖（旨）、縂（總）、寳（寶）、稀见异体 𠮓（變）、𡚁（弊）、普通繁体 龍
const SAMPLE = '其㫖縂在寳，𠮓𡚁龍';
const HANT = '其旨總在寶，變弊龍';
const HANS = '其旨总在宝，变弊龙';
const KEY = 'bim-reader-prefs';

describe('scriptConverter', () => {
    const site = getSimplifiedConverter();
    it('没选过：照站点（简体站点走站点转换，繁体站点不转）', () => {
        expect(scriptConverter(null, 'zh-Hans', site)).toBe(site);
        expect(scriptConverter(undefined, 'zh-Hant', null)).toBeNull();
    });
    it('orig：一律不转', () => {
        expect(scriptConverter('orig', 'zh-Hans', site)).toBeNull();
        expect(scriptConverter('orig', 'zh-Hant', null)).toBeNull();
    });
    it('hant：繁体站点做异体字归一；简体站点以站点为准（旧存档不能把简体站点显示成繁体）', () => {
        expect(scriptConverter('hant', 'zh-Hant', null)).toBe(normalizeVariants);
        expect(scriptConverter('hant', 'zh-Hans', site)).toBe(site);
    });
    it('hans：简体站点用站点转换；繁体站点（旧存档）不转', () => {
        expect(scriptConverter('hans', 'zh-Hans', site)).toBe(site);
        expect(scriptConverter('hans', 'zh-Hant', null)).toBeNull();
        expect(scriptConverter('hans', 'zh-Hans', null)!(SAMPLE)).toBe(HANS);
    });
});

function Show() {
    const { convert } = useI18n();
    return <p data-testid="out">{convert(SAMPLE)}</p>;
}
const out = () => screen.getByTestId('out').textContent;

describe('ScriptModeScope：同一段文本三态对照', () => {
    const cases: Array<[ScriptMode | null, 'zh-Hant' | 'zh-Hans', string]> = [
        [null, 'zh-Hant', SAMPLE], // 默认偏好＋繁体站点：与改动前一致（原样）
        [null, 'zh-Hans', HANS], // 默认偏好＋简体站点：与改动前一致（简体）
        ['orig', 'zh-Hant', SAMPLE], // 原字：所见即底本，异体字保留
        ['orig', 'zh-Hans', SAMPLE], // 原字：简体站点上也不转（站点 locale 只管界面文字）
        ['hant', 'zh-Hant', HANT], // 通行繁体：异体字归一，繁体字不变
        ['hans', 'zh-Hans', HANS], // 简体
    ];
    for (const [mode, locale, want] of cases) {
        it(`${mode ?? 'null'} @ ${locale}`, () => {
            render(<LocaleProvider locale={locale}><ScriptModeScope mode={mode}><Show /></ScriptModeScope></LocaleProvider>);
            expect(out()).toBe(want);
        });
    }

    it('不包 Scope 时输出与改动前一致', () => {
        render(<LocaleProvider locale="zh-Hans"><Show /></LocaleProvider>);
        expect(out()).toBe(HANS);
    });

    it('同一 locale 下换模式，useConvert 的缓存不串（orig→hans→orig）', () => {
        const view = render(<LocaleProvider locale="zh-Hans"><ScriptModeScope mode="orig"><Show /></ScriptModeScope></LocaleProvider>);
        expect(out()).toBe(SAMPLE);
        view.rerender(<LocaleProvider locale="zh-Hans"><ScriptModeScope mode="hans"><Show /></ScriptModeScope></LocaleProvider>);
        expect(out()).toBe(HANS);
        view.rerender(<LocaleProvider locale="zh-Hans"><ScriptModeScope mode="orig"><Show /></ScriptModeScope></LocaleProvider>);
        expect(out()).toBe(SAMPLE);
    });
});

describe('原字模式下检索高亮不错位', () => {
    const normalizer = (s: string) => getSimplifiedConverter()(s);
    const marked = (node: React.ReactNode) => {
        const { container } = render(<p>{node}</p>);
        return { text: container.textContent, marks: [...container.querySelectorAll('mark')].map(m => m.textContent) };
    };

    it('显示的是底本原字（含扩展区的 𠮓），用归一后的简体检索词照样高亮在对的位置', () => {
        // 显示：甲𠮓乙𡚁丙；检索「变」应命中原字「𠮓」，检索「弊」命中「𡚁」
        const shown = '甲𠮓乙𡚁丙';
        expect(marked(renderHighlighted(shown, '变', normalizer))).toEqual({ text: shown, marks: ['𠮓'] });
        expect(marked(renderHighlighted(shown, '弊', normalizer))).toEqual({ text: shown, marks: ['𡚁'] });
        expect(marked(renderHighlighted(shown, '乙弊', normalizer))).toEqual({ text: shown, marks: ['乙𡚁'] });
    });

    it('原字里 𠮓 在命中词之前（UTF-16 单元数与归一后不同），位置仍然对', () => {
        const shown = '𠮓𠮓龍門';
        const r = marked(renderHighlighted(shown, '龙门', normalizer));
        expect(r.text).toBe(shown);
        expect(r.marks).toEqual(['龍門']);
    });

    it('通行繁体／简体下显示的文字照旧能高亮', () => {
        expect(marked(renderHighlighted('甲變乙', '变', normalizer)).marks).toEqual(['變']);
        expect(marked(renderHighlighted('甲变乙', '變', normalizer)).marks).toEqual(['变']);
    });
});

describe('TextReader：偏好 scriptMode 接到正文渲染', () => {
    const transport = () => fakeTextTransport('w1', {
        chapters: [{ n: 1, file: '001', title: '卷一', has_json: true }],
        kind: 'collated',
        json: { title: '正史類', sections: [{ title: '《史記》', type: 'book', content: SAMPLE }] } as never,
        item: { id: 'w1', title: '測試書' },
    });
    const body = (c: HTMLElement) => c.querySelector('article.bim-rd-prose')?.textContent ?? '';
    const mount = (locale: 'zh-Hant' | 'zh-Hans', prefs?: Record<string, unknown>) => {
        localStorage.clear();
        if (prefs) localStorage.setItem(KEY, JSON.stringify(prefs));
        return render(<LocaleProvider locale={locale}><TextReader id="w1" transport={transport()} /></LocaleProvider>);
    };
    beforeEach(() => { localStorage.clear(); });

    it('默认偏好：繁体站点原样、简体站点转简体（与改动前一致）', async () => {
        const hant = mount('zh-Hant');
        await waitFor(() => expect(body(hant.container)).toContain('其㫖縂在寳'));
        hant.unmount();
        const hans = mount('zh-Hans');
        await waitFor(() => expect(body(hans.container)).toContain(HANS));
    });

    it('原字：简体站点上也保留底本原字', async () => {
        const v = mount('zh-Hans', { scriptMode: 'orig' });
        await waitFor(() => expect(body(v.container)).toContain(SAMPLE));
    });

    it('通行繁体：异体字归一', async () => {
        const v = mount('zh-Hant', { scriptMode: 'hant' });
        await waitFor(() => expect(body(v.container)).toContain(HANT));
        expect(body(v.container)).not.toContain('㫖');
    });

    it('简体：𠮓、𡚁 也转了', async () => {
        const v = mount('zh-Hans', { scriptMode: 'hans' });
        await waitFor(() => expect(body(v.container)).toContain(HANS));
    });

    it('面板里点「原字」：正文立刻回到底本原字，站点 locale 不变；再点「简体」转回简体', async () => {
        const v = mount('zh-Hans');
        await waitFor(() => expect(body(v.container)).toContain(HANS));
        // 设置面板在窄屏是底部抽屉、宽屏是侧栏：按「繁简」组直接取，没展开就点设置键
        if (!screen.queryByRole('group', { name: '繁简' })) fireEvent.click(screen.getAllByRole('button', { name: /阅读设置|设置/ })[0]);
        const grp = () => within(screen.getByRole('group', { name: '繁简' }));
        fireEvent.click(grp().getByRole('button', { name: '原字' }));
        await waitFor(() => expect(body(v.container)).toContain(SAMPLE));
        fireEvent.click(grp().getByRole('button', { name: '简体' }));
        await waitFor(() => expect(body(v.container)).toContain(HANS));
    });
});
