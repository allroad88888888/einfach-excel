import type { SpreadsheetCellFormat } from '@einfach/spreadsheet-ui-core'

import {
  cellFormatStyle,
  cellTextRotationStyle,
} from '../../../src/workbook/grid/cells/cell-format-style'

describe('cellFormatStyle', () => {
  it('maps valid font, alignment, border, rotation, and overflow formats to React styles', () => {
    const format: SpreadsheetCellFormat = {
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      fgColor: 'rgba(10, 20, 30, 0.5)',
      bgColor: '#AABBCC',
      fontFamily: 'Arial, "Open Sans"',
      fontSize: 14,
      align: 'distributed',
      verticalAlign: 'center',
      indent: 3,
      borders: {
        top: { style: 'thin', color: 'red' },
        right: { style: 'dashed', color: '#1234' },
      },
      rotation: 45,
      overflow: 'ellipsis',
    }

    expect(cellFormatStyle(format)).toEqual({
      backgroundColor: '#AABBCC',
      borderRightColor: '#1234',
      borderRightStyle: 'dashed',
      borderTopColor: 'red',
      borderTopStyle: 'solid',
      borderTopWidth: '1px',
      color: 'rgba(10, 20, 30, 0.5)',
      fontFamily: 'Arial, "Open Sans"',
      fontSize: '14px',
      fontStyle: 'italic',
      fontWeight: 'bold',
      overflow: 'hidden',
      paddingLeft: '24px',
      textAlign: 'justify',
      textAlignLast: 'justify',
      textDecoration: 'underline line-through',
      textOverflow: 'ellipsis',
      verticalAlign: 'middle',
      whiteSpace: 'nowrap',
    })
  })

  it('preserves vertical rotation, wrap fallback, and overflow semantics', () => {
    expect(cellFormatStyle({ rotation: 'vertical', wrap: true })).toEqual({
      overflowWrap: 'anywhere',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
    })
    expect(cellTextRotationStyle({ rotation: 'vertical' })).toEqual({
      display: 'inline-block',
      textOrientation: 'mixed',
      writingMode: 'vertical-rl',
    })
    expect(cellTextRotationStyle({ rotation: 45 })).toEqual({
      display: 'inline-block',
      transform: 'rotate(45deg)',
      transformOrigin: 'center center',
    })
    expect(cellFormatStyle({ overflow: 'clip' })).toEqual({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    })
    expect(cellFormatStyle({ overflow: 'overflow', wrap: true })).toEqual({
      overflow: 'visible',
      whiteSpace: 'nowrap',
    })
  })

  it('rejects hostile and out-of-bounds values while retaining safe values', () => {
    const untrusted = {
      fgColor: 'url(javascript:alert(1))',
      bgColor: 'rgb(256, 0, 0)',
      fontFamily: 'Arial; color: red',
      fontSize: Infinity,
      indent: 999,
      rotation: 91,
      borders: {
        top: { style: 'thin', color: 'expression(alert(1))' },
        right: { style: 'unknown', color: 'blue' },
      },
    } as unknown as SpreadsheetCellFormat

    expect(cellFormatStyle(untrusted)).toEqual({
      borderTopStyle: 'solid',
      borderTopWidth: '1px',
      paddingLeft: '2000px',
    })
    expect(cellTextRotationStyle(untrusted)).toBeUndefined()
  })

  it('returns undefined only when no format is supplied', () => {
    expect(cellFormatStyle(undefined)).toBeUndefined()
    expect(cellFormatStyle({})).toEqual({})
  })
})
