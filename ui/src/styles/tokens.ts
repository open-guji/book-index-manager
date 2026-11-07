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

/** 黑体字体栈：font-ui 与 font-reader-ui 的回退值共用这一份 */
const SANS_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", '
    + '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif';

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
        'quality-source': { value: '#1b5e20', note: '文本质量等级（底本 / OCR / 粗校 / 精校 / 暂无正文 / 占位）' },
        'quality-ocr': { value: '#e65100' },
        'quality-rough': { value: '#1565c0' },
        'quality-fine': { value: '#2e7d32' },
        'quality-none': { value: '#5f6368', note: '中性灰：暂无正文' },
        'quality-placeholder': { value: '#757575', note: '中性灰：占位' },
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
        'mark-bg': { value: '#fde68a', note: '专名出处：从「古籍中的出处」跳到阅读页时高亮的字、出处摘录里的专名（A12）' },
        'mark-flash': { value: '#f59e0b', note: '专名出处：跳到阅读页时高亮先闪一下的颜色' },
        'mark-soft': { value: 'rgba(253, 230, 138, 0.45)', note: '专名出处：阅读页 `#e=` 时本章提到该实体的其余各处（当前一处用 mark-bg）' },
        'theme-dot-zhusha': { value: '#9c3a2c', note: '主题切换控件的色点：朱砂（不随主题变，两套主题下都要认得出）' },
        'theme-dot-indigo': { value: '#2e5266', note: '主题切换控件的色点：靛青' },
        'theme-dot-ink': { value: '#3b4a58', note: '主题切换控件的色点：墨' },
        'sect-jing': { value: '#2e5266', note: '四部分布条：經部（人物页提要卡；无别处使用）' },
        'sect-shi': { value: '#9a7a3b', note: '四部分布条：史部' },
        'sect-zi': { value: '#4f7a5c', note: '四部分布条：子部' },
        'sect-ji': { value: '#9fb3bc', note: '四部分布条：集部' },
        'table-border': { value: 'color-mix(in srgb, currentColor 28%, transparent)', root: false, note: '古籍表格（跟随当前文字色）' },
        'table-head-bg': { value: 'color-mix(in srgb, currentColor 8%, transparent)', root: false },
    }),
    group('版式（v4 外观系统，overview#291）：疏朗＝留白分区（默认，下列值即疏朗）；界栏＝框线分区（`<html data-layout="boxed">`）', {
        'fr-bd': { value: '0 solid transparent', note: '区块外框（border 简写）。疏朗无框；界栏 1px 实线' },
        'fr-bg': { value: 'transparent', note: '区块底。界栏＝卡面色' },
        'fr-hd-pad': { value: '14px 18px', note: '区块标题栏内边距。10-01 起疏朗也有淡染底的标题栏（--bim-fr-hd-bg），故疏朗 14px 18px，界栏 12px 18px' },
        'fr-hd-bd': { value: '0 solid transparent', note: '区块标题栏下沿线（border 简写）' },
        'fr-bd-pad': { value: '0', note: '区块正文内边距' },
        'fr-gap': { value: '56px', note: '区块之间的间距。界栏收紧到 24px（框线本身已分隔）' },
        'fr-side-gap': { value: '34px', note: '侧栏各块之间的间距；界栏 20px' },
        'fr-shadow': { value: '0 1px 0 var(--bim-rule), 0 12px 32px -18px rgba(40, 36, 31, 0.25)', note: '抬起的面（提要卡）的投影；界栏不用投影，靠框线' },
        'fr-tab-bd': { value: 'transparent', note: '页签行下沿线颜色（疏朗不画，界栏画）' },
        // ── 版式判准（overview 设计/v4/版式判准.md §三，2026-10-01）：疏朗不画任何框线和分隔线；界栏区块、卡片、表格、侧栏都有框。
        //    边框类一律 border 简写；疏朗取 1px solid transparent（不是 none），两种版式盒子一样大，切换不跳。
        'fr-hd-size': { value: '24px', note: '分区标题字号。界栏标题在框顶标题栏里，小一档 19px' },
        'fr-hd-bg': { value: 'color-mix(in srgb, var(--bim-accent) 7%, var(--bim-page-bg))', note: '分区标题栏底色（淡染主色）。疏朗混进页面底，界栏 6% 混进卡面底。主色取 accent（primary 是 VS Code 按钮蓝，不随配色）' },
        'fr-card-bd': { value: '1px solid transparent', note: '卡片边框。疏朗不画（靠卡面底与淡投影）；界栏 1px' },
        'fr-card-bg': { value: 'var(--bim-card-bg)', note: '卡片底' },
        'fr-row-bd': { value: '1px solid transparent', note: '列表行线、块内小分割线。疏朗不画（靠行距）；界栏 1px' },
        'fr-row-pad': { value: '10px 2px', note: '列表行内边距。界栏收紧 7px 2px' },
        'fr-chrome-bd': { value: '1px solid transparent', note: '顶栏、分区导航（吸顶锚点条）的线' },
        'fr-tag-bd': { value: '1px solid transparent', note: '标签、版本签、计数签、工具按钮的边框。疏朗浅底无框；界栏透明底加框' },
        'fr-tag-bg': { value: 'var(--bim-tint-bg)', note: '标签底' },
        'fr-tbl-cell-bd': { value: '0 solid transparent', note: '表格格线。疏朗不画（靠斑马纹）；界栏全格线' },
        'fr-tbl-zebra': { value: 'var(--bim-tint-bg)', note: '表格斑马纹（只在疏朗下有）' },
        'fr-rail-bd': { value: '1px solid transparent', note: '侧栏里的块、提示块的边框' },
        'fr-rail-bg': { value: 'var(--bim-tint-bg)', note: '侧栏块底。疏朗浅底；界栏卡面底' },
        'fr-spine-bd': { value: '1px solid transparent', note: '题签、书脊（竖排书名）的边框。界栏是强调色浅线' },
        'fr-spine-bg': { value: 'var(--bim-flag-bg)', note: '题签、书脊底。疏朗浅色实底；界栏卡面底（正史原志两种版式都是强调色实底）' },
        'fr-plank': { value: '0 solid transparent', note: '书架架板（border 简写）。只在界栏下画 3px' },
        'fr-axis-bd': { value: '0 solid transparent', note: '时间轴轴线。界栏 1px' },
        'fr-axis-band': { value: '6px', note: '时间轴底带高度。疏朗用 6px 浅色带代替轴线；界栏 0' },
        'fr-tick': { value: '0', note: '时间轴刻度短线长度。界栏 5px' },
        'fr-band-gap': { value: '3px', note: '年代带各段之间的空隙。疏朗 3px；界栏紧贴' },
        'fr-band-bd': { value: '0 solid transparent', note: '年代带外框与段间分隔。界栏 1px' },
    }),
    group('阅读器（整理本 / 全文）', {
        'reader-top': {
            value: '0px',
            note: '宿主吸顶导航的高度：阅读器工具条、目录与书影侧栏在它下面吸顶（如 60px）',
        },
        'reader-warm': { value: '#c9a24a', note: '阅读设置侧栏的暖黄：只做底色（8%）与选中态（24%），与朱／靛／墨三套主色都不冲' },
        'warp-bg': { value: '#faf8f5', note: '古籍矫正底本书影画布底色' },
        'warp-box-shadow': { value: '0 2px 12px rgba(0, 0, 0, 0.08)', note: '古籍底本书影浮雕阴影' },
        'warp-sel-bg': { value: 'rgba(196, 148, 76, 0.45)', note: '古籍对读字框选中高亮底色' },
        'warp-sel-stroke': { value: '#a06e1c', note: '古籍对读字框选中描边' },
        'warp-hover-bg': { value: 'rgba(217, 185, 106, 0.25)', note: '古籍对读字框悬停高亮底色' },
        'warp-hover-stroke': { value: '#c4944c', note: '古籍对读字框悬停描边' },
        'warp-badge-bg': { value: 'rgba(184, 134, 54, 0.12)', note: '图文对读徽章背景' },
        'warp-badge-fg': { value: '#8c6820', note: '图文对读徽章文字颜色' },
        'warp-badge-bd': { value: 'rgba(184, 134, 54, 0.3)', note: '图文对读徽章边框' },
        'warp-banxin-border': { value: '#8a8070', note: '版心分界线' },
        'warp-banxin-fold': { value: 'rgba(160, 110, 28, 0.65)', note: '版心中缝对折线' },
        'warp-banxin-outer': { value: '#c9c3b4', note: '版心外边线' },
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
        'font-ui': { value: SANS_STACK },
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
        'font-reader-ui': {
            value: SANS_STACK,
            css: 'var(--bim-font-ui)',
            note: '阅读器范围（.bim-rd）内的界面字体：阅读器根节点上把 font-ui / font-body 换成它；宿主想让阅读器单独用系统字体栈，覆盖这一个即可',
        },
        'font-reader-serif': {
            value: SERIF_STACK,
            css: 'var(--bim-font-serif)',
            note: '阅读器范围内的宋体：阅读器根节点上把 font-serif 换成它',
        },
        'font-reader-reading': {
            value: SERIF_STACK,
            css: 'var(--bim-font-reading)',
            note: '阅读器范围内的正文字体：阅读器根节点上把 font-reading 换成它',
        },
    }),
    group('列表页（IndexBrowser）', {
        'browser-pad-x': {
            value: '20px',
            note: '列表页标题栏、检索框行、统计摘要、结果区的左右内边距；宿主要贴齐自己的版心时设 0',
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

/**
 * 可切换主题（2026-09-29，overview#286）：默认「朱砂」= 上面各变量的 value，不需要列出；
 * 这里只列与默认不同的变量，生成为 `:root[data-theme="<名>"] { … }`。
 * 只换强调色一族（链接、主按钮、选中态、「有影印」块），
 * 纸色、墨色、暖沙横幅与分类色不动。两套主题的对比度由 tokens.test.ts 卡（AA ≥ 4.5）。
 * 切换靠宿主在 <html> 上设 data-theme；未设或值不认识 = 朱砂（`data-theme="zhusha"` 也是朱砂）。
 */
export const BIM_THEMES = {
    indigo: {
        'accent': '#2e5266',
        'accent-deep': '#23414f',
        'flag-bg': '#e3eaec',
        'selection-bg': '#dfe6e3',
        'rule-accent-soft': '#cfd9dc',
    },
    /*
     * 墨（设计稿 10-01「墨」，overview#340：纯白底 #ffffff、冷灰中性色、主色石板蓝灰 #3b4a58）。与朱砂／靛青不同：
     * 纸色、墨色阶、线色、面色也换成一套中性灰，不只是强调色。主色与正文 #1d2024 色相相近、对比只有 ~1.8（不到 3:1），
     * 所以链接、悬停、选中态仍不能只靠颜色区分——组件里对 data-theme="ink" 另加了下划线／描边／字重。
     * 色值取自设计稿 THEMES["墨"]：page=bg card=sf tint=ln2 zebra／hover=hv selection=ln rule=ln rule-dashed=ln3
     * ink=ink body=ink2 quiet=ink3 accent=ac accent-deep=ac-d flag=ac-t。与开源古籍站 globals.css 的 ink 块同一套。
     * 辅助字（meta/label/aux/hint）：设计稿 mut #6b7178 白底 4.93，但在 tint #eceef0 上只有 4.24，按 AA 调深到 #5f656c（各底 ≥4.6）。
     */
    ink: {
        'page-bg': '#ffffff',
        'card-bg': '#f6f7f8',
        'zebra-bg': '#eef0f2',
        'tint-bg': '#eceef0',
        'row-hover-bg': '#eef0f2',
        'selection-bg': '#e3e5e8',
        'band-bg': '#eef0f2',
        'band-bg-hover': '#e3e5e8',
        'ink': '#1d2024',
        'body-fg': '#3b4046',
        'quiet-fg': '#565c63',
        'meta-fg': '#5f656c',
        'label-fg': '#5f656c',
        'aux-fg': '#5f656c',
        'hint-fg': '#5f656c',
        'accent': '#3b4a58',
        'accent-deep': '#2e3a46',
        'flag-bg': '#e8ecf0',
        'rule-strong': '#1d2024',
        'rule': '#e3e5e8',
        'rule-dashed': '#cdd1d6',
        'rule-accent-soft': '#cdd1d6',
        'shadow-summary': '0 10px 32px rgba(29, 32, 36, 0.06)',
        'fr-shadow': '0 1px 0 var(--bim-rule), 0 12px 32px -18px rgba(29, 32, 36, 0.22)',
    },
} as const satisfies Record<string, Partial<Record<BimTokenName, string>>>;

export type BimThemeName = 'zhusha' | keyof typeof BIM_THEMES;

/** 版式覆盖（默认「疏朗」= BIM_TOKENS 的 value，不需要列出）。生成 `:root[data-layout="boxed"]`。 */
export const BIM_LAYOUTS = {
    boxed: {
        'fr-bd': '1px solid var(--bim-rule)',
        'fr-bg': 'var(--bim-card-bg)',
        'fr-hd-pad': '12px 18px',
        'fr-hd-bd': '1px solid var(--bim-rule)',
        'fr-bd-pad': '14px 18px 18px',
        'fr-gap': '24px',
        'fr-side-gap': '20px',
        'fr-shadow': 'none',
        'fr-tab-bd': 'var(--bim-rule)',
        'fr-hd-size': '19px',
        'fr-hd-bg': 'color-mix(in srgb, var(--bim-accent) 6%, var(--bim-card-bg))',
        'fr-card-bd': '1px solid var(--bim-rule)',
        'fr-row-bd': '1px solid var(--bim-rule)',
        'fr-row-pad': '7px 2px',
        'fr-chrome-bd': '1px solid var(--bim-rule)',
        'fr-tag-bd': '1px solid var(--bim-rule-strong)',
        'fr-tag-bg': 'transparent',
        'fr-tbl-cell-bd': '1px solid var(--bim-rule)',
        'fr-tbl-zebra': 'transparent',
        'fr-rail-bd': '1px solid var(--bim-rule)',
        'fr-rail-bg': 'var(--bim-card-bg)',
        'fr-spine-bd': '1px solid var(--bim-rule-accent-soft)',
        'fr-spine-bg': 'var(--bim-card-bg)',
        'fr-plank': '3px solid var(--bim-rule-strong)',
        'fr-axis-bd': '1px solid var(--bim-rule-strong)',
        'fr-axis-band': '0',
        'fr-tick': '5px',
        'fr-band-gap': '0',
        'fr-band-bd': '1px solid var(--bim-rule-dashed)',
    },
} as const satisfies Record<string, Partial<Record<BimTokenName, string>>>;

export type BimLayoutName = 'airy' | keyof typeof BIM_LAYOUTS;

/**
 * 调色板（品牌色）：宿主只需覆盖 `--bim-palette-*`（约 20 个），语义变量全部由它推出。
 * 生成 `palette.css`（发布为 `book-index-ui/palette.css`）：在 tokens.css 之后引入、**再**覆盖调色板。
 * 不引 palette.css 的宿主（VS Code 扩展等）不受影响——tokens.css 的语义默认值一个字没动。
 * 默认取值 = 开源古籍站的朱砂主题；宿主有自己的令牌体系时，把调色板接过去即可（随主题切换自动跟随）。
 */
export const BIM_PALETTE = {
    'paper': { value: '#faf7f2', note: '页底' },
    'raise': { value: '#fffdf9', note: '抬起的面（卡片、检索框）' },
    'tint': { value: '#f3eee6', note: '分组底、悬停' },
    'tint-2': { value: '#ebe4d9', note: '再深一阶：悬停／选中，也是细线色' },
    'ink': { value: '#26211c', note: '正文、标题' },
    'ink-2': { value: '#5f564d', note: '次要文字' },
    'ink-3': { value: '#948a7e', note: '最浅的墨（只做装饰，不拿来写字）' },
    'aux': { value: '#6f6457', note: '辅助字（标签、注记）：须在 paper / tint 上对比度 ≥4.5' },
    'accent': { value: '#9e2a2b', note: '强调色（朱）：链接、主按钮、选中态' },
    'accent-deep': { value: '#7a1c1f', note: '强调色的深一阶（悬停）' },
    'gold': { value: '#a37b43', note: '泥金：点缀、警告条、高亮' },
    'gold-ink': { value: '#8a6320', note: '泥金的字色（警告字、彩色标记字）' },
    'blue': { value: '#2f6a8d', note: '蓝：丛编、序' },
    'blue-soft': { value: '#3a6b8a', note: '蓝（压暗一档）：文字资源、关系上行' },
    'purple': { value: '#6a4a86', note: '紫：专名条目' },
    'purple-soft': { value: '#7a5192', note: '紫（浅一档）：图文资源' },
    'green': { value: '#3f7d54', note: '绿：正式、已完成' },
    'amber': { value: '#b5762e', note: '琥珀：草稿、缺册、平行关系' },
    'red': { value: '#a8322c', note: '红：佚失' },
    'book': { value: 'var(--bim-palette-accent)', note: '「书」类标记色；默认随强调色，宿主在强调色是蓝灰的主题里想保留红时单独设' },
    'shade': { value: 'rgba(40, 36, 31, 0.25)', note: '疏朗版式提要卡的投影色（含透明度）' },
} as const;

export type BimPaletteName = keyof typeof BIM_PALETTE;

const P = (n: BimPaletteName) => `var(--bim-palette-${n})`;
const MIX = (n: BimPaletteName, pct: number, other = 'transparent') => `color-mix(in srgb, ${P(n)} ${pct}%, ${other})`;

/** 语义变量 ← 调色板的推导（palette.css 里 :root 的声明）；表里没有的变量保持 tokens.css 的默认值 */
export const BIM_PALETTE_MAP = {
    // 底色与文字
    'bg': P('raise'), 'bg-subtle': P('paper'), 'widget-bg': P('paper'), 'sidebar-bg': P('tint'),
    'fg': P('ink'), 'desc-fg': P('ink-2'), 'muted': P('aux'),
    // 描边
    'widget-border': P('tint-2'), 'border': P('tint-2'), 'input-border': P('tint-2'), 'focus-border': P('accent'),
    // 输入控件
    'input-bg': P('raise'), 'input-fg': P('ink'),
    // 主色
    'primary': P('accent'), 'primary-fg': '#ffffff', 'primary-soft': MIX('accent', 12), 'primary-bg': MIX('accent', 8),
    'link': P('accent'), 'link-fg': P('accent'),
    'list-hover-bg': P('tint'), 'list-active-bg': MIX('accent', 8),
    'tag-bg': P('tint'), 'accent-bg': P('gold'),
    // 条目类型与状态
    'type-book': P('book'), 'type-work': P('gold'), 'type-collection': P('blue'), 'type-entity': P('purple'),
    'status-draft': P('amber'), 'status-official': P('green'),
    // 资源
    'restype-text': P('blue-soft'), 'restype-image': P('amber'), 'restype-text-image': P('purple-soft'), 'missing-fg': P('amber'),
    'colormode-bw-bg': P('tint'), 'colormode-bw-fg': P('ink-2'), 'colormode-color-bg': MIX('gold', 14), 'colormode-color-fg': P('gold-ink'),
    'progress-active': P('gold'), 'progress-done': P('green'), 'progress-todo': P('ink-3'),
    // 警告条
    'warn-bg': MIX('gold', 14), 'warn-border': MIX('gold', 40), 'warn-fg': P('gold-ink'),
    // 整理本
    'highlight-bg': MIX('gold', 28), 'section-lei': P('gold'), 'section-shu': P('book'), 'section-xu': P('blue'),
    'section-kaozhen': P('ink-2'), 'section-tag-fg': P('accent'), 'matchstate-fg': P('gold'),
    // 版本传承与关系
    'lost-fg': P('red'), 'relation-up': P('blue-soft'), 'relation-down': P('green'), 'relation-flat': P('amber'),
    'cover-accent': P('gold'),
    // 详情页
    'page-bg': P('paper'), 'row-hover-bg': P('tint'), 'selection-bg': MIX('gold', 30),
    'band-bg': P('tint'), 'band-bg-hover': P('tint-2'),
    'ink': P('ink'), 'body-fg': P('ink'), 'quiet-fg': P('ink-2'), 'meta-fg': P('ink-2'),
    'aux-fg': P('aux'), 'label-fg': P('aux'), 'hint-fg': P('aux'),
    'accent': P('accent'), 'accent-deep': P('accent-deep'), 'flag-bg': MIX('accent', 8),
    'rule-strong': P('tint-2'), 'rule': P('tint-2'), 'rule-dashed': P('tint-2'),
    'rule-accent-soft': MIX('accent', 24, P('paper')),
    'card-bg': P('raise'), 'zebra-bg': MIX('tint', 60), 'tint-bg': P('tint'),
    'fr-shadow': `0 1px 0 var(--bim-rule), 0 12px 32px -18px ${P('shade')}`,
} as const satisfies Partial<Record<BimTokenName, string>>;

/** `all` = variables.css 全文（兼容旧入口 book-index-ui/styles）；`tokens` = :root ＋ 版式；`themes` = 仅主题块 */
export type BimCssPart = 'all' | 'tokens' | 'themes' | 'palette';

/** 生成 variables.css / tokens.css / themes.css 的全文（`npm run gen:tokens` 调用） */
export function bimTokensCss(part: BimCssPart = 'all'): string {
    if (part === 'palette') return bimPaletteCss();
    const wantRoot = part !== 'themes';
    const wantThemes = part !== 'tokens';
    const wantLayouts = part !== 'themes';
    const out: string[] = part === 'themes' ? [
        '/**',
        ' * 内置主题（indigo、ink）—— 由 src/styles/tokens.ts 生成，勿手改。',
        ' * 需要用 <html data-theme="…"> 切换这些主题的宿主，在 tokens.css 之后引入；',
        ' * 自己用品牌色覆盖变量的宿主（如 kaiyuanguji-web）不引。',
        ' */',
    ] : part === 'tokens' ? [
        '/**',
        ' * book-index-ui 设计变量（tokens.css）—— 由 src/styles/tokens.ts 生成，勿手改；',
        ' * 改完 tokens.ts 后运行 `npm run gen:tokens`。',
        ' *',
        ' * 宿主先引本文件，再在自己的 :root 里只覆盖品牌相关的变量（颜色、字体）；覆盖声明须在本文件之后加载。',
        ' * 对外承诺的变量名见 README「样式契约」。内置主题（indigo、ink）在 themes.css。',
        ' */',
        ':root {',
    ] : [
        '/**',
        ' * CSS 变量默认值（换肤接口）—— 由 src/styles/tokens.ts 生成，勿手改；',
        ' * 改完 tokens.ts 后运行 `npm run gen:tokens`。',
        ' *',
        ' * 消费者在自己的 :root 里覆盖同名变量即可换肤；覆盖声明须在本文件之后加载。',
        ' */',
        ':root {',
    ];
    if (wantRoot) {
        BIM_TOKEN_GROUPS.forEach((g, i) => {
            if (i > 0) out.push('');
            out.push(`    /* ==== ${g.title} ==== */`);
            for (const [name, t] of Object.entries(g.tokens) as [string, BimToken][]) {
                if (t.root === false) continue;
                if (t.note) out.push(`    /* ${t.note} */`);
                out.push(`    --bim-${name}: ${bimRootValue(t)};`);
            }
        });
        out.push('}');
    }
    if (wantThemes) {
        let first = part === 'themes';
        for (const [theme, vars] of Object.entries(BIM_THEMES)) {
            if (!first) out.push('');
            first = false;
            out.push(`/* ==== 主题：${theme}（<html data-theme="${theme}">）==== */`, `:root[data-theme="${theme}"] {`);
            for (const [name, v] of Object.entries(vars)) out.push(`    --bim-${name}: ${v};`);
            out.push('}');
        }
    }
    if (wantLayouts) {
        for (const [layout, vars] of Object.entries(BIM_LAYOUTS)) {
            out.push('', `/* ==== 版式：${layout}（<html data-layout="${layout}">）==== */`, `:root[data-layout="${layout}"] {`);
            for (const [name, v] of Object.entries(vars)) out.push(`    --bim-${name}: ${v};`);
            out.push('}');
        }
    }
    out.push('');
    return out.join('\n');
}

/** palette.css：调色板默认值 ＋ 语义变量的推导（在 tokens.css 之后引入；宿主在其后覆盖 `--bim-palette-*`） */
export function bimPaletteCss(): string {
    const out = [
        '/**',
        ' * book-index-ui 调色板（palette.css）—— 由 src/styles/tokens.ts 生成，勿手改；',
        ' * 改完 tokens.ts 后运行 `npm run gen:tokens`。',
        ' *',
        ' * 用法：宿主依次引 tokens.css、palette.css，再在自己的 :root 里只覆盖 `--bim-palette-*`（约 20 个）；',
        ' * 语义变量（--bim-link、--bim-type-*、--bim-warn-* …）全部由调色板推出，不必逐个重写。',
        ' * 不引本文件 = 保持 tokens.css 的默认值（VS Code 扩展等）。',
        ' */',
        ':root {',
        '    /* ==== 调色板 ==== */',
    ];
    for (const [name, p] of Object.entries(BIM_PALETTE)) {
        out.push(`    /* ${p.note} */`, `    --bim-palette-${name}: ${p.value};`);
    }
    out.push('', '    /* ==== 由调色板推出的语义变量 ==== */');
    for (const [name, v] of Object.entries(BIM_PALETTE_MAP)) out.push(`    --bim-${name}: ${v};`);
    out.push('}', '');
    return out.join('\n');
}
