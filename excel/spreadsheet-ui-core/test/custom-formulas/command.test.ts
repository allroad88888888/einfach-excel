import { expect, test } from 'vitest'
import { setRustWorkbookConnectionAtom } from '../../src'
import { customFormulaFunctionSpecsAtom, nativeCustomFormulaDefinitionsAtom } from '../../src/custom-formulas/expression-catalog'
import { DOUBLE, setup } from './fixture'

test('read native directory, save draft and publish only returned definitions and projection', async () => {
  const f = setup()
  await f.run('open')
  expect(f.panel()).toMatchObject({ open: true, loaded: true, definitions: [] })
  await f.run({ draft: { name: 'double', parameters: 'amount', expression: '=amount*2' } })
  expect(f.store.getter(nativeCustomFormulaDefinitionsAtom)).toEqual([])
  expect(await f.run('save')).toBe(true)
  expect(f.request.mock.calls[1]).toMatchObject(['customFormula.change', {
    revision: 1, action: { kind: 'upsert', definition: { name: 'double', parameters: ['amount'], expression: '=amount*2' } },
  }])
  expect(f.panel().open).toBe(false)
  expect(f.store.getter(customFormulaFunctionSpecsAtom)).toEqual([{
    name: 'DOUBLE', args: [{ name: 'AMOUNT' }], category: 'Custom', signatureAvailable: true, summary: '=amount*2',
  }])
})

test('select native definition, replace parameters or remove despite invalid draft', async () => {
  const f = setup([DOUBLE])
  await f.run('open'); await f.run({ select: 'DOUBLE' })
  expect(f.panel()).toMatchObject({ selected: 'DOUBLE', parameters: 'AMOUNT', expression: '=amount*2' })
  await f.run({ draft: { expression: '' } }); await f.run('remove')
  expect(f.request.mock.calls[1]).toMatchObject(['customFormula.change', { action: { kind: 'remove', name: 'DOUBLE' } }])
  expect(f.store.getter(nativeCustomFormulaDefinitionsAtom)).toEqual([])
})

test('cancel read suppresses late reply; saving blocks duplicate and close', async () => {
  const f = setup()
  let finish!: (reply: unknown) => void
  f.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const opening = f.run('open'); await Promise.resolve()
  expect(f.panel()).toMatchObject({ phase: 'reading', busy: true })
  await f.run('close'); finish({ definitions: [DOUBLE], revision: 1 }); await opening
  expect(f.panel().open).toBe(false)
  expect(f.store.getter(nativeCustomFormulaDefinitionsAtom)).toEqual([])
  await f.run('open'); await f.run({ draft: { name: 'DOUBLE', expression: '=1' } })
  f.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const saving = f.run('save'); await Promise.resolve()
  expect(f.panel().phase).toBe('saving')
  expect(await f.run('close')).toBe(false); expect(await f.run('save')).toBe(false)
  const payload = f.request.mock.calls[2][1] as { projection: object }
  finish({
    changed: true,
    definitions: [DOUBLE],
    projection: { ...payload.projection, cells: [], revision: 2 },
  })
  expect(await saving).toBe(true)
})

test('native rejection retains draft; stale and malformed replies never install definitions', async () => {
  const f = setup()
  await f.run('open'); await f.run({ draft: { name: 'DOUBLE', expression: '=1' } })
  f.request.mockRejectedValueOnce(new Error('Protected workbook.'))
  expect(await f.run('save')).toBe(false)
  expect(f.panel()).toMatchObject({ open: true, name: 'DOUBLE', expression: '=1', error: 'Protected workbook.', phase: null })
  f.project(2)
  expect(await f.run('save')).toBe(false)
  expect(f.request).toHaveBeenCalledTimes(2)
  await f.run('close')
  f.request.mockResolvedValueOnce({ definitions: [DOUBLE, DOUBLE], revision: 2 })
  expect(await f.run('open')).toBe(false)
  expect(f.store.getter(nativeCustomFormulaDefinitionsAtom)).toEqual([])
  f.store.setter(setRustWorkbookConnectionAtom, null)
  expect(f.panel().open).toBe(false)
})
