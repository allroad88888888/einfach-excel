import { describe, expect, it, vi } from 'vitest'
import type { HistoryEntry, SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'

import { createSpreadsheetBackendHandle } from '../src/provider/backend-handle'
import { createHistoryEntryRecorder } from '../src/provider/history-entry-recorder'

type HistoryCapability = 'full' | 'undo-only' | 'redo-only' | 'none'

function createBackend(capability: HistoryCapability): SpreadsheetBackend {
  const backend: SpreadsheetBackend = {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
  if (capability === 'full' || capability === 'undo-only') {
    backend.undoTransaction = async (request) => ({ transactionId: request.transactionId })
  }
  if (capability === 'full' || capability === 'redo-only') {
    backend.redoTransaction = async (request) => ({ transactionId: request.transactionId })
  }
  return backend
}

function entry(): HistoryEntry {
  return {
    transactionId: 'tx-1',
    kind: 'range.fill',
    sheetId: 'sheet-1',
    projectionRevision: 1,
  }
}

describe('history entry recorder', () => {
  it('appends an acknowledged entry only when the current backend supports undo and redo', () => {
    const recorder = createHistoryEntryRecorder(createBackend('full'))
    const append = vi.fn(() => true)

    expect(recorder(entry(), append)).toBe('recorded')
    expect(append).toHaveBeenCalledWith(entry())
  })

  it.each<HistoryCapability>(['undo-only', 'redo-only', 'none'])(
    'skips the Core append callback when the current backend is %s',
    (capability) => {
      const recorder = createHistoryEntryRecorder(createBackend(capability))
      const append = vi.fn(() => true)

      expect(recorder(entry(), append)).toBe('unavailable')
      expect(append).not.toHaveBeenCalled()
    },
  )

  it('reports rejected when the Core append callback rejects or throws', () => {
    const recorder = createHistoryEntryRecorder(createBackend('full'))
    const append = vi.fn(() => false)

    expect(recorder(entry(), append)).toBe('rejected')
    expect(append).toHaveBeenCalledTimes(1)
    expect(
      recorder(entry(), () => {
        throw new Error('append failed')
      }),
    ).toBe('rejected')
  })

  it('checks the forwarding backend after the mutation acknowledgement', async () => {
    const handle = createSpreadsheetBackendHandle(createBackend('full'))
    const recorder = createHistoryEntryRecorder(handle.backend)
    const append = vi.fn(() => true)

    await Promise.resolve()
    handle.replace(createBackend('none'))

    expect(recorder(entry(), append)).toBe('unavailable')
    expect(append).not.toHaveBeenCalled()

    handle.replace(createBackend('full'))

    expect(recorder(entry(), append)).toBe('recorded')
    expect(append).toHaveBeenCalledTimes(1)
  })
})
