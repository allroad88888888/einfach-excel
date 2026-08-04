import type {
  SpreadsheetBorderSide,
  SpreadsheetBorderSpec,
  SpreadsheetCellFormat,
} from '../backend'
import type { CellRange } from '../shared'
import {
  CONDITIONAL_FORMAT_MUTATION_LEDGER_MAX,
  BORDER_SIDES,
  INITIAL_EDITOR_STATE,
} from './constants'
import type {
  ConditionalFormatEditorState,
  ConditionalFormatOperationAttempt,
  ConditionalFormatOperationAttemptStatus,
  ConditionalFormatRule,
  ConditionalFormatRuleEntry,
  ConditionalFormatRuleKind,
  ConditionalFormatRulesState,
  ConditionalFormatScope,
} from './types'

export function copyRange(range: Readonly<CellRange>): CellRange {
  return { rowStart: range.rowStart, rowEnd: range.rowEnd, colStart: range.colStart, colEnd: range.colEnd }
}

export function copyScope(scope: ConditionalFormatScope): ConditionalFormatScope {
  return { range: copyRange(scope.range) }
}

export function copyFormat(format: SpreadsheetCellFormat): SpreadsheetCellFormat {
  const result: SpreadsheetCellFormat = { ...format }
  if (format.numberFormat !== undefined) result.numberFormat = { ...format.numberFormat }
  if (format.borders !== undefined) {
    const borders: Partial<Record<SpreadsheetBorderSide, SpreadsheetBorderSpec>> = {}
    for (const side of BORDER_SIDES) {
      const spec = format.borders[side]
      if (spec !== undefined) borders[side] = { ...spec }
    }
    result.borders = borders
  }
  return result
}

export function copyRule(rule: ConditionalFormatRule): ConditionalFormatRule {
  switch (rule.kind) {
    case 'cell-value': case 'formula': case 'top-bottom': return { ...rule, format: copyFormat(rule.format) }
    case 'data-bar': case 'color-scale': return { ...rule }
  }
}

export function freezeRange(range: Readonly<CellRange>): CellRange {
  return Object.freeze(copyRange(range))
}

export function freezeScope(scope: ConditionalFormatScope): ConditionalFormatScope {
  return Object.freeze({ range: freezeRange(scope.range) })
}

export function freezeFormat(format: SpreadsheetCellFormat): SpreadsheetCellFormat {
  const result = copyFormat(format)
  if (result.numberFormat !== undefined) result.numberFormat = Object.freeze(result.numberFormat)
  if (result.borders !== undefined) {
    for (const side of BORDER_SIDES) {
      const spec = result.borders[side]
      if (spec !== undefined) result.borders[side] = Object.freeze(spec)
    }
    result.borders = Object.freeze(result.borders)
  }
  return Object.freeze(result)
}

export function freezeRule(rule: ConditionalFormatRule): ConditionalFormatRule {
  const result = copyRule(rule)
  if (result.kind === 'cell-value' || result.kind === 'formula' || result.kind === 'top-bottom') result.format = freezeFormat(result.format)
  return Object.freeze(result)
}

export function freezeEntry(entry: ConditionalFormatRuleEntry): ConditionalFormatRuleEntry {
  return Object.freeze({ id: entry.id, priority: entry.priority, scope: freezeScope(entry.scope), rule: freezeRule(entry.rule) })
}

export function freezeRulesState(state: ConditionalFormatRulesState): ConditionalFormatRulesState {
  return Object.freeze({ sheetId: state.sheetId, rules: Object.freeze(state.rules.map(freezeEntry)), ...(state.revision === undefined ? {} : { revision: state.revision }) })
}

export function freezeEditorState(state: ConditionalFormatEditorState): ConditionalFormatEditorState {
  return Object.freeze({ ...state, draft: state.draft === null ? null : freezeEntry(state.draft) })
}

export function freezeAttempt(attempt: ConditionalFormatOperationAttempt): ConditionalFormatOperationAttempt {
  return Object.freeze({ ...attempt, scope: attempt.scope === null ? null : freezeScope(attempt.scope) })
}

export function freezeLedger(ledger: readonly ConditionalFormatOperationAttempt[]): readonly ConditionalFormatOperationAttempt[] {
  return Object.freeze(ledger.map(freezeAttempt))
}

export function defaultRuleForKind(kind: ConditionalFormatRuleKind): ConditionalFormatRule {
  switch (kind) {
    case 'cell-value': return { kind, operator: 'gt', value: '0', format: { bgColor: '#fef3c7' } }
    case 'formula': return { kind, formula: '=TRUE()', format: { bgColor: '#fef3c7' } }
    case 'data-bar': return { kind }
    case 'color-scale': return { kind, minColor: '#ff0000', maxColor: '#00ff00' }
    case 'top-bottom': return { kind, direction: 'top', count: 10, format: { bgColor: '#fef3c7' } }
  }
}

export function sameScope(left: ConditionalFormatScope, right: ConditionalFormatScope): boolean {
  return left.range.rowStart === right.range.rowStart && left.range.rowEnd === right.range.rowEnd && left.range.colStart === right.range.colStart && left.range.colEnd === right.range.colEnd
}

function nextSafeMonotonicIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

export function nextConditionalFormatRequestId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}

export function nextConditionalFormatSessionId(sessionId: number): number | null {
  return nextSafeMonotonicIdentity(sessionId)
}

export function closeEditorState(previous: ConditionalFormatEditorState): ConditionalFormatEditorState {
  const sessionId = nextConditionalFormatSessionId(previous.sessionId)
  return sessionId === null ? { ...INITIAL_EDITOR_STATE, sessionId: previous.sessionId, error: 'Conditional formatting session identity space is exhausted' } : { ...INITIAL_EDITOR_STATE, sessionId }
}

export function reserveAttemptSlot(ledger: readonly ConditionalFormatOperationAttempt[]): ConditionalFormatOperationAttempt[] | null {
  const next = [...ledger]
  while (next.length >= CONDITIONAL_FORMAT_MUTATION_LEDGER_MAX) {
    const acknowledgedIndex = next.findIndex((attempt) => attempt.status === 'acknowledged')
    if (acknowledgedIndex < 0) return null
    next.splice(acknowledgedIndex, 1)
  }
  return next
}

export function settleAttempt(
  ledger: readonly ConditionalFormatOperationAttempt[],
  operationId: string,
  status: ConditionalFormatOperationAttemptStatus,
  detail: { readonly error?: string; readonly resultRevision?: string | number },
): readonly ConditionalFormatOperationAttempt[] {
  return ledger.map((attempt) => attempt.operationId !== operationId || attempt.status !== 'pending' ? attempt : { ...attempt, status, ...(detail.error === undefined ? {} : { error: detail.error }), ...(detail.resultRevision === undefined ? {} : { resultRevision: detail.resultRevision }) })
}
