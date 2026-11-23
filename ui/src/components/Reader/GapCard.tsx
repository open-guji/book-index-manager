/**
 * 书影里的缺页占位卡：灰底，写缺了什么与估计字数；不占页号，插在 `afterPage` 那张图之后。
 * 数据见 core/gaps.ts（`guji-gaps/0.1`）。
 */
import type { ReaderGap } from '../../core/gaps';

export function GapCard({ gap, convert }: { gap: ReaderGap; convert?: (s: string) => string }) {
    const c = convert ?? ((s: string) => s);
    return (
        <div className="bim-fx-gap" data-testid="facsimile-gap" data-gap-after={gap.afterPage}>
            <div className="bim-fx-gap-card" role="img" aria-label={c(gap.note)}>
                <b>{c(gap.kind === '未拍' ? '未拍' : '缺頁')}</b>
                <span>{c(gap.what)}</span>
                {gap.estChars ? <small>{c(`約 ${gap.estChars} 字`)}</small> : null}
                <small>{c(gap.kind === '未拍' ? '書中有，圖未拍到' : '原書此處缺，無影像')}</small>
            </div>
        </div>
    );
}
