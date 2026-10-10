import { bim } from './styles/tokens';

/** 资源原子类型 */
export type ResourceTypeAtom = 'text' | 'image' | 'physical';

/** 资源类型的“显示值”：原子类型，或编辑器下拉里的 `text+image` 组合项（数据里只存 `types` 原子数组，不存 `text+image`） */
export type ResourceType = ResourceTypeAtom | 'text+image';

/** 资源条目的类型原子数组：只读 `types`（单值 `type` 的读侧兼容已于 2026-10 清退）；缺失返回 [] */
export function getResourceTypes(entry: { types?: ResourceTypeAtom[] }): ResourceTypeAtom[] {
    return entry.types && entry.types.length > 0 ? entry.types : [];
}

/** 检测是否包含某种类型 */
export function hasResourceType(entry: { types?: ResourceTypeAtom[] }, atom: ResourceTypeAtom): boolean {
    return getResourceTypes(entry).includes(atom);
}

/**
 * 整理本文本质量等级（book-text 新规格）。旧值 `published` 已去掉，读侧由 CollatedEdition 的 normalizeTextQualityGrade 映射为 `source`。
 * source＝底本原文；none＝暂无正文；placeholder＝占位。
 */
export type TextQualityGrade = 'source' | 'ocr' | 'rough' | 'fine' | 'none' | 'placeholder';

/** enum → 繁体中文 badge 文字 */
export const TEXT_QUALITY_LABELS: Record<TextQualityGrade, string> = {
    source: '底本',
    ocr: 'OCR',
    rough: '粗校',
    fine: '精校',
    none: '暫無正文',
    placeholder: '占位',
};

/** enum → 判定标准（tooltip 显示）；source／none／placeholder 的文字已经文本总管复核（overview#516） */
export const TEXT_QUALITY_CRITERIA: Record<TextQualityGrade, string> = {
    source: '照錄來源原文，本站未另行校對',
    ocr: '保持大意和結構，錯誤率在百分之十以內',
    rough: '保證文意基本正確，錯誤率在百分之三以內',
    fine: '通讀無障礙，錯誤率在百分之一以內',
    none: '質量未評定',
    placeholder: '占位條目，正文尚未錄入',
};

/** enum → 主题色 */
export const TEXT_QUALITY_COLORS: Record<TextQualityGrade, string> = {
    source: bim('quality-source'),
    ocr: bim('quality-ocr'),
    rough: bim('quality-rough'),
    fine: bim('quality-fine'),
    none: bim('quality-none'),
    placeholder: bim('quality-placeholder'),
};

/** 覆盖信息 */
export interface CoverageInfo {
    level: number;
    ranges: string;
}

/**
 * 资源元数据 key → 中文显示名
 * @deprecated 使用 `useT().metadata` 代替，支持繁简切换
 */
export const RESOURCE_METADATA_LABELS: Record<string, string> = {
    edition: '版本',
    version: '修订版本',
    quality: '资源质量',
    check_type: '校对',
    image_source: '影像来源',
    team: '所属团队',
    publisher: '出版社',
    year: '出版年份',
    format: '格式',
    note: '备注',
    total_page: '页数',
    paragraph_count: '段落数',
    has_translation: '翻译',
};

/** 资源分册条目 */
export interface ResourceVolume {
    volume: number;
    url?: string;
    status?: 'found' | 'missing' | string;
    label?: string;
    /** 分组标签（如所属 Work 标题），用于展开视图中按组分小节展示 */
    group?: string;
    /** 分组对应的 entity id（如 Work id），渲染为内部链接 */
    group_id?: string;
    /** 允许数据源携带额外 URL 字段（tw_url, wiki_url 等） */
    [key: string]: unknown;
}

/** 统一资源条目 */
export interface ResourceEntry {
    id: string;
    name: string;
    short_name?: string;
    url: string;
    /** 资源类型数组（自由组合） */
    types?: ResourceTypeAtom[];
    root_type?: 'catalog' | 'search';
    structure?: string[];
    coverage?: CoverageInfo;
    details?: string;
    /** 结构化元数据 */
    metadata?: Record<string, string>;
    /** 分册信息（可选） */
    volumes?: ResourceVolume[];
    /** 预期册数 */
    expected_volumes?: number;
    /** 色彩模式：黑白 / 彩色 */
    color_mode?: 'bw' | 'color';
    /** 来源标注（如"來源：臺灣華文電子書庫"） */
    source_label?: string;
    /** 镜像组 key，同组 resources 是同一份内容的不同存储位置；label/description 在 Book.resource_groups */
    group?: string;
    /** origin = 原始来源；mirror = 我们做的备份镜像 */
    group_role?: 'origin' | 'mirror';
}

/** Book/Work 上的资源组元数据：每个 group key 对应一组同源镜像的展示信息 */
export interface ResourceGroupInfo {
    label?: string;
    description?: string;
}

/** 索引类型 */
export type IndexType = 'book' | 'work' | 'collection' | 'entity';

/** Entity subtype（人物 / 地名 / 朝代 / 匿名 / 集体编撰） */
export type EntitySubtype = 'people' | 'place' | 'dynasty' | 'reign' | 'office' | 'anonymous' | 'collective';

/** 别名分类（基于 CBDB ALTNAME_CODES，简化为我方枚举） */
export type AltNameType = '字' | '號' | '諡號' | '賜號' | '別名' | '常用名' | '簡體'
    | '本名' | '稱號' | '行第' | '小名' | '小字' | '俗姓' | '俗名'
    | '廟號' | '尊號' | '法號' | '道號' | '年號' | string;

