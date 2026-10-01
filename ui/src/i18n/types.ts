import type { NamespaceMessages } from './messages';

/**
 * 支持的语言变体。
 * 加英文：这里加 'en'，locales/ 下补 en.ts，各 messages/*.ts 的 en 栏填上（缺的键回落到繁体）。
 */
export type Locale = 'zh-Hant' | 'zh-Hans';

/** 将来要加的语言（字典结构已为它留位置，见 messages/define.ts） */
export type FutureLocale = Locale | 'en';

/** 早期的整块字典（locales/zh-Hant.ts、zh-Hans.ts）；新文字请放进 messages/ 下按区域分的字典 */
export interface CoreMessages {
    indexType: { work: string; book: string; collection: string; entity: string };
    resourceType: { text: string; image: string; textImage: string; physical: string };
    resourceTypeShort: { text: string; image: string; textImage: string; physical: string };
    rootType: { catalog: string; search: string };
    status: { draft: string; official: string };
    checkType: Record<string, { label: string; bg: string; fg: string }>;
    action: {
        save: string;
        delete: string;
        newEntry: string;
        viewAll: string;
        visit: string;
        view: string;
        viewEntity: string;
        copy: string;
        copied: string;
        linkExisting: string;
        createAndLink: string;
        remove: string;
        clearAll: string;
        reselect: string;
        changeType: string;
        expand: string;
        collapse: string;
        expandMore: string;
        addSubWork: string;
        addVersion: string;
        addBook: string;
        addSubCollection: string;
        addCollectionImpl: string;
        addSource: string;
        addResource: string;
        addIndexedBy: string;
        addEmendatedBy: string;
        addAdditionalWork: string;
        selectBookOrWork: string;
        clickToSelectBookOrWork: string;
        unlink: string;
    };
    label: {
        id: string;
        author: string;
        dynasty: string;
        edition: string;
        juanCount: string;
        pageCount: string;
        volumeCount: string;
        holder: string;
        firstImage: string;
        year: string;
        currentLocation: string;
        parentWork: string;
        relatedWorks: string;
        type: string;
        rootType: string;
        coverageLevel: string;
        coverageRange: string;
        metadata: string;
        optionalInfo: string;
        details: string;
        detailsOptional: string;
        positionOptional: string;
        dataVersionOptional: string;
        processorVersionOptional: string;
        sourceName: string;
        sourceBid: string;
        titleInfo: string;
        authorInfo: string;
        urlAddress: string;
    };
    section: {
        basicInfo: string;
        description: string;
        additionalWorks: string;
        indexedBy: string;
        emendatedBy: string;
        resources: string;
        textResources: string;
        imageResources: string;
        sources: string;
        provenance: string;
        relatedVersions: string;
        otherEditions: string;
        dangerZone: string;
        aliases: string;
        attachedTexts: string;
        appendix: string;
        containedIn: string;
        /** 作品被丛编收录（与 belongsToWork 区分：后者指向上级作品） */
        collectedIn: string;
        belongsToWork: string;
        locationHistory: string;
        historyOverview: string;
        containedBooks: string;
        relations: string;
        summary: string;
        comment: string;
        additionalComment: string;
        indexed: string;
        emendated: string;
        relatedWorks: string;
        containedWorks: string;
        adaptations: string;
        derivativeWorks: string;
        /** 本作品所研究/注解的对象（relation: studies / preceded_by） */
        studies: string;
    };
    relation: {
        belongsToWork: string;
        containedInCollection: string;
        siblingVersions: string;
        addVersionForWork: string;
        parentWork: string;
        childWorks: string;
        collectionImpl: string;
        allVersions: string;
        correspondingWork: string;
        parentCollection: string;
        childCollections: string;
        containedBooks: string;
        notLinked: string;
        none: string;
    };
    search: {
        placeholder: string;
        searching: string;
        loading: string;
        noResults: string;
        noResultsFor: string;
        tryOther: string;
        recentBrowse: string;
        history: string;
        clearAll: string;
        clearRecent: string;
        itemNotFound: string;
        removeFromRecent: string;
        searchTitle: string;
        /** 结果页签：「全部」与页签组的无障碍名称 */
        allTab: string;
        resultTabs: string;
        searchSubtitle: string;
        searchBookName: string;
        alias: string;
    };
    /** 搜索页 v4：左栏筛选、表格／卡片视图（overview#298） */
    searchV4: {
        filterTitle: string;
        dynasty: string;
        classification: string;
        resources: string;
        extant: string;
        clearAllFilters: string;
        hasImage: string;
        hasText: string;
        hasCollated: string;
        /** 「筛选」按钮（手机）与已选个数 */
        filterButton: string;
        filterSelected: string;
        expand: string;
        collapse: string;
        filteredCount: string;
        removeFilter: string;
        viewLabel: string;
        viewTable: string;
        viewCard: string;
        colTitle: string;
        colType: string;
        colAuthor: string;
        colEra: string;
        colClass: string;
        colResource: string;
        tagImage: string;
        tagText: string;
        tagCollated: string;
        tagLost: string;
        pageInfo: string;
        pagerLabel: string;
        prevPage: string;
        nextPage: string;
        emptyFiltered: string;
        limitedNote: string;
        sortLabel: string;
        sortRelevance: string;
        sortEra: string;
        sortTitle: string;
        sortEraAsc: string;
        sortEraDesc: string;
        sortTitleAsc: string;
        sortTitleDesc: string;
        onlyWorksNote: string;
    };
    home: {
        title: string;
        subtitle: string;
        recommendedBrowse: string;
        catalogTab: string;
        collectionTab: string;
        siteTab: string;
        recommendTab: string;
        feedbackTab: string;
        statusInProgress: string;
        statusDone: string;
        statusTodo: string;
        typeCatalog: string;
        typeCollection: string;
        totalPending: string;
        progressFormat: string;
        siteCoverage: string;
    };
    browser: {
        title: string;
        subtitle: string;
    };
    detailTab: {
        basicInfo: string;
        catalog: string;
        collectionCatalog: string;
        collatedEdition: string;
        catalogSuffix: string;
        fullText: string;
        lineage: string;
        feedback: string;
        dataSource: string;
        backToIndex: string;
        submitVersion: string;
        dataLicense: string;
    };
    metadata: Record<string, string>;
    editor: {
        untitled: string;
        workTitle: string;
        collectionTitle: string;
        bookTitle: string;
        belongsToWork: string;
        authorLabel: string;
        publicationYearLabel: string;
        containedIn: string;
        holderLabel: string;
        pageLabel: string;
        volumeLabel: string;
        firstImageLabel: string;
        descriptionPlaceholder: string;
        provenancePlaceholder: string;
        otherEditionsPlaceholder: string;
        dangerZoneDesc: string;
        deleteEntity: string;
        selectToLink: string;
        unnamedSource: string;
        selectSourceType: string;
        fromExistingBook: string;
        enterUrl: string;
        sourceNamePlaceholder: string;
        deleteThisSource: string;
        deleteThisResource: string;
        resourcePlaceholder: string;
        idAutoExtract: string;
        resourceName: string;
        resourceUrl: string;
        structurePlaceholder: string;
        coverageRangePlaceholder: string;
        detailsPlaceholder: string;
        summaryPlaceholder: string;
        commentPlaceholder: string;
        additionalCommentPlaceholder: string;
        imageResourceLink: string;
        bookNameLabel: string;
        sourcePlaceholder: string;
    };
    download: {
        completed: string;
        downloading: string;
        downloadThis: string;
    };
    mode: {
        localMode: string;
        syncMode: string;
        githubSync: string;
        switchToSync: string;
        switchToLocal: string;
        switchToGithub: string;
        switchToDraft: string;
        switchToOfficial: string;
        selectFolder: string;
        configurePath: string;
    };
    catalog: {
        totalVolumes: string;
        processed: string;
        contains: string;
        matched: string;
        unmatched: string;
        source: string;
        all: string;
        loading: string;
        notFound: string;
        loadFailed: string;
        noMatch: string;
        unmatched_label: string;
        volume: string;
    };
    unit: {
        juan: string;
        volume: string;
        bu: string;
        items: string;
    };
    /** Work.subtype → 中文。数据里是英文枚举，直出会在标题旁露出 `chapter`/`poem` */
    workSubtype: { book: string; article: string; poem: string; chapter: string };
    colorMode: { bw: string; color: string };
    misc: {
        noResources: string;
        hasTranslation: string;
        noTranslation: string;
        structure: string;
        coverage: string;
        notFoundEntry: string;
        loadFailed: string;
        textResource: string;
        imageResource: string;
    };
}

/** 全部界面文字：早期整块字典 + messages/ 下按区域分的字典 */
export type LocaleMessages = CoreMessages & NamespaceMessages;
