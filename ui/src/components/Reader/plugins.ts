/**
 * 阅读器插件接口（方案 `长期方案与迁移计划.md` §4.2）。
 *
 * 宿主把功能写成 `ReaderPlugin` 对象，经 `<TextReader plugins={[…]}>` 传入；包负责渲染每一个字，
 * 并按插件声明的位置放设置、工具条按钮、浮层、字上的修饰与选字动作。宿主不必也不应再用选择器抓阅读器的 DOM。
 *
 * 适用范围（本版）：`decorate`／`onCell`／`selectionActions`／`locate`／`scrollTo`／`rectOf` 作用于带逐字格位的
 * 正文（对读章，即 `GujiTextViewer`）；整理本结构化渲染与 Markdown 文本没有格位，这几项对它们不生效，
 * 其余（`settings`／`toolbar`／`overlay`／`onChapter`）对所有章都生效。
 *
 * 稳定性：插件对象请用 `useMemo`／模块常量保持引用稳定。包在插件引用、章状态、`api.refresh()` 变化时重算修饰。
 * 插件钩子抛错只记 console，不会拖垮阅读器。
 */
import type React from 'react';
import type { IndexStorage } from '../../storage/types';
import type { TextChapter, TextVersion } from '../../core/text-model';
import type { ReaderPrefs } from './prefs';

/** 设置面板的组：已有组名并进原组，其它字符串新开一组 */
export type ReaderSettingsGroup = 'text' | 'annotate' | 'layout' | 'more' | (string & {});

/** 一个字上的修饰。同一格有多个插件的修饰时，按 `plugins` 顺序逐字段叠加（后者覆盖前者；`focus` 取或；`title` 用「；」连接） */
export interface CellDecoration {
    /** 色调，映射到 token 色（底色＋字色）。 `add`＝对照本多出，`omit`＝对照本缺 */
    tone?: 'accent' | 'warn' | 'muted' | 'add' | 'omit' | (string & {});
    underline?: 'solid' | 'dotted' | 'wavy';
    /** 下标小字（如对校：对照本在这一位的写法）。不进 textContent，复制不带 */
    sub?: string;
    /** 字后插入的小字（如对校：对照本多出的字）。不进 textContent，复制不带 */
    insertAfter?: string;
    /** 原生提示 */
    title?: string;
    /** 当前焦点（如「上一处／下一处」落在这里） */
    focus?: boolean;
}

/** 本章阅读顺序里的一格 */
export interface ReaderCellInfo {
    /** 格位 key `页:列:序`（与逐字数据的 id 相同） */
    anchor: string;
    char: string;
    page: number;
    col: number;
}

export interface CellHit {
    anchor: string;
    char: string;
    /** 该字当前的屏幕矩形；字未渲染时为 null */
    rect: DOMRect | null;
}

export interface ReaderSelection {
    /** 选中的格位，按阅读顺序 */
    anchors: string[];
    /** 选中的字（按阅读顺序拼起来，最长 500 字） */
    text: string;
    /** 最后一个选中字的屏幕矩形 */
    rect: DOMRect | null;
}

export interface SelectionAction {
    key: string;
    label: React.ReactNode;
    title?: string;
    onClick(): void;
}

/** 换章（含首章）时给插件的上下文 */
export interface ReaderChapterCtx {
    entryId: string;
    versionKey: string;
    chapterKey: string;
    /** 章在版本目录里的条目（含各 `*_file`） */
    chapter: TextChapter;
    version: TextVersion;
    transport: IndexStorage;
    /** 窄屏＝目录收进抽屉、设置走底部抽屉的那档 */
    viewport: 'wide' | 'narrow';
}

