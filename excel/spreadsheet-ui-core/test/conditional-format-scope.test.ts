import { expect, test } from 'vitest'
import { conditionalFormatScopeToA1, parseConditionalFormatScope } from '../src/conditional-formatting/scope'
import { copyScope, freezeScope, sameScope } from '../src/conditional-formatting/value-domain'
import { snapshotScope } from '../src/conditional-formatting/snapshot-format'
import { validNativeConditionalFormats } from '../src/rust-workbook/conditional-format-commands'

const range = { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 0 }
const scope = { range, additionalRanges: [{ ...range, colStart: 2, colEnd: 2 }] }

test('scope text preserves order, gaps and the first formula origin', () => {
  expect(parseConditionalFormatScope('A1:A2, C1:C2')).toEqual(scope)
  expect(conditionalFormatScopeToA1(scope)).toBe('A1:A2, C1:C2')
  expect(parseConditionalFormatScope('A1')).toEqual({ range: { ...range, rowEnd: 0 } })
  expect(parseConditionalFormatScope('A1,')).toBeNull()
  expect(parseConditionalFormatScope('A1, invalid')).toBeNull()
  expect(parseConditionalFormatScope(Array(4097).fill('A1').join(','))).toBeNull()
})

test('copy, snapshot and frozen values cannot lose or alias additional ranges', () => {
  for (const copy of [copyScope(scope), snapshotScope(scope), freezeScope(scope)]) {
    expect(copy).toEqual(scope)
    expect(copy!.additionalRanges![0]).not.toBe(scope.additionalRanges[0])
  }
  expect(Object.isFrozen(freezeScope(scope).additionalRanges)).toBe(true)
  expect(sameScope(scope, { range })).toBe(false)
  expect(sameScope(scope, copyScope(scope))).toBe(true)
  expect(snapshotScope({ range, additionalRanges: [null] })).toBeNull()
  expect(snapshotScope({ range, additionalRanges: {} })).toBeNull()
})

test('projection validates all scope areas rather than accepting a bad extra area', () => {
  const config = (extra: unknown) => ({ revision: 1, rules: [{ id: 'r', priority: 0,
    rule: { kind: 'data-bar' as const }, scope: { range, additionalRanges: extra } }] })
  expect(validNativeConditionalFormats(config(scope.additionalRanges) as never)).toBe(true)
  for (const extra of [null, {}, [null], [{ ...range, rowEnd: 1048576 }],
    [{ ...range, colStart: -1 }], Array(4096).fill(range)])
    expect(validNativeConditionalFormats(config(extra) as never)).toBe(false)
})
