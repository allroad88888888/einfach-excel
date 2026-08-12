/** @jsxImportSource solid-js */

import type { createStore } from '@einfach/core'
import type {
  CellRange,
  DisplayCell,
  SpreadsheetBackend,
  VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { beginProjectionAtom, resolveProjectionAtom } from '@einfach/spreadsheet-ui-core'

/** 状态栏 / 诊断读数条各测试文件共用的后端替身与投影驱动器。 */

export function createFakeBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

export function numericCell(row: number, col: number, value: number): DisplayCell {
  return {
    row,
    col,
    displayValue: String(value),
    valueKind: 'number',
    numericValue: value,
  }
}

export function beginVisibleRefresh(
  store: ReturnType<typeof createStore>,
  window: CellRange,
): VisibleProjectionRequest {
  const outcome = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: 'sheet-1',
    reason: 'test',
    window,
    retainResult: true,
  })
  if (outcome.status !== 'started' || outcome.request.kind !== 'visible-window') {
    throw new Error(`projection refresh failed to start: ${outcome.status}`)
  }
  return outcome.request
}

export function resolveVisibleRefresh(
  store: ReturnType<typeof createStore>,
  request: VisibleProjectionRequest,
  cells: readonly DisplayCell[],
): void {
  const outcome = store.setter(resolveProjectionAtom, {
    request,
    result: {
      kind: 'visible-window',
      sheetId: request.sheetId,
      window: request.window,
      requestId: request.requestId,
      cells: [...cells],
      ...(request.revision === undefined ? {} : { revision: request.revision }),
    },
  })
  if (outcome.status !== 'accepted') {
    throw new Error(`projection refresh failed to resolve: ${outcome.reason}`)
  }
}
