import { expect, test } from 'vitest'
import { diagonalBorderLines } from '../src/borders/diagonal-geometry'
import { normalizeFormat } from '../src/contracts/format-normalization'
import { snapshotFormat } from '../src/conditional-formatting/snapshot-format'
import { copyFormat, freezeFormat } from '../src/conditional-formatting/value-domain'
import { snapshotFormat as mutationSnapshot } from '../src/toolbar/mutation-snapshots'

test('diagonal facts survive normalization, transport snapshots and isolated deep copies', () => {
  const source = { borders: { diagDown: { style: 'double', color: '#c00000' } } } as const
  for (const copy of [normalizeFormat(source), snapshotFormat(source), copyFormat(source),
    freezeFormat(source), mutationSnapshot(source)]) {
    expect(copy).toEqual(source)
    expect(copy!.borders).not.toBe(source.borders)
    expect(copy!.borders!.diagDown).not.toBe(source.borders.diagDown)
  }
  expect(snapshotFormat({ borders: { diagUp: { style: 'thin', color: 'red' } } })).toBeNull()
  expect(snapshotFormat({ borders: { ...source.borders, diagUp: { style: 'thin' } } })).toBeNull()
})

test('non-square diagonals reach opposite corners and double lines have a two-pixel normal gap', () => {
  const single = diagonalBorderLines({ diagDown: { style: 'thick' }, diagUp: { style: 'dashed' } }, 120, 50)
  expect(single).toMatchObject([
    { x1: 0, y1: 0, x2: 120, y2: 50, width: 3, dash: [] },
    { x1: 0, y1: 50, x2: 120, y2: 0, width: 1, dash: [4, 3] },
  ])
  const [a, b] = diagonalBorderLines({ diagDown: { style: 'double' } }, 120, 50)
  expect(Math.hypot(b!.x1 - a!.x1, b!.y1 - a!.y1)).toBeCloseTo(2)
  expect((b!.x1 - a!.x1) * 120 + (b!.y1 - a!.y1) * 50).toBeCloseTo(0)
  expect([a!.width, b!.width]).toEqual([1, 1])
  for (const width of [0, -1, NaN, Infinity]) expect(diagonalBorderLines({ diagUp: { style: 'thin' } }, width, 50)).toEqual([])
  expect(diagonalBorderLines({ diagUp: { style: 'none' } }, 120, 50)).toEqual([])
})
