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
});
