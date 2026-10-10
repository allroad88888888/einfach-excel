import { expect, test } from 'vitest'
import { cellBorderEdgeStyle, cellFormatStyle } from '../../../src/workbook/grid/cells/cell-format-style'

test.each([
  ['thin', 'solid', '1px'], ['medium', 'solid', '2px'], ['thick', 'solid', '3px'],
  ['dashed', 'dashed', '1px'], ['dotted', 'dotted', '1px'], ['double', 'double', '3px'],
] as const)('%s has a definite CSS width', (style, css, width) => {
  expect(cellFormatStyle({ borders: { top: { style, color: '#c00000' } } })).toMatchObject({
    borderTopStyle: css, borderTopWidth: width, borderTopColor: '#c00000',
  })
})

test('identical adjacent edges draw once without mutating stored formats', () => {
  const spec = { style: 'thin', color: '#123abc' } as const
  const format = { borders: { top: spec, left: spec } }
  expect(cellBorderEdgeStyle(format, { borders: { bottom: spec } }, { borders: { right: spec } }))
    .toEqual({ borderTopWidth: '0px', borderLeftWidth: '0px' })
  expect(cellBorderEdgeStyle(format, undefined, undefined)).toEqual({})
  expect(cellBorderEdgeStyle(format, { borders: { bottom: { ...spec, style: 'double' } } }, undefined)).toEqual({})
  expect(format.borders.top.style).toBe('thin')
})
