/**
 * 手机专名卡台子：一段带专名／书名／合称的正文 + 固定底栏（仿阅读页的 卷目／书影／设置），
 * 摘要用假数据。?mouse=1 不看触屏行为时用（实际由测试用的设备决定）。
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../../src/i18n/provider';
import { EntityText } from '../../src/components/EntityText';
import { adaptEntityJson } from '../../src/core/entity-annotations';

const para = '何焯校正《九經解目錄》，以為即元李簡之書。今考簡所撰《學易記》，其書具在，未嘗與此書相復，且《永樂大典》所載亦作許衡，則非簡書明甚。焯之所校，不知何以云然也。元胡一桂撰。一桂，字庭芳，號雙湖，婺源人。景定甲子，領鄉薦，試禮部不第，教授鄉里以終。事蹟具《元史·儒學傳》。是編以《朱子本義》為宗，二程子之說亦兼採焉。';
const find = (w: string, nth = 0) => { let i = -1; for (let k = 0; k <= nth; k++) i = para.indexOf(w, i + 1); return [i, i + w.length] as const; };
const e = (id: string, type: string, w: string, target: Record<string, unknown>, nth = 0) => {
    const [a, b] = find(w, nth);
    return { id, type, text: w, span: { start_offset: a, end_offset: b }, target };
};
const entities = adaptEntityJson({
    entities: [
        e('e1', 'people', '何焯', { status: 'matched', entity_id: 'p1' }),
        e('e2', 'work', '九經解目錄', { status: 'matched', entity_id: 'w1' }),
        e('e3', 'people', '李簡', { status: 'matched', entity_id: 'p2' }),
        e('e4', 'work', '永樂大典', { status: 'matched', entity_id: 'w2' }),
        e('e5', 'people', '胡一桂', { status: 'new_candidate' }),
        e('e6', 'work', '朱子本義', { status: 'matched', entity_id: 'w3' }),
        e('e7', 'people', '二程子', { status: 'matched_multi', targets: [{ entity_id: 'p3', canonical_name: '程顥', part: '二' }, { entity_id: 'p4', canonical_name: '程頤', part: '程' }] }),
        e('e8', 'work', '儒學傳', { status: 'matched', entity_id: 'w4' }),
    ],
} as never);

const DB: Record<string, { title: string; meta: string; description: string }> = {
    p1: { title: '何焯', meta: '清 · 1661–1722', description: '字屺瞻，號義門，長洲人。康熙四十二年進士，以校勘古籍著稱，所校諸書世稱義門校本。' },
    p2: { title: '李簡', meta: '元', description: '字仲和，號學易，著有《學易記》九卷。' },
    p3: { title: '程顥', meta: '宋 · 1032–1085', description: '字伯淳，世稱明道先生，洛陽人。與弟頤並稱二程，開理學一脈。' },
    p4: { title: '程頤', meta: '宋 · 1033–1107', description: '字正叔，世稱伊川先生。著有《伊川易傳》。' },
    w1: { title: '九經解', meta: '宋 · 王昭禹', description: '' },
    w2: { title: '永樂大典', meta: '明 · 解縉等', description: '明成祖永樂年間所修類書，凡二萬二千八百七十七卷，今多散佚。清修《四庫全書》時自其中輯出佚書數百種。' },
    w3: { title: '周易本義', meta: '宋 · 朱熹', description: '十二卷。朱熹撰，以呂祖謙所定古《易》為本，分經二卷、傳十卷。' },
    w4: { title: '元史', meta: '明 · 宋濂', description: '二百十卷，明洪武二年修，歷時三百餘日而成。' },
};
const loadSummary = async (id: string) => DB[id] ? { id, ...DB[id] } : null;

const lines = Array.from({ length: 6 }, () => para).join('\n');

createRoot(document.getElementById('root')!).render(
    <LocaleProvider locale="zh-Hant">
        <div style={{ padding: '70px 16px 90px', fontSize: 20, lineHeight: 2.1, fontFamily: 'serif', color: '#222' }}>
            {lines.split('\n').map((_, i) => (
                <p key={i} style={{ margin: '0 0 1em' }}>
                    <EntityText text={para} entities={entities} loadSummary={loadSummary} />
                </p>
            ))}
        </div>
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 60, background: '#faf8f4', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-around', alignItems: 'center', fontSize: 13, zIndex: 50 }}>
            <span>卷目</span><span>书影</span><span>设置</span><span>报告错字</span>
        </div>
    </LocaleProvider>,
);
requestAnimationFrame(() => requestAnimationFrame(() => { (window as unknown as { __ready: boolean }).__ready = true; }));
