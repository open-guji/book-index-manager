/**
 * 实体标注样式（class 前缀 bim-et-）。颜色一律走 --bim-*，跟随详情页 / 阅读器主题。
 *
 * - 书名（work）：波浪线，与阅读器 `.bim-rd-pn` 同一画法（书名号样式）；
 * - 地名（place）：双线（`3px double`）；
 * - 人名、官职、朝代等：单线专名线；
 * - 已收录的实体是链接，悬停 / 聚焦时线条转朱色并弹出摘要卡。
 */
import { bim } from '../../styles/tokens';

export const ENTITY_TEXT_CSS = `
.bim-et-w { position: relative; display: inline; }
.bim-et {
  color: inherit; text-decoration-line: underline;
  text-decoration-thickness: 1px; text-underline-offset: 0.32em;
  text-decoration-color: ${bim('quiet-fg')};
  text-decoration-skip-ink: none;
}
.bim-et-work { text-decoration-style: wavy; }
.bim-et-person, .bim-et-office, .bim-et-dynasty, .bim-et-reign, .bim-et-other { text-decoration-style: solid; }
.bim-et-nu, a.bim-et-nu:hover, a.bim-et-nu:focus-visible { text-decoration-line: none; }
.bim-et-place { text-decoration-style: double; text-decoration-thickness: 3px; }
a.bim-et { cursor: pointer; }
a.bim-et:hover, a.bim-et:focus-visible { color: ${bim('accent')}; text-decoration-color: ${bim('accent')}; }
a.bim-et:focus-visible { outline: 2px solid ${bim('accent')}; outline-offset: 2px; border-radius: 2px; }
.bim-et-sr {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}
.bim-et-card {
  position: absolute; z-index: 30; top: calc(100% + 6px); left: 0;
  display: block; box-sizing: border-box; width: max-content; max-width: min(300px, 80vw);
  padding: 10px 12px; text-align: left; text-indent: 0; white-space: normal;
  writing-mode: horizontal-tb;
  background: ${bim('card-bg')}; color: ${bim('ink')};
  border: 1px solid ${bim('rule')}; border-radius: 6px; box-shadow: ${bim('shadow-summary')};
  font-family: ${bim('font-ui')}; font-size: 13px; line-height: 1.6; font-weight: normal;
}
.bim-et-card[data-align="end"] { left: auto; right: 0; }
.bim-et-card-k { display: block; font-size: 11px; letter-spacing: 0.1em; color: ${bim('label-fg')}; }
.bim-et-card-t { display: block; font-family: ${bim('font-serif')}; font-size: 15px; color: ${bim('ink')}; }
.bim-et-card-m { display: block; color: ${bim('meta-fg')}; }
.bim-et-card-d {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
  margin-top: 4px; color: ${bim('body-fg')};
}
.bim-et-card-s { display: block; color: ${bim('hint-fg')}; }
@media (prefers-reduced-motion: no-preference) {
  .bim-et-card { animation: bim-et-in 120ms ease-out; }
  @keyframes bim-et-in { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
}
`;
