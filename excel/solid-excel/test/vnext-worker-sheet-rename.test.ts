import { describe, expect, test } from '@jest/globals'

import { createWorkerRuntimeTs } from '../src-vnext/adapter/worker-runtime-ts'

type RpcRequest = { id: number; cmd: string; [key: string]: unknown }

function makeRpc() {
  const runtime = createWorkerRuntimeTs()
  let nextId = 1

  return async (request: Omit<RpcRequest, 'id'>) => {
    const response = await runtime.handle({ id: nextId++, ...request } as RpcRequest)
    if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`)
    return response.result
  }
}

async function readCells(rpc: ReturnType<typeof makeRpc>, sheet: number, addrs: string[]) {
  return (await rpc({
    cmd: 'readCells',
    cells: addrs.map((addr) => ({ sheet, addr })),
  })) as Array<{ display: string; formula: string }>
}

describe('TS worker sheet rename', () => {
  test('keeps renamed-sheet data while old-name formulas remain #REF! until renamed back', async () => {
    const rpc = makeRpc()
    await rpc({ cmd: 'initWorkbook', sheets: ['Sheet1', 'Sheet2', 'Sheet3'] })

    await rpc({ cmd: 'setCell', sheet: 0, addr: 'B4', value: { type: 'number', value: 10 } })
    await rpc({ cmd: 'setCell', sheet: 2, addr: 'B4', value: { type: 'number', value: 100 } })
    await rpc({ cmd: 'setFormulaDetailed', sheet: 2, addr: 'C2', formula: '=Sheet1!B4+1' })
    await rpc({ cmd: 'setFormulaDetailed', sheet: 1, addr: 'C2', formula: '=Sheet3!C2+1' })
    await rpc({ cmd: 'setFormulaDetailed', sheet: 1, addr: 'C5', formula: '=Sheet3!B4+5' })

    expect((await readCells(rpc, 2, ['B4', 'C2'])).map((cell) => cell.display)).toEqual([
      '100',
      '11',
    ])
    expect((await readCells(rpc, 1, ['C2', 'C5'])).map((cell) => cell.display)).toEqual([
      '12',
      '105',
    ])

    expect(await rpc({ cmd: 'renameSheet', sheet: 2, name: 'Data' })).toBe(true)
    expect(await rpc({ cmd: 'sheetList' })).toEqual([
      { idx: 0, name: 'Sheet1' },
      { idx: 1, name: 'Sheet2' },
      { idx: 2, name: 'Data' },
    ])

    const [renamedValue, renamedFormula] = await readCells(rpc, 2, ['B4', 'C2'])
    expect(renamedValue.display).toBe('100')
    expect(renamedFormula).toMatchObject({ display: '11', formula: '=Sheet1!B4+1' })

    const [firstBroken, secondBroken] = await readCells(rpc, 1, ['C2', 'C5'])
    expect(firstBroken).toMatchObject({ display: '#REF!', formula: '=Sheet3!C2+1' })
    expect(secondBroken).toMatchObject({ display: '#REF!', formula: '=Sheet3!B4+5' })

    expect(await rpc({ cmd: 'renameSheet', sheet: 2, name: 'Sheet3' })).toBe(true)
    expect((await readCells(rpc, 1, ['C2', 'C5'])).map((cell) => cell.display)).toEqual([
      '12',
      '105',
    ])
    expect((await readCells(rpc, 0, ['B4'])).map((cell) => cell.display)).toEqual(['10'])
  })
})
