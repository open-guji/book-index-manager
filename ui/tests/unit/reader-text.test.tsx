/**
 * 阅读器正文排版（Reader/ReaderText）：条目分行 ↔ 自然段（W7 回填）、夹注、高亮、专名线。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n';
import { ReaderMdText, canParagraphize, renderProperNames, stripBlockComments } from '../../src/components/Reader/ReaderText';

const CATALOG_MD = `<!-- p4 -->
六藝略
易經十二篇，施、孟、梁丘三家<師古曰：“上、下經及十翼，故十二篇。”>
易傳周氏二篇<字王孫也。>
服氏二篇<師古曰：“劉向《別録》云：服氏，齊人，號服光。”>
楊氏二篇<名何，字叔元，菑川人。>
蔡公二篇<衛人，事周王孫。>
韓氏二篇<名嬰。>
王氏二篇<名同。>
丁氏八篇<名寬，字元襄，梁人也。>
古五子十八篇<自甲子至壬子，說《易》陰陽。>
凡易十三家，二百九十四篇。`;

const RECORD_MD = `## 學而第一

一之一
子曰：「學而時習之，不亦說乎？」

一之二
有子曰：「其爲人也孝弟，而好犯上者，鮮矣。」`;

/** 宋史本纪式散文：空行分段、每段一两百字 */
const PROSE_MD = [
    '太祖啟運立極英武睿文神德聖功至明大孝皇帝諱匡胤，姓趙氏，涿郡人也。高祖朓，是為僖祖，仕唐歷永清、文安、幽都令。朓生珽，是為順祖，歷藩鎮從事，累官兼御史中丞。珽生敬，是為翼祖，歷營、薊、涿三州刺史。',
    '宣祖少驍勇，善騎射，事趙王王鎔，為鎔將五百騎援唐莊宗于河上有功。莊宗愛其勇，留典禁軍。漢乾祐中，討王景於鳳翔，會蜀兵來援，戰于陳倉。始合，矢集左目，氣彌盛，奮擊大敗之，以功遷護聖都指揮使。',
    '太祖，宣祖仲子也，母杜氏。後唐天成二年，生於洛陽夾馬營，赤光繞室，異香經宿不散，體有金色，三日不變。既長，容貌雄偉，器度豁如，識者知其非常人。學騎射，輒出人上。',
].join('\n\n');

function mount(node: React.ReactNode, locale: 'zh-Hant' | 'zh-Hans' = 'zh-Hant') {
    return render(<LocaleProvider locale={locale}><article>{node}</article></LocaleProvider>).container;
}

const mark = (s: string) => <mark>{s}</mark>;
const highlighter = (q: string) => (seg: string) => {
    const i = seg.indexOf(q);
    if (i < 0) return seg;
    return <>{seg.slice(0, i)}{mark(q)}{seg.slice(i + q.length)}</>;
};

describe('自然段：夹注照常小字、不露记号', () => {
    it('目录体（<…> 记法）', () => {
        const c = mount(<ReaderMdText text={CATALOG_MD} mode="paragraph" />);
        expect(c.textContent).not.toMatch(/[<>]/);
        const jz = c.querySelectorAll('.bim-jiazhu');
        expect(jz.length).toBe(9);
        expect(jz[0].textContent).toBe('師古曰：“上、下經及十翼，故十二篇。”');
        // 页内逐行以全角空格相接成一段
        expect(c.querySelectorAll('p')).toHaveLength(1);
        expect(c.textContent).toContain('六藝略　易經十二篇');
        // 分行模式夹注数相同
        const line = mount(<ReaderMdText text={CATALOG_MD} mode="line" />);
        expect(line.querySelectorAll('.bim-jiazhu')).toHaveLength(9);
        expect(line.querySelectorAll('p').length).toBeGreaterThan(5);
    });

    it('语录/经传体（⟨…⟩ 与 <…> 混排）', () => {
        const text = '## 隱公元年\n元年春，王正月。⟨元年者何？君之始年也。⟩\n\n三月，公及邾婁儀父盟于眛。<及者何？與也。>';
        const c = mount(<ReaderMdText text={text} mode="paragraph" />);
        expect(c.textContent).not.toMatch(/[<>⟨⟩]/);
        expect(c.querySelectorAll('.bim-jiazhu')).toHaveLength(2);
    });
});

