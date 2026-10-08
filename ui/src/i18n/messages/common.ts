import { defineMessages } from './define';

/** 多处共用的零碎界面文字 */
export const common = defineMessages({
    /** 繁简切换按钮：有意用目标字体书写，让读者一眼认出 */
    toHans: '切换为简体',
    toHant: '切換為繁體',
    localeShortHans: '简',
    localeShortHant: '繁',
    /** 主题切换（ThemeToggle），键同 ThemeName */
    themeLabel: '主題',
    theme: {
        zhusha: '朱砂',
        indigo: '靛青',
        ink: '墨',
    },
    // 以下几条改 i18n 前写死简体，繁体栏已改成繁体（overview#337）
    /** LoadingDots，后面接 1–3 个点 */
    loading: '加載中',
    repoSourceLink: '在 GitHub 查看本條目源文件',
    // ResourceList 分册
    volumesMissing: '缺{n}',
    collapseVolumes: '收起分冊',
    expandVolumes: '展開分冊',
    collapseArrow: '收起 ▲',
    expandArrow: '展開 ▼',
    // EntityDetail
    entitySubtype: {
        people: '人物',
        place: '地名',
        dynasty: '朝代',
        reign: '年號',
        office: '官名',
        anonymous: '佚名',
        collective: '集體',
    },
    cbdbTitle: 'CBDB 中國歷代人物傳記數據庫',
    entityPlaceholderNote: '人物信息暫缺。該 Entity 僅作為作者佔位，詳細生平資料尚待補充。',
    /** IndexDetail 版本分组里未归组的一组 */
    otherVersions: '其他版本',
    // IndexView 查看／编辑切换
    switchToEdit: '切換到編輯模式',
    switchToView: '切換到查看模式',
    modeEdit: '✏️ 編輯',
    modeView: '👁 查看',
    noData: '無數據',
}, {
    toHans: '切换为简体',
    toHant: '切換為繁體',
    localeShortHans: '简',
    localeShortHant: '繁',
    themeLabel: '主题',
    theme: {
        zhusha: '朱砂',
        indigo: '靛青',
        ink: '墨',
    },
    loading: '加载中',
    repoSourceLink: '在 GitHub 查看本条目源文件',
    volumesMissing: '缺{n}',
    collapseVolumes: '收起分册',
    expandVolumes: '展开分册',
    collapseArrow: '收起 ▲',
    expandArrow: '展开 ▼',
    entitySubtype: {
        people: '人物',
        place: '地名',
        dynasty: '朝代',
        reign: '年号',
        office: '官名',
        anonymous: '佚名',
        collective: '集体',
    },
    cbdbTitle: 'CBDB 中国历代人物传记数据库',
    entityPlaceholderNote: '人物信息暂缺。该 Entity 仅作为作者占位，详细生平资料尚待补充。',
    otherVersions: '其他版本',
    switchToEdit: '切换到编辑模式',
    switchToView: '切换到查看模式',
    modeEdit: '✏️ 编辑',
    modeView: '👁 查看',
    noData: '无数据',
});
