import {
  cancelPointerAtom,
  commitPointerAtom,
  createFillHandlePreview,
  startPointerAtom,
  updatePointerAtom,
} from '@einfach/spreadsheet-ui-core'
import type { GridContextMenuApi } from './grid-context-menu'
import type { GridFillControllerApi } from './grid-fill-controller'
import { startFillPointerSession } from './grid-fill-pointer-session'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridViewStateApi } from './grid-view-state'

/** Owns the transient pointer session behind the selection fill handle. */
type GridFillHandleRuntime = GridRuntimeBase &
  Pick<GridViewStateApi, 'selectionSnapshot'> &
  Pick<GridContextMenuApi, 'getCellCoordFromPoint'> &
  Pick<GridFillControllerApi, 'executeFillHandle'>

export function installGridFillHandle(runtime: GridFillHandleRuntime) {
  const { props, store, selectionSnapshot, getCellCoordFromPoint, executeFillHandle, dom } = runtime

  function startFillHandle(event: PointerEvent) {
    if ((event.pointerType === 'mouse' && event.button !== 0) || event.isPrimary === false) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    dom.cancelDragSelection()
    dom.cancelFill()
    dom.cancelResize()
    store.setter(cancelPointerAtom)

    const selection = selectionSnapshot()
    if (selection.selection.sheetId !== props.sheetId) return

    const sourceRange = selection.range
    const preview = createFillHandlePreview(sourceRange, selection.activeCell)
    store.setter(startPointerAtom, {
      kind: 'fill-handle',
      sheetId: props.sheetId,
      sourceRange,
      focus: selection.activeCell,
      previewRange: preview.previewRange,
      direction: preview.direction,
      copyOnly: event.ctrlKey || event.metaKey,
      source: 'pointer',
    })

    startFillPointerSession(event, {
      move: (moveEvent) => {
        const focus = getCellCoordFromPoint(moveEvent)
        if (!focus) return
        const nextPreview = createFillHandlePreview(sourceRange, focus)
        store.setter(updatePointerAtom, {
          kind: 'fill-handle',
          focus,
          previewRange: nextPreview.previewRange,
          direction: nextPreview.direction,
          copyOnly: moveEvent.ctrlKey || moveEvent.metaKey,
        })
      },
      commit: (upEvent) => {
        store.setter(updatePointerAtom, {
          kind: 'fill-handle',
          copyOnly: upEvent.ctrlKey || upEvent.metaKey,
        })
        const intent = store.setter(commitPointerAtom)
        if (intent?.type === 'pointer.fill-handle.commit') void executeFillHandle(intent)
      },
      cancel: () => store.setter(cancelPointerAtom),
      setCancel: dom.setCancelFill,
    })
  }

  return installGridFeature(runtime, { startFillHandle })
}

export type GridFillHandleApi = ReturnType<typeof installGridFillHandle>