describe('自然段：搜索高亮照常', () => {
    it('跨条目合并后命中词仍被 <mark> 包住', () => {
        const c = mount(<ReaderMdText text={RECORD_MD} mode="paragraph" renderText={highlighter('孝弟')} />);
        expect(c.querySelectorAll('p')).toHaveLength(1);
        expect(c.querySelector('mark')?.textContent).toBe('孝弟');
    });
});

describe('体裁判不清就不给「自然段」开关、也不合并', () => {
    it('灰区文本：逐行显示', () => {
        const text = Array(6).fill('甲條內容').join('\n') + '\n\n' + Array(6).fill('乙條內容').join('\n');
        expect(canParagraphize(text)).toBe(false);
        const c = mount(<ReaderMdText text={text} mode="paragraph" />);
        expect(c.querySelectorAll('p')).toHaveLength(12);
    });

    it('散文（宋史本纪）不会把整章并成一段', () => {
        expect(canParagraphize(PROSE_MD)).toBe(false);
        const c = mount(<ReaderMdText text={PROSE_MD} mode="paragraph" />);
        expect(c.querySelectorAll('p')).toHaveLength(3);
        // 段间空行不再额外垫空隙（每段本来就是一个 <p>）
        expect(c.querySelectorAll('.bim-rd-gap')).toHaveLength(0);
    });

    it('一章里的散文小节（藝文志「序」）照分行，书目小节才合并；整行粗体条目名不跨条合并', () => {
        const text = [
            '## 序',
            PROSE_MD,
            '',
            '## 易類',
            '**《周易》十卷**',
            '王弼注。',
            '',
            '**《周易正義》十四卷**',
            '孔穎達撰。',
        ].join('\n');
        const c = mount(<ReaderMdText text={text} mode="paragraph" />);
        expect(c.querySelectorAll('h4')).toHaveLength(2);
        expect([...c.querySelectorAll('p')].map(p => p.textContent)).toEqual([
            ...PROSE_MD.split('\n\n'),
            '王弼注。',
            '孔穎達撰。',
        ]);
    });

    it('语录体、目录体判得清', () => {
        expect(canParagraphize(RECORD_MD)).toBe(true);
        expect(canParagraphize(CATALOG_MD)).toBe(true);
    });
});

describe('md 杂项', () => {
    it('跨行的生成说明注释不进正文；与卷名相同的 # 标题去掉', () => {
        const text = '<!-- 本档由 json 反向生成。\n     生成后逐条对账。 -->\n\n# 正史類\n\n**《史記》一百三十卷**\n\n漢太史令夏陽司馬遷子長撰。';
        expect(stripBlockComments(text)).not.toContain('本档');
        const c = mount(<ReaderMdText text={text} mode="line" dropTitle="正史類" />);
        expect(c.textContent).not.toContain('本档');
        expect(c.querySelector('h2')).toBeNull();
        // 整行粗体是条目标题
        expect(c.querySelector('h4')?.textContent).toBe('《史記》一百三十卷');
        expect(c.querySelector('p')?.textContent).toBe('漢太史令夏陽司馬遷子長撰。');
    });

    it('简体模式整段转换（表格外的正文）', async () => {
        const c = mount(<ReaderMdText text={'## 卷一\n\n漢太史令撰。'} mode="line" />, 'zh-Hans');
        await waitFor(() => expect(c.textContent).toContain('汉太史令撰。'), { timeout: 8000 });
    }, 10000);
});

describe('专名线', () => {
    it('书名号内文字加波浪线；书名号视觉隐藏但仍在文本里', () => {
        const c = render(<p>{renderProperNames('案班固云：采《世本》、《戰國策》。')}</p>).container;
        const pn = c.querySelectorAll('.bim-rd-pn');
        expect(pn).toHaveLength(2);
        expect(pn[0].textContent).toBe('《世本》');
        expect(pn[0].querySelectorAll('.bim-rd-sr')).toHaveLength(2);
        expect(c.textContent).toBe('案班固云：采《世本》、《戰國策》。');
    });

    it('打开后夹注里的书名也画线；不成对的书名号原样', () => {
        const c = mount(<ReaderMdText text={'說《易》陰陽<見《漢書》>。\n殘《字'} mode="line" properNames />);
        expect(c.querySelectorAll('.bim-rd-pn')).toHaveLength(2);
        expect(c.querySelector('.bim-jiazhu .bim-rd-pn')?.textContent).toBe('《漢書》');
        expect(c.textContent).toContain('殘《字');
    });
});
