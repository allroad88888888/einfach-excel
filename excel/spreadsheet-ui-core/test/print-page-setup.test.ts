import { describe, expect, test } from '@jest/globals'
import { createStore } from '@einfach/core'
import type {
  ReadPrintConfigRequest,
  ReadPrintConfigResult,
  SetPrintConfigRequest,
  PrintConfigSource,
} from '../src'
import {
  DEFAULT_PRINT_CONFIG,
  cancelPageSetupAtom,
  openPageSetupAtom,
  pageSetupCanCancelAtom,
  pageSetupCanRetryRefreshAtom,
  pageSetupSessionAtom,
  printConfigStateAtom,
  retryPageSetupRefreshAtom,
  runPageSetupSaveAtom,
  setPrintConfigAtom,
  updatePageSetupDraftAtom,
  type PrintConfig,
} from '../src'

interface PrintBackendHarness {
  readonly source: PrintConfigSource
  readonly reads: ReadonlyArray<ReadPrintConfigRequest>
  readonly writes: ReadonlyArray<SetPrintConfigRequest>
}

function cloneConfig(config: PrintConfig): PrintConfig {
  return JSON.parse(JSON.stringify(config)) as PrintConfig
}

function createPrintBackend(
  options: {
    readonly afterWrite?: (request: SetPrintConfigRequest) => Promise<void>
    readonly readResult?: (
      request: ReadPrintConfigRequest,
      config: PrintConfig,
    ) => ReadPrintConfigResult
  } = {},
): PrintBackendHarness {
  let persisted = cloneConfig(DEFAULT_PRINT_CONFIG)
  const reads: ReadPrintConfigRequest[] = []
  const writes: SetPrintConfigRequest[] = []
  const source = {
    async readPrintConfig(request: ReadPrintConfigRequest): Promise<ReadPrintConfigResult> {
      reads.push(request)
      return (
        options.readResult?.(request, persisted) ?? {
          kind: 'print-config',
          sheetId: request.sheetId,
          config: cloneConfig(persisted),
          requestId: request.requestId,
          revision: 'read-1',
        }
      )
    },
    async setPrintConfig(request: SetPrintConfigRequest) {
      writes.push(request)
      persisted = cloneConfig(request.config)
      await options.afterWrite?.(request)
      return { sheetId: request.sheetId, requestId: request.requestId, revision: 'write-1' }
    },
  } satisfies PrintConfigSource
  return { source, reads, writes }
}

describe('page setup Atom session', () => {
  test('commits a draft only after exact mutation acknowledgement and exact read-back', async () => {
    const store = createStore()
    const backend = createPrintBackend()
    store.setter(setPrintConfigAtom, {
      sheetId: 'sheet-1',
      config: cloneConfig(DEFAULT_PRINT_CONFIG),
    })
    store.setter(openPageSetupAtom, { sheetId: 'sheet-1' })
    store.setter(updatePageSetupDraftAtom, {
      orientation: 'landscape',
      scale: { kind: 'fit', pagesWide: 2, pagesTall: 1 },
    })

    await expect(store.setter(runPageSetupSaveAtom, { source: backend.source })).resolves.toBe(
      'completed',
    )

    expect(backend.writes).toHaveLength(1)
    expect(backend.reads).toHaveLength(1)
    expect(backend.writes[0]).toMatchObject({ sheetId: 'sheet-1', requestId: 1 })
    expect(backend.reads[0]).toMatchObject({ sheetId: 'sheet-1', requestId: 2 })
    expect(store.getter(printConfigStateAtom)['sheet-1']).toMatchObject({
      orientation: 'landscape',
      scale: { kind: 'fit', pagesWide: 2, pagesTall: 1 },
    })
    expect(store.getter(pageSetupSessionAtom)).toBeNull()
  })

  test('a rejected write is outcome-unknown and retry performs read-only reconciliation', async () => {
    const store = createStore()
    const backend = createPrintBackend({
      afterWrite: async () => {
        throw new Error('connection dropped after dispatch')
      },
    })
    store.setter(openPageSetupAtom, { sheetId: 'sheet-1' })
    store.setter(updatePageSetupDraftAtom, { orientation: 'landscape' })

    await expect(store.setter(runPageSetupSaveAtom, { source: backend.source })).resolves.toBe(
      'outcome-unknown',
    )

    expect(store.getter(pageSetupSessionAtom)?.phase).toBe('outcome-unknown')
    expect(store.getter(pageSetupCanCancelAtom)).toBe(false)
    expect(store.getter(pageSetupCanRetryRefreshAtom)).toBe(true)
    await expect(store.setter(retryPageSetupRefreshAtom, { source: backend.source })).resolves.toBe(
      'completed',
    )
    expect(backend.writes).toHaveLength(1)
    expect(backend.reads).toHaveLength(1)
    expect(store.getter(printConfigStateAtom)['sheet-1'].orientation).toBe('landscape')
  })

  test('a malformed read receipt is refresh-failed until a later refresh proves the saved state', async () => {
    let firstRead = true
    const store = createStore()
    const backend = createPrintBackend({
      readResult: (request, config) => {
        if (firstRead) {
          firstRead = false
          return {
            kind: 'print-config',
            sheetId: request.sheetId,
            config,
            revision: 'wrong-request',
          }
        }
        return {
          kind: 'print-config',
          sheetId: request.sheetId,
          config,
          requestId: request.requestId,
          revision: 'read-2',
        }
      },
    })
    store.setter(openPageSetupAtom, { sheetId: 'sheet-1' })

    await expect(store.setter(runPageSetupSaveAtom, { source: backend.source })).resolves.toBe(
      'refresh-failed',
    )
    expect(store.getter(pageSetupSessionAtom)?.phase).toBe('refresh-failed')
    await expect(store.setter(retryPageSetupRefreshAtom, { source: backend.source })).resolves.toBe(
      'completed',
    )
    expect(backend.writes).toHaveLength(1)
    expect(backend.reads).toHaveLength(2)
  })

  test('a missing print port blocks before dispatch and permits cancel', async () => {
    const store = createStore()
    store.setter(openPageSetupAtom, { sheetId: 'sheet-1' })

    await expect(
      store.setter(runPageSetupSaveAtom, { source: {} }),
    ).resolves.toBe('blocked')

    expect(store.getter(pageSetupSessionAtom)?.phase).toBe('blocked')
    expect(store.getter(pageSetupCanCancelAtom)).toBe(true)
    expect(store.setter(cancelPageSetupAtom)).toBe(true)
  })
})
