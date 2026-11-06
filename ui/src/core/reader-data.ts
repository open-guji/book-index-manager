/**
 * 阅读器的数据读取（无 React）：按章条目的声明取对读文件，并整理成阅读器要的形状。
 *
 * 章在 `items/<id>/<版本 key>/index.json` 里的条目用 `*_file` 字段声明有哪些层，只按声明取，不写死书 id、不猜文件名：
 *   - `char_file`（必有）：每格的字（guji-char，文本真源）；
 *   - `cord_file`（可选）：每格的像素框（guji-cord）——**有它才有对读**（书影格线、对读版面）；
 *   - `punct_file`：标点；`entity_file`：专名实体；
 *   - `norm_file`（可选）：异体字归一表；未声明或取不到都当没有；
 *   - `fig_file`（可选，char v0.3）：图表（图片格、插图块的说明与文件）；同样取不到当没有；
 *   - `warp_file`（可选）：手工透视矫正的样张（PageWarpData 的 base，含版心与对偶页拼接），取不到当没有；
 *   - `reader_*_file`：阅读器瘦身副本（打包时生成），有就先取它，取不到回落原文件。
 * 这些文件在同一章里按格位 key（`页:列:格[子列]`）对上。
 *
 * 本模块是 book-text 格式的语义，不是某个宿主的业务：宿主只提供传输层（`IndexStorage` 上的 `getTextFile`／`getTextAssetUrl`）。
 */
import type { IndexStorage } from '../storage/types';
import type { TextManifest, TextVersion } from './text-model';
import { adaptCharCord, adaptFig } from './guji-char-cord';
import { adaptPunctJson, iiifVolumeOf, type GujiPageInfo } from './guji-pages';
import type { PageWarpData } from '../components/Reader/GujiWarpCanvas';

// ───────────────────────── 阅读页的版本列表规则 ─────────────────────────

/**
 * 阅读页给读者看的版本清单。显示规则，数据不动（目录页仍读原 manifest）：
 *   1. 作品有 kind=transcription 的全文版时，所有 kind=collated 的整理本阅读页都不列，只留全文版；
 *      default 被隐藏后 versions[0] 是主版本。kind=self_collated（本站独立整理，即原件）不适用这条。
 *   2. 本站自己整理的版本（self_collated）里，同一来源（source_name）若有 quality=fine 的，就不列 quality=rough 的粗校版。
 * 没有要隐藏的就原样返回同一个对象（便于判等、少一次拷贝）。
 */
export function readerVersions<M extends { versions: TextVersion[] }>(manifest: M): M {
    const versions = manifest.versions;
    const hasFullText = versions.some((v) => v.kind === 'transcription');
    const hideCollated = (v: TextVersion) => hasFullText && v.kind === 'collated';
    const fineOwn = new Set(versions.filter((v) => v.kind === 'self_collated' && v.quality === 'fine').map((v) => v.source_name ?? ''));
    const hideRough = (v: TextVersion) => v.kind === 'self_collated' && v.quality === 'rough' && fineOwn.has(v.source_name ?? '');
    const hide = (v: TextVersion) => hideCollated(v) || hideRough(v);
    if (!versions.some(hide)) return manifest;
    return { ...manifest, versions: versions.filter((v) => !hide(v)) };
}

/** 阅读页的 manifest（按 readerVersions 过一遍）；非法形状原样返回 */
export function readerManifest(m: TextManifest | null | undefined): TextManifest | null | undefined {
    return m && Array.isArray(m.versions) ? readerVersions(m) : m;
}

// ───────────────────────── 对读文件 ─────────────────────────

export interface ReaderChapterFiles {
    char: unknown;
    /** 没有声明 `cord_file` 时为 null：下游不画书影格线、不做对读版面 */
    cord: unknown | null;
    punct: unknown;
    entity: unknown;
    /** 没有声明 `norm_file`（或取不到）时为 null */
    norm: unknown;
    /** 声明了 `fig_file` 才有这个键；取不到为 null */
    fig?: unknown;
    /** 声明了 `warp_file` 才有这个键；取不到为 null */
    warp?: unknown;
    /** 声明了 `cord_file` 但这次没取（窄屏不显示书影栏）：cord 为 null，正文照常排，只是没有字框 */
    cordSkipped?: boolean;
}

/** 取版本目录下一个文本 JSON 所需的传输层方法（`IndexStorage` 的可选方法） */
type FileStorage = Pick<IndexStorage, 'getTextFile' | 'getTextAssetUrl'>;

export interface ReaderLoadOptions {
    /** `false`＝不取像素框（窄屏不显示书影栏，cord 是最大的文件）；缺省取 */
    cord?: boolean;
    /** storage 没有 `getTextFile`（本地／bundle 模式）时，退回 `fetch(<base>/<id>/<key>/<file>)`，如 `/data/items` */
    textFileBase?: string;
}

