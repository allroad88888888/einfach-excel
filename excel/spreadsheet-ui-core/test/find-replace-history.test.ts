import { describe, expect, jest, test } from '@jest/globals'
import { createStore } from '@einfach/core'
import {
  historyStackAtom,
  selectionAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
  setWorkspaceActiveSheetAtom,
} from '../src'
import {
  openFindReplaceAtom,
  runFindReplaceMutationAtom,
  runFindReplaceSearchAtom,
  updateFindReplaceFormAtom,
} from '../src/find-replace'
import type {
  FindMatch,
  HistoryEntry,
  HistoryEntryRecorder,
  ReplaceMatchesRequest,
  ReplaceMatchesResponse,
  SearchRangeRequest,
  SearchRangeResult,
} from '../src'
import { findReplaceErrorAtom, findReplaceRefreshRecoveryAtom } from '../src/find-replace'

function match(row: number, col: number): FindMatch {
  return {
    coord: { row, col },
    sheetId: 'sheet1',
    matchStart: 0,
    matchEnd: 3,
    target: 'displayValue',
  }
}

function searchResult(
  request: SearchRangeRequest,
  matches: readonly FindMatch[],
  revision: number | string = request.revision ?? 1,
): SearchRangeResult {
  return {
    kind: 'search-range',
    sheetId: request.sheetId,
    requestId: request.requestId,
    pageStart: request.pageStart,
    matches: [...matches],
    totalCount: matches.length,
    revision,
  }
}

function acknowledgement(request: ReplaceMatchesRequest): ReplaceMatchesResponse {
  return {
    requestId: request.requestId,
    replacedCount: request.coords.length,
    revision: 2,
  }
}

async function setupStore(matches: readonly FindMatch[]) {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 1000, colCount: 100 })
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet1' })
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId: 'sheet1',
    anchor: { row: 1, col: 3 },
    focus: { row: 1, col: 3 },
  })
  store.setter(openFindReplaceAtom)
  store.setter(updateFindReplaceFormAtom, {
    needle: '240',
    replacement: '888',
    scope: 'sheet',
  })
  await store.setter(runFindReplaceSearchAtom, {
    searchRange: async (request) => searchResult(request, matches),
  })
  expect(store.getter(selectionAtom)).toMatchObject({ sheetId: 'sheet1' })
  return store
}

function replaceInput(
  historyEntryRecorder: HistoryEntryRecorder,
  searchRange: (request: SearchRangeRequest) => Promise<SearchRangeResult>,
  replaceMatches: (request: ReplaceMatchesRequest) => Promise<ReplaceMatchesResponse>,
) {
  return {
    action: 'replace-all' as const,
    historyEntryRecorder,
    searchRange,
    replaceMatches,
  }
}

describe('find/replace history recording', () => {
  test('records an acknowledged replace-all as one cell-input history entry', async () => {
    const store = await setupStore([match(1, 3), match(2, 3)])
    const recorded: HistoryEntry[] = []
    const historyEntryRecorder: HistoryEntryRecorder = (entry, append) => {
      recorded.push(entry)
      return append(entry) ? 'recorded' : 'rejected'
    }
    const refreshSearch = jest.fn(async (request: SearchRangeRequest) => searchResult(request, []))
    const replaceMatches = jest.fn(async (request: ReplaceMatchesRequest) =>
      acknowledgement(request),
    )

    await store.setter(
      runFindReplaceMutationAtom,
      replaceInput(historyEntryRecorder, refreshSearch, replaceMatches),
    )

    expect(replaceMatches).toHaveBeenCalledTimes(1)
    expect(refreshSearch).toHaveBeenCalledTimes(1)
    expect(recorded).toEqual([
      expect.objectContaining({
        kind: 'cell.set-input',
        sheetId: 'sheet1',
        projectionRevision: 2,
        affectedRange: { rowStart: 1, rowEnd: 2, colStart: 3, colEnd: 3 },
      }),
    ])
    expect(store.getter(historyStackAtom)).toMatchObject({
      cursor: 1,
      entries: [expect.objectContaining({ kind: 'cell.set-input' })],
    })
  })

  test('an unavailable recorder completes without creating an undo entry', async () => {
    const store = await setupStore([match(1, 3), match(2, 3)])
    const refreshSearch = jest.fn(async (request: SearchRangeRequest) => searchResult(request, []))
    const replaceMatches = jest.fn(async (request: ReplaceMatchesRequest) =>
      acknowledgement(request),
    )

    await store.setter(
      runFindReplaceMutationAtom,
      replaceInput(() => 'unavailable', refreshSearch, replaceMatches),
    )

    expect(replaceMatches).toHaveBeenCalledTimes(1)
    expect(refreshSearch).toHaveBeenCalledTimes(1)
    expect(store.getter(historyStackAtom)).toMatchObject({ cursor: 0, entries: [] })
  })

  test.each(['rejected', 'throw'] as const)(
    'a %s history recorder makes the acknowledged mutation outcome-unknown without refresh or resend',
    async (outcome) => {
      const store = await setupStore([match(1, 3), match(2, 3)])
      const refreshSearch = jest.fn(async (request: SearchRangeRequest) =>
        searchResult(request, []),
      )
      const replaceMatches = jest.fn(async (request: ReplaceMatchesRequest) =>
        acknowledgement(request),
      )
      const historyEntryRecorder: HistoryEntryRecorder = () => {
        if (outcome === 'throw') throw new Error('history lane failed')
        return 'rejected'
      }
      const input = replaceInput(historyEntryRecorder, refreshSearch, replaceMatches)

      await store.setter(runFindReplaceMutationAtom, input)
      await store.setter(runFindReplaceMutationAtom, input)

      expect(replaceMatches).toHaveBeenCalledTimes(1)
      expect(refreshSearch).not.toHaveBeenCalled()
      expect(store.getter(historyStackAtom)).toMatchObject({ cursor: 0, entries: [] })
      expect(store.getter(findReplaceErrorAtom)?.code).toBe('FIND_REPLACE_OUTCOME_UNKNOWN')
      expect(store.getter(findReplaceRefreshRecoveryAtom)).toMatchObject({
        status: 'required',
        phase: 'search',
      })
    },
  )
})