/** 人物别名 */
export interface AltName {
    name: string;
    type?: AltNameType;
}

/** Entity.works[i] —— 反向引用作品 */
export interface EntityWorkRef {
    work_id: string;
    role?: string;
    /** 作品標題（部分數據帶，無則逐條解析） */
    title?: string;
}

/** Entity.external_ids —— 外部数据库引用 */
export interface ExternalIds {
    cbdb_id?: number;
    cbdb_match?: string;
    cbdb_source?: string;
    /** 形如 Q123456 */
    wikidata_id?: string;
    /** 纯数字字符串 */
    viaf_id?: string;
}

/** 索引状态 */
export type IndexStatus = 'draft' | 'official';

/** 索引条目（列表显示用） */
export interface IndexEntry {
    id: string;
    title: string;
    type: IndexType;
    isDraft?: boolean;
    author?: string;
    dynasty?: string;
    role?: string;
    path?: string;
    /** 刊刻朝代（Book/Collection，= dating.era）。dynasty 是撰人朝代，两者不同 */
    era?: string;
    /** 年代排序锚点（= dating.year ?? dating.year_range[0]） */
    sort_year?: number;
    /** Work 别名列表 */
    additional_titles?: string[];
    /** Book 附载篇目 */
    attached_texts?: string[];
    /** 版本 */
    edition?: string;
    /** 卷数 */
    juan_count?: number;
    /**
     * UI 直接展示的計量文本（如「一百三十篇」「十二卷」），与 measures 一致。
     * 索引分片里本就有该字段（抽样 works 分片约 3300+ 条带此字段），
     * 只是此前漏在 IndexEntry 类型里声明，导致 IndexBrowser 里读取它时 tsc 报错。
     */
    measure_info?: string;
    /** 是否有文字资源 */
    has_text?: boolean;
    /** 是否有图片资源 */
    has_image?: boolean;
    /** 是否有整理本 */
    has_collated?: boolean;
    /** 部类一级（經部／史部／子部／集部；只有 Work 有，搜索页表格的「部类」列） */
    classification?: string;
    /** 存佚：extant／partially_extant／lost（只有 Work 有；空＝没判定） */
    loss_status?: string;
    /** 作品子类型：poem / article / book（默认）；对 entity 表示 EntitySubtype */
    subtype?: string;
    /** Entity 主名（type='entity' 时使用） */
    primary_name?: string;
    /** Entity 生年 */
    birth_year?: number;
    /** Entity 卒年 */
    death_year?: number;
    /** Entity 关联的 CBDB ID */
    cbdb_id?: number;
    /**
     * 简介搜索命中片段（A4，2026-09-27）。只有 L1/Meili 搜索命中了简介内容时才有值，
     * 含 SNIPPET_MARK_START/END 标记（见 core/highlight.ts），渲染层用
     * splitHighlightSnippet 切分后逐段包 <mark>，不要当 HTML 直接注入。
     */
    descriptionSnippet?: string;
    /**
     * Tombstone 标记：该 draft 已升格为 production。
     * draft 索引 shard 在 promote 时会带这个字段；存储层据此从默认列表/搜索结果中
     * 过滤掉这类条目，避免与 production 条目重复出现。
     */
    promoted_to?: string;
    /**
     * 重定向溯源：当 storage 把对 draft-id 的查询自动重定向到 production-id 时，
     * 返回的 entry 上挂这个字段，原 draft-id 写在这里。UI 可据此显示「已升级，
     * 跳转中」并把 URL replace 到新 ID。
     */
    redirected_from?: string;
}

/** 分页结果 */
export interface PageResult<T> {
    entries: T[];
    total: number;
    page: number;
    pageSize: number;
}

/** 统一搜索结果（按类型分组） */
export interface GroupedSearchResult {
    works: IndexEntry[];
    books: IndexEntry[];
    collections: IndexEntry[];
    entities?: IndexEntry[];
    /** 各类型的总匹配数（不限于返回条数） */
    totalWorks: number;
    totalBooks: number;
    totalCollections: number;
    totalEntities?: number;
}

