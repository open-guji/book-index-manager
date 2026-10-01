import { defineMessages } from './define';

/** 搜索页（search/*、IndexBrowser）。朝代分组、部类名是数据，走 convert；这里只放界面文字 */
export const searchPage = defineMessages({
    /** 存佚筛选项，键同 LOSS_OPTIONS 的 value（'' 记作 all） */
    loss: {
        all: '全部',
        extant: '存',
        partially_extant: '殘',
        lost: '佚',
    },
    /** 部类筛选里 value 为 '' 的那一项 */
    unclassified: '未分類',
    // IndexBrowser 首屏统计
    statBook: '書',
    statComma: '，',
    statBookCopies: '本',
    statArticle: '文章',
    statArticleUnit: '篇',
    statPoem: '詩詞',
    statPoemUnit: '首',
    statCollection: '叢編',
    /** 网站搜索页检索框右边的按钮（overview#337 B4） */
    submit: '搜索',
}, {
    loss: {
        all: '全部',
        extant: '存',
        partially_extant: '残',
        lost: '佚',
    },
    unclassified: '未分类',
    statBook: '书',
    statComma: '，',
    statBookCopies: '本',
    statArticle: '文章',
    statArticleUnit: '篇',
    statPoem: '诗词',
    statPoemUnit: '首',
    statCollection: '丛编',
    submit: '搜索',
});
