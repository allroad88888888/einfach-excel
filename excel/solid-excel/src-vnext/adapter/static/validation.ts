// 一句话：数据校验规则在单元格上的落地与清除。

import type {
  ClearValidationRuleRequest,
  SetValidationRuleRequest,
} from '@einfach/spreadsheet-ui-core'
import {
  keyFor,
  normalizeRange,
  validationMessageForRule,
  validationSeverityForMode,
} from '@einfach/spreadsheet-ui-core'
import { isCellInsideRange, upsertBlankCell } from './cell-map'
import { recordCellBefore } from './history-record'
import type { StaticBackendState } from './state'
import { getOrCreateSheetCells } from './state'

export function applyValidationRule(
  state: StaticBackendState,
  request: SetValidationRuleRequest,
): number {
  const cells = getOrCreateSheetCells(state, request.sheetId)
  const range = normalizeRange(request.range)
  const validation = {
    code: `validation.${request.rule.kind}`,
    severity: validationSeverityForMode(request.mode),
    message: validationMessageForRule(request.rule),
  }
  let changed = 0

  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      // upsertBlankCell mutates the LIVE cell object in place — record
      // the before-clone first (audit D-2).
      recordCellBefore(state, request.sheetId, keyFor(row, col))
      const cell = upsertBlankCell(cells, row, col)
      cell.validation = { ...validation }
      changed += 1
    }
  }

  return changed
}

export function clearValidationRule(
  state: StaticBackendState,
  request: ClearValidationRuleRequest,
): number {
  const cells = getOrCreateSheetCells(state, request.sheetId)
  const range = normalizeRange(request.range)
  let changed = 0

  for (const cell of cells.values()) {
    if (!isCellInsideRange(cell, range) || !cell.validation) continue
    recordCellBefore(state, request.sheetId, keyFor(cell.row, cell.col))
    delete cell.validation
    changed += 1
  }

  return changed
}
