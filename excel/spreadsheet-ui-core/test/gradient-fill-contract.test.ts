import { expect, test } from 'vitest'
import { cloneCellFill, freezeCellFill, snapshotCellFill, type SpreadsheetGradientFill } from '../src/contracts/cell-fill'
import { cloneFormat } from '../src/contracts/format-normalization'
import { snapshotFormat } from '../src/toolbar/mutation-snapshots'

const stops = [{ position: 0.9, color: '#123456' }, { position: 0.1, color: '#ABCDEF' },
  { position: 0.1, color: '#fedcba' }]
const linear: SpreadsheetGradientFill = { kind: 'linear-gradient', degree: -450, stops }
const path: SpreadsheetGradientFill = { kind: 'path-gradient', left: 0.9, right: 0.1, top: 0, bottom: 0, stops }

test('gradient contracts retain original geometry, stop order and zero/one/256 stop lists', () => {
  for (const fill of [linear, path]) for (const values of [[], stops.slice(0, 1), stops,
    Array.from({ length: 256 }, () => ({ position: 0.5, color: '#123456' }))]) {
    const input = { ...fill, stops: values }
    expect(snapshotCellFill(input)).toEqual(input)
    expect(snapshotCellFill(input)).not.toBe(input)
  }
})

test('invalid gradient inputs reject wrong variants, coordinates, colors and resource overflow', () => {
  for (const input of [{ ...linear, degree: Infinity }, { ...linear, degree: NaN },
    { ...linear, degree: '90' }, { ...linear, left: 0 }, { ...path, degree: 0 },
    { ...path, right: 1.001 }, { ...path, left: -0.1 }, { ...path, top: undefined },
    { ...path, stops: [{ position: 0.5, color: 'red' }] },
    { ...path, stops: [{ position: 0.5, color: '#123456', extra: true }] },
    { ...path, stops: [{ position: 2, color: '#123456' }] }, { ...path, stops: new Array(2) },
    { ...linear, stops: Array.from({ length: 257 }, () => stops[0]) }])
    expect(snapshotCellFill(input)).toBeNull()
  expect(snapshotCellFill({ get kind() { throw Error('getter') } })).toBeNull()
})

test('format and command snapshots isolate every gradient stop from caller mutation', () => {
  const input = { ...linear, stops: stops.map(stop => ({ ...stop })) }
  const copies = [cloneCellFill(input), freezeCellFill(input), cloneFormat({ fill: input }).fill!,
    snapshotFormat({ fill: input })!.fill!]
  input.stops[0].color = '#000000'; input.stops[0].position = 0
  for (const copy of copies) expect(copy).toEqual(linear)
  for (const copy of [copies[1], copies[3]]) {
    expect(Object.isFrozen(copy)).toBe(true)
    if (copy.kind !== 'pattern') {
      expect(Object.isFrozen(copy.stops)).toBe(true)
      expect(copy.stops.every(Object.isFrozen)).toBe(true)
    }
  }
})
