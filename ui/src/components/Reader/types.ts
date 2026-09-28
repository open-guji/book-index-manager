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
