import { defineMessages } from './define';

/**
 * 版本传承（VersionLineageView / VersionLineageList / VersionLineageGraph）。
 * 改 i18n 前这几个组件一律写简体字面量；繁体栏已改成真正的繁体（overview#337）。
 */
export const lineage = defineMessages({
    empty: '暫無版本傳承數據',
    emptyGraph: '暫無版本圖數據',
    modeList: '列表',
    modeGraph: '關係圖',
    collectionLabel: '集合：',
    collectionAll: '全部',
    collectionAllDesc: '顯示該作品所有版本（含橋接節點）',
    graphLoading: '加載圖組件中…',
    /** {xyflow} {dagre} {list} 是 <code> 包的包名／组件名 */
    graphMissing: '圖組件未安裝。請安裝 {xyflow} 與 {dagre}。',
    graphMissingHint: '或使用 {list} 列表視圖。',
    bridgeTitle: '橋接節點：本身不在核心集，為保持派生鏈完整而顯示',
    otherGroup: '其他',
    lost: '已佚',
    fragment: '殘本',
    hypothetical: '假想祖本',
    bridge: '橋接',
    extant: '現存：{juan}',
    sources: '來源：',
    related: '關聯：',
    confidence: {
        certain: '確定',
        consensus: '共識',
        probable: '推測',
        disputed: '有爭議',
    },
}, {
    empty: '暂无版本传承数据',
    emptyGraph: '暂无版本图数据',
    modeList: '列表',
    modeGraph: '关系图',
    collectionLabel: '集合：',
    collectionAll: '全部',
    collectionAllDesc: '显示该作品所有版本（含桥接节点）',
    graphLoading: '加载图组件中…',
    graphMissing: '图组件未安装。请安装 {xyflow} 与 {dagre}。',
    graphMissingHint: '或使用 {list} 列表视图。',
    bridgeTitle: '桥接节点：本身不在核心集，为保持派生链完整而显示',
    otherGroup: '其他',
    lost: '已佚',
    fragment: '残本',
    hypothetical: '假想祖本',
    bridge: '桥接',
    extant: '现存：{juan}',
    sources: '来源：',
    related: '关联：',
    confidence: {
        certain: '确定',
        consensus: '共识',
        probable: '推测',
        disputed: '有争议',
    },
});
