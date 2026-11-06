import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import { WasmWorkbook, initSync } from '../../../excel-wasm/lite/einfach_wasm.js'
import { drawingHandlers } from '../../src/rust-workbook/dispatch/drawings'
import { readDrawings } from '../../src/rust-workbook/drawings/command'
import type { RuntimeContext } from '../../src/rust-workbook/dispatch/context'
import type { WasmWorkbook as WasmWorkbookShape } from '../../src/rust-workbook/wasm-types'
import type { SheetDrawing, VisibleProjectionRequest } from '../../src'
import { drawing } from './fixture'

const projection = (sheetId = 's'): VisibleProjectionRequest => ({ kind: 'visible-window',
  sheetId, requestId: 1, window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 } })

function setup() {
  const workbook = new WasmWorkbook()
  const sheets = new Map([['s', { id: 's', index: 0, name: 'Sheet1', rowCount: 100, colCount: 20 }],
    ['gone', { id: 'gone', index: -1, name: 'Gone', rowCount: 1, colCount: 1 }]])
  const context = { sheetsById: sheets, revision: 7,
    projectChange: (changed: boolean, input: { projection: VisibleProjectionRequest }) =>
      ({ changed, projection: input.projection }),
  } as unknown as RuntimeContext
  const current = workbook as unknown as WasmWorkbookShape
  const run = <R>(name: 'drawings.read' | 'drawings.set' | 'drawings.remove' | 'drawings.reorder',
    input: unknown) => (drawingHandlers[name] as unknown as
      (c: RuntimeContext, w: WasmWorkbookShape, i: unknown) => R)(context, current, input)
  const set = (entry: SheetDrawing) => run<{ changed: boolean; drawings: SheetDrawing[] }>(
    'drawings.set', { sheetId: 's', drawing: entry, projection: projection() })
  const ids = () => run<{ drawings: SheetDrawing[] }>('drawings.read', { sheetId: 's' })
    .drawings.map((entry) => entry.id)
  return { workbook, current, context, run, set, ids, sheets }
}

beforeAll(() => {
  initSync({ module: readFileSync(new NodeURL('../../../excel-wasm/lite/einfach_wasm_bg.wasm',
    import.meta.url)) })
})

describe('drawings handlers against the real WASM workbook', () => {
  test('read returns an empty catalog with the current revision', () => {
    const { run } = setup()
    expect(run('drawings.read', { sheetId: 's' })).toEqual({ drawings: [], revision: 7 })
  })

  test('set adds on top, replaces in place and reports whether anything changed', () => {
    const { set, ids, run } = setup()
    expect(set(drawing('a')).changed).toBe(true)
    expect(set(drawing('b')).changed).toBe(true)
    expect(ids()).toEqual(['a', 'b'])
    const moved = drawing('a', { anchor: { ...drawing('a').anchor, col: 8 } })
    const reply = set(moved)
    expect(reply.changed).toBe(true)
    expect(reply.drawings.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(reply.drawings[0]!.anchor.col).toBe(8)
    expect(set(moved).changed).toBe(false)
    expect(run<{ drawings: SheetDrawing[] }>('drawings.read', { sheetId: 's' }).drawings[0])
      .toMatchObject({ id: 'a', kind: 'chart', payload: { title: 'a' } })
  })

  test('reorder moves an object to the front or back', () => {
    const { set, ids, run } = setup()
    for (const id of ['a', 'b', 'c']) set(drawing(id))
    const reorder = (id: string, toFront: boolean) => run<{ changed: boolean }>('drawings.reorder',
      { sheetId: 's', id, toFront, projection: projection() })
    expect(reorder('a', true).changed).toBe(true)
    expect(ids()).toEqual(['b', 'c', 'a'])
    expect(reorder('a', false).changed).toBe(true)
    expect(ids()).toEqual(['a', 'b', 'c'])
    expect(reorder('a', false).changed).toBe(false)
  })

  test('remove deletes by id and reports a missing id as unchanged', () => {
    const { set, ids, run } = setup()
    set(drawing('a'))
    set(drawing('b'))
    const remove = (id: string) => run<{ changed: boolean; drawings: SheetDrawing[] }>(
      'drawings.remove', { sheetId: 's', id, projection: projection() })
    expect(remove('a')).toMatchObject({ changed: true })
    expect(ids()).toEqual(['b'])
    expect(remove('ghost').changed).toBe(false)
  })

  test('Rust validation rejects malformed objects and leaves the catalog alone', () => {
    const { set, ids } = setup()
    set(drawing('a'))
    expect(() => set(drawing('bad id!'))).toThrow()
    expect(() => set(drawing('b', { kind: 'Chart' }))).toThrow()
    expect(() => set(drawing('b', { anchor: { ...drawing('b').anchor, width: 0 } }))).toThrow()
    expect(() => set(drawing('b', { anchor: { ...drawing('b').anchor, width: 10_001 } }))).toThrow()
    expect(() => set(drawing('b', { payload: { text: 'x'.repeat(70_000) } }))).toThrow()
    expect(ids()).toEqual(['a'])
  })

  test('requests for a deleted or unknown sheet and mismatched projections are refused', () => {
    const { run, set, ids } = setup()
    expect(() => run('drawings.read', { sheetId: 'gone' })).toThrow('no longer exists')
    expect(() => run('drawings.read', { sheetId: 'missing' })).toThrow('no longer exists')
    expect(() => run('drawings.set', { sheetId: 's', drawing: drawing('a'),
      projection: projection('other') })).toThrow('Invalid object projection request')
    expect(() => run('drawings.remove', { sheetId: 's', id: 5, projection: projection() }))
      .toThrow('Invalid object id')
    expect(() => run('drawings.reorder', { sheetId: 's', id: 'a', toFront: 'yes',
      projection: projection() })).toThrow('Invalid object order request')
    expect(ids()).toEqual([])
    set(drawing('a'))
    expect(ids()).toEqual(['a'])
  })
})

describe('command helpers without WASM support', () => {
  test('a workbook build without the object API reports it instead of guessing', () => {
    const { sheets } = setup()
    expect(() => readDrawings({} as WasmWorkbookShape, sheets, 's'))
      .toThrow('Rust objects are unavailable.')
  })
})
