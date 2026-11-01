import { defineMessages } from './define';

/** 「古籍中的出處」一节（MentionsSection，A12 专名出处反查） */
export const mentions = defineMessages({
    title: '古籍中的出處',
    total: '{n} 處，見於 {b} 部書',
    inBook: '{n} 處',
    more: '再看 {n} 處',
    loading: '載入中…',
    hint: '文中寫法可能是略稱、字號；點一條到閱讀頁，人名會標出來。',
}, {
    title: '古籍中的出处',
    total: '{n} 处，见于 {b} 部书',
    inBook: '{n} 处',
    more: '再看 {n} 处',
    loading: '载入中…',
    hint: '文中写法可能是略称、字号；点一条到阅读页，人名会标出来。',
}, {
    title: 'Mentions in texts',
    total: '{n} mentions in {b} books',
    inBook: '{n}',
    more: 'Show {n} more',
    loading: 'Loading…',
    hint: 'The text may use a short form or courtesy name. Open one to see it highlighted in the reader.',
});
