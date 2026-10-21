import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { expect, test } from 'vitest'
import { initSync, function_catalog } from '../../../excel-wasm/full/einfach_wasm.js'
import { buildFormulaArguments, formulaArgumentFields, formulaArgumentRepeat } from '../../src/formula-arguments/layout'
import { setupArguments } from './fixtures'
import type { NativeFunctionCatalog } from '../../src'

test('every compiled native signature expands and assembles from the current real metadata', () => {
  initSync({ module: readFileSync(new NodeURL('../../../excel-wasm/full/einfach_wasm_bg.wasm', import.meta.url)) })
  const { catalog } = setupArguments(function_catalog() as NativeFunctionCatalog)
  expect(catalog.length).toBeGreaterThanOrEqual(502)
  for (const spec of catalog) {
    expect(spec.signatureAvailable, spec.name).toBe(true)
    const repeat = formulaArgumentRepeat(spec)
    const count = repeat ? 2 : 0
    const fields = formulaArgumentFields(spec, count, [])
    expect(fields.length, spec.name).toBe(spec.args.length + (repeat?.length ?? 0))
    expect(fields.map((field) => field.arg), spec.name)
      .toEqual(fields.map((field) => spec.args[field.prototypeIndex]))
    const values = fields.map(() => '1')
    const result = buildFormulaArguments(spec, count, values)
    expect(result.error, spec.name).toBe('')
    expect(result.formula, spec.name).toBe(`=${spec.name}(${values.join(',')})`)
    if (repeat) expect(fields.filter((field) => field.groupIndex === null &&
      field.prototypeIndex >= repeat.start).map((field) => field.prototypeIndex), spec.name)
      .toEqual(spec.args.map((_, index) => index).slice(repeat.start + repeat.length))
  }
})

test('raw expressions preserve nested commas, escaped quotes, arrays and cross-sheet references', () => {
  const { catalog } = setupArguments()
  const sum = catalog.find((spec) => spec.name === 'SUM')!
  const values = ['SUM(1,2)', 'IF(TRUE,"a,""b",0)', '{1,2;3,4}', "'Sales, Q1'!A1:A3"]
  expect(buildFormulaArguments(sum, 4, values).formula)
    .toBe('=SUM(SUM(1,2),IF(TRUE,"a,""b",0),{1,2;3,4},\'Sales, Q1\'!A1:A3)')
})

test('optional holes stay positional while unused trailing slots disappear', () => {
  const { catalog } = setupArguments()
  const xlookup = catalog.find((spec) => spec.name === 'XLOOKUP')!
  expect(buildFormulaArguments(xlookup, 0, ['2', '{1,2}', '{10,20}', '', '0', '']).formula)
    .toBe('=XLOOKUP(2,{1,2},{10,20},,0)')
  const lambda = catalog.find((spec) => spec.name === 'LAMBDA')!
  expect(buildFormulaArguments(lambda, 1, ['', 'SUM(1,2)']).formula).toBe('=LAMBDA(SUM(1,2))')
})

test('required fixed and repeated slots fail before handing a formula to editing', () => {
  const { catalog } = setupArguments()
  const spec = catalog.find((entry) => entry.name === 'LET')!
  expect(buildFormulaArguments(spec, 2, ['x', '3', 'y', '', 'x+y']))
    .toMatchObject({ formula: '', errorField: 3, error: expect.stringContaining('repeated group') })
  expect(buildFormulaArguments(spec, 1, ['x', '3', '']))
    .toMatchObject({ formula: '', errorField: 2, error: 'Enter every required argument.' })
})

test('a repeated group can omit its metadata-optional trailing member', () => {
  const spec = { name: 'SORTBY', summary: 'Sort.', repeat: { start: 1, length: 2, minGroups: 1 },
    args: [{ name: 'array' }, { name: 'by_array', repeats: true },
      { name: 'sort_order', repeats: true, optional: true }] }
  expect(buildFormulaArguments(spec, 2, ['A1:A3', 'B1:B3', '', 'C1:C3', '']).formula)
    .toBe('=SORTBY(A1:A3,B1:B3,,C1:C3)')
})
