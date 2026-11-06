/**
 * 编辑态子入口 `book-index-ui/editor`：条目编辑器及其部件。
 * 读者端（详情、阅读、检索）不需要它，网站打包不会带进这部分代码；需要 `IndexStorage` 的 saveItem 等写入方法。
 */
export { ResourceEditor } from './components/ResourceEditor';
export { IndexEditor } from './components/IndexEditor';
export type { IndexEditorProps, IndexEditorData } from './components/IndexEditor';
export { SmartBidInput } from './components/SmartBidInput';
export { SourceEditor, parseSourceString, stringifySources } from './components/SourceEditor';
export { RelationPanel } from './components/RelationPanel';
export { EntitySelector } from './components/EntitySelector';
export { CreateEntityDialog } from './components/CreateEntityDialog';
export { EntityPickerDialog } from './components/EntityPickerDialog';
/** @deprecated 旧版「查看／编辑」合一视图，随旧 `IndexDetail` 一起保留；仅为兼容旧宿主 */
export { IndexView, detailToEditor, editorToDetail } from './components/IndexView';
export type { IndexViewProps } from './components/IndexView';
