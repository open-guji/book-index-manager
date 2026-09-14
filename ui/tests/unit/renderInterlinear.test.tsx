/**
 * 夾注渲染單測。
 *
 * 防以下回歸：
 * 1. 2026-09-05 之前網站**直出標記**——《史記》頁上「書目答問」條顯示成
 *    `…一百三十卷。{{武昌局本…}}`。資料側當日已把 `（（…））`／`{{…}}`
 *    歸一為 `⟨…⟩`，渲染這一半在此。
 * 2. `renderText` 分段各過一次——整理本要在**注文之內**也能檢索高亮，
 *    若只對正文段呼叫，注裡的關鍵詞就永遠高亮不到。
 * 3. 無注之文不可白繞一趟：直接回 `renderText(text)`，免得把純字串
 *    拆成陣列而擾動 React 的 diff。
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderInterlinear } from '../../src/components/detail/primitives';

const html = (node: React.ReactNode) => render(<>{node}</>).container;

describe('renderInterlinear', () => {
    it('把 ⟨…⟩ 之內包成小字，且不留尖括號', () => {
        const c = html(renderInterlinear('張敷華介軒集⟨字缺安福人都察院左都御史⟩'));
        expect(c.textContent).toBe('張敷華介軒集字缺安福人都察院左都御史');
        const jz = c.querySelectorAll('.bim-jiazhu');
        expect(jz).toHaveLength(1);
        expect(jz[0].textContent).toBe('字缺安福人都察院左都御史');
    });

    it('一段裡多個注各自成塊', () => {
        const c = html(renderInterlinear('甲⟨注一⟩乙⟨注二⟩丙'));
        expect(c.textContent).toBe('甲注一乙注二丙');
        expect(c.querySelectorAll('.bim-jiazhu')).toHaveLength(2);
    });

    it('注在句首、句尾亦可', () => {
        expect(html(renderInterlinear('⟨注⟩正文')).textContent).toBe('注正文');
        expect(html(renderInterlinear('正文⟨注⟩')).textContent).toBe('正文注');
    });

    // ── `<…>` 新記法（2026-09-14 補）──────────────────────────────────
    //
    // 背景：用戶 2026-09-14 定「不做全面返工，逐本隨整理自然轉」，
    // ⇒ `⟨…⟩` 存量與 `<…>` 新本**長期並存**，兩種都必須認。
    // 改之前線上實況：《漢書藝文志》整理本已換 `<…>`（`⟨…⟩` 歸零），
    // 而本函數只認 `⟨…⟩` ⇒ 把夾注當正文直出，與坑 1 同型，只是換了記號。

    it('把 <…> 之內包成小字（spec §1 正規記法）', () => {
        const c = html(renderInterlinear('易傳周氏二篇<字王孫也。>'));
        expect(c.textContent).toBe('易傳周氏二篇字王孫也。');
        const jz = c.querySelectorAll('.bim-jiazhu');
        expect(jz).toHaveLength(1);
        expect(jz[0].textContent).toBe('字王孫也。');
    });

    it('兩種記法混排於同一段', () => {
        const c = html(renderInterlinear('甲⟨舊注⟩乙<新注>丙'));
        expect(c.textContent).toBe('甲舊注乙新注丙');
        expect(c.querySelectorAll('.bim-jiazhu')).toHaveLength(2);
    });

    it('取自庫中實料：漢志條目連師古注', () => {
        const c = html(renderInterlinear('服氏二篇<師古曰：“劉向《別録》云：服氏，齊人，號服光。”>'));
        expect(c.querySelectorAll('.bim-jiazhu')[0].textContent)
            .toBe('師古曰：“劉向《別録》云：服氏，齊人，號服光。”');
    });

    // spec §1 生效條件 2 的反例——這些都**不是**夾注，須原樣留在正文
    it.each([
        ['HTML 標籤', '<div>正文</div>'],
        ['自動連結', '<https://example.com>'],
        ['HTML 註釋', '正文<!-- p3 -->後文'],
        ['比較運算', 'a < b 且 b > c'],
        ['空記號', '甲<>乙'],
    ])('不誤判：%s', (_name, src) => {
        expect(html(renderInterlinear(src)).querySelectorAll('.bim-jiazhu')).toHaveLength(0);
    });

    it('未閉合按字面，不吞後文（spec §0.3）', () => {
        const c = html(renderInterlinear('甲<注未閉合乙'));
        expect(c.textContent).toBe('甲<注未閉合乙');
        expect(c.querySelectorAll('.bim-jiazhu')).toHaveLength(0);
    });

    it('起止須同行，不跨 \n（spec §0.2）', () => {
        const c = html(renderInterlinear('甲<注\n續>乙'));
        expect(c.querySelectorAll('.bim-jiazhu')).toHaveLength(0);
    });

    it('無注之文原樣返回，不拆成陣列', () => {
        expect(renderInterlinear('史記一百三十卷')).toBe('史記一百三十卷');
    });

    it('空、null、undefined 皆回空串', () => {
        expect(renderInterlinear('')).toBe('');
        expect(renderInterlinear(null)).toBe('');
        expect(renderInterlinear(undefined)).toBe('');
    });

    it('renderText 於正文段與注文段各過一次（高亮須在注裡也管用）', () => {
        const seen: string[] = [];
        html(renderInterlinear('甲⟨注⟩乙', (s) => { seen.push(s); return s; }));
        expect(seen).toEqual(['甲', '注', '乙']);
    });

    it('殘標記不成對者原樣留著，不吞字', () => {
        // 夾注跨條目被切斷者（整理本實有 143 處），渲染不可把半截當注
        expect(html(renderInterlinear('《汲塚師春》一卷⟨師春純集疏')).textContent)
            .toBe('《汲塚師春》一卷⟨師春純集疏');
        expect(html(renderInterlinear('《左傳》卜筮事⟩荀卿')).textContent)
            .toBe('《左傳》卜筮事⟩荀卿');
    });

    it('空注 ⟨⟩ 不炸', () => {
        expect(html(renderInterlinear('甲⟨⟩乙')).textContent).toBe('甲乙');
    });
});
