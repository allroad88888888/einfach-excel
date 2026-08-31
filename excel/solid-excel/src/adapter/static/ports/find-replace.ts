// 一句话：查找替换端口。

import type { FindReplaceTarget } from '@einfach/spreadsheet-ui-core'
import { normalizeRange } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { updateCell } from '../cell-update'
import { collectLiteralFindSpans, collectRegexFindSpans } from '../find-spans'
import { beginUndoableMutation, recordCellBefore } from '../history-record'
import {
  buildStaticReplacementPlan,
  invalidReplaceMatchesRequest,
  replaceMatchesNotApplied,
} from '../replace-plan'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'

export function createFindReplacePorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'searchRange' | 'replaceMatches'> {
  return {
    async searchRange(request) {
      const range = normalizeRange(request.range)
      const cells = state.cellsBySheet.get(request.sheetId) ?? new Map()
      const { needle, options } = request.query
      const pageStart = Math.max(0, request.pageStart)
      let regexMatcher: RegExp | null = null

      if (needle.length > 0 && options.regex) {
        try {
          const source = options.wholeMatch ? `^(?:${needle})$` : needle
          regexMatcher = new RegExp(source, options.caseSensitive ? 'g' : 'gi')
        } catch {
          return {
            kind: 'search-range',
            sheetId: request.sheetId,
            matches: [],
            pageStart,
            totalCount: 0,
            requestId: request.requestId,
            revision: request.revision ?? state.revision,
          }
        }
      }

      const matches: {
        coord: { row: number; col: number }
        sheetId: string
        matchStart: number
        matchEnd: number
        target: FindReplaceTarget
      }[] = []
      for (const cell of cells.values()) {
        if (cell.row < range.rowStart || cell.row > range.rowEnd) continue
        if (cell.col < range.colStart || cell.col > range.colEnd) continue
        const target: FindReplaceTarget =
          options.searchFormulas && cell.formula !== undefined ? 'formula' : 'displayValue'
        const haystack = target === 'formula' ? cell.formula! : cell.displayValue
        if (needle.length === 0 || haystack.length === 0) continue

        const spans = regexMatcher
          ? collectRegexFindSpans(regexMatcher, haystack)
          : collectLiteralFindSpans(
              haystack,
              needle,
              Boolean(options.caseSensitive),
              Boolean(options.wholeMatch),
            )
        for (const span of spans) {
          matches.push({
            coord: { row: cell.row, col: cell.col },
            sheetId: request.sheetId,
            matchStart: span.start,
            matchEnd: span.end,
            target,
          })
        }
      }
      matches.sort(
        (a, b) =>
          a.coord.row - b.coord.row || a.coord.col - b.coord.col || a.matchStart - b.matchStart,
      )
      const page = matches.slice(pageStart, pageStart + request.pageSize)
      return {
        kind: 'search-range',
        sheetId: request.sheetId,
        matches: page,
        pageStart,
        totalCount: matches.length,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      }
    },
    async replaceMatches(request) {
      if (
        request.requestId === undefined ||
        !Number.isSafeInteger(request.requestId) ||
        request.requestId < 0
      ) {
        throw invalidReplaceMatchesRequest('Replace requires an exact safe request id')
      }

      if (request.revision === undefined) {
        return replaceMatchesNotApplied(
          request.requestId,
          'FIND_REPLACE_REVISION_REQUIRED',
          'Replace requires an exact projection revision',
        )
      }
      if (request.revision !== state.revision) {
        return replaceMatchesNotApplied(
          request.requestId,
          'FIND_REPLACE_REVISION_CONFLICT',
          `Replace revision conflict: expected ${String(request.revision)}, ` +
            `current ${String(state.revision)}`,
        )
      }

      const plan = buildStaticReplacementPlan(state, request.coords, request.replacement)
      if (plan.status === 'invalid') {
        return replaceMatchesNotApplied(
          request.requestId,
          'FIND_REPLACE_REPLACEMENT_PLAN_INVALID',
          plan.message,
        )
      }
      if (plan.replacedCount === 0) {
        return {
          replacedCount: 0,
          requestId: request.requestId,
          revision: state.revision,
        }
      }

      const nextRevision = bumpRevision(state.revision)
      if (Object.is(nextRevision, state.revision)) {
        return replaceMatchesNotApplied(
          request.requestId,
          'FIND_REPLACE_REVISION_UNADVANCEABLE',
          `Replace cannot advance projection revision: ${String(state.revision)}`,
        )
      }

      beginUndoableMutation(state)
      for (const cellPlan of plan.cells) {
        const cells = state.cellsBySheet.get(cellPlan.sheetId)!
        recordCellBefore(state, cellPlan.sheetId, cellPlan.key)
        updateCell(cells, {
          kind: 'set-cell-input',
          sheetId: cellPlan.sheetId,
          row: cellPlan.row,
          col: cellPlan.col,
          input: cellPlan.nextInput,
        })
      }
      state.revision = nextRevision
      return {
        replacedCount: plan.replacedCount,
        requestId: request.requestId,
        revision: state.revision,
      }
    },
  }
}
