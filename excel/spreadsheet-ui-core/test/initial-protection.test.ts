import { expect, test, vi } from 'vitest'
import { loadWorkbookDefinition } from '../src/runtime/load-workbook-definition'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import type { RustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import type { RustWorkbookConnection } from '../src/rust-workbook'
import type { VisibleProjectionRequest } from '../src/contracts'

const definition: RustWorkbookDefinition = {
  title: 'Protected startup',
  sheets: [{ id: 'input', name: 'Input', rowCount: 20, colCount: 4, protected: true,
    editableRanges: [{ rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 }],
    tables: [{ name: 'InputTable', range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 0 } }] }],
  createImportChunks: () => [[{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Header' }]],
}

function setup() {
  const request = vi.fn(async (command: string, payload: Record<string, unknown>) => {
    if (command === 'workbook.initialize') return [{ id: 'input', name: 'Input', index: 0 }]
    if (command === 'workbook.importCells') return {
      accepted: (payload.cells as unknown[]).length, errors: 0, rejectedFormulas: 0,
    }
    if (command === 'projection.readVisible') return {
      ...payload.request as VisibleProjectionRequest, cells: [], revision: 7,
    }
    if (command === 'protection.change') return {
      changed: true, protection: { mode: 'protected', unlockedRanges: definition.sheets[0].editableRanges },
    }
    throw new Error(`Unexpected command: ${command}`)
  })
  return { request, connection: { request, dispose() {} } as unknown as RustWorkbookConnection }
}

test('initial protection uses native revision after all cells and tables are loaded', async () => {
  const { request, connection } = setup()
  const loaded = await loadWorkbookDefinition(
    connection, snapshotRustWorkbookDefinition(definition), () => true,
  )
  expect(request.mock.calls.map(([command]) => command)).toEqual([
    'workbook.initialize', 'workbook.importCells', 'workbook.importCells',
    'projection.readVisible', 'protection.change',
  ])
  expect(request.mock.calls[4]?.[1]).toMatchObject({
    sheetId: 'input', change: { action: 'protect' }, revision: 7,
    projection: { sheetId: 'input', window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } },
  })
  expect(loaded?.sheets[0]).toMatchObject({ id: 'input', name: 'Input' })
  expect(loaded?.protectionBySheet?.input).toEqual({
    mode: 'protected', unlockedRanges: definition.sheets[0].editableRanges,
  })
})

test('default open sheets never issue a protection mutation', async () => {
  const { request, connection } = setup()
  await loadWorkbookDefinition(connection, {
    ...definition, sheets: definition.sheets.map((sheet) => ({ ...sheet, protected: false })),
  }, () => true)
  expect(request.mock.calls.map(([command]) => command)).toEqual([
    'workbook.initialize', 'workbook.importCells', 'workbook.importCells',
  ])
})

test('ownership loss during the initial projection prevents a late protection write', async () => {
  const { request, connection } = setup()
  let owned = true
  const read = request.getMockImplementation()!
  request.mockImplementation(async (command, payload) => {
    const reply = await read(command, payload)
    if (command === 'projection.readVisible') owned = false
    return reply
  })
  expect(await loadWorkbookDefinition(connection, definition, () => owned)).toBeNull()
  expect(request.mock.calls.some(([command]) => command === 'protection.change')).toBe(false)
})

test('failed initial protection rejects startup instead of publishing a writable sheet', async () => {
  const { request, connection } = setup()
  const read = request.getMockImplementation()!
  request.mockImplementation((command, payload) => {
    if (command === 'protection.change') throw new Error('Protection rejected')
    return read(command, payload)
  })
  await expect(loadWorkbookDefinition(connection, definition, () => true)).rejects.toThrow('Protection rejected')
})

test('definition snapshots protection and rejects invalid values', () => {
  const source = { ...definition, sheets: [{ ...definition.sheets[0] }] }
  const snapshot = snapshotRustWorkbookDefinition(source)
  source.sheets[0]!.protected = false
  expect(snapshot.sheets[0]?.protected).toBe(true)
  expect(() => snapshotRustWorkbookDefinition({ ...source,
    sheets: [{ ...source.sheets[0]!, protected: 'yes' as unknown as boolean }],
  })).toThrow('Invalid initial worksheet protection.')
})
