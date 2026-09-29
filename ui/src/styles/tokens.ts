/**
 * --bim-* 设计变量：全包唯一的取值定义处（换肤接口）
 *
 * - 组件一律 `bim('fg')` 取色，得到 `var(--bim-fg, <默认值>)`；回退值只在这里写一次，
 *   不再每处各写一份。
 * - `styles/variables.css`（发布为 `book-index-ui/styles`）由本文件生成：
 *   改了这里跑 `npm run gen:tokens`，单测 tokens.test.ts 会校验两者一致。
 * - 消费者（kaiyuanguji-web、guji-platform）在自己的 :root 覆盖同名变量即可换肤；
 *   若同时引入了 `book-index-ui/styles`，覆盖声明须在它之后加载。
 *
 * 字段：
 * - value   —— 默认值；也是组件内联 `var()` 的回退值（没引样式表时生效）
 * - vscode  —— 在 :root 里先取这个 VS Code 主题变量，取不到再用 value
 * - css     —— :root 里的声明另有写法（如 color-mix 派生）时填；此时 value 只作回退值
 * - root    —— false 表示不在 :root 声明（仅作回退值，如 inherit）
 *
 * 2026-09 N2：本阶段只「清零硬编码、改走变量」，所有取值与改造前现网观感逐一相同。
 * 下面标 ⚠️ 的是历史遗留的不一致，为保证零变化原样保留，留给后续按视觉方针收敛。
 */

export interface BimToken {
    value: string;
    vscode?: string;
    css?: string;
    root?: false;
    /** 生成 variables.css 时写在该变量上方的注释 */
    note?: string;
}

function group<T extends Record<string, BimToken>>(title: string, tokens: T) {
    return { title, tokens };
}

/** 宋体字体栈：font-serif 与 font-reading 共用这一份（N3a 定的顺序） */
const SERIF_STACK = '"Songti SC", "Songti TC", STSong, "Noto Serif CJK SC", "Source Han Serif SC", SimSun, serif';

