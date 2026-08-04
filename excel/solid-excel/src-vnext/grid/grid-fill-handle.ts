import {
  cancelPointerAtom,
  commitPointerAtom,
  createFillHandlePreview,
  startPointerAtom,
  updatePointerAtom,
} from '@einfach/spreadsheet-ui-core'
import { type GridRuntime } from './grid-runtime'

/** Owns the transient pointer session behind the selection fill handle. */
export function installGridFillHandle(runtime: GridRuntime) {
  const {
    props,
    store,
    selectionSnapshot,
    getCellCoordFromPoint,
    executeFillHandle,
    bumpRender,
  } = runtime

  function startFillHandle(event: PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    runtime.cancelFill()
    runtime.cancelResize()

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

    const onPointerMove = (moveEvent: PointerEvent) => {
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
      bumpRender()
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      store.setter(cancelPointerAtom)
      runtime.cancelFill = () => undefined
    }
    const onPointerUp = (upEvent: PointerEvent) => {
      store.setter(updatePointerAtom, {
        kind: 'fill-handle',
        copyOnly: upEvent.ctrlKey || upEvent.metaKey,
      })
      const intent = store.setter(commitPointerAtom)
      cleanup()
      if (intent?.type === 'pointer.fill-handle.commit') void executeFillHandle(intent)
      bumpRender()
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    runtime.cancelFill = cleanup
    bumpRender()
  }

  Object.assign(runtime, { startFillHandle })
}
