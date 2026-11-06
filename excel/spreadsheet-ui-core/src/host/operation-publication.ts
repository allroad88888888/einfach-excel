import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom,
  publishWorkbookSheetStructureAtom,
  workbookDocumentAtom,
} from '../runtime/workbook-document'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { setSelectionBoundsAtom } from '../selection/selection-write-atoms'
import { applyProjectionSizes } from '../projection/projection-sizes'
import { initializeViewportMetricsAtom } from '../viewport/metric-commands'
import { viewportMetricsAtom } from '../viewport/metrics'
import { visibleWindowAtom } from '../viewport/visible-window'
import { projectionSnapshotAtom } from '../projection/state'
import { runVisibleProjectionAtom } from '../projection/run-visible-projection'
import { structureProjectionRequest } from '../rust-workbook/structure-geometry'
import type { NativeWorkbookOperationResult } from './operation-types'

/** Publish native metadata and geometry before reading the current visible frame. */
export const publishWorkbookOperationAtom = atom(
  null,
  async (
    get,
    set,
    result: NativeWorkbookOperationResult & { refresh?: boolean },
  ): Promise<void> => {
    // Keep navigation performed while this Worker request was pending.
    const beforeActive = get(activeWorkbookSheetAtom)?.id
    set(publishWorkbookSheetStructureAtom, result.sheets)
    const sheets = get(workbookDocumentAtom).sheets
    const active =
      sheets.find((sheet) => sheet.id === beforeActive && !sheet.hidden) ??
      sheets.find((sheet) => !sheet.hidden)
    if (!active) throw new Error('Rust returned no visible worksheets.')
    if (active.id !== beforeActive) set(activateWorkbookSheetAtom, active)
    set(setSelectionBoundsAtom, { rowCount: active.rowCount, colCount: active.colCount })
    set(initializeViewportMetricsAtom, {
      ...get(viewportMetricsAtom),
      sheetId: active.id,
      rowCount: active.rowCount,
      colCount: active.colCount,
      rowHeight: active.defaults?.rowHeight ?? 28,
      colWidth: active.defaults?.colWidth ?? 120,
    })
    for (const geometry of result.geometries ?? (result.geometry ? [result.geometry] : [])) {
      const { range, ...sizes } = geometry
      applyProjectionSizes(get, set, {
        kind: 'visible-window',
        requestId: 0,
        revision: result.revision,
        cells: [],
        window: range,
        ...sizes,
        rowHeights: [...sizes.rowHeights],
        colWidths: [...sizes.colWidths],
      })
    }
    const request = get(projectionSnapshotAtom).request
    if ((result.changed || result.refresh) && (request?.sheetId === active.id || result.refresh)) {
      const metrics = get(viewportMetricsAtom)
      const visible = structureProjectionRequest(
        request?.kind === 'visible-window' && request.sheetId === active.id
          ? request
          : {
              kind: 'visible-window',
              sheetId: active.id,
              requestId: 0,
              window: get(visibleWindowAtom),
              viewport: {
                height: metrics.viewportHeight,
                width: metrics.viewportWidth,
                rowHeight: metrics.rowHeight,
                colWidth: metrics.colWidth,
              },
            },
        active,
      )
      const refreshed = await set(runVisibleProjectionAtom, {
        sheetId: active.id,
        window: visible.window,
        viewport: visible.viewport,
        reason: 'viewport',
        retainResult: true,
      })
      if (refreshed.status === 'failed') throw new Error(refreshed.error)
    }
  },
)
publishWorkbookOperationAtom.debugLabel = 'spreadsheet.host.publishOperation'
