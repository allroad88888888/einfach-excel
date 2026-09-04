import { describe, expect, it } from 'vitest'
import { createStore } from '@einfach/core'

import { historyRefreshTargetSheetIdAtom } from '../src/provider/history-refresh-target-atom'

describe('history refresh retry target', () => {
  it('keeps the retry target in the owning workbook Store', () => {
    const firstWorkbookStore = createStore()
    const secondWorkbookStore = createStore()

    firstWorkbookStore.setter(historyRefreshTargetSheetIdAtom, 'first-sheet')

    expect(firstWorkbookStore.getter(historyRefreshTargetSheetIdAtom)).toBe('first-sheet')
    expect(secondWorkbookStore.getter(historyRefreshTargetSheetIdAtom)).toBeNull()

    secondWorkbookStore.setter(historyRefreshTargetSheetIdAtom, 'second-sheet')

    expect(firstWorkbookStore.getter(historyRefreshTargetSheetIdAtom)).toBe('first-sheet')
    expect(secondWorkbookStore.getter(historyRefreshTargetSheetIdAtom)).toBe('second-sheet')
  })
})
