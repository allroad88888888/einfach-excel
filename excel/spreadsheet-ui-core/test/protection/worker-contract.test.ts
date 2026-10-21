import { expect, test, vi } from 'vitest'
import { changeProtection, readProtection, validNativeProtection } from '../../src/rust-workbook/protection/commands'
import type { RustProtectionCommands } from '../../src/rust-workbook/protection/commands'

const sheets = new Map([['s', { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }]])
const projection = { kind: 'visible-window', sheetId: 's', requestId: 2,
  window: { rowStart: 0, colStart: 0, rowEnd: 9, colEnd: 7 } } as const
const input: RustProtectionCommands['protection.change']['payload'] = {
  sheetId: 's', revision: 1, projection, change: { action: 'protect' },
}

test('Worker forwards one native settings change and never creates a content history operation', () => {
  const change = vi.fn(() => true)
  expect(changeProtection({ change_protection: change }, sheets, input, 1)).toBe(true)
  expect(change).toHaveBeenCalledExactlyOnceWith(0, { action: 'protect' })
  change.mockReturnValue(false)
  expect(changeProtection({ change_protection: change }, sheets, input, 1)).toBe(false)
})

test('stale revision, invalid ownership and ranges fail before reaching Rust', () => {
  const change = vi.fn(() => true)
  const workbook = { change_protection: change }
  for (const bad of [
    { ...input, revision: 99 }, { ...input, sheetId: 'unknown' },
    { ...input, projection: { ...projection, sheetId: 'other' } },
    { ...input, change: { action: 'allow-range', range: {
      rowStart: 1, rowEnd: 100, colStart: 0, colEnd: 0 } } },
    { ...input, change: { action: 'remove-range', index: -1 } },
  ]) expect(() => changeProtection(workbook, sheets,
    bad as RustProtectionCommands['protection.change']['payload'], 1)).toThrow()
  expect(change).not.toHaveBeenCalled()
})

test('read validates native payloads and missing capabilities report a real error', () => {
  const state = { mode: 'protected', unlockedRanges: [
    { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
  ] } as const
  expect(readProtection({ read_protection: () => state }, sheets, { sheetId: 's' })).toBe(state)
  expect(() => readProtection({}, sheets, { sheetId: 's' })).toThrow('unavailable')
  expect(validNativeProtection({ mode: 'protected', unlockedRanges: [
    { rowStart: 2, rowEnd: 1, colStart: 0, colEnd: 0 },
  ] })).toBe(false)
  expect(validNativeProtection({ mode: 'protected', unlockedRanges: [] })).toBe(true)
  expect(() => changeProtection({}, sheets, input, 1)).toThrow('unavailable')
})
