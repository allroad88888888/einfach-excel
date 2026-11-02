import { createStore } from '@einfach/core'
import { describe, expect, it } from 'vitest'
import {
  activeSheetFormulaReferenceTokensAtom,
  cancelEditingAtom,
  dispatchFormulaInputKeyAtom,
  formulaReferenceTokensAtom,
  initializeWorkbookDocumentAtom,
  parseFormulaReferences,
  setWorkspaceActiveSheetAtom,
  startEditingAtom,
  updateFormulaDraftAtom,
} from '../src'

describe('parseFormulaReferences', () => {
  it('returns empty for non-formula text', () => {
    expect(parseFormulaReferences('hello', 'sheet-1')).toEqual([])
    expect(parseFormulaReferences('', 'sheet-1')).toEqual([])
  })

  it('parses a single cell reference', () => {
    const tokens = parseFormulaReferences('=A1', 'sheet-1')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({
      start: 1,
      end: 3,
      text: 'A1',
      sheetId: 'sheet-1',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
      colorIndex: 0,
    })
  })

  it('parses a range reference', () => {
    const tokens = parseFormulaReferences('=SUM(B2:E8)', 'sheet-1')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].text).toBe('B2:E8')
    expect(tokens[0].range).toEqual({ rowStart: 1, rowEnd: 7, colStart: 1, colEnd: 4 })
  })

  it('parses multiple references in order with distinct color indices', () => {
    const tokens = parseFormulaReferences('=A1+B2+C3', 'sheet-1')
    expect(tokens.map((t) => t.text)).toEqual(['A1', 'B2', 'C3'])
    expect(tokens.map((t) => t.colorIndex)).toEqual([0, 1, 2])
  })

  it('reuses the same color for repeated references', () => {
    const tokens = parseFormulaReferences('=A1+A1', 'sheet-1')
    expect(tokens.map((t) => t.text)).toEqual(['A1', 'A1'])
    expect(tokens[0].colorIndex).toBe(0)
    expect(tokens[1].colorIndex).toBe(0)
  })

  it('handles cross-sheet references with unquoted sheet name', () => {
    const tokens = parseFormulaReferences('=Sheet2!A1', 'sheet-1')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].sheetId).toBe('Sheet2')
    expect(tokens[0].text).toBe('Sheet2!A1')
  })

  it('handles cross-sheet references with quoted sheet name', () => {
    const tokens = parseFormulaReferences("='My Sheet'!B2:C3", 'sheet-1')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].sheetId).toBe('My Sheet')
    expect(tokens[0].range).toEqual({ rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 })
  })

  it('strips $ anchors from row/col indices', () => {
    const tokens = parseFormulaReferences('=$A$1:$B$2', 'sheet-1')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].range).toEqual({ rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 })
  })

  it('reports positions in the full draft (including the leading =)', () => {
    const tokens = parseFormulaReferences('=SUM(A1:B2)+C3', 'sheet-1')
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toMatchObject({ start: 5, end: 10, text: 'A1:B2' })
    expect(tokens[1]).toMatchObject({ start: 12, end: 14, text: 'C3' })
  })

  it('normalizes range corners so rowStart<=rowEnd', () => {
    const tokens = parseFormulaReferences('=B5:A2', 'sheet-1')
    expect(tokens[0].range).toEqual({ rowStart: 1, rowEnd: 4, colStart: 0, colEnd: 1 })
  })

  it('falls back to currentSheetId when no prefix is present', () => {
    const tokens = parseFormulaReferences('=A1+Sheet2!B2', 'sheet-1')
    expect(tokens[0].sheetId).toBe('sheet-1')
    expect(tokens[1].sheetId).toBe('Sheet2')
  })

  it('resolves quoted and unquoted sheet names case-insensitively and deduplicates colorIndex', () => {
    const sheets = [
      { id: 'orders', name: 'Sales Orders' },
      { id: 'summary', name: 'Summary' },
    ]
    const tokens = parseFormulaReferences(
      "=B2+summary!B2+'Sales Orders'!$G$2+'SUMMARY'!$B$2",
      'summary',
      sheets,
    )
    expect(
      tokens.map((t) => ({ text: t.text, sheetId: t.sheetId, colorIndex: t.colorIndex })),
    ).toEqual([
      { text: 'B2', sheetId: 'summary', colorIndex: 0 },
      { text: 'summary!B2', sheetId: 'summary', colorIndex: 0 },
      { text: "'Sales Orders'!$G$2", sheetId: 'orders', colorIndex: 1 },
      { text: "'SUMMARY'!$B$2", sheetId: 'summary', colorIndex: 0 },
    ])
  })

  it('filters activeSheetFormulaReferenceTokensAtom by the currently viewed worksheet', async () => {
    const store = createStore()
    store.setter(initializeWorkbookDocumentAtom, {
      title: 'Test',
      sheets: [
        { id: 'orders', name: 'Sales Orders', index: 0, rowCount: 100, colCount: 16 },
        { id: 'summary', name: 'Summary', index: 1, rowCount: 100, colCount: 8 },
      ],
    })
    store.setter(startEditingAtom, {
      sheetId: 'orders',
      cell: { row: 9, col: 1 },
      source: 'cell',
      draft: "=E2+'Summary'!B1:B2+E2",
    })

    const allTokens = store.getter(formulaReferenceTokensAtom)
    expect(
      allTokens.map((t) => ({ text: t.text, sheetId: t.sheetId, colorIndex: t.colorIndex })),
    ).toEqual([
      { text: 'E2', sheetId: 'orders', colorIndex: 0 },
      { text: "'Summary'!B1:B2", sheetId: 'summary', colorIndex: 1 },
      { text: 'E2', sheetId: 'orders', colorIndex: 0 },
    ])

    expect(store.getter(activeSheetFormulaReferenceTokensAtom).map((t) => t.text)).toEqual([
      'E2',
      'E2',
    ])

    store.setter(dispatchFormulaInputKeyAtom, { key: 'F2', start: 6, end: 6 })
    expect(store.getter(activeSheetFormulaReferenceTokensAtom)).toEqual([
      expect.objectContaining({
        text: "'Summary'!B1:B2",
        sheetId: 'summary',
        colorIndex: 1,
        range: { rowStart: 0, rowEnd: 1, colStart: 1, colEnd: 1 },
      }),
    ])

    store.setter(updateFormulaDraftAtom, { draft: 'plain text', caret: 10 })
    expect(store.getter(formulaReferenceTokensAtom)).toEqual([])
    expect(store.getter(activeSheetFormulaReferenceTokensAtom)).toEqual([])

    store.setter(cancelEditingAtom)
    expect(store.getter(formulaReferenceTokensAtom)).toEqual([])
  })

  it('parses 3D sheet-span references and highlights when active sheet is within the span', () => {
    const sheets = [
      { id: 's-jan', name: 'Jan' },
      { id: 's-feb', name: 'Feb' },
      { id: 's-mar', name: 'Mar' },
      { id: 's-summary', name: 'Summary' },
    ]
    const tokens = parseFormulaReferences(
      "=SUM(Jan:Mar!A1:B2)+AVERAGE('Jan:Mar'!$C$5)+MAX('Jan':'Mar'!D1:D3)",
      's-feb',
      sheets,
    )
    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toMatchObject({
      text: 'Jan:Mar!A1:B2',
      sheetId: 's-feb',
      sheetIds: ['s-jan', 's-feb', 's-mar'],
      range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
      colorIndex: 0,
    })
    expect(tokens[1]).toMatchObject({
      text: "'Jan:Mar'!$C$5",
      sheetId: 's-feb',
      sheetIds: ['s-jan', 's-feb', 's-mar'],
      range: { rowStart: 4, rowEnd: 4, colStart: 2, colEnd: 2 },
      colorIndex: 1,
    })
    expect(tokens[2]).toMatchObject({
      text: "'Jan':'Mar'!D1:D3",
      sheetId: 's-feb',
      sheetIds: ['s-jan', 's-feb', 's-mar'],
      range: { rowStart: 0, rowEnd: 2, colStart: 3, colEnd: 3 },
      colorIndex: 2,
    })

    const store = createStore()
    store.setter(initializeWorkbookDocumentAtom, {
      title: 'Test 3D',
      sheets: [
        { id: 's-jan', name: 'Jan', index: 0, rowCount: 100, colCount: 16 },
        { id: 's-feb', name: 'Feb', index: 1, rowCount: 100, colCount: 16 },
        { id: 's-mar', name: 'Mar', index: 2, rowCount: 100, colCount: 16 },
        { id: 's-summary', name: 'Summary', index: 3, rowCount: 100, colCount: 16 },
      ],
    })
    store.setter(startEditingAtom, {
      sheetId: 's-summary',
      cell: { row: 0, col: 0 },
      source: 'cell',
      draft: '=SUM(Jan:Mar!A1:B2)',
    })
    // Active sheet is Summary (outside Jan:Mar) -> not highlighted on Summary
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 's-summary' })
    expect(store.getter(activeSheetFormulaReferenceTokensAtom)).toEqual([])

    // Switching active sheet to Feb (inside Jan:Mar) -> highlighted!
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 's-feb' })
    expect(store.getter(activeSheetFormulaReferenceTokensAtom)).toEqual([
      expect.objectContaining({
        text: 'Jan:Mar!A1:B2',
        range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
      }),
    ])
  })
})
