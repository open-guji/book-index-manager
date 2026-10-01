import { defineMessages } from './define';

/**
 * 反馈（FeedbackButton / FeedbackDialog / FeedbackForm / FeedbackList / FeedbackTab）。
 * 改 i18n 前这几个组件一律写简体字面量；繁体栏已改成真正的繁体（overview#337）。
 */
export const feedback = defineMessages({
    title: '反饋',
    close: '關閉',
    /** 提交端可选的四类 */
    submitType: {
        bug: '反饋錯誤',
        resource: '添加資源',
        suggestion: '功能建議',
        contact: '想參與',
    },
    placeholder: {
        bug: '請描述您發現的錯誤，包括頁面位置和具體內容',
        resource: '請提供完整資源鏈接和簡要版本說明',
        suggestion: '您希望網站增加或改進什麼？',
        contact: '想參與整理、校對或合作？簡單介紹一下您自己，並留下聯繫方式（此類留言不公開）',
    },
    chooseTypeFirst: '請先選擇反饋類型',
    contactPlaceholder: '郵箱（選填，僅站方可見，方便我們回覆您）',
    contactLabel: '聯繫方式（選填）',
    submitFailedRetry: '提交失敗，請稍後重試',
    submitFailed: '提交失敗',
    thanks: '感謝您的反饋！',
    viewList: '查看反饋列表 →',
    continueSubmit: '繼續提交',
    submitting: '提交中...',
    submit: '提交',
    submitFeedback: '提交反饋',
    /** 公开列表里的类型标签（含服务端才有的 other） */
    listType: {
        bug: '錯誤反饋',
        resource: '資源建議',
        suggestion: '功能建議',
        other: '其他',
    },
    status: {
        pending: '待處理',
        in_progress: '處理中',
        resolved: '已處理',
        wontfix: '不採納',
        duplicate: '重複',
    },
    empty: '暫無反饋',
    reply: '回覆',
}, {
    title: '反馈',
    close: '关闭',
    submitType: {
        bug: '反馈错误',
        resource: '添加资源',
        suggestion: '功能建议',
        contact: '想参与',
    },
    placeholder: {
        bug: '请描述您发现的错误，包括页面位置和具体内容',
        resource: '请提供完整资源链接和简要版本说明',
        suggestion: '您希望网站增加或改进什么？',
        contact: '想参与整理、校对或合作？简单介绍一下您自己，并留下联系方式（此类留言不公开）',
    },
    chooseTypeFirst: '请先选择反馈类型',
    contactPlaceholder: '邮箱（选填，仅站方可见，方便我们回复您）',
    contactLabel: '联系方式（选填）',
    submitFailedRetry: '提交失败，请稍后重试',
    submitFailed: '提交失败',
    thanks: '感谢您的反馈！',
    viewList: '查看反馈列表 →',
    continueSubmit: '继续提交',
    submitting: '提交中...',
    submit: '提交',
    submitFeedback: '提交反馈',
    listType: {
        bug: '错误反馈',
        resource: '资源建议',
        suggestion: '功能建议',
        other: '其他',
    },
    status: {
        pending: '待处理',
        in_progress: '处理中',
        resolved: '已处理',
        wontfix: '不采纳',
        duplicate: '重复',
    },
    empty: '暂无反馈',
    reply: '回复',
});
