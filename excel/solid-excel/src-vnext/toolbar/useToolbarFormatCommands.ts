import {
  dispatchToolbarFormatCommandAtom,
  resolveContentMutationAtom,
  runToolbarMutationAtom,
  type CellRange,
  type RunToolbarMutationInput,
  type SpreadsheetCellFormat,
  type SpreadsheetNumberFormat,
  type ToolbarFormatCommandInput,
  type ToolbarFormatCommandIntent,
} from '@einfach/spreadsheet-ui-core'
import { refreshVisibleProjection } from '../provider'
import { formatForToolbarCommand } from './ToolbarFormatLogic'
import type { ToolbarActionDeps } from './ToolbarActionDeps'

type DecimalCapableKind =
  | 'number'
  | 'decimal'
  | 'percent'
  | 'currency'
  | 'accounting'
  | 'scientific'

function isDecimalCapableFormat(
  format: SpreadsheetNumberFormat | undefined,
): format is SpreadsheetNumberFormat & { kind: DecimalCapableKind; digits?: number } {
  return Boolean(
    format &&
      ['number', 'decimal', 'percent', 'currency', 'accounting', 'scientific'].includes(
        format.kind,
      ),
  )
}

/** Runs non-border toolbar format mutations through the existing Core gateway. */
export function useToolbarFormatCommands(deps: ToolbarActionDeps) {
  function dispatchToolbarMutation(
    input: Omit<RunToolbarMutationInput, 'source' | 'refreshProjection'>,
  ) {
    void deps.store.setter(runToolbarMutationAtom, {
      ...input,
      source: deps.backend,
      refreshProjection: (sheetId) => refreshVisibleProjection(deps.store, deps.backend, sheetId),
    })
  }

  function resolveFormatSourceRanges(sheetId: string, range: CellRange): CellRange[] | null {
    const resolution = deps.store.setter(resolveContentMutationAtom, {
      kind: 'set-format-range',
      sheetId,
      range,
    })
    return resolution.status === 'blocked'
      ? null
      : (resolution.ranges ?? [range]).map((sourceRange) => ({ ...sourceRange }))
  }

  function executeCommand(intent: ToolbarFormatCommandIntent, range: CellRange) {
    const sourceRanges = resolveFormatSourceRanges(intent.sheetId, range)
    if (sourceRanges === null) return
    const format = formatForToolbarCommand(intent, deps.activeCellFormat())
    dispatchToolbarMutation({
      sheetId: intent.sheetId,
      operation: 'format',
      affectedRange: sourceRanges.length === 1 ? sourceRanges[0] : range,
      steps: sourceRanges.map((sourceRange) => ({
        kind: 'set-format-range',
        range: sourceRange,
        format,
      })),
    })
  }

  function dispatchCommand(input: ToolbarFormatCommandInput) {
    const intent = deps.store.setter(dispatchToolbarFormatCommandAtom, input)
    if (intent) executeCommand(intent, deps.selectionSnapshot().range)
  }

  function clearFormat() {
    const sheetId = deps.getMutationSheetId()
    if (!sheetId) return
    const range = deps.selectionSnapshot().range
    const sourceRanges = resolveFormatSourceRanges(sheetId, range)
    if (sourceRanges === null) return
    dispatchToolbarMutation({
      sheetId,
      operation: 'format',
      affectedRange: sourceRanges.length === 1 ? sourceRanges[0] : range,
      steps: sourceRanges.map((sourceRange) => ({
        kind: 'set-format-range',
        range: sourceRange,
        format: {},
      })),
    })
  }

  function currentDecimalDigits(): number {
    const format = deps.activeCellFormat().numberFormat
    return isDecimalCapableFormat(format) ? Math.max(0, format.digits ?? 0) : 0
  }

  function adjustDigits(direction: 'increase' | 'decrease') {
    const sheetId = deps.getMutationSheetId()
    if (!sheetId) return
    const range = deps.selectionSnapshot().range
    const sourceRanges = resolveFormatSourceRanges(sheetId, range)
    if (sourceRanges === null) return
    const current = deps.activeCellFormat()
    const next = decimalAdjustedFormat(current, direction)
    if (!next) return
    dispatchToolbarMutation({
      sheetId,
      operation: 'format',
      affectedRange: sourceRanges.length === 1 ? sourceRanges[0] : range,
      steps: sourceRanges.map((sourceRange) => ({
        kind: 'set-format-range',
        range: sourceRange,
        format: next,
      })),
    })
  }

  return {
    adjustDigits,
    clearFormat,
    currentDecimalDigits,
    dispatchCommand,
    dispatchToolbarMutation,
    resolveFormatSourceRanges,
  }
}

function decimalAdjustedFormat(
  current: SpreadsheetCellFormat,
  direction: 'increase' | 'decrease',
): SpreadsheetCellFormat | null {
  const numberFormat = current.numberFormat
  if (isDecimalCapableFormat(numberFormat)) {
    const digits = numberFormat.digits ?? 0
    const nextDigits = direction === 'increase' ? digits + 1 : Math.max(0, digits - 1)
    return nextDigits === digits
      ? null
      : { ...current, numberFormat: { ...numberFormat, digits: nextDigits } }
  }
  return direction === 'increase'
    ? { ...current, numberFormat: { kind: 'decimal', digits: 1, thousands: false } }
    : null
}
