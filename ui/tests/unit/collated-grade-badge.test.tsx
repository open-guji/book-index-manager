/**
 * 整理本质量徽标（W-A）：source／none／placeholder 三档各显示一个徽标，文案取 messages.collated.qualityLabel。
 * fine／rough／ocr 的既有显示不变（rough 由 reader-loading 等用例覆盖）。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import { fakeTextTransport } from './helpers/text-transport';

const ID = 'd59f2nfhf8cg';

const badgeCase = (grade: 'source' | 'none' | 'placeholder', label: string) => {
    it(`质量 ${grade} → 徽标「${label}」`, async () => {
        const t = fakeTextTransport(ID, {
            kind: 'collated',
            json: { title: '卷一', sections: [{ title: '府軍前衛選簿', type: '书', content: '兵部為清查功次' }] },
            index: { type: 'catalog', text_quality: { grade, source_note: '測試底本' } },
        });
        const { container } = render(<TextReader id={ID} transport={t} title="武職選簿" />);
        await screen.findByText(/兵部為清查功次/);
        const badge = container.querySelector('.bim-rd-grade');
        expect(badge?.textContent).toBe(label);
    });
};

describe('整理本质量徽标（W-A 新增三档）', () => {
    badgeCase('source', '來源本');
    badgeCase('none', '無正文');
    badgeCase('placeholder', '佔位');
});
