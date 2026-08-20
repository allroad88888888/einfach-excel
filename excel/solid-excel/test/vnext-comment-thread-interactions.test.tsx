/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  PostCommentRequest,
  RangeProjectionRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import {
  commentSessionAtom,
  openCommentSessionAtom,
  setCommentDraftAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetCommentThread } from '../src-vnext/comments'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(() => {
  cleanup()
  document.querySelectorAll('[data-comment-test-anchor]').forEach((element) => element.remove())
})

function createBackend(postComment?: SpreadsheetBackend['postComment']): SpreadsheetBackend {
  return {
    async readVisibleProjection(request: VisibleProjectionRequest) {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        window: request.window,
        cells: [],
      }
    },
    async readRangeProjection(request: RangeProjectionRequest) {
      return {
        kind: 'range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        range: request.range,
        cells: [],
      }
    },
    async setCellInput(request) {
      return { sheetId: request.sheetId, requestId: request.requestId }
    },
    postComment,
  }
}

function appendAnchor(): HTMLTableCellElement {
  const anchor = document.createElement('td')
  anchor.className = 'spreadsheet-grid-cell'
  anchor.dataset.row = '2'
  anchor.dataset.col = '3'
  anchor.dataset.active = 'true'
  anchor.dataset.commentTestAnchor = 'true'
  anchor.tabIndex = -1
  anchor.getBoundingClientRect = () =>
    ({
      x: 100,
      y: 80,
      top: 80,
      right: 180,
      bottom: 104,
      left: 100,
      width: 80,
      height: 24,
      toJSON: () => undefined,
    }) as DOMRect
  document.body.append(anchor)
  anchor.focus()
  return anchor
}

describe('SpreadsheetCommentThread interactions', () => {
  it('anchors to the target cell, traps focus, closes on Escape, and restores cell focus', async () => {
    const store = createStore()
    const anchor = appendAnchor()
    const view = render(() => (
      <SpreadsheetUiProvider backend={createBackend()} store={store}>
        <SpreadsheetCommentThread />
      </SpreadsheetUiProvider>
    ))

    store.setter(openCommentSessionAtom, {
      sheetId: 'sheet-1',
      cell: { row: 2, col: 3 },
    })

    const dialog = await waitFor(() => view.getByTestId('comment-thread'))
    const textarea = view.getByTestId('comment-thread-textarea')
    await waitFor(() => expect(document.activeElement).toBe(textarea))
    expect(dialog.getAttribute('data-anchor-state')).toBe('cell')
    expect((dialog as HTMLElement).style.left).toBe('188px')

    const last = view.getByTestId('comment-post-button')
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(view.getByTestId('dialog-close-x'))

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(view.queryByTestId('comment-thread')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(anchor))
  })

  it('offers an explicit retry only for a recoverable pre-dispatch failure', async () => {
    const store = createStore()
    const requests: PostCommentRequest[] = []
    const postPort: { current: SpreadsheetBackend['postComment'] } = { current: undefined }
    const backend = createBackend()
    Object.defineProperty(backend, 'postComment', { get: () => postPort.current })
    store.setter(openCommentSessionAtom, {
      sheetId: 'sheet-retry',
      cell: { row: 0, col: 0 },
    })
    store.setter(setCommentDraftAtom, 'Retry me')
    const view = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetCommentThread />
      </SpreadsheetUiProvider>
    ))

    fireEvent.click(view.getByTestId('comment-post-button'))
    const retry = await waitFor(() => view.getByTestId('comment-retry-button'))
    expect(store.getter(commentSessionAtom)).not.toBeNull()

    postPort.current = async (request) => {
      requests.push(request)
      return { sheetId: request.sheetId, requestId: request.requestId }
    }
    fireEvent.click(retry)

    await waitFor(() => expect(requests).toHaveLength(1))
    await waitFor(() => expect(store.getter(commentSessionAtom)).toBeNull())
  })

  it('explains an unknown outcome without exposing retry', async () => {
    const store = createStore()
    const backend = createBackend(async () => {
      throw new Error('connection dropped')
    })
    store.setter(openCommentSessionAtom, {
      sheetId: 'sheet-unknown',
      cell: { row: 1, col: 1 },
    })
    store.setter(setCommentDraftAtom, 'Do not duplicate')
    const view = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetCommentThread />
      </SpreadsheetUiProvider>
    ))

    fireEvent.click(view.getByTestId('comment-post-button'))

    await waitFor(() => expect(view.getByTestId('comment-outcome-unknown-help')).toBeTruthy())
    expect(view.queryByTestId('comment-retry-button')).toBeNull()
    expect((view.getByTestId('comment-post-button') as HTMLButtonElement).disabled).toBe(true)
  })
})
