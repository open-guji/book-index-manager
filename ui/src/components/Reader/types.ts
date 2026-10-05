/**
 * 阅读器（整理本 / 全文）对外类型。
 *
 * 书影接口按「每页一张图 + 可选的逐字框」设计：影像 URL 一律由宿主传入，
 * 组件自己不拼地址、不取数。逐字框格式是本包暂定的 `bim-charbox-v0`，
 * 等 CV 的交付格式定下来再对齐——对齐时新增一个 format 值并在
 * `ImagePanel` 里加一个换算分支即可，已有宿主不受影响。
 */
import type React from 'react';

/**
 * 逐字框（`bim-charbox-v0`）。
 *
 * 坐标系：图片**原始像素**，原点在左上角；与 `ReaderPageImage.width/height` 同一坐标系，
 * 渲染时按显示尺寸等比缩放。宽高未知时不画框。
 */
export interface ReaderCharBox {
    x: number;
    y: number;
    w: number;
    h: number;
    /** 框内识别出的字（可选） */
    char?: string;
    /** 对应正文里的字符偏移（可选，预留给「点字定位正文」） */
    textOffset?: number;
    /** 识别置信度 0–1（可选） */
    confidence?: number;
}

/** 书影的一页：一张图，外加可选的逐字框 */
export interface ReaderPageImage {
    /** 影像 URL（宿主给出，组件原样使用） */
    url: string;
    /** 原图像素宽高。给了才画逐字框，也用于占位时保持比例 */
    width?: number;
    height?: number;
    /** 对读用：本图对应的页（葉）序号，与逐字 id `<页>:<列>:<格>` 里的页相同；缺省按序号对位 */
    pageNo?: number;
    /** 对读用：原图像素档的 URL（透视矫正要用原图精度；缺省退回 `url`） */
    hiresUrl?: string;
    /** 页码标签，如「葉三上」「p.12」；缺省显示序号 */
    label?: string;
    /** 图片替代文本；缺省「书影 第 N 页」 */
    alt?: string;
    /** 逐字框；格式见 `boxFormat` */
    boxes?: ReaderCharBox[];
    /**
     * 逐字框格式。目前只认 `bim-charbox-v0`（缺省即此）；其他值的框一律不画，
     * 留给宿主用 `renderOverlay` 自己画——这是与 CV 交付格式对齐前的扩展点。
     */
    boxFormat?: 'bim-charbox-v0' | (string & {});
}

/**
 * 按卷/章取书影。返回 null / 空数组表示这一卷没有影像（书影区显示占位或自动收起）。
 * 可以是异步的；组件只认最后一次调用的结果。
 */
export type ReaderImageResolver = (chapterKey: string) =>
    ReaderPageImage[] | null | undefined | Promise<ReaderPageImage[] | null | undefined>;

/** 画在书影上面的自定义层（逐字框以外的格式、批注等），坐标系同原图像素 */
export type ReaderImageOverlay = (page: ReaderPageImage, index: number) => React.ReactNode;

/** 目录树的一项 */
export interface ReaderTocItem {
    /** 选中时回传的 key；分组（纯标题）也要有唯一 key */
    key: string;
    label: React.ReactNode;
    /** 行尾的小字（命中数、「…」加载中），不做 badge */
    hint?: React.ReactNode;
    /** 置灰且不可选（搜索无命中的卷） */
    disabled?: boolean;
    /** 有 children 即为分组：点标题只展开收起，不选中 */
    children?: ReaderTocItem[];
    /** 分组默认展开 */
    defaultExpanded?: boolean;
}

/** 横排 / 竖排。竖排先预留，见 ReaderShell 的 `allowVertical` */
export type ReaderWritingMode = 'horizontal' | 'vertical';

/**
 * 同一 owner 的一份全文（「版本」下拉框的一项，overview#235）。
 *
 * 由宿主（或 TextReader）按 manifest.json 的 versions 换算。
 */
export interface ReaderVersion {
    /** 该份全文的 key，如 `wikisource-01`、`kanripo-01`；切换时原样回传 */
    key: string;
    /** 版本说明（`version_label`），如「詩序（Kanripo WYG 本）」 */
    label: string;
    /** 来源名（`source_name`），如「維基文庫」「Kanripo」 */
    sourceName?: string;
    /** 授权（`license`），如「CC BY-SA 4.0」；按份计，切到哪份显示哪份 */
    license?: string;
    /** 来源页（`source_url`） */
    sourceUrl?: string;
    /** 下拉框里的选项文字；给了就原样用，不再拼「版本说明 · 来源名」（新结构的版本名只写来源，overview#307） */
    optionLabel?: string;
    /** 首选的一份（恰一份为 true）；宿主没给 currentVersionKey 时默认选它 */
    primary?: boolean;
}

/**
 * 「报告错字」回调收到的上下文。宿主（网站）据此打开现有的反馈入口并预填；
 * 本包不做反馈后端，也不发请求。
 */
export interface ReaderReportContext {
    /** 书名（工具条上的书名；取不到为空） */
    bookTitle?: string;
    /** 条目 id（作品 / 版本 id）；取不到为空 */
    entryId?: string;
    /** 当前卷 / 章的 key（目录 key） */
    chapterKey: string | null;
    /** 当前卷 / 章的显示名，如「卷1　易类」 */
    chapterLabel?: string;
    /** 当前位置锚点：视口顶端所在条目的元素 id（如 `rd-e-3`）；正文里没有锚点时为空 */
    anchor?: string;
    /** 读者选中的正文文字（无选中为空；最长 500 字） */
    selectedText?: string;
}
