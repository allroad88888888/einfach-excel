import { expect, test } from 'vitest'
import { CELL_FILL_PATTERNS, snapshotCellFill } from '../src/contracts/cell-fill'
import { normalizeFormat } from '../src/contracts/format-normalization'
import { snapshotFormat } from '../src/conditional-formatting/snapshot-format'
import { copyFormat, freezeFormat } from '../src/conditional-formatting/value-domain'
import { snapshotFormat as mutationSnapshot } from '../src/toolbar/mutation-snapshots'

test('all 17 pattern facts survive projection and immutable transport snapshots', () => {
  expect(CELL_FILL_PATTERNS).toHaveLength(17)
  for (const pattern of CELL_FILL_PATTERNS) {
    const source = { fill: { kind: 'pattern', pattern, foreground: '#123abc' } } as const
    for (const copy of [normalizeFormat(source), snapshotFormat(source), copyFormat(source),
      freezeFormat(source), mutationSnapshot(source)]) {
      expect(copy).toEqual(source)
      expect(copy!.fill).not.toBe(source.fill)
    }
    expect(Object.isFrozen(freezeFormat(source).fill)).toBe(true)
    expect(Object.isFrozen(mutationSnapshot(source)!.fill)).toBe(true)
  }
})

test('invalid patterns, CSS input and an extra background field reject without mutating facts', () => {
  for (const fill of [null, {}, { kind: 'unknown', pattern: 'darkDown', foreground: '#123abc' },
    { kind: 'pattern', pattern: 'solid', foreground: '#123abc' },
    { kind: 'pattern', pattern: 'darkDown', foreground: 'red' },
    { kind: 'pattern', pattern: 'darkDown', foreground: 'url(evil)' },
    { kind: 'pattern', pattern: 'darkDown', foreground: '#123abc', background: '#ffffff' }]) {
    expect(snapshotCellFill(fill)).toBeNull()
    expect(snapshotFormat({ fill })).toBeNull()
  }
})