/** 加载选项 */
export interface LoadOptions {
    page?: number;
    pageSize?: number;
    /** 搜索筛选（v4 搜索页：朝代／部类／资源／存佚）；storage 不支持就忽略 */
    filters?: import('./core/search-filters').SearchFilters;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

/** 下载状态 */
export type DownloadStatus = 'idle' | 'downloading' | 'completed' | 'error';

/** 下载进度信息 */
export interface DownloadProgress {
    status: DownloadStatus;
    progress?: number;
    message?: string;
}

/** 索引数据源 */
export type IndexSource = 'local' | 'repo' | 'github';

/** 同步配置 */
export interface SyncConfig {
    parentPath?: string;
    isDraft?: boolean;
    repoPath?: string;
    remoteName?: string;
    remoteUrl?: string;
}

// ── 详情数据类型 ──

/**
 * 来源标注。
 *
 * 历史上写成两种形态：早期是裸字符串，后来（小说类条目为主）改成
 * `{title, url?}` 对象。全库两种并存（约 10.6 万条字符串 : 672 条对象），
 * 谁也没法单方面废弃，所以类型上认下来，渲染前一律走 sourceText()／sourceHref()。
 * schema-v2 又允许元素为 Source 对象 `{name, type, details}`（数据不迁移，长期并存）。
 */
export type DescriptionSource =
    | string
    | { title: string; url?: string }
    | SourceObject;

/** schema-v2 Source 对象：`type` 为 `url` 时 `details` 是链接 */
export interface SourceObject {
    name: string;
    type?: string;
    details?: string;
}

/** 描述信息 */
export interface DescriptionInfo {
    text: string;
    sources?: DescriptionSource[];
}

/** 附记条目：长篇补充材料，独立于 description。
 *  与 description 区分：description 简短、用于卡片/搜索摘要、可被多处引用；
 *  appendix 仅在条目详情页展开显示，可放学术备记、翻刻本/续补/版本流变等长篇资料。 */
export interface AppendixEntry {
    /** 附记小节标题（如「孫楷第《通俗小說書目》著錄之未見/已佚別本」） */
    title: string;
    /** 正文 markdown 文本 */
    text: string;
    /** 来源标注（与 DescriptionInfo.sources 同形） */
    sources?: DescriptionSource[];
}

/** 作者信息 */
export interface AuthorInfo {
    name: string;
    role?: string;
    dynasty?: string;
    /** 关联的人物 Entity ID（可点击跳转人物详情页） */
    entity_id?: string;
}

/** 出版信息 */
export interface PublicationInfo {
    year?: string;
    details?: string;
}

/** 位置/机构信息 */
export interface LocationInfo {
    name: string;
    start_date?: string;
    end_date?: string;
    description?: string;
}

/** 卷数 */
export interface JuanCount {
    number?: number;
    description?: string;
}

/** 單個計量單位（卷、回、集、篇、則 等） */
export interface Measure {
    unit: string;
    number: number;
    /** 計量相關備註，如 "每集五回" */
    note?: string;
}

/** 页数 */
export interface PageCount {
    number?: number;
    description?: string;
}

/** 详情基础数据 */
export interface BaseDetailData {
    id: string;
    title: string;
    edition?: string;
    type: IndexType;
    description?: DescriptionInfo;
    /** 长篇附记（详情页展示，不进卡片/搜索摘要） */
    appendix?: AppendixEntry[];
    authors?: AuthorInfo[];
    additional_titles?: (string | { book_title: string })[];
    /** Book 附载篇目 */
    attached_texts?: (string | { book_title: string })[];
    additional_works?: AdditionalWork[];
    indexed_by?: IndexedByEntry[];
    emendated_by?: EmendatedByEntry[];
    publication_info?: PublicationInfo;
    current_location?: LocationInfo;
    juan_count?: JuanCount;
    /** 多維計量（卷、回、集等），適合通俗小說等 */
    measures?: Measure[];
    /** UI 直接展示的計量文本，應與 measures 一致 */
    measure_info?: string;
    page_count?: PageCount;
    resources?: ResourceEntry[];
    /** 资源组元数据：key=group_key，value={label, description} */
    resource_groups?: Record<string, ResourceGroupInfo>;
    /** 條目級待核清單（2026-09-28 S5）：只裝尚待辦者，做完即移除 */
    todo?: TodoItem[];
    /** 條目級人工審核狀態（2026-09-28 S5）；欄位不存在等同 unreviewed */
    review?: ReviewInfo;
    /** 存佚：extant 今存 / fragment 殘 / lost 佚 等 */
    loss_status?: string;
    /** 數據修訂號與修訂日期（詳情頁提要卡底部小字） */
    revision?: number | string;
    revised_at?: string;
}

/** 待核事項 `{what, by?, date?}` */
export interface TodoItem {
    what: string;
    by?: string;
    date?: string;
}

/** 人工審核狀態 */
export interface ReviewInfo {
    status: 'unreviewed' | 'reviewed' | 'disputed' | string;
    by?: string;
    date?: string;
}

/** 四部分類（Work.classification，2026-09-27）：未定之級為空串 */
export interface WorkClassification {
    l1: string;
    l2?: string;
    l3?: string;
    l4?: string;
    /** 依據強弱 S / A / B / C */
    basis?: string;
    /** 取自哪部目錄書，如「欽定四庫全書總目」或「經義考/易」 */
    source?: string;
}

/** 收录关联：书籍被丛编收录的信息 */
export interface ContainedInEntry {
    /** 丛编 ID */
    id: string;
    /** 在丛编中的册号（单册如 9，跨册如 "9-12"） */
    volume_index?: number | string;
}

/**
 * 刊刻年代（结构化）。
 *
 * 方案见 overview/项目进展/古籍索引网站/整体设计/2026-09-刊刻年代方案.md。
 *
 * 背景：97.5% 的版本没有任何年代欄位，页面上的「刊刻年代」此前是
 * **每次渲染都从题名现推**——无法人工订正，也留不下「这是著录还是猜的」
 * 的痕迹。这个字段把推断结果落盘，并区分可信度。
 */
export interface DatingInfo {
    /** 朝代（归一后：漢/三國/晉/南北朝/隋/唐/五代/宋/遼/西夏/金/元/明/清/民國/日本/朝鮮/高麗/越南/琉球） */
    era?: string;
    /** 年号，如「乾隆」「慶元」 */
    reign?: string;
    /** 年号第几年 */
    reign_year?: number;
    /** 折算后的公元年，供排序 */
    year?: number;
    /** 只知「某某間」时给区间，与 year 二选一 */
    year_range?: [number, number];
    /** attested 著录 | inferred 推断 | uncertain 存疑 */
    certainty?: 'attested' | 'inferred' | 'uncertain';
    /** edition 题名推断 | catalog 书目著录 | colophon 牌记序跋 | manual 人工订正 */
    source?: 'edition' | 'catalog' | 'colophon' | 'manual';
    /** 判定依据，一句话 */
    basis?: string;
    /** 底本：本版所依据的更早的本子 */
    based_on?: {
        era?: string;
        reign?: string;
        year?: number;
        /** 影印 | 翻刻 | 傳鈔 | 配補 | 據刊 */
        relation?: string;
        certainty?: 'attested' | 'inferred' | 'uncertain';
    };
    /** 后修：本版之后被谁修过版（「元大德刻明修本」的「明修」） */
    later_repair?: { era?: string };
}

/**
 * ── build 产物（`_build/entry/<id>.json`）里的 `_` 派生字段 ──
 *
 * 形状以 book-index 仓 `schema/derived.md` 为准。卡片用短键；值为空（`""`、`[]`、`0`、false）的键省略，
 * 读者按「缺即无」处理。枢纽（入度 > 200 的记录）在引用它的卡片里只写 `{id, h: 1}`，名称在 `_hubs.json`；
 * 经 `withHubTitles`（storage/hub-titles.ts）取到的条目，枢纽卡片已补上 `title`。
 */

/** 册次：整数、数组或字符串（「第1卷」「9-12」都有） */
export type DerivedVolume = number | number[] | string;

/** Book 卡（`_books` 的元素） */
export interface DerivedBookCard {
    id: string;
    title?: string;
    edition?: string;
    /** edition_type */
    etype?: string;
    /** 朝代＋年号，如「清 乾隆」 */
    dating?: string;
    /** 公元年（供排序） */
    y?: number;
    holder?: string;
    juan?: number;
    img?: true;
    txt?: true;
    /** resources 项数 */
    nres?: number;
}

/** Work `_related` 的元素：对方（Work 或 Collection）的卡片＋关系 */
export interface DerivedRelatedCard {
    id: string;
    title?: string;
    /** 枢纽：无 title，名称见 _hubs.json */
    h?: 1;
    /** 本条视角的关系词（`in` 方向时已取反向词） */
    relation?: string;
    direction?: 'out' | 'in';
    note?: string;
}

/** Work `_classifications` 的元素 */
export interface DerivedClassification {
    scheme: string;
    node?: string;
    path?: string[];
    l1: string;
    l2?: string;
    l3?: string;
    l4?: string;
    source?: string;
}

/** Work／Book `_catalogs` 的元素 */
export interface DerivedCatalogCard {
    bid: string;
    title?: string;
    h?: 1;
    dyn?: string;
    section?: string;
}

/** Work／Book `_collections` 的元素：所属丛编（Collection 卡）＋本条在其中的位置 */
export interface DerivedCollectionRef {
    id: string;
    title?: string;
    h?: 1;
    /** 册次（source 的 volume_index） */
    vol?: DerivedVolume;
    /** 附属子目（source 的 sub_items） */
    sub?: string[];
    group?: string;
    ord?: number;
}

/** Collection `_members` 的元素：成员（Work 卡或 Book 卡）＋成员在本丛编中的位置 */
export interface DerivedMemberCard {
    id: string;
    t?: 'book' | 'work';
    title?: string;
    vol?: DerivedVolume;
    sub?: string[];
    group?: string;
    ord?: number;
    section?: string;
}

/** Entity `_works` 的元素：Work 卡（`id` 改名 `work_id`）＋署名角色 */
export interface DerivedEntityWork {
    work_id: string;
    title?: string;
    role?: string;
    dyn?: string;
    nb?: number;
    img?: true;
    txt?: true;
}

/** Book 详情 */
export interface BookDetailData extends BaseDetailData {
    type: 'book';
    /** 刊刻年代（结构化）。优先于从题名现推的结果 */
    dating?: DatingInfo;
    work_id?: string;
    /** 源档字段：本书被收入的丛编（成员侧写）。详情页读下面的 `_collections` */
    contained_in?: ContainedInEntry[];
    /** build 产物：所属丛编（每个丛编一项，枢纽丛编无 title，名称见 withHubTitles） */
    _collections?: DerivedCollectionRef[];
    location_history?: LocationInfo[];
    related_books?: string[];
    /** 版本传承信息（用于版本图） */
    lineage?: BookLineage;
    /** 行款／装帧／尺寸／品相（2026-09-28 S2b）；四内容子段全为空串时目录侧不写本对象 */
    physical_description?: PhysicalDescription;
    /** 版本类型（受控词表：刻本／抄本／稿本／活字本／石印本／鉛印本／影印本／套印本／拓本／印刷本／其他）；未考则无此字段 */
    edition_type?: string;
    /** 馆藏（2026-09-28 S2）：一书多藏本各一项 */
    provenance?: ProvenanceEntry[];
    /** 底本／配补／参校（2026-09-28 S2c） */
    base_edition?: BaseEditionEntry[];
}

/** Book.physical_description：子段全为字符串，空串＝未知；source 仅内部 */
export interface PhysicalDescription {
    leaf_style?: string;
    binding?: string;
    dimensions?: string;
    condition?: string;
    source?: string;
}

/** Book.provenance[]：机构＋索书号＋藏印；source 仅内部 */
export interface ProvenanceEntry {
    institution: string;
    call_number?: string;
    seals?: string[];
    notes?: string;
    source?: string;
}

/** Book.base_edition[]：role 取 底本／配補／參校；有 book_id 的可跳转 */
export interface BaseEditionEntry {
    role: string;
    name?: string;
    book_id?: string;
    work_id?: string;
    note?: string;
    source?: string;
}

/** Collection 详情 */
export interface CollectionDetailData extends BaseDetailData {
    type: 'collection';
    /**
     * 丛编子类：book_collection（书籍汇编，60 部）/ work_collection（作品集，15 部）。
     * 数据里一直有，此前没在类型里声明。
     */
    subtype?: 'book_collection' | 'work_collection' | string;
    work_id?: string;
    /** 上级丛编，`{id}` 对象形（与 Book／Work 一致；旧裸 id 字符串形已清零，不再兼容） */
    contained_in?: Array<{ id: string }>;
    history?: string[];
    /** @deprecated 源档已无此字段（成员只在成员侧 contained_in 写）；详情页读 `_members`。仅旧版 IndexDetail 还读 */
    books?: string[];
    /** @deprecated 同上 */
    contained_works?: { id: string; title: string; volume_index?: number }[];
    /** build 产物：成员总数；无成员为 0 */
    _member_count?: number;
    /** build 产物：成员卡片，只有前 20 项（全表在 members/ 分页，站点包没带）；总数见 `_member_count` */
    _members?: DerivedMemberCard[];
    /** 成员型别（派生，2026-09-28）：成员是 Book／Work／两者兼有；缺则无从推断 */
    _member_type?: 'Book' | 'Work' | 'Collection' | 'mixed' | string;
    /** 应收总数（卷／册／种／函分列，各自可 null）；source 仅内部 */
    count?: CollectionCount;
}

/** Collection.count：整数或 null，null＝未知（不是 0） */
export interface CollectionCount {
    juan?: number | null;
    ce?: number | null;
    zhong?: number | null;
    han?: number | null;
    source?: string;
}

/** Work 详情 */
export interface WorkDetailData extends BaseDetailData {
    type: 'work';
    parent_works?: string[];
    parent_work?: { id: string; title: string };
    /** @deprecated 源档已无此字段（作品归属只在 Book.work_id）；详情页读 `_books`。仅旧版 IndexDetail 还读 */
    books?: string[];
    /** @deprecated 同上 */
    collections?: string[];
    /** 源档字段（编辑器用；不带对方题名）。详情页读 `_related` */
    related_works?: { id: string; title: string; relation?: 'part_of' | 'has_part' | 'collected_in' | 'text_carried_by' | 'studied_by' | 'preceded_by' | 'followed_by' | 'related' | (string & {}); note?: string }[];
    /** 版本传承图（多版本作品如红楼梦、十三经等） */
    version_graph?: VersionGraph;
    /** build 产物：掛在本作品下的版本（Book 卡），有年代者在前、按年代升序 */
    _books?: DerivedBookCard[];
    /** build 产物：掛在本作品下的 Book 數（= `_books.length`） */
    _edition_count?: number;
    /** build 产物：分类（总目 zongmu 等，可有多条；没有只代表尚無可靠依據） */
    _classifications?: DerivedClassification[];
    /** build 产物：与本作品有关系的作品／丛编，按本条视角取词，带对方现行题名与 direction */
    _related?: DerivedRelatedCard[];
    /** build 产物：著录本作品的志书（只有名称与部类；著录原文在源档 `indexed_by`） */
    _catalogs?: DerivedCatalogCard[];
    /** build 产物：所属丛编 */
    _collections?: DerivedCollectionRef[];
    /** @deprecated 源档已无此字段（分类在 classification/ 成员档）；详情页读 `_classifications` */
    classification?: WorkClassification;
    /** Work 子類（book / article / poem / chapter） */
    subtype?: string;
}

/** Entity（人物/地名等）详情
 *  extends BaseDetailData 以兼容现有 data.title / data.description 等访问；
 *  title 在加载时由 primary_name 复制而来。
 */
export interface EntityDetailData extends BaseDetailData {
    type: 'entity';
    subtype: EntitySubtype;
    /** 主显示名（Entity 数据源主键） */
    primary_name: string;
    /** 别名（字、号、諡号等） */
    alt_names?: AltName[];
    /** 朝代标签 */
    dynasty?: string;
    /** 生年（公历） */
    birth_year?: number;
    /** 卒年（公历） */
    death_year?: number;
    /** 生卒／活动年（2026-09-28 S4）；birth_year／death_year 缺时作回退。basis 仅内部 */
    dates?: EntityDates;
    /** 籍贯（「建州」），人物页提要卡写成「建州人」 */
    native_place?: string;
    /** @deprecated 源档已无此字段（署名只在 Work.authors[].entity_id）；详情页读 `_works`。仅旧版 EntityDetail 还读 */
    works?: EntityWorkRef[];
    /** build 产物：著录本专名的作品（Work 卡，`id` 改名 `work_id`，另有 role） */
    _works?: DerivedEntityWork[];
    /** 外部数据库引用（CBDB 等） */
    external_ids?: ExternalIds;
    /** 是否草稿 */
    isDraft?: boolean;
}

/** Entity.dates：整数（负数为公元前）或 null；floruit=[起,止]，仅生卒皆缺时才有 */
export interface EntityDates {
    birth?: number | null;
    death?: number | null;
    floruit?: [number, number] | number[] | null;
    basis?: string;
}

/** 统一详情数据类型 */
export type IndexDetailData = BookDetailData | CollectionDetailData | WorkDetailData | EntityDetailData;

// ── 关联关系类型 ──

/** 关联实体 */
export interface RelatedEntity {
    id: string;
    title: string;
    type: IndexType;
}

/** 关联关系数据 */
export interface RelationData {
    parentWork?: RelatedEntity;
    parentCollection?: RelatedEntity;
    belongsToWork?: RelatedEntity;
    belongsToCollection?: RelatedEntity;
    childWorks?: RelatedEntity[];
    childCollections?: RelatedEntity[];
    containedBooks?: RelatedEntity[];
    siblingBooks?: RelatedEntity[];
}

// ── 实体搜索/选择类型 ──

/** 实体选项（搜索结果、最近使用等） */
export interface EntityOption {
    id: string;
    title: string;
    edition?: string;
    type: IndexType | string;
    author?: string;
    dynasty?: string;
}

/** 创建实体参数 */
export interface CreateEntityParams {
    type: IndexType;
    title: string;
    inheritData?: Record<string, unknown>;
}

// ── 附属作品信息 ──

/** 附属作品条目（序言、附录、卷图等） */
export interface AdditionalWork {
    book_title: string;
    n_juan?: number;
}

// ── 收录信息 ──

/** 收录条目：记录某部作品被某目录/丛书收录时的信息 */
export interface IndexedByEntry {
    /** 收录来源名称（繁体全名），如"欽定四庫全書總目" */
    source: string;
    /** 收录来源的 Book Index ID */
    source_bid?: string;
    /** 收录时的标题信息，如"《子夏易傳》 十一卷" */
    title_info?: string;
    /** 收录时的作者信息，如"舊本題「卜子夏撰」" */
    author_info?: string;
    /** 收录时的版本信息，如"內府藏本" */
    edition?: string;
    /**
     * 在该书目中的门类，如"六藝略／春秋"。
     * 抽样 2480 部作品中 21.6% 有此字段，此前一直没在类型里声明，
     * 于是详情页读不到、也就从没展示过。
     */
    section?: string;
    /** section 的判定依据（整理时记录的推理过程，一般不展示） */
    section_basis?: string;
    /** 出处页码，如"KR2a0007_WYG_030-12b"（抽样 8.6% 有） */
    page?: string;
    /** 提要/摘要 */
    summary?: string;
    /** 编者评论 */
    comment?: string;
    /** 附加评论 */
    additional_comment?: string;
}

// ── 考证信息 ──

/** 考证条目：记录某部作品被某考证著作校勘/注释时的信息 */
export interface EmendatedByEntry {
    /** 考证来源名称（繁体全名），如"隋書經籍志考證" */
    source: string;
    /** 考证来源的 Book Index ID */
    source_bid?: string;
    /** 考证正文/摘要 */
    summary?: string;
    /** 编者评论 */
    comment?: string;
    /** 附加评论 */
    additional_comment?: string;
}

// ── 资料来源类型 ──

// ── 丛编目录 (volume_book_mapping) ──

/** 丛编分部 */
export interface VolumeSection {
    name: string;
    volume_range: [number, number];
}

/** 册级详细信息（来源 URL、状态等） */
export interface VolumeDetail {
    volume: number;
    status?: string;
    urls?: Record<string, string>;
    file?: string;
}

/** 丛编目录中的书目条目（统一格式，归一化后） */
export interface VolumeBookEntry {
    title: string;
    book_id?: string | null;
    work_id?: string | null;
    /** 册号列表，始终为 number[]（归一化后） */
    volumes: number[];
    /** 册级详细信息（可选） */
    volume_details?: VolumeDetail[];
    section?: string;
    sub_items?: string[];
    edition?: string;
    expected_volumes?: number;
    found_volumes?: number;
    missing_volumes?: number[];
}

/** 丛编目录统计（统一格式，字段均可选） */
export interface VolumeBookStats {
    total_books: number;
    processed_volumes?: number;
    matched_works?: number;
    unmatched_works?: number;
    total_found_volumes?: number;
}

/** 丛编目录数据 (volume_book_mapping.json)，归一化后的统一格式 */
export interface VolumeBookMapping {
    collection_id: string;
    title: string;
    source?: string;
    resource_id?: string;
    resource_name?: string;
    total_volumes: number;
    sections?: VolumeSection[];
    stats: VolumeBookStats;
    books: VolumeBookEntry[];
    volume_index?: Record<string, string[]>;
}

/** 带资源信息的丛编目录 */
export interface ResourceCatalog {
    resource_id: string;
    short_name?: string;
    data: VolumeBookMapping;
}

// ── 整理本 (collated_edition) ──

/** 整理本中的一个 section */
export interface CollatedSection {
    title: string;
    level?: number;
    type: string;  // '书' | '序' | '结语' | '类'（结构标签） | '考证'（考证整理本）
    content?: string;
    edition?: string | null;
    text_status?: string | null;
    book_title?: string;
    n_juan?: number | null;
    additional_titles?: string[] | null;
    summary?: string | null;
    comment?: string | null;
    additional_comment?: string | null;
    author_info?: string | null;
    dynasty?: string | null;
    author?: string | null;
    author_type?: string | null;
    note?: string | null;
    tag?: string | null;
    /** catalog 类型：单个关联作品 ID */
    work_id?: string | null;
    /** kaozhen 类型：关联的作品 ID 列表 */
    work_ids?: string[];
    /** kaozhen 类型：原文标题行 */
    header_line?: string;
    /** AI 生成的备注 */
    ai_note?: string;
}

/** 整理本的一卷数据 */
export interface CollatedJuan {
    title: string;
    page_title?: string;
    source_url?: string;
    sections: CollatedSection[];
}

/** 整理本卷分组 */
export interface JuanGroup {
    label: string;
    files: string[];
    children?: JuanGroup[];
}

/** 整理本参考文献 */
export interface CollatedReference {
    /** 文献标题 */
    title: string;
    /** 作者 */
    author?: string;
    /** URL（网络资源） */
    url?: string;
    /** 备注说明 */
    note?: string;
}

/** 整理本索引（卷列表） */
export interface CollatedEditionIndex {
    /** 整理本类型：catalog（目录志书）| kaozhen（考证） */
    type?: 'catalog' | 'kaozhen';
    work_id: string;
    /** 书名（数据里有，如「直齋書錄解題」）；阅读器工具条用 */
    title?: string;
    /**
     * 卷文件清单——**卷数的唯一可信来源**，取 juan_files.length。
     *
     * 曾有个 total_juan 字段与它并存，是整理时写入的独立声明、之后没人维护，
     * 实测 4 部整理本对不上（d59f2mp38qv4 声明 1 卷、实际 43 个卷文件），
     * 且口径混着「原书传统卷数」与「拆分文件数」两种。2026-09-03 已从数据
     * 和类型里一并删除，不要再加回来。
     */
    juan_files?: string[];
    /**
     * 元数据（如所属源册号），渲染于 tab/button 旁。
     *
     * 键必须是 juan_files 里的规范名（`juan/001.json`）。曾经存的是改名前的
     * 原名（`49册.json`），查询一律落空、武職選簿 26 册的册号整批丢失；
     * 2026-09-09 已随 juan_groups 一并订正，juan_files_original 那个迁移
     * 临时字段也同时删除。**不要再引入以原名为键的形态。**
     */
    juan_metadata?: Record<string, { vols?: number[]; vol_label?: string }>;
    /**
     * 分组导航。files 里必须是 juan_files 里的规范名——曾经存的是语义名
     * （`易類.json`）或改名前的旧名（`juan001.json`），31 部整理本因此
     * 一卷都点不开（欽定四庫全書總目 205 卷全中招）。2026-09-09 已订正。
     */
    juan_groups?: JuanGroup[];
    /** 参考文献 */
    references?: CollatedReference[];
    /** kaozhen: 考证对象（如"漢書藝文志"） */
    target_source?: string;
    target_source_id?: string;
    /** kaozhen: 文本来源说明 */
    text_source?: string;
    /** 文本质量等级 */
    text_quality?: {
        grade: TextQualityGrade;
        /** 文字来源说明 */
        source_note?: string;
    };
    /** 文件列表（替代 juan_files 的详细版） */
    files?: Array<{
        filename: string;
        title: string;
        source_juan?: string;
        sections?: number;
        status?: string;
    }>;
}

/** 资料来源项 */
export interface SourceItem {
    id: string;
    name: string;
    type: 'bookID' | 'url' | '';
    details: string;
    position: string;
    version: string;
    processor_version: string;
}

// ── 资源导入进度 ──

/** 资源导入状态 */
export type ResourceImportStatus = 'todo' | 'in_progress' | 'done';

/** 资源导入类型 */
export type ResourceImportType = 'catalog' | 'collection';

/** 资源导入进度条目 */
export interface ResourceProgressItem {
    id: string;
    name: string;
    /** 版本（如"文淵閣本"、"百衲本"） */
    edition?: string;
    type: ResourceImportType;
    description?: string;
    url?: string;
    /** 关联的叢編 ID */
    collection_id?: string;
    /** 关联的作品 ID */
    work_id?: string;
    total: number;
    imported: number;
    status: ResourceImportStatus;
    priority: number;
    start_date?: string;
    end_date?: string;
    notes?: string;
}

/** 资源导入进度数据 */
export interface ResourceProgress {
    resources: ResourceProgressItem[];
}

// ── 推荐数据 ──

/** 推荐条目（bundle-data 时已用 index 元数据 hydrate，便于免 chunk 渲染） */
export interface RecommendedEntry {
    id: string;
    title: string;
    description?: string;
    type?: IndexType;
    author?: string;
    dynasty?: string;
    role?: string;
    edition?: string;
    has_text?: boolean;
    has_image?: boolean;
    has_collated?: boolean;
    subtype?: string;
    primary_name?: string;
}

/** 推荐分组 */
export interface RecommendedGroup {
    name: string;
    items: RecommendedEntry[];
}

/** 推荐数据 */
export interface RecommendedData {
    groups: RecommendedGroup[];
}

// ── 版本传承图 (lineage / version_graph) ──

/** 版本类别 */
export type LineageCategory = '抄本' | '刻本' | '影印' | '校注' | '排印' | '电子' | string;

/** 版本现存状态 */
export type LineageStatus = 'extant' | 'fragment' | 'lost';

/** 派生关系类型 */
export type LineageRelation =
    | '过录' | '底本' | '参校' | '校改' | '修订' | '翻刻'
    | '配补' | '续补' | '影印' | '校注' | '评点' | '续评' | string;

/** 横向关联类型（兄弟本/同源/互校等） */
export type LineageSiblingRelation = '兄弟本' | '同源' | '互校' | string;

/** 关系信心等级 */
export type LineageConfidence = 'certain' | 'consensus' | 'probable' | 'disputed';

/** ref_type：派生来源是其他 Book 还是假想节点 */
export type LineageRefType = 'book' | 'hypothetical';

/** Book.lineage.derived_from[i] —— 单条派生关系 */
export interface LineageDerivation {
    /** 引用 ID：book_id 或 hypothetical_node.id */
    ref: string;
    ref_type: LineageRefType;
    relation: LineageRelation;
    confidence: LineageConfidence;
    /** 一句话证据：题字、避讳、序言、抄手等 */
    evidence?: string;
    note?: string;
}

/** Book.lineage.related_to[i] —— 横向兄弟本 */
export interface LineageSibling {
    book_id: string;
    relation: LineageSiblingRelation;
    confidence: LineageConfidence;
    evidence?: string;
    note?: string;
}

/** Book.lineage —— 单本书的版本节点信息 */
export interface BookLineage {
    /** 数字年份（用于时间轴/排序） */
    year?: number;
    /** 原始年代表述 */
    year_text?: string;
    /** 年份是否仅为推断 */
    year_uncertain?: boolean;
    /**
     * 著录的年代区间。year_text 是「明末清初」这类跨代表述时，
     * 录入者会在 year 填代表值、在此填真实区间——取区间才对，
     * 拿代表值当确切年会和朝代打架（水滸文盛堂本 year=1700 配「明」越界）。
     */
    year_range?: [number, number];
    category: LineageCategory;
    status: LineageStatus;
    /** 现存范围说明 */
    extant_juan?: string;
    /** 别名 */
    alias?: string[];
    /** 派生关系（可多源） */
    derived_from?: LineageDerivation[];
    /** 横向兄弟本（不是父子） */
    related_to?: LineageSibling[];
    note?: string;
}

/** Work.version_graph.groups[i] —— 分组/泳道 */
export interface VersionGraphGroup {
    id: string;
    label: string;
    /** 颜色（hex） */
    color?: string;
    /** 简要说明（用于版本列表中折叠组的副标题） */
    description?: string;
}

/** Work.version_graph.hypothetical_nodes[i] —— 假想祖本节点 */
export interface VersionGraphHypotheticalNode {
    id: string;
    label: string;
    /** 节点上展示的副标题/描述（如「繁本，早於嘉靖殘本，已佚」）。
     *  与 note（学术依据/长说明）区分：description 紧跟在 label 下方显示。 */
    description?: string;
    year?: number;
    /** 当 year 不明而只有区间时使用 */
    year_range?: [number, number];
    year_uncertain?: boolean;
    group?: string;
    /** 假想节点之间也可有派生关系 */
    derived_from?: LineageDerivation[];
    note?: string;
}

/** Work.version_graph —— 整个作品的版本图元信息 */
export interface VersionGraph {
    /** 详情页是否显示「关系图」tab */
    enabled: boolean;
    title?: string;
    description?: string;
    /** 布局方向：LR=左右，TB=上下 */
    layout?: 'LR' | 'TB';
    groups?: VersionGraphGroup[];
    /** book_id → group_id */
    node_groups?: Record<string, string>;
    /** 假想祖本节点 */
    hypothetical_nodes?: VersionGraphHypotheticalNode[];
    /** Work.books 里但不进图的条目（如待 dedupe 的占位） */
    excluded_books?: string[];
    excluded_reason?: string;
    /** 默认显示的集合 key（对应 collections 字典中的某 key 或 'all'）。
     *  缺省时等同 'all'（不过滤）。 */
    default_collection?: string;
    /** 各集合的元数据。任意 key（如 'core'/'printed'）；'all' 为保留特殊值表示完整。
     *  每个集合可通过 groups 或 book_ids（或两者并集）声明范围；都未指定则与 'all' 同义。 */
    collections?: Record<string, VersionGraphCollection>;
    /** @deprecated 旧字段，等价 `collections.core.book_ids`；保留以兼容旧数据。 */
    core_books?: string[];
    /** @deprecated 旧字段，等价 `collections.core.hypothetical_ids`；保留以兼容旧数据。 */
    core_hypotheticals?: string[];
}

/** 集合定义。可按 group/book_ids 任选其一或并集声明范围。 */
export interface VersionGraphCollection {
    /** UI 上显示的名称（如「核心版本」「刻本」） */
    label: string;
    /** UI 上 tooltip / 描述区显示的说明 */
    description?: string;
    /** 集合包含哪些分组（按 work.version_graph.groups[].id；
     *  集合 = 这些 group 下所有 book + hypothetical 节点的并集） */
    groups?: string[];
    /** 集合精确包含的 book id 列表（与 groups 并集生效） */
    book_ids?: string[];
    /** 集合精确包含的假想节点 id 列表（与 groups 并集生效；
     *  缺省且未指定 groups 时，所有假想节点均纳入） */
    hypothetical_ids?: string[];
}

// ── 古籍总目（N4a 组件 / N4b 网站构建期索引共用的数据契约，overview#218 第 4 条） ──

/** 总目分类树节点。count 为该节点整棵子树的作品数（含直接挂在本节点、未细分到下级的） */
export interface CatalogNode {
    id: string;
    label: string;
    count: number;
    children?: CatalogNode[];
}

/** 总目作品卡片（一页 20 张） */
export interface CatalogWorkCard {
    id: string;
    title: string;
    /** 卷数：数字按「N卷」显示；字符串原样显示（如 measure_info「一百三十篇」） */
    juan?: number | string;
    authors?: { name: string; dynasty?: string }[];
    /** 提要，卡片上三行截断 */
    summary?: string;
    /** 分类签，如 ['史部', '正史類']，卡片上以「·」连接 */
    classification?: string[];
}
