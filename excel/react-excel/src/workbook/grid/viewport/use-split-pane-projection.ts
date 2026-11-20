import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeSheetZoomAtom,
  getVisibleWindow,
  projectionSnapshotAtom,
  runSplitPaneProjectionAtom,
  seedRetainedActiveCellFactAtom,
  selectionSnapshotAtom,
  setSplitPaneSizeAtom,
  splitPaneProjectionsAtom,
  splitPaneSizesAtom,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
  type CellRange,
  type SplitPaneId,
  type WorkbookDocumentSheet,
} from '@einfach-excel/spreadsheet-ui-core'
import { useEffect, useLayoutEffect, useMemo, type RefObject } from 'react'

function rangeCovers(outer: CellRange, inner: CellRange): boolean {
  return (
    outer.rowStart <= inner.rowStart &&
    outer.rowEnd >= inner.rowEnd &&
    outer.colStart <= inner.colStart &&
    outer.colEnd >= inner.colEnd
  )
}

interface UseSplitPaneProjectionInput {
  readonly pane: SplitPaneId
  readonly paneRef: RefObject<HTMLDivElement | null>
  readonly activeSheet: WorkbookDocumentSheet
  readonly scrollTop: number
  readonly scrollLeft: number
  readonly paneGutter: number
  readonly paneHeading: number
}

const DEFAULT_PANE_SIZE = { width: 400, height: 240 }

/** Measures a split pane and syncs its bounded Rust projection via UI Core atoms. */
export function useSplitPaneProjection({
  pane,
  paneRef,
  activeSheet,
  scrollTop,
  scrollLeft,
  paneGutter,
  paneHeading,
}: UseSplitPaneProjectionInput) {
  const metrics = useAtomValue(viewportMetricsAtom)
  const zoom = useAtomValue(activeSheetZoomAtom)
  const sizeOverrides = useAtomValue(viewportGeometrySizesAtom)
  const primaryProjection = useAtomValue(projectionSnapshotAtom).result
  const selection = useAtomValue(selectionSnapshotAtom)
  const paneSize = useAtomValue(splitPaneSizesAtom)[pane] ?? DEFAULT_PANE_SIZE
  const localSnapshot = useAtomValue(splitPaneProjectionsAtom)[pane] ?? null
  const setPaneSize = useSetAtom(setSplitPaneSizeAtom)
  const runPaneProjection = useSetAtom(runSplitPaneProjectionAtom)
  const seedActiveCellFact = useSetAtom(seedRetainedActiveCellFactAtom)

  useLayoutEffect(() => {
    const node = paneRef.current
    if (!node) return
    const measure = () => {
      setPaneSize({
        pane,
        width: Math.max(1, node.clientWidth - paneGutter),
        height: Math.max(1, node.clientHeight - paneHeading),
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [pane, paneRef, paneGutter, paneHeading, zoom, setPaneSize])

  const rowHeights = sizeOverrides.rowHeightsBySheet[activeSheet.id]
  const colWidths = sizeOverrides.colWidthsBySheet[activeSheet.id]

  const paneWindow = useMemo(
    () =>
      getVisibleWindow(
        {
          ...metrics,
          sheetId: activeSheet.id,
          rowCount: activeSheet.rowCount,
          colCount: activeSheet.colCount,
          scrollTop,
          scrollLeft,
          viewportWidth: paneSize.width,
          viewportHeight: paneSize.height,
          overscanRows: 4,
          overscanCols: 2,
        },
        rowHeights,
        colWidths,
      ),
    [
      metrics,
      activeSheet.id,
      activeSheet.rowCount,
      activeSheet.colCount,
      scrollTop,
      scrollLeft,
      paneSize.width,
      paneSize.height,
      rowHeights,
      colWidths,
    ],
  )

  const primaryCovers =
    primaryProjection?.kind === 'visible-window' &&
    primaryProjection.sheetId === activeSheet.id &&
    rangeCovers(primaryProjection.window, paneWindow)
  const primaryRevision =
    primaryProjection?.kind === 'visible-window' && primaryProjection.sheetId === activeSheet.id
      ? primaryProjection.revision
      : undefined

  useEffect(() => {
    const empty = paneWindow.rowEnd < paneWindow.rowStart || paneWindow.colEnd < paneWindow.colStart
    if (primaryCovers || empty) return
    void runPaneProjection({ pane, sheetId: activeSheet.id, range: paneWindow })
  }, [pane, activeSheet.id, primaryCovers, primaryRevision, paneWindow, runPaneProjection])

  const activeSnapshot = primaryCovers
    ? primaryProjection
    : localSnapshot?.sheetId === activeSheet.id
      ? localSnapshot
      : primaryProjection?.kind === 'visible-window' && primaryProjection.sheetId === activeSheet.id
        ? primaryProjection
        : null

  useEffect(() => {
    if (!activeSnapshot || activeSnapshot === primaryProjection) return
    if (selection.selection.sheetId !== activeSheet.id) return
    const { row, col } = selection.activeCell
    if (
      row < activeSnapshot.window.rowStart ||
      row > activeSnapshot.window.rowEnd ||
      col < activeSnapshot.window.colStart ||
      col > activeSnapshot.window.colEnd
    ) {
      return
    }
    const fact = activeSnapshot.cells.find((c) => c.row === row && c.col === col) ?? null
    seedActiveCellFact({
      sheetId: activeSheet.id,
      cell: { row, col },
      revision: activeSnapshot.revision,
      fact,
    })
  }, [activeSnapshot, primaryProjection, selection, activeSheet.id, seedActiveCellFact])

  return {
    activeSnapshot,
    displayWindow: activeSnapshot?.window ?? paneWindow,
    paneSize,
    metrics,
    sizeOverrides,
    rowHeights,
    colWidths,
    seedActiveCellFact,
  }
}
