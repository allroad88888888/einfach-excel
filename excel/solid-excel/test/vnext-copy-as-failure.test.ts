/* eslint-disable import/no-extraneous-dependencies -- root Jest supplies these test globals. */
import { describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import type {
  RangeProjectionRequest,
  RangeProjectionResult,
  SpreadsheetBackend,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import {
  copyAsErrorAtom,
  lastCopyAsAtom,
  publishCopyAsResultAtom,
  selectionAtom,
  setSelectionBoundsAtom,
  setWorkspaceActiveSheetAtom,
} from '@einfach/spreadsheet-ui-core'

import { dispatchCopyAs, dispatchCopyAsImage } from '../src-vnext/provider'

function createRejectingProjectionBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection(request): Promise<VisibleProjectionResult> {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        window: request.window,
        requestId: request.requestId,
        revision: request.revision,
        cells: [],
      }
    },
    async readRangeProjection(_request: RangeProjectionRequest): Promise<RangeProjectionResult> {
      throw new Error('projection unavailable')
    },
    async setCellInput(request) {
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision,
        affectedRange: {
          rowStart: request.row,
          rowEnd: request.row,
          colStart: request.col,
          colEnd: request.col,
        },
      }
    },
  }
}

function seedSelection(store: ReturnType<typeof createStore>): void {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
  store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
  store.setter(selectionAtom, {
    kind: 'range',
    sheetId: 'sheet-1',
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  })
}

describe('Copy As projection failures', () => {
  it('turns a text projection rejection into Atom-backed failure feedback', async () => {
    const store = createStore()
    const sentinel = { html: '<table>saved</table>', plainText: 'saved', markdown: '| saved |' }
    store.setter(publishCopyAsResultAtom, sentinel)
    seedSelection(store)

    await expect(dispatchCopyAs(store, createRejectingProjectionBackend())).resolves.toBeUndefined()

    expect(store.getter(lastCopyAsAtom)).toEqual(sentinel)
    expect(store.getter(copyAsErrorAtom)).toEqual({ kind: 'failed' })
  })

  it('turns a host image renderer projection rejection into Atom-backed feedback', async () => {
    const store = createStore()
    const sentinel = { html: '<table>saved</table>', plainText: 'saved', markdown: '| saved |' }
    store.setter(publishCopyAsResultAtom, sentinel)
    seedSelection(store)

    await expect(
      dispatchCopyAsImage(store, createRejectingProjectionBackend()),
    ).resolves.toBeUndefined()

    expect(store.getter(lastCopyAsAtom)).toEqual(sentinel)
    expect(store.getter(copyAsErrorAtom)).toEqual({ kind: 'image-failed' })
  })
})
