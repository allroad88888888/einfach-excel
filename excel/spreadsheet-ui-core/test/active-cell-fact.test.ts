import { createStore, type Store } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  activeCellFactAtom,
  activeCellFormatAtom,
  activeCellInputTextAtom,
  beginProjectionAtom,
  resetProjectionAtom,
  resolveProjectionAtom,
  selectCellAtom,
  type DisplayCell,
} from '../src'

/** 读取一个可见窗口并以给定修订版落定；保留旧结果，与滚动读取相同。 */
function read(store: Store, rowStart: number, revision: number, cells: DisplayCell[] = []) {
  const outcome = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: 'sheet-1',
    window: { rowStart, rowEnd: rowStart + 2, colStart: 0, colEnd: 2 },
    reason: 'test',
    retainResult: true,
  })
  if (outcome.status !== 'started' || outcome.request.kind !== 'visible-window') {
    throw new Error(`Expected a visible projection request, received ${outcome.status}.`)
  }
  const { request } = outcome
  store.setter(resolveProjectionAtom, {
    request,
    result: {
      kind: 'visible-window', sheetId: 'sheet-1', window: request.window,
      requestId: request.requestId, revision, cells,
    },
  })
}

function scrolledAwayFrom(cell: DisplayCell): Store {
  const store = createStore()
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: cell.row, col: cell.col } })
  read(store, 0, 3, [cell])
  read(store, 100, 3)
  return store
}

const ACTIVE: DisplayCell = {
  row: 1, col: 1, displayValue: '4', formula: '=A1*2', inputText: '=A1*2', format: { bold: true },
}

describe('active cell facts outside the visible window', () => {
  test('a same-revision scroll keeps the formula bar and format of the active cell', () => {
    // 回归：活动格滚出可见区后公式栏清空并禁用、单格命令变灰，滚回来又恢复，看起来在闪。
    const store = scrolledAwayFrom(ACTIVE)
    expect(store.getter(activeCellInputTextAtom)).toBe('=A1*2')
    expect(store.getter(activeCellFormatAtom)).toEqual({ bold: true })
    read(store, 200, 3)
    expect(store.getter(activeCellInputTextAtom)).toBe('=A1*2')
  })

  test('an empty active cell stays known as empty', () => {
    const store = createStore()
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 1 } })
    read(store, 0, 3)
    read(store, 100, 3)
    expect(store.getter(activeCellFactAtom)).toBeNull()
    expect(store.getter(activeCellInputTextAtom)).toBe('')
  })

  test('a newer revision drops the retained facts instead of showing stale content', () => {
    const store = scrolledAwayFrom(ACTIVE)
    read(store, 100, 4)
    expect(store.getter(activeCellFactAtom)).toBeUndefined()
    expect(store.getter(activeCellInputTextAtom)).toBeUndefined()
  })

  test('another active cell does not reuse the retained facts', () => {
    const store = scrolledAwayFrom(ACTIVE)
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 50, col: 1 } })
    expect(store.getter(activeCellFactAtom)).toBeUndefined()
  })

  test('a reset forgets the retained facts even when the next revision matches', () => {
    const store = scrolledAwayFrom(ACTIVE)
    store.setter(resetProjectionAtom)
    read(store, 100, 3)
    expect(store.getter(activeCellFactAtom)).toBeUndefined()
  })
})
