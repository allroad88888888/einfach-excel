import {
  openCommentSessionAtom,
  openConditionalFormatEditorAtom,
  openFilterDropdownFromEntrypointAtom,
  openFindReplaceFromEntrypointAtom,
  openNameManagerAtom,
  openValidationRuleEditorAtom,
  retryFilterSortRefreshAtom,
  selectionSnapshotAtom,
} from '@einfach/spreadsheet-ui-core'
import { refreshVisibleProjection } from '../provider'
import { dispatchRedo, dispatchUndo } from '../provider/history-dispatch'
import type { ToolbarActionDeps } from './ToolbarActionDeps'

/** Opens toolbar-owned entrypoints without introducing any local product state. */
export function useToolbarEntrypointCommands(deps: ToolbarActionDeps) {
  const selection = () => deps.selectionSnapshot()

  function openFindReplace() {
    deps.store.setter(openFindReplaceFromEntrypointAtom)
  }

  function openConditionalFormat() {
    deps.store.setter(openConditionalFormatEditorAtom, null)
  }

  function openDataValidation() {
    const sheetId = deps.getMutationSheetId()
    if (sheetId) deps.store.setter(openValidationRuleEditorAtom, { range: selection().range })
  }

  function openFilterDropdown() {
    deps.store.setter(openFilterDropdownFromEntrypointAtom, {
      source: deps.backend,
      entrypoint: 'toolbar',
    })
  }

  // 工具栏排序的执行已收进确认弹窗流(b2c1920):SortDropdown 只 begin 确认,
  // 真正下发 runPhysicalSortAtom 的是 useSortConfirmation.confirm() —— 这里
  // 曾经的 handleSortSelect 直发路径已删除,不要复活它绕过确认。

  function retryFilterSortRefresh() {
    void deps.store.setter(retryFilterSortRefreshAtom, {
      refreshProjection: (sheetId) => refreshVisibleProjection(deps.store, deps.backend, sheetId),
    })
  }

  function openNameManager() {
    deps.store.setter(openNameManagerAtom, { status: 'editing-new' })
  }

  async function handleUndo() {
    await dispatchUndo(deps.store, deps.backend)
  }

  async function handleRedo() {
    await dispatchRedo(deps.store, deps.backend)
  }

  function openComment() {
    const snapshot = deps.store.getter(selectionSnapshotAtom)
    const sheetId = snapshot.selection.sheetId || deps.availability().sheetId
    if (sheetId) deps.store.setter(openCommentSessionAtom, { sheetId, cell: snapshot.activeCell })
  }

  return {
    handleRedo,
    handleUndo,
    openComment,
    openConditionalFormat,
    openDataValidation,
    openFilterDropdown,
    openFindReplace,
    openNameManager,
    retryFilterSortRefresh,
  }
}
