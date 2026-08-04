// 一句话：把各特性的端口装配成一个完整的 worker SpreadsheetBackend 实例。

import { subscribeCellsDirty } from './content-change'
import { createWorkerBackendState } from './session'
import type {
  WorkerWorkbookSpreadsheetBackend,
  WorkerWorkbookSpreadsheetBackendOptions,
} from './types'
import { createCellInputPorts } from './ports/cell-input'
import { createClipboardPorts } from './ports/clipboard'
import { createConditionalFormatPorts } from './ports/conditional-format'
import { createCustomFormulaPorts } from './ports/custom-formula'
import { createDataEdgePorts } from './ports/data-edge'
import { createFillPorts } from './ports/fill'
import { createFilterSortPorts } from './ports/filter-sort'
import { createFormatPorts } from './ports/format'
import { createHiddenStatePorts } from './ports/hidden-state'
import { createHistoryPorts } from './ports/history'
import { createLifecyclePorts } from './ports/lifecycle'
import { createMergePorts } from './ports/merge'
import { createNamedRangePorts } from './ports/named-range'
import { createProjectionPorts } from './ports/projection'
import { createSheetPorts } from './ports/sheet'
import { createSpillPorts } from './ports/spill'
import { createStructurePorts } from './ports/structure'
import { createTablePorts } from './ports/table'
import { createValidationPorts } from './ports/validation'

export function createWorkerWorkbookSpreadsheetBackend(
  options: WorkerWorkbookSpreadsheetBackendOptions,
): WorkerWorkbookSpreadsheetBackend {
  const state = createWorkerBackendState(options)
  state.offDirty = subscribeCellsDirty(state)

  const groups = [
    createSheetPorts(state),
    createProjectionPorts(state),
    createSpillPorts(state),
    createClipboardPorts(state),
    createCellInputPorts(state),
    createStructurePorts(state),
    createFormatPorts(state),
    createDataEdgePorts(state),
    createHistoryPorts(state),
    createNamedRangePorts(state),
    createValidationPorts(state),
    createConditionalFormatPorts(state),
    createFilterSortPorts(state),
    createHiddenStatePorts(state),
    createMergePorts(state),
    createFillPorts(state),
    createTablePorts(state),
    createCustomFormulaPorts(state),
    createLifecyclePorts(state),
  ]

  // Descriptor copy, NOT a spread / Object.assign: the capability-gated ports
  // are getters that must stay lazy, and both of those would read each getter
  // once here and freeze the answer before `ready()` resolved the runtime
  // handshake. The groups are disjoint, so the result is the same single object
  // with the same own accessor properties the factory used to return.
  const backend = {} as WorkerWorkbookSpreadsheetBackend
  for (const group of groups) {
    Object.defineProperties(backend, Object.getOwnPropertyDescriptors(group))
  }
  return backend
}
