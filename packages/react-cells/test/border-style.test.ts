import { expect, test } from 'vitest'
import { cellFormatStyle } from '../src/cell-format-style'

test.each([
  ['thin', 'solid', '1px'], ['medium', 'solid', '2px'], ['thick', 'solid', '3px'],
  ['dashed', 'dashed', '1px'], ['dotted', 'dotted', '1px'], ['double', 'double', '3px'],
] as const)('%s has a definite CSS width', (style, css, width) => {
  expect(cellFormatStyle({ borders: { top: { style, color: '#c00000' } } })).toMatchObject({
    borderTopStyle: css, borderTopWidth: width, borderTopColor: '#c00000',
  })
})
