import React from 'react';
import { bim, type BimTokenName } from '../../styles/tokens';
import type { IndexType } from '../../types';

/** 类型标记：小方块（取 --bim-type-* 变量），代替原来的 emoji（overview#286：搜索页去 emoji） */
export const TypeMark: React.FC<{ type: IndexType; size?: number }> = ({ type, size = 9 }) => (
    <span
        aria-hidden="true"
        style={{
            display: 'inline-block', width: size, height: size, borderRadius: 1, flex: 'none',
            background: bim(`type-${type}` as BimTokenName), verticalAlign: 'middle',
        }}
    />
);
