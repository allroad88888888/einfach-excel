import { describe, expect, test } from '@jest/globals'
import {
  DEFAULT_PRINT_CONFIG,
  type PrintConfig,
  type ReadPrintConfigRequest,
} from '@einfach/spreadsheet-ui-core'
import { createStaticSpreadsheetBackend } from '../src-vnext/adapter/static/backend'
import { createWorkerWorkbookSpreadsheetBackend } from '../src-vnext/adapter/worker/backend'
import { createWorkerRuntimeTs } from '../src-vnext/adapter/worker-runtime-ts'
import type { WorkerWorkbookClient } from '../src-vnext/adapter/worker-protocol'

type RpcRequest = { id: number; cmd: string; [key: string]: unknown }
type RpcPayload = Omit<RpcRequest, 'id'> & { cmd: string }

function printConfig(): PrintConfig {
  return {
    ...DEFAULT_PRINT_CONFIG,
    orientation: 'landscape',
    scale: { kind: 'fit', pagesWide: 1, pagesTall: 2 },
    manualPageBreaks: [{ axis: 'row', index: 4 }],
    header: { center: 'Quarterly plan' },
  }
}

function makeRpc(runtime = createWorkerRuntimeTs()) {
  let id = 0
  const calls: string[] = []
  const rpc = async (request: RpcPayload) => {
    calls.push(request.cmd)
    const response = await runtime.handle({ id: ++id, ...request } as RpcRequest)
    if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`)
    return response.result
  }
  return { calls, rpc }
}

function tsRuntimeClient(rpc: ReturnType<typeof makeRpc>['rpc']): WorkerWorkbookClient {
  return {
    initWorkbook: (sheets?: Parameters<WorkerWorkbookClient['initWorkbook']>[0]) =>
      rpc({ cmd: 'initWorkbook', sheets }) as ReturnType<WorkerWorkbookClient['initWorkbook']>,
    describeCapabilities: async () => null,
    sheetList: () => rpc({ cmd: 'sheetList' }) as ReturnType<WorkerWorkbookClient['sheetList']>,
    getPrintConfig: (sheet: Parameters<NonNullable<WorkerWorkbookClient['getPrintConfig']>>[0]) =>
      rpc({ cmd: 'getPrintConfig', sheet }) as ReturnType<
        NonNullable<WorkerWorkbookClient['getPrintConfig']>
      >,
    setPrintConfig: (
      sheet: Parameters<NonNullable<WorkerWorkbookClient['setPrintConfig']>>[0],
      config: Parameters<NonNullable<WorkerWorkbookClient['setPrintConfig']>>[1],
    ) =>
      rpc({ cmd: 'setPrintConfig', sheet, config }) as ReturnType<
        NonNullable<WorkerWorkbookClient['setPrintConfig']>
      >,
    onCellsDirty: () => () => {},
  } as unknown as WorkerWorkbookClient
}

describe('print configuration runtime parity', () => {
  test('static runtime returns exact business ACKs and keeps config through sheet lifecycle', async () => {
    const backend = createStaticSpreadsheetBackend({
      sheets: [
        { id: 'sheet-a', name: 'A' },
        { id: 'sheet-b', name: 'B' },
      ],
    })
    const initial: ReadPrintConfigRequest = {
      kind: 'read-print-config',
      sheetId: 'sheet-a',
      requestId: 11,
    }
    expect(await backend.readPrintConfig!(initial)).toMatchObject({
      kind: 'print-config',
      sheetId: 'sheet-a',
      requestId: 11,
      revision: 0,
    })

    const config = printConfig()
    expect(
      await backend.setPrintConfig!({
        kind: 'set-print-config',
        sheetId: 'sheet-a',
        requestId: 12,
        config,
      }),
    ).toEqual({ sheetId: 'sheet-a', requestId: 12, revision: 1 })
    config.header!.center = 'mutated by caller'
    const readBack = await backend.readPrintConfig!({
      kind: 'read-print-config',
      sheetId: 'sheet-a',
      requestId: 13,
    })
    expect(readBack).toMatchObject({
      sheetId: 'sheet-a',
      requestId: 13,
      revision: 1,
      config: { header: { center: 'Quarterly plan' } },
    })

    await backend.reorderSheet!({ kind: 'reorder-sheet', sheetId: 'sheet-a', targetIndex: 1 })
    expect((await backend.readPrintConfig!({ ...initial, requestId: 14 })).config.orientation).toBe(
      'landscape',
    )
    const added = await backend.addSheet!({ kind: 'add-sheet', name: 'C' })
    expect(
      (
        await backend.readPrintConfig!({
          kind: 'read-print-config',
          sheetId: added.sheetId!,
          requestId: 15,
        })
      ).revision,
    ).toBe(0)
  })

  test('TS worker persists engine-owned config, restores it, and maps it across a move', async () => {
    const { rpc } = makeRpc()
    await rpc({ cmd: 'initWorkbook', sheets: ['A', 'B'] })
    const saved = await rpc({ cmd: 'setPrintConfig', sheet: 1, config: printConfig() })
    expect(saved).toMatchObject({ sheet: 1, revision: 1, config: { orientation: 'landscape' } })

    const snapshot = (await rpc({ cmd: 'snapshotPersistenceV1' })) as {
      printConfigs?: Array<{ sheet: number; revision: number; config: PrintConfig }>
    }
    expect(snapshot.printConfigs).toHaveLength(2)
    expect(snapshot.printConfigs?.[1]).toMatchObject({
      revision: 1,
      config: { orientation: 'landscape' },
    })

    await rpc({ cmd: 'moveSheet', from: 1, to: 0 })
    expect(await rpc({ cmd: 'getPrintConfig', sheet: 0 })).toMatchObject({
      sheet: 0,
      revision: 1,
      config: { orientation: 'landscape' },
    })

    const stats = await rpc({ cmd: 'restorePersistenceV1', snapshot })
    expect(stats).toMatchObject({ restored_print_configs: 2 })
    expect(await rpc({ cmd: 'getPrintConfig', sheet: 1 })).toMatchObject({
      sheet: 1,
      revision: 1,
      config: { orientation: 'landscape' },
    })
  })

  test('worker backend translates TS engine receipts into exact port ACK/read-back and does not retry unknown sheets', async () => {
    const { calls, rpc } = makeRpc()
    const backend = createWorkerWorkbookSpreadsheetBackend({
      client: tsRuntimeClient(rpc),
      sheets: [{ id: 'sheet-a', name: 'A' }],
    })
    await backend.ready()

    expect(
      await backend.setPrintConfig!({
        kind: 'set-print-config',
        sheetId: 'sheet-a',
        requestId: 21,
        config: printConfig(),
      }),
    ).toEqual({ sheetId: 'sheet-a', requestId: 21, revision: 1 })
    expect(
      await backend.readPrintConfig!({
        kind: 'read-print-config',
        sheetId: 'sheet-a',
        requestId: 22,
      }),
    ).toMatchObject({ kind: 'print-config', sheetId: 'sheet-a', requestId: 22, revision: 1 })

    const before = calls.length
    await expect(
      backend.readPrintConfig!({ kind: 'read-print-config', sheetId: 'missing', requestId: 23 }),
    ).rejects.toThrow('unknown worker workbook sheet')
    expect(calls).toHaveLength(before)
  })
})