export interface ReaderApi {
    ctx: ReaderChapterCtx;
    /** 取某个插件 `onChapter` 的返回值（本章还没取到为 undefined） */
    state<T = unknown>(pluginId: string): T | undefined;
    /** 本章的格，阅读顺序；没有逐字格位的章为空数组 */
    cells: ReadonlyArray<ReaderCellInfo>;
    /** 滚到某格所在的段（一般是整段顶到视口上方）。格还没渲染出来就等它出来 */
    scrollTo(anchor: string, opts?: { block?: 'center' | 'start' }): void;
    rectOf(anchor: string): DOMRect | null;
    /**
     * 按文字或按格序定位，返回格位 key，找不到为 null。
     * `{ cp }`＝本章 `cells` 的下标（从 0 数）；`{ text }`＝在本章连续文字里找第一处。
     */
    locate(q: { cp: number } | { text: string }): string | null;
    /** 插件自己的状态变了，要求重算修饰（缺省重算全部插件） */
    refresh(pluginId?: string): void;
    prefs: ReaderPrefs;
    setPref(patch: Partial<ReaderPrefs>): void;
    t(key: string, vars?: Record<string, string | number>): string;
    convert(s: string): string;
}

export interface ReaderPlugin {
    id: string;

    /** 换章（含首章）时调用：在这里取自己的数据；返回值（或 resolve 值）经 `api.state(id)` 传给各钩子。抛错＝本章该插件无状态 */
    onChapter?(ctx: ReaderChapterCtx): unknown | Promise<unknown>;

    /** 阅读设置面板里的一块 */
    settings?: {
        group: ReaderSettingsGroup;
        /** 新开组时的组标题；并进已有组时忽略 */
        title?: React.ReactNode;
        /** 同组内的排序，小的在前，缺省 100 */
        order?: number;
        render(api: ReaderApi): React.ReactNode;
    };

    /**
     * 工具条：`subtitle`＝书名后的小字位，`actions`＝右侧动作位。
     * 窄屏由包收进设置抽屉的「更多」组，宿主不必判断宽窄。
     */
    toolbar?: { slot: 'subtitle' | 'actions'; order?: number; render(api: ReaderApi): React.ReactNode };

    /** 按格位修饰字。返回 key 为格位的 Map；包统一渲染 */
    decorate?(api: ReaderApi): ReadonlyMap<string, CellDecoration> | undefined;

    /** 格子事件。`click` 是读者点字（桌面点击／手机轻点），`hover` 在鼠标移入、移出（null）时调用 */
    onCell?: {
        click?(hit: CellHit, api: ReaderApi): void;
        hover?(hit: CellHit | null, api: ReaderApi): void;
    };

    /** 选字后浮条上的按钮（报错、改字…）。返回空数组＝本次不出 */
    selectionActions?(sel: ReaderSelection, api: ReaderApi): SelectionAction[];

    /** 浮层（导航条、详情卡）。包负责放：桌面右下角，手机贴底 */
    overlay?(api: ReaderApi): React.ReactNode;
}

/** 调用插件钩子：抛错只记 console，返回 fallback */
export function safely<T, R>(plugin: { id: string }, hook: string, fn: () => T, fallback: R): T | R {
    try {
        return fn();
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[reader-plugin:${plugin.id}] ${hook} 出错`, e);
        return fallback;
    }
}

/** 把多个插件对同一批格子的修饰叠加成一张表 */
export function mergeDecorations(list: ReadonlyArray<ReadonlyMap<string, CellDecoration>>): Map<string, CellDecoration> {
    const out = new Map<string, CellDecoration>();
    for (const m of list) {
        m.forEach((d, anchor) => {
            const prev = out.get(anchor);
            if (!prev) { out.set(anchor, d); return; }
            const merged: CellDecoration = { ...prev, ...stripUndefined(d) };
            if (prev.focus || d.focus) merged.focus = true;
            if (prev.title && d.title && prev.title !== d.title) merged.title = `${prev.title}；${d.title}`;
            out.set(anchor, merged);
        });
    }
    return out;
}

function stripUndefined(d: CellDecoration): CellDecoration {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(d) as (keyof CellDecoration)[]) if (d[k] !== undefined) o[k] = d[k];
    return o as CellDecoration;
}

/** 两个修饰是否相同（按页分桶复用旧桶，页组件就不重渲染） */
export function sameDecoration(a: CellDecoration, b: CellDecoration): boolean {
    return a.tone === b.tone && a.underline === b.underline && a.sub === b.sub && a.insertAfter === b.insertAfter
        && a.title === b.title && !!a.focus === !!b.focus;
}
