import {
  commitPointerAtom,
  pickFormulaReferenceAtom,
  startPointerAtom,
  updatePointerAtom,
  type CellCoord,
} from '@einfach/spreadsheet-ui-core'
import type { GridContextMenuApi } from './grid-context-menu'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridSelectionApi } from './grid-selection'

type GridPointerSelectionRuntime = GridRuntimeBase &
  Pick<GridContextMenuApi, 'focusGrid' | 'getCellCoordFromPoint'> &
  Pick<GridSelectionApi, 'selectCellSpan'>

export function installGridPointerSelection(runtime: GridPointerSelectionRuntime) {
  const { props, store, dom, focusGrid, getCellCoordFromPoint } = runtime

  function startFormulaReferenceDragPick(event: PointerEvent, row: number, col: number) {
    const activeInput = document.activeElement as HTMLInputElement | null
    const anchor: CellCoord = { row, col }
    store.setter(pickFormulaReferenceAtom, {
      pickAnchor: anchor,
      pickFocus: anchor,
      sheetId: props.sheetId,
      dragging: true,
    })
    let lastFocus = anchor
    const onPointerMove = (moveEvent: PointerEvent) => {
      const focus = getCellCoordFromPoint(moveEvent)
      if (!focus || (focus.row === lastFocus.row && focus.col === lastFocus.col)) return
      lastFocus = focus
      store.setter(pickFormulaReferenceAtom, {
        pickAnchor: anchor,
        pickFocus: focus,
        sheetId: props.sheetId,
        dragging: true,
      })
    }
    const onPointerUp = () => {
      store.setter(pickFormulaReferenceAtom, {
        pickAnchor: anchor,
        pickFocus: lastFocus,
        sheetId: props.sheetId,
        dragging: false,
      })
      cleanup()
      if (
        activeInput &&
        (activeInput.classList.contains('cell-input') ||
          activeInput.classList.contains('formula-bar-input'))
      ) {
        queueMicrotask(() => {
          activeInput.focus()
          const length = activeInput.value.length
          activeInput.setSelectionRange(length, length)
        })
      }
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  }

  function startDragSelection(event: PointerEvent, row: number, col: number) {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    dom.cancelDragSelection()
    dom.cancelFill()
    dom.cancelResize()
    const anchorHit: CellCoord = { row, col }
    const initialSelection = runtime.selectCellSpan(anchorHit, anchorHit)
    let pointerAnchor = initialSelection.anchor
    store.setter(startPointerAtom, {
      kind: 'drag-selection',
      sheetId: props.sheetId,
      anchor: pointerAnchor,
      focus: initialSelection.focus,
      source: 'pointer',
    })
    focusGrid()
    let lastFocusHit = anchorHit
    const onPointerMove = (moveEvent: PointerEvent) => {
      const focusHit = getCellCoordFromPoint(moveEvent)
      if (!focusHit || (focusHit.row === lastFocusHit.row && focusHit.col === lastFocusHit.col))
        return
      lastFocusHit = focusHit
      const selection = runtime.selectCellSpan(anchorHit, focusHit)
      if (
        selection.anchor.row !== pointerAnchor.row ||
        selection.anchor.col !== pointerAnchor.col
      ) {
        pointerAnchor = selection.anchor
        store.setter(startPointerAtom, {
          kind: 'drag-selection',
          sheetId: props.sheetId,
          anchor: pointerAnchor,
          focus: selection.focus,
          source: 'pointer',
        })
        return
      }
      store.setter(updatePointerAtom, { kind: 'drag-selection', focus: selection.focus })
    }
    const onPointerUp = () => {
      store.setter(commitPointerAtom)
      cleanup()
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      dom.setCancelDragSelection(() => undefined)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    dom.setCancelDragSelection(cleanup)
  }

  return installGridFeature(runtime, { startFormulaReferenceDragPick, startDragSelection })
}

export type GridPointerSelectionApi = ReturnType<typeof installGridPointerSelection>
