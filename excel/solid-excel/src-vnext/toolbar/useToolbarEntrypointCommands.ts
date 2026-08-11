import {
  openCommentSessionAtom,
  openConditionalFormatEditorAtom,
  openFilterDropdownFromEntrypointAtom,
  openFindReplaceFromEntrypointAtom,
  openNameManagerAtom,
  openValidationRuleEditorAtom,
  retryFilterSortRefreshAtom,
  runPhysicalSortAtom,
  selectionSnapshotAtom,
  type SortDirection,
} from '@einfach/spreadsheet-ui-core'
import { refreshVisibleProjection, resolveSortRange } from '../provider'
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

  async function handleSortSelect(direction: SortDirection) {
    deps.closeSurface()
    const snapshot = deps.store.getter(selectionSnapshotAtom)
    const sheetId = snapshot.activeCell.sheetId || deps.availability().sheetId
    if (!sheetId || typeof deps.backend.sortRange !== 'function') return
    const range = await resolveSortRange(deps.store, deps.backend, sheetId, snapshot.activeCell)
    void deps.store.setter(runPhysicalSortAtom, {
      source: deps.backend,
      entrypoint: 'toolbar',
      direction,
      range,
      refreshProjection: (target) => refreshVisibleProjection(deps.store, deps.backend, target),
    })
  }

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
    handleSortSelect,
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
