// 一句话：把各特性的端口组装成一个完整的静态 SpreadsheetBackend 实例。

import type { StaticSpreadsheetSeedInput } from '../types'
import type { StaticSpreadsheetBackend } from './backend-contract'
import { normalizeSeed } from './seed'
import { createCellInputPorts } from './ports/cell-input'
import { createClipboardPorts } from './ports/clipboard'
import { createConditionalFormatPorts } from './ports/conditional-format'
import { createDataEdgePorts } from './ports/data-edge'
import { createFillPorts } from './ports/fill'
import { createFilterSortPorts } from './ports/filter-sort'
import { createFindReplacePorts } from './ports/find-replace'
import { createFormatPorts } from './ports/format'
import { createFreezePorts } from './ports/freeze'
import { createHiddenStatePorts } from './ports/hidden-state'
import { createHistoryPorts } from './ports/history'
import { createMergePorts } from './ports/merge'
import { createNamedRangePorts } from './ports/named-range'
import { createProjectionPorts } from './ports/projection'
import { createRemoveRowsPorts } from './ports/remove-rows'
import { createSheetPorts } from './ports/sheet'
import { createStructurePorts } from './ports/structure'
import { createTablePorts } from './ports/table'
import { createTableTotalsPorts } from './ports/table-totals'
import { createValidationPorts } from './ports/validation'

/**
 * The port groups are disjoint (each owns a distinct set of `SpreadsheetBackend`
 * members), so a plain spread reproduces the single object literal this used to
 * be — no accessor is involved on this backend, unlike the worker adapter's
 * capability-gated getters.
 */
export function createStaticSpreadsheetBackend(
  seed: StaticSpreadsheetSeedInput = [],
): StaticSpreadsheetBackend {
  const state = normalizeSeed(seed)

  return {
    ...createSheetPorts(state),
    ...createProjectionPorts(state),
    ...createFreezePorts(state),
    ...createCellInputPorts(state),
    ...createStructurePorts(state),
    ...createHiddenStatePorts(state),
    ...createFormatPorts(state),
    ...createClipboardPorts(state),
    ...createRemoveRowsPorts(state),
    ...createNamedRangePorts(state),
    ...createValidationPorts(state),
    ...createConditionalFormatPorts(state),
    ...createFilterSortPorts(state),
    ...createMergePorts(state),
    ...createFindReplacePorts(state),
    ...createFillPorts(state),
    ...createDataEdgePorts(state),
    ...createHistoryPorts(state),
    ...createTablePorts(state),
    ...createTableTotalsPorts(state),
  }
}
