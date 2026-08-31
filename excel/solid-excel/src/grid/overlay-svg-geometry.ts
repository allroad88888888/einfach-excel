import type { Store } from '@einfach/core'
import {
  activeCellAtom,
  activeSpillRegionAtom,
  clipboardStateAtom,
  editingSessionAtom,
  formulaReferenceTokensAtom,
  getSelectionRange,
  pointerSessionAtom,
  selectionRangeAtom,
  selectionRegionsAtom,
  type CellRange,
} from '@einfach/spreadsheet-ui-core'
import { createMemo, type Accessor } from 'solid-js'
import { FORMULA_REFERENCE_PALETTE, type OverlayRect } from './overlay-types'
import { computeOverlayRectForRange } from './overlayGeometry'
import type { SpreadsheetGridOverlaySvgProps } from './SpreadsheetGridOverlaySvg'

export interface ColoredOverlayRect extends OverlayRect {
  color: string
  testId?: string
}

export interface OverlaySvgGeometry {
  primarySelection: Accessor<OverlayRect | null>
  activeCellRect: Accessor<OverlayRect | null>
  secondarySelectionRects: Accessor<OverlayRect[]>
  fillPreviewRect: Accessor<OverlayRect | null>
  formulaReferenceRects: Accessor<ColoredOverlayRect[]>
  spillBorderRect: Accessor<OverlayRect | null>
  mergeBorderRects: Accessor<OverlayRect[]>
  conditionalFormatRects: Accessor<ColoredOverlayRect[]>
  clipboardSourceRect: Accessor<OverlayRect | null>
}

const UNBOUNDED_SELECTION_BOUNDS = {
  rowCount: Number.MAX_SAFE_INTEGER,
  colCount: Number.MAX_SAFE_INTEGER,
}

export function createOverlaySvgGeometry(
  props: SpreadsheetGridOverlaySvgProps,
  store: Store,
  geometryTick: Accessor<number>,
  decorationTick: Accessor<number>,
): OverlaySvgGeometry {
  const rectForRange = (range: CellRange): OverlayRect | null =>
    computeOverlayRectForRange({
      range,
      getCellRect: props.getCellRect,
      getVisibleRows: props.getVisibleRows,
      getVisibleCols: props.getVisibleCols,
    })
  const trackBoth = () => {
    void decorationTick()
    void geometryTick()
  }
  const trackGeometry = () => {
    void geometryTick()
  }
  const primarySelection = createMemo<OverlayRect | null>(() => {
    trackBoth()
    if (!store.getter(selectionRegionsAtom).some((region) => region.sheetId === props.sheetId)) {
      return null
    }
    return rectForRange(store.getter(selectionRangeAtom))
  })
  const activeCellRect = createMemo<OverlayRect | null>(() => {
    trackBoth()
    const active = store.getter(activeCellAtom)
    return (active.sheetId ?? props.sheetId) === props.sheetId
      ? props.getCellRect(active.row, active.col)
      : null
  })
  const secondarySelectionRects = createMemo<OverlayRect[]>(() => {
    trackBoth()
    return store
      .getter(selectionRegionsAtom)
      .filter((region) => region.sheetId === props.sheetId)
      .slice(1)
      .flatMap((region) => {
        const rect = rectForRange(getSelectionRange(region, UNBOUNDED_SELECTION_BOUNDS))
        return rect ? [rect] : []
      })
  })
  const fillPreviewRect = createMemo<OverlayRect | null>(() => {
    trackBoth()
    const session = store.getter(pointerSessionAtom)
    const interaction = session.status === 'active' ? session.interaction : null
    if (interaction?.kind !== 'fill-handle' || interaction.sheetId !== props.sheetId) return null
    return interaction.previewRange ? rectForRange(interaction.previewRange) : null
  })
  const formulaReferenceRects = createMemo<ColoredOverlayRect[]>(() => {
    trackBoth()
    const editSheetId = store.getter(editingSessionAtom).source?.sheetId ?? null
    return store.getter(formulaReferenceTokensAtom).flatMap((token) => {
      if ((token.sheetId ?? editSheetId) && (token.sheetId ?? editSheetId) !== props.sheetId) {
        return []
      }
      const rect = rectForRange(token.range)
      return rect
        ? [
            {
              ...rect,
              color: FORMULA_REFERENCE_PALETTE[token.colorIndex % FORMULA_REFERENCE_PALETTE.length],
              testId: `svg-overlay-formula-ref-${token.colorIndex}`,
            },
          ]
        : []
    })
  })
  const spillBorderRect = createMemo<OverlayRect | null>(() => {
    trackBoth()
    const region = store.getter(activeSpillRegionAtom)
    return region?.sheetId === props.sheetId ? rectForRange(region.range) : null
  })
  const mergeBorderRects = createMemo<OverlayRect[]>(() => {
    trackGeometry()
    return props.getCells().flatMap((cell) => {
      if (!cell.mergedSpan) return []
      const rect = rectForRange({
        rowStart: cell.row,
        rowEnd: cell.row + Math.max(1, Math.trunc(cell.mergedSpan.rows)) - 1,
        colStart: cell.col,
        colEnd: cell.col + Math.max(1, Math.trunc(cell.mergedSpan.cols)) - 1,
      })
      return rect ? [rect] : []
    })
  })
  const conditionalFormatRects = createMemo<ColoredOverlayRect[]>(() => {
    trackGeometry()
    return props.getCells().flatMap((cell) => {
      const color = cell.conditionalFormat?.bgColor
      const rect = color ? props.getCellRect(cell.row, cell.col) : null
      return rect && color ? [{ ...rect, color }] : []
    })
  })
  const clipboardSourceRect = createMemo<OverlayRect | null>(() => {
    trackBoth()
    const clipboard = store.getter(clipboardStateAtom)
    const intent = clipboard.intent
    if (!intent || (intent.type !== 'clipboard.copy' && intent.type !== 'clipboard.cut'))
      return null
    const source = clipboard.source ?? intent.request.source
    return source?.sheetId === props.sheetId ? rectForRange(source.range) : null
  })
  return {
    primarySelection,
    activeCellRect,
    secondarySelectionRects,
    fillPreviewRect,
    formulaReferenceRects,
    spillBorderRect,
    mergeBorderRects,
    conditionalFormatRects,
    clipboardSourceRect,
  }
}