/** 分组仅用于生成 variables.css 时的注释标题 */
export const BIM_TOKEN_GROUPS = [
    group('基础（VS Code 环境下跟随 --vscode-*）', {
        'bg': { value: '#ffffff', vscode: '--vscode-editor-background' },
        'fg': { value: '#333333', vscode: '--vscode-foreground' },
        'input-bg': { value: '#ffffff', vscode: '--vscode-input-background' },
        'input-fg': { value: '#333333', vscode: '--vscode-input-foreground' },
        'input-border': { value: '#cccccc', vscode: '--vscode-input-border' },
        'widget-border': { value: '#e0e0e0', vscode: '--vscode-widget-border' },
        'link-fg': { value: '#0066cc', vscode: '--vscode-textLink-foreground' },
        'desc-fg': { value: '#717171', vscode: '--vscode-descriptionForeground' },
        'primary': { value: '#0078d4', vscode: '--vscode-button-background' },
        'primary-fg': { value: '#ffffff', vscode: '--vscode-button-foreground' },
        'primary-soft': {
            value: 'rgba(0, 120, 212, 0.15)',
            css: 'color-mix(in srgb, var(--bim-primary) 15%, transparent)',
        },
        'danger': { value: '#f44336' },
        'warning': { value: '#ff9800' },
        'success': { value: '#4caf50' },
        'sidebar-bg': { value: '#f3f3f3', vscode: '--vscode-sideBar-background' },
        'list-hover-bg': { value: 'rgba(0, 0, 0, 0.04)', vscode: '--vscode-list-hoverBackground' },
        'list-active-bg': { value: 'rgba(0, 120, 212, 0.1)', vscode: '--vscode-list-activeSelectionBackground' },
        'focus-border': { value: '#0078d4', vscode: '--vscode-focusBorder' },
    }),
    group('底色层次 / 文字与描边 / 链接', {
        'bg-subtle': { value: '#fafafa' },
        'widget-bg': { value: '#f8f8f8' },
        'muted': { value: '#888888' },
        'border': { value: '#e5e5e5' },
        'primary-bg': { value: '#fdf4f4' },
        'link': { value: '#1976d2' },
        'tag-bg': { value: '#f0f0f0' },
        'accent-bg': { value: '#1976d2' },
        'on-color-fg': { value: '#ffffff', note: '彩色底（徽章、选中态按钮）上的文字' },
    }),
    group('提示与警告', {
        'info-fg': { value: '#0c5380' },
        'info-bg': { value: '#e7f3ff' },
        'info-border': { value: '#b3dbff' },
        'warn-fg': { value: '#856404' },
        'warn-bg': { value: '#fff3cd' },
        'warn-border': { value: '#ffc107' },
        'danger-bg': { value: 'rgba(244, 67, 54, 0.08)', note: '错误提示条底色' },
        'danger-soft-bg': { value: 'rgba(244, 67, 54, 0.03)', note: '编辑器危险区块' },
        'danger-soft-border': { value: 'rgba(244, 67, 54, 0.13)' },
    }),
    group('遮罩与阴影', {
        'backdrop': { value: 'rgba(0, 0, 0, 0.5)', note: '对话框遮罩' },
        'overlay-bg': { value: '#00000010', note: '轻量遮罩底（图片占位等）' },
        'shadow-dialog': { value: '0 4px 20px rgba(0, 0, 0, 0.3)' },
        'shadow-dropdown': { value: '0 4px 12px rgba(0, 0, 0, 0.1)' },
        'shadow-tooltip': { value: '0 2px 8px rgba(0, 0, 0, 0.08)' },
        'shadow-fab': { value: '0 2px 8px rgba(0, 0, 0, 0.25)', note: '悬浮按钮（反馈）' },
        'shadow-card': { value: '0 1px 4px rgba(0, 0, 0, 0.06)', note: '展开的卡片' },
        'shadow-node': { value: '0 1px 3px rgba(0, 0, 0, 0.1)', note: '谱系图节点' },
        'shadow-node-selected': { value: '0 0 0 3px rgba(0, 120, 212, 0.2), 0 2px 8px rgba(0, 120, 212, 0.3)' },
    }),
    group('条目类型 / 状态徽章', {
        'type-book': { value: '#c0392b' },
        'type-work': { value: '#8e6f3e' },
        'type-collection': { value: '#2471a3' },
        'type-entity': { value: '#5b3e8e' },
        'status-draft': { value: '#e67e22' },
        'status-official': { value: '#27ae60' },
    }),
    group('资源', {
        'restype-text': { value: '#2196f3' },
        'restype-image': { value: '#ff9800' },
        'restype-text-image': { value: '#9c27b0' },
        'restype-physical': { value: '#795548' },
        'missing-fg': { value: '#e67e22', note: '资源缺册提示' },
        'colormode-bw-bg': { value: '#f5f5f5', note: '影印件色彩模式标记（黑白 / 彩色）' },
        'colormode-bw-fg': { value: '#757575' },
        'colormode-color-bg': { value: '#fff8e1' },
        'colormode-color-fg': { value: '#f57f17' },
        'progress-active': { value: '#f59e0b', note: '资源导入进度' },
        'progress-done': { value: '#10b981' },
        'progress-todo': { value: '#9ca3af' },
        'check-fine-bg': { value: '#e8f5e9', note: '文字资源校对程度徽章（精校 / 粗校 / AI整理）' },
        'check-fine-fg': { value: '#2e7d32' },
        'check-rough-bg': { value: '#fff3e0' },
        'check-rough-fg': { value: '#e65100' },
        'check-ai-bg': { value: '#e3f2fd' },
        'check-ai-fg': { value: '#1565c0' },
    }),
    group('整理本（CollatedEdition）', {
        'highlight-bg': { value: '#fff59d', note: '搜索命中高亮底' },
        'highlight-fg': { value: 'inherit', root: false },
        'section-lei': { value: '#8e6f3e', note: '章节类型标记：类 / 书 / 序 / 结语 / 考证 / 注释' },
        'section-shu': { value: '#c0392b' },
        'section-xu': { value: '#1a5276' },
        'section-jieyu': { value: '#7d6608' },
        'section-kaozhen': { value: '#5d6d7e' },
        'section-zhushi': { value: '#6c5b7b' },
        'section-tag-fg': { value: '#e74c3c', note: '章节标记（△ 等）' },
        'matchstate-fg': { value: '#b78900', note: '与底本匹配状态提示' },
        'quality-published': { value: '#1b5e20', note: '文本质量等级（出版 / 精校 / 粗校 / OCR）' },
        'quality-fine': { value: '#2e7d32' },
        'quality-rough': { value: '#1565c0' },
        'quality-ocr': { value: '#e65100' },
    }),
    group('版本传承（VersionLineageGraph / List） / 关系方向（RelationPanel）', {
        'lost-fg': { value: '#c62828', note: '佚失标记' },
        'confidence-certain': { value: '#2e7d32', note: '关系置信度' },
        'confidence-consensus': { value: '#1976d2' },
        'confidence-probable': { value: '#ed6c02' },
        'confidence-disputed': { value: '#c62828' },
        'lineage-edge-consensus': {
            value: '#555555',
            note: '⚠️ 同为 consensus，List 徽章用 --bim-confidence-consensus（蓝），Graph 连线用这个（灰）。'
                + '若要统一，覆盖成 var(--bim-confidence-consensus)',
        },
        'relation-up': { value: '#2196f3' },
        'relation-down': { value: '#4caf50' },
        'relation-flat': { value: '#ff9800' },
    }),
    group('编辑器视图（主要在 guji-platform 插件中可见）', {
        'editor-type-work': {
            value: '#4caf50',
            note: '⚠️ 与展示视图的 --bim-type-* 是两套配色（历史如此）。若要统一，覆盖成对应的 var(--bim-type-*)',
        },
        'editor-type-collection': { value: '#2196f3' },
        'editor-type-book': { value: '#ff9800' },
        'editor-type-entity': { value: '#9c27b0' },
        'source-url': { value: '#2196f3', note: '来源类型（SourceEditor）' },
        'source-bookid': { value: '#4caf50' },
        'mode-active-bg': { value: '#2196f3', note: '模式指示器当前态（ModeIndicator）' },
        'cover-accent': { value: '#8e6f3e', note: '书目卡片「封面」点缀（IndexBrowser resultVariant="card"）' },
    }),
    group('详情页（作品 / 版本 / 丛编）：宣纸 + 朱砂一套独立暖色，不继承 --bim-primary 等控件色', {
        'page-bg': { value: '#fbf9f3', note: '纸' },
        'row-hover-bg': { value: '#f5f1e5' },
        'selection-bg': { value: '#ecdcbc', note: '选区' },
        'band-bg': { value: '#f0e4cb', note: '全文入口横幅（暖沙）' },
        'band-bg-hover': { value: '#e6d5b4' },
        'ink': { value: '#2a231c', note: '文字层次：墨 → 正文 → 提要 → meta → 标签 → 提示' },
        'body-fg': { value: '#3b3228' },
        'quiet-fg': { value: '#5b4f40' },
        'meta-fg': { value: '#7b6a54' },
        'label-fg': { value: '#6f6457', note: '标签 / 提示：2026-09 N3a 调深，纸底与斑马底上对比度均 ≥4.5（原 #a3937b 2.8、#b3a385 2.3）' },
        'hint-fg': { value: '#756a5e' },
        'accent': { value: '#9c3a2c', note: '朱' },
        'accent-deep': { value: '#6f2a20', note: '链接 hover' },
        'rule-strong': { value: '#2a231c', note: '分隔线：强 → 常规 → 虚线 → 提要左线' },
        'rule': { value: '#e4dbc9' },
        'rule-dashed': { value: '#d6c9ae' },
        'rule-accent-soft': { value: '#e0d3b6' },
        'aux-fg': {
            value: '#6f6457',
            note: '辅助字（元数据、注记、「·」分隔的浅色小字）。须在 page-bg / zebra-bg 上对比度 ≥4.5（Q5 巡检）',
        },
        'card-bg': { value: '#fffdf9', note: '提要卡：抬起的面' },
        'zebra-bg': { value: '#f6f2eb', note: '表格斑马纹 / 左栏分组底（不画格线，靠这一阶底色分行）' },
        'tint-bg': { value: '#f3eee6', note: '检索框、悬停' },
        'shadow-summary': { value: '0 10px 32px rgba(60, 50, 40, 0.07)', note: '提要卡投影' },
        'flag-bg': { value: 'rgba(158, 42, 43, 0.08)', note: '唯一的状态色块「有影印」' },
        'sect-jing': { value: '#2e5266', note: '四部分布条：經部（人物页提要卡；无别处使用）' },
        'sect-shi': { value: '#9a7a3b', note: '四部分布条：史部' },
        'sect-zi': { value: '#4f7a5c', note: '四部分布条：子部' },
        'sect-ji': { value: '#9fb3bc', note: '四部分布条：集部' },
        'table-border': { value: 'color-mix(in srgb, currentColor 28%, transparent)', root: false, note: '古籍表格（跟随当前文字色）' },
        'table-head-bg': { value: 'color-mix(in srgb, currentColor 8%, transparent)', root: false },
    }),
    group('阅读器（整理本 / 全文）', {
        'reader-top': {
            value: '0px',
            note: '宿主吸顶导航的高度：阅读器工具条、目录与书影侧栏在它下面吸顶（如 60px）',
        },
    }),
    group('反馈浮钮（2026-09-28 Q5）', {
        'feedback-fab-z': { value: '40', note: '层级：低于页面抽屉、弹层（本包对话框为 1000）' },
        /*
         * 浮钮占掉的底部高度。FeedbackButton 挂载且未隐藏时写在 <html> 的内联样式上，
         * 宿主正文 padding-bottom 引用它；不在 :root 声明，未挂载时走宿主自己的回退值。
         */
        'feedback-fab-offset': { value: '0px', root: false },
    }),
    group('字体（全站无衬线，2026-09-05 定）', {
        'font-ui': {
            value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", '
                + '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        },
        'font-body': { value: 'system-ui, sans-serif', css: 'var(--bim-font-ui)' },
        'font-serif': {
            value: SERIF_STACK,
            note: '著录原文（提要、按语）用宋体',
        },
        'font-reading': {
            value: SERIF_STACK,
            css: 'var(--bim-font-serif)',
            note: '阅读器正文（整理本 / 全文）；默认接 font-serif，只需覆盖那一个就同时换掉',
        },
    }),
] as const;

type KeysOf<G> = G extends { tokens: infer T } ? keyof T : never;
export type BimTokenName = KeysOf<(typeof BIM_TOKEN_GROUPS)[number]> & string;

export const BIM_TOKENS: Readonly<Record<BimTokenName, BimToken>> = Object.assign({}, ...BIM_TOKEN_GROUPS.map(g => g.tokens));

const REFS: Record<string, string> = {};
for (const [name, t] of Object.entries(BIM_TOKENS) as [string, BimToken][]) REFS[name] = `var(--bim-${name}, ${t.value})`;

/** `bim('fg')` → `'var(--bim-fg, #333333)'`；未定义的变量名直接抛错，防手误 */
export function bim(name: BimTokenName): string {
    const ref = REFS[name];
    if (ref === undefined) throw new Error(`book-index-ui: 未定义的设计变量 --bim-${name}`);
    return ref;
}

/** :root 中该变量的声明值 */
export function bimRootValue(t: BimToken): string {
    if (t.css) return t.css;
    if (t.vscode) return `var(${t.vscode}, ${t.value})`;
    return t.value;
}

/** 生成 variables.css 的全文（`npm run gen:tokens` 调用） */
export function bimTokensCss(): string {
    const out: string[] = [
        '/**',
        ' * CSS 变量默认值（换肤接口）—— 由 src/styles/tokens.ts 生成，勿手改；',
        ' * 改完 tokens.ts 后运行 `npm run gen:tokens`。',
        ' *',
        ' * 消费者在自己的 :root 里覆盖同名变量即可换肤；覆盖声明须在本文件之后加载。',
        ' */',
        ':root {',
    ];
    BIM_TOKEN_GROUPS.forEach((g, i) => {
        if (i > 0) out.push('');
        out.push(`    /* ==== ${g.title} ==== */`);
        for (const [name, t] of Object.entries(g.tokens) as [string, BimToken][]) {
            if (t.root === false) continue;
            if (t.note) out.push(`    /* ${t.note} */`);
            out.push(`    --bim-${name}: ${bimRootValue(t)};`);
        }
    });
    out.push('}', '');
    return out.join('\n');
}
