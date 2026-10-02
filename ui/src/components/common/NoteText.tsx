import React from 'react';
import { splitNoteLinks } from '../../core/note-links';

/**
 * 来源说明一类自由文本：「《书名》(网址)」「[文字](网址)」、裸网址渲染成链接，其余原样（overview#359 P2-5）。
 * convert 只作用于文字段（繁简），网址不动。
 */
export function NoteText({ text, convert, className = 'bim-rd-link' }: {
    text: string;
    convert: (s: string) => string;
    className?: string;
}) {
    return (
        <>
            {splitNoteLinks(text).map((p, i) => (p.url
                ? <a key={i} className={className} href={p.url} target="_blank" rel="noopener noreferrer">{convert(p.text)}</a>
                : <React.Fragment key={i}>{convert(p.text)}</React.Fragment>))}
        </>
    );
}
