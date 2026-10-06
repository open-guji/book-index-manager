import { describe, it, expect } from 'vitest';
import { LAYOUT_CSS } from '../../src/components/detail/layout';

// 10-06：馆藏资源组的类别标签很长（「國圖藏本：平阳段子成   蒙古中统二年[1261]   明[1368-1644]重修」），
// .bim-d-meta 的 flex: none 让它在 390 宽下撑出 31px 横向滚动（web e2e「窄屏下……不横向溢出」）。
describe('右栏资源类别标签', () => {
    it('可收缩、可折行，且选择器比 .bim-d-side li .bim-d-meta 更具体', () => {
        expect(LAYOUT_CSS).toMatch(/\.bim-d-side li \.bim-d-meta\.bim-d-kind \{[^}]*flex: 0 1 auto;[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
    });
});
