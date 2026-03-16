import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IndexDetail } from '../components/IndexDetail';
import { IndexEditor } from '../components/IndexEditor';
import type { IndexEditorData } from '../components/IndexEditor';
import type { IndexDetailData } from '../types';

// 3 本测试数据
const SAMPLE_DATA: IndexDetailData[] = [
    {
        id: "GYJ3CJh4p5d",
        type: "work",
        title: "南北史合注",
        authors: [{ name: "李清", role: "撰", dynasty: "明" }],
        volume_count: { number: 191 },
        indexed_by: [{
            source: "欽定四庫全書總目",
            source_bid: "GY4HvsY3w3u",
            title_info: "《南北史合注》•一百九十一卷",
            author_info: "明李清撰",
            summary: "明李清撰。清字心水，號映碧，揚州興化人。禮部尚書思誠之孫，大學士春芳之玄孫；崇禎辛未進士，官至吏科給事中；事蹟附見《明史李春芳傳》。清以南北朝諸史並存，冗雜特甚，李延壽雖並為一書，而諸說兼行，仍多矛盾。嘗與張溥議，欲仿裴松之《三國志》注例，合宋、齊、梁、陳四史為《南史》，魏、齊、周、隋四史為《北史》，未就而溥歿。",
            comment: "謹案：此書經四庫館臣校訂，收入四庫全書。"
        }],
    } as IndexDetailData,
    {
        id: "GYJ3CJiQjod",
        type: "work",
        title: "南唐書合訂",
        authors: [{ name: "李清", role: "撰", dynasty: "明" }],
        volume_count: { number: 25 },
        indexed_by: [{
            source: "欽定四庫全書總目",
            source_bid: "GY4HvsY3w3u",
            title_info: "《南唐書合訂》•二十五卷",
            author_info: "明李清撰",
            summary: "明李清撰。清有南北史合注，巳著錄。是書記南唐一代事蹟，以陸遊書為主，而以馬令書及諸野史輔之。"
        }],
    } as IndexDetailData,
    {
        id: "GYJ3CJjtj5y",
        type: "work",
        title: "閩小紀",
        authors: [{ name: "周亮工", role: "撰", dynasty: "清" }],
        volume_count: { number: 4 },
        additional_titles: [{ book_title: "續閩小紀", n_juan: 4 }],
        indexed_by: [{
            source: "欽定四庫全書總目",
            source_bid: "GY4HvsY3w3u",
            title_info: "《閩小紀》•四卷",
            author_info: "國朝周亮工撰",
            version: "浙江鮑士恭家藏本",
            summary: "國朝周亮工撰。亮工字元亮，號櫟園，祥符人。前明崇禎庚辰進士，授濰縣知縣。入國朝，官至戶部右侍郎，以事革職，終於江南督糧道。"
        }],
    } as IndexDetailData,
];

/** 将 IndexDetailData 转换为 IndexEditorData 扁平格式 */
function toEditorData(d: IndexDetailData): IndexEditorData {
    return {
        id: d.id,
        title: d.title,
        type: d.type,
        author: d.authors?.map(a => {
            const parts: string[] = [];
            if (a.dynasty) parts.push(`[${a.dynasty}]`);
            parts.push(a.name);
            if (a.role) parts.push(a.role);
            return parts.join(' ');
        }).join('、') || '',
        dynasty: d.authors?.[0]?.dynasty || '',
        indexed_by: d.indexed_by,
        additional_titles: d.additional_titles,
    };
}

function App() {
    const [selectedId, setSelectedId] = useState(SAMPLE_DATA[0].id);
    const [mode, setMode] = useState<'detail' | 'editor'>('detail');
    const selected = SAMPLE_DATA.find(d => d.id === selectedId)!;
    const [editorData, setEditorData] = useState<IndexEditorData>(toEditorData(selected));

    const handleSelect = (id: string) => {
        setSelectedId(id);
        const item = SAMPLE_DATA.find(d => d.id === id)!;
        setEditorData(toEditorData(item));
    };

    return (
        <div style={{
            display: 'flex',
            height: '100vh',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
            background: '#f5f5f5',
        }}>
            {/* Sidebar */}
            <div style={{
                width: '280px',
                borderRight: '1px solid #e0e0e0',
                background: '#fff',
                padding: '16px 0',
                overflowY: 'auto',
                flexShrink: 0,
            }}>
                {/* Mode tabs */}
                <div style={{ display: 'flex', gap: '4px', padding: '0 16px', marginBottom: '16px' }}>
                    {(['detail', 'editor'] as const).map(m => (
                        <button key={m} onClick={() => setMode(m)} style={{
                            flex: 1, padding: '6px', fontSize: '12px', fontWeight: 500,
                            border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer',
                            background: mode === m ? '#0078d4' : 'transparent',
                            color: mode === m ? '#fff' : '#666',
                        }}>
                            {m === 'detail' ? '详情' : '编辑器'}
                        </button>
                    ))}
                </div>
                <h2 style={{ padding: '0 16px', fontSize: '14px', color: '#717171', marginBottom: '12px' }}>
                    预览 ({SAMPLE_DATA.length} 部)
                </h2>
                {SAMPLE_DATA.map(item => (
                    <div
                        key={item.id}
                        onClick={() => handleSelect(item.id)}
                        style={{
                            padding: '12px 16px',
                            cursor: 'pointer',
                            background: item.id === selectedId ? '#e8f0fe' : 'transparent',
                            borderLeft: item.id === selectedId ? '3px solid #0078d4' : '3px solid transparent',
                        }}
                    >
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{item.title}</div>
                        <div style={{ fontSize: '12px', color: '#717171', marginTop: '2px' }}>
                            {item.authors?.[0]?.dynasty && `[${item.authors[0].dynasty}] `}
                            {item.authors?.[0]?.name}
                            {item.authors?.[0]?.role && ` ${item.authors[0].role}`}
                            {item.volume_count?.number && ` · ${item.volume_count.number}卷`}
                        </div>
                    </div>
                ))}
            </div>
            {/* Main */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px' }}>
                {mode === 'detail' ? (
                    <IndexDetail
                        data={selected}
                        onNavigate={id => alert(`Navigate to: ${id}`)}
                    />
                ) : (
                    <IndexEditor
                        data={editorData}
                        onChange={setEditorData}
                        onSave={() => {
                            console.log('Save:', JSON.stringify(editorData, null, 2));
                            alert('已保存到 console（查看 DevTools）');
                        }}
                    />
                )}
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
