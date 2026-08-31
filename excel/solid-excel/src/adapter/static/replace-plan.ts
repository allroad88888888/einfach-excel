// 一句话：把一次替换请求编译成逐格写入计划。

import type { ReplaceMatchInput, ReplaceMatchesResponse } from '@einfach/spreadsheet-ui-core'
import { keyFor } from '@einfach/spreadsheet-ui-core'
import type { StaticBackendState } from './state'

interface StaticReplacementCellPlan {
  readonly sheetId: string
  readonly key: string
  readonly row: number
  readonly col: number
  readonly nextInput: string
}

type StaticReplacementPlanResult =
  | {
      readonly status: 'ready'
      readonly cells: readonly StaticReplacementCellPlan[]
      readonly replacedCount: number
    }
  | {
      readonly status: 'invalid'
      readonly message: string
    }

export function replaceMatchesNotApplied(
  requestId: number,
  code: string,
  message: string,
): ReplaceMatchesResponse {
  return {
    kind: 'replace-matches-not-applied',
    applied: false,
    requestId,
    error: { code, message, source: 'validation' },
  }
}

export function invalidReplaceMatchesRequest(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: 'FIND_REPLACE_REQUEST_ID_REQUIRED',
  })
}

export function buildStaticReplacementPlan(
  state: StaticBackendState,
  coords: readonly ReplaceMatchInput[],
  replacement: string,
): StaticReplacementPlanResult {
  const bySheet = new Map<string, Map<string, ReplaceMatchInput[]>>()

  for (const match of coords) {
    if (
      typeof match.sheetId !== 'string' ||
      match.sheetId.length === 0 ||
      !Number.isSafeInteger(match.coord.row) ||
      match.coord.row < 0 ||
      !Number.isSafeInteger(match.coord.col) ||
      match.coord.col < 0 ||
      !Number.isSafeInteger(match.matchStart) ||
      !Number.isSafeInteger(match.matchEnd) ||
      match.matchStart < 0 ||
      match.matchEnd <= match.matchStart ||
      (match.target !== 'displayValue' && match.target !== 'formula')
    ) {
      return { status: 'invalid', message: 'Replace coordinates are malformed' }
    }

    const key = keyFor(match.coord.row, match.coord.col)
    const byKey = bySheet.get(match.sheetId) ?? new Map<string, ReplaceMatchInput[]>()
    const matches = byKey.get(key) ?? []
    matches.push(match)
    byKey.set(key, matches)
    bySheet.set(match.sheetId, byKey)
  }

  const cells: StaticReplacementCellPlan[] = []
  let replacedCount = 0

  for (const [sheetId, byKey] of bySheet) {
    const sheetCells = state.cellsBySheet.get(sheetId)
    if (!sheetCells) {
      return { status: 'invalid', message: `Unknown replacement sheet: ${sheetId}` }
    }

    for (const [key, cellMatches] of byKey) {
      const cell = sheetCells.get(key)
      if (!cell) {
        return { status: 'invalid', message: `Replacement cell does not exist: ${key}` }
      }

      const target = cellMatches[0]?.target
      if (!target || cellMatches.some((match) => match.target !== target)) {
        return { status: 'invalid', message: `Replacement targets disagree: ${key}` }
      }

      const haystack = target === 'formula' ? cell.formula : cell.displayValue
      if (haystack === undefined) {
        return { status: 'invalid', message: `Replacement target does not exist: ${key}` }
      }

      const sorted = cellMatches
        .slice()
        .sort((left, right) => left.matchStart - right.matchStart || left.matchEnd - right.matchEnd)
      let previousEnd = -1
      for (const match of sorted) {
        if (match.matchEnd > haystack.length) {
          return { status: 'invalid', message: `Replacement span is out of bounds: ${key}` }
        }
        if (match.matchStart < previousEnd) {
          return { status: 'invalid', message: `Replacement spans overlap: ${key}` }
        }
        previousEnd = match.matchEnd
      }

      const effective = sorted.filter(
        (match) => haystack.slice(match.matchStart, match.matchEnd) !== replacement,
      )
      if (effective.length === 0) continue

      let nextInput = haystack
      for (const match of effective.slice().reverse()) {
        nextInput =
          nextInput.slice(0, match.matchStart) + replacement + nextInput.slice(match.matchEnd)
      }
      cells.push({
        sheetId,
        key,
        row: cell.row,
        col: cell.col,
        nextInput,
      })
      replacedCount += effective.length
    }
  }

  return { status: 'ready', cells, replacedCount }
}
