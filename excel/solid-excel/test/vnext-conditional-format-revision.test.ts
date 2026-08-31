import { describe, expect, test } from '@jest/globals'
import { createStaticSpreadsheetBackend } from '../src/adapter/static/backend'
import { createWorkerRuntimeTs } from '../src/adapter/worker-runtime-ts'

const RANGE = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 }
const RULE = {
  kind: 'cell-value' as const,
  operator: 'gt' as const,
  value: '10',
  format: { bgColor: '#fef3c7' },
}

type RpcRequest = { id: number; cmd: string; [key: string]: unknown }

function createRpc() {
  const runtime = createWorkerRuntimeTs()
  let id = 0
  return {
    call(request: Omit<RpcRequest, 'id'>) {
      return runtime.handle({ id: ++id, ...request } as RpcRequest)
    },
  }
}

describe('conditional-format canonical revisions', () => {
  test('static backend guards each sheet independently and returns the matching ACK', async () => {
    const backend = createStaticSpreadsheetBackend({
      sheets: [
        { id: 'sheet-a', name: 'A' },
        { id: 'sheet-b', name: 'B' },
      ],
    })
    const request = {
      kind: 'set-conditional-format-rule' as const,
      sheetId: 'sheet-a',
      requestId: 41,
      revision: 0,
      scope: { range: RANGE },
      rule: RULE,
    }
    expect(await backend.setConditionalFormatRule!(request)).toEqual({
      sheetId: 'sheet-a',
      requestId: 41,
      revision: 1,
      affectedRange: RANGE,
    })
    await expect(
      backend.setConditionalFormatRule!({ ...request, requestId: 42 }),
    ).rejects.toMatchObject({
      code: 'STALE_CONDITIONAL_FORMAT_REVISION',
    })
    expect(
      await backend.listConditionalFormatRules!({
        kind: 'list-conditional-format-rules',
        sheetId: 'sheet-b',
        requestId: 43,
      }),
    ).toMatchObject({ sheetId: 'sheet-b', requestId: 43, revision: 0, rules: [] })
    const listed = await backend.listConditionalFormatRules!({
      kind: 'list-conditional-format-rules',
      sheetId: 'sheet-a',
      requestId: 44,
    })
    expect(
      await backend.removeConditionalFormatRule!({
        kind: 'remove-conditional-format-rule',
        sheetId: 'sheet-a',
        requestId: 45,
        revision: 1,
        ruleId: listed.rules[0].id,
      }),
    ).toEqual({ sheetId: 'sheet-a', requestId: 45, revision: 2 })
  })

  test('TS engine rejects stale writes and persists the canonical sheet configuration', async () => {
    const rpc = createRpc()
    expect((await rpc.call({ cmd: 'initWorkbook', sheets: ['A', 'B'] })).ok).toBe(true)
    const set = await rpc.call({
      cmd: 'setConditionalFormatRule',
      sheet: 0,
      conditionalFormat: {
        requestId: 51,
        revision: 0,
        scope: { range: RANGE },
        rule: RULE,
      },
    })
    expect(set).toMatchObject({
      ok: true,
      result: { sheet: 0, revision: 1, rules: [{ scope: { range: RANGE } }] },
    })
    const stale = await rpc.call({
      cmd: 'setConditionalFormatRule',
      sheet: 0,
      conditionalFormat: {
        requestId: 52,
        revision: 0,
        scope: { range: RANGE },
        rule: RULE,
      },
    })
    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE_CONDITIONAL_FORMAT_REVISION' } })

    const snapshot = await rpc.call({ cmd: 'snapshotPersistenceV1' })
    expect(snapshot).toMatchObject({
      ok: true,
      result: {
        conditionalFormats: [{ sheet: 0, revision: 1, rules: [{ scope: { range: RANGE } }] }],
      },
    })
    const snapshotValue = (snapshot as { result: Record<string, unknown> }).result
    expect(
      await rpc.call({
        cmd: 'removeConditionalFormatRule',
        sheet: 0,
        conditionalFormat: { requestId: 53, revision: 1, ruleId: 'conditional-format-1' },
      }),
    ).toMatchObject({ ok: true, result: { revision: 2, rules: [] } })
    expect(await rpc.call({ cmd: 'restorePersistenceV1', snapshot: snapshotValue })).toMatchObject({
      ok: true,
      result: { restored_conditional_formats: 1 },
    })
    expect(await rpc.call({ cmd: 'listConditionalFormats', sheet: 0 })).toMatchObject({
      ok: true,
      result: { sheet: 0, revision: 1, rules: [{ scope: { range: RANGE } }] },
    })

    const { conditionalFormats: _conditionalFormats, ...legacySnapshot } = snapshotValue
    expect(await rpc.call({ cmd: 'restorePersistenceV1', snapshot: legacySnapshot })).toMatchObject(
      {
        ok: true,
        result: { restored_conditional_formats: 0 },
      },
    )
    expect(await rpc.call({ cmd: 'listConditionalFormats', sheet: 0 })).toMatchObject({
      ok: true,
      result: { sheet: 0, revision: 0, rules: [] },
    })
  })
})