/** 章条目里的 `*_file` 只认章目录所在目录下的文件名，不让条目写出路径把请求带到别处 */
const fileField = (ch: Record<string, unknown>, k: string): string | null => {
    const v = ch[k];
    return typeof v === 'string' && /^[\w.-]+$/.test(v) ? v : null;
};

async function getJson(storage: FileStorage | undefined, base: string | undefined, id: string, key: string, file: string): Promise<unknown> {
    try {
        const getTextFile = storage?.getTextFile;
        if (typeof getTextFile === 'function') return (await getTextFile.call(storage, id, key, file)) ?? null;
        if (!base) return null;
        const res = await fetch(`${base.replace(/\/$/, '')}/${id}/${key}/${file}`);
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

async function getPreferred(storage: FileStorage | undefined, base: string | undefined, id: string, key: string, slim: string | null, original: string | null): Promise<unknown> {
    if (slim) {
        const v = await getJson(storage, base, id, key, slim);
        if (v != null) return v;
    }
    return original ? getJson(storage, base, id, key, original) : null;
}

const filesCache = new Map<string, Promise<ReaderChapterFiles | null>>();

/**
 * 取本章的对读数据文件。本章没有声明 `char_file`、或声明了 char／（已声明的）cord 取不到，返回 null（不缓存失败）。
 * 声明了 norm／fig／warp 却没取到也不缓存（可能是暂时失败，下次再取）。
 */
export function loadReaderFiles(
    storage: FileStorage | undefined,
    req: { id: string; versionKey: string | null | undefined; chapter: Record<string, unknown> | null | undefined },
    opts?: ReaderLoadOptions,
): Promise<ReaderChapterFiles | null> {
    const { id } = req;
    const ch = req.chapter;
    const key = req.versionKey;
    if (!ch || !key) return Promise.resolve(null);
    const base = opts?.textFileBase;
    const charFile = fileField(ch, 'char_file');
    const declaredCord = fileField(ch, 'cord_file');
    const cordFile = opts?.cord === false ? null : declaredCord;
    const cordSkipped = !!declaredCord && !cordFile;
    if (!charFile) return Promise.resolve(null);
    const readerChar = fileField(ch, 'reader_char_file');
    const readerCord = cordFile ? fileField(ch, 'reader_cord_file') : null;
    const punctFile = fileField(ch, 'punct_file');
    const readerPunct = punctFile ? fileField(ch, 'reader_punct_file') : null;
    const entityFile = fileField(ch, 'entity_file');
    const readerEntity = entityFile ? fileField(ch, 'reader_entity_file') : null;
    const normFile = fileField(ch, 'norm_file');
    const figFile = fileField(ch, 'fig_file');
    const warpFile = fileField(ch, 'warp_file');
    const cacheKey = [id, key, charFile, readerChar, cordFile, readerCord, punctFile, readerPunct, entityFile, readerEntity, normFile, figFile, warpFile, base].map((s) => s ?? '').join('|');
    let p = filesCache.get(cacheKey);
    if (!p) {
        p = (async () => {
            const [char, cord, punct, entity, norm, fig, warp] = await Promise.all([
                getPreferred(storage, base, id, key, readerChar, charFile),
                cordFile ? getPreferred(storage, base, id, key, readerCord, cordFile) : null,
                punctFile ? getPreferred(storage, base, id, key, readerPunct, punctFile) : null,
                entityFile ? getPreferred(storage, base, id, key, readerEntity, entityFile) : null,
                normFile ? getJson(storage, base, id, key, normFile) : null,
                figFile ? getJson(storage, base, id, key, figFile) : null,
                warpFile ? getJson(storage, base, id, key, warpFile) : null,
            ]);
            if (!char || (cordFile && !cord)) return null;
            return {
                char, cord, punct, entity, norm: norm ?? null,
                ...(figFile ? { fig: fig ?? null } : {}),
                ...(warpFile ? { warp: warp ?? null } : {}),
                ...(cordSkipped ? { cordSkipped: true } : {}),
            };
        })();
        filesCache.set(cacheKey, p);
        p.then((v) => {
            if (!v) filesCache.delete(cacheKey);
            else if (normFile && v.norm == null) {
                filesCache.delete(cacheKey);
                console.warn(`[reader-data] 声明了 norm_file 但取不到：${id}/${key}/${normFile}（本次当没有规范层，下次重试）`);
            } else if (figFile && v.fig == null) {
                filesCache.delete(cacheKey);
                console.warn(`[reader-data] 声明了 fig_file 但取不到：${id}/${key}/${figFile}（本次图片格显示标签，下次重试）`);
            } else if (warpFile && v.warp == null) {
                filesCache.delete(cacheKey);
            }
        });
    }
    return p;
}

/** 册号（IIIF 路径里的 `<册>`）：cord 的 canvas id 取不到时（窄屏没取 cord）按 char 的 book_id＋volume 推，册号两位补零 */
export function volumeFromChar(char: unknown): { bookId: string; vol: string } | null {
    const c = char as { book_id?: unknown; volume?: unknown } | null;
    const bookId = typeof c?.book_id === 'string' && /^[0-9a-z]+$/.test(c.book_id) ? c.book_id : null;
    const v = typeof c?.volume === 'number' && Number.isInteger(c.volume) && c.volume > 0 ? c.volume : null;
    return bookId && v ? { bookId, vol: String(v).padStart(2, '0') } : null;
}

/**
 * 本章图表里每张图的文件地址：`file`（相对版本目录，如 `fig/005/f148-2-14.png`）→ 可直接放进 `<img src>` 的 URL。
 * 阅读器的 `figUrl` 是同步函数，而哈希寻址的地址要先查哈希表（异步），所以在取数时一次解析好。
 * 存储没有 `getTextAssetUrl` 时按 `<textFileBase>/<id>/<key>/<file>`（没给 base 就没有地址）；取不到地址的图不进表（阅读器显示 `〔图：说明〕` 标签）。
 */
export async function loadFigUrls(storage: FileStorage | undefined, id: string, key: string | null | undefined, fig: unknown, textFileBase?: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const list = fig && typeof fig === 'object' ? (fig as { figures?: unknown }).figures : undefined;
    if (!key || !Array.isArray(list)) return out;
    const getUrl = storage?.getTextAssetUrl;
    await Promise.all(list.map(async (f) => {
        const file = (f as { file?: unknown } | null)?.file;
        if (typeof file !== 'string' || !/^fig\/[\w-]+\/[\w-]+\.(?:png|webp|svg)$/.test(file) || out.has(file)) return;
        try {
            const url = typeof getUrl === 'function' ? await getUrl.call(storage, id, key, file) : textFileBase ? `${textFileBase.replace(/\/$/, '')}/${id}/${key}/${file}` : null;
            if (url) out.set(file, url);
        } catch { /* 这张图取不到地址：显示标签 */ }
    }));
    return out;
}

// ───────────────────────── 整理成阅读器要的形状 ─────────────────────────

export interface ReaderChapterData {
    /** 对读数据（交给 GujiWarpCanvas／正文排版）；没有对读（没声明 cord）或窄屏没取 cord 时，仍有 pages 但没有字框 */
    warpData: PageWarpData;
    /** 原始文件（改字、校对等宿主功能要用） */
    files: ReaderChapterFiles;
    pages: GujiPageInfo[];
    /** 专名层原文件（没有为 null） */
    entity: unknown;
    /** 书影所在的 IIIF 册（从 cord 的 canvas id 取；窄屏没取 cord 时按 char 推）；取不到为 null */
    iiifVolume: { bookId: string; vol: string } | null;
}

/**
 * 取一章并整理成阅读器的对读数据。本章没有对读（没声明 `char_file`、取不到、或有 cord_file 却是「无 cord」）返回 null：
 * 没有 cord：未声明（没有对读）或取不到 → null；窄屏故意没取（`cord: false`）→ 照常排正文，只是没有字框。
 */
export async function loadReaderChapter(
    storage: FileStorage | undefined,
    req: { id: string; versionKey: string | null | undefined; chapter: Record<string, unknown> | null | undefined },
    opts?: ReaderLoadOptions,
): Promise<ReaderChapterData | null> {
    const files = await loadReaderFiles(storage, req, opts);
    if (!files || (!files.cord && !files.cordSkipped)) return null;
    const pages = adaptCharCord(files.char, files.cord ?? undefined, files.norm);
    if (pages.length === 0) return null;
    const base = files.warp && typeof files.warp === 'object' ? (files.warp as Record<string, unknown>) : { page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [] };
    const figures = files.fig != null ? adaptFig(files.fig) : null;
    const figUrls = figures && figures.size > 0 ? await loadFigUrls(storage, req.id, req.versionKey, files.fig, opts?.textFileBase) : null;
    const fig = figures && figures.size > 0 ? { figures, figUrl: (file: string) => figUrls?.get(file) ?? '' } : {};
    const warpData = {
        ...base,
        pages,
        punctuations: adaptPunctJson(files.punct),
        // 章条目声明了 norm_file 且取到了（哪怕是空表）＝自校文本，「原字」档可选；外来文本没有，置灰
        hasNorm: files.norm != null,
        ...fig,
    } as unknown as PageWarpData;
    const iiifVolume = files.cord ? iiifVolumeOf(files.cord) : files.cordSkipped ? volumeFromChar(files.char) : null;
    return { warpData, files, pages, entity: files.entity ?? null, iiifVolume };
}
