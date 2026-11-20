import { describe, expect, test, vi } from 'vitest'
import {
  cellStylesPanelAtom,
  createSpreadsheetUi,
  getWorkbookTheme,
  initializeWorkbookDocumentAtom,
  resolveCellStylePreset,
  runCellStylesAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  setSheetProtectionAtom,
  tintHexColor,
  workbookThemeAtom,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

describe('cell styles and workbook themes', () => {
  test('resolveCellStylePreset adapts headings and accents to the active theme', () => {
    const office = getWorkbookTheme('office')
    const warm = getWorkbookTheme('warm')

    const officeH1 = resolveCellStylePreset('heading-1', office)
    const warmH1 = resolveCellStylePreset('heading-1', warm)
    expect(officeH1.format.fgColor).toBe('#1f4e79')
    expect(officeH1.format.borders?.bottom?.color).toBe('#4472c4')
    expect(warmH1.format.fgColor).toBe('#431407')
    expect(warmH1.format.borders?.bottom?.color).toBe('#c2410c')

    const softAccent = resolveCellStylePreset('accent-1-soft', office)
    expect(softAccent.format.bgColor).toBe(tintHexColor('#4472c4', 0.78))
    expect(softAccent.clearFormatFields).toContain('fill')
    expect(softAccent.clearFormatFields).toContain('borders')

    const normal = resolveCellStylePreset('normal', office)
    expect(normal.format).toEqual({
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
    })
    expect(normal.clearFormatFields).toContain('bgColor')
    expect(normal.clearFormatFields).toContain('borders')
    expect(tintHexColor('nothex', Number.NaN)).toBe('nothex')
  })

  test('runCellStylesAtom switches themes, applies presets atomically, and respects protection', async () => {
    const patches: unknown[] = []
    const request = vi.fn(async (command: string, payload: unknown) => {
      if (command === 'format.setRange') {
        const req = payload as {
          request: { sheetId: string; requestId: number; range: unknown; format: unknown }
          projection: VisibleProjectionRequest
        }
        patches.push(req.request.format)
        return {
          acknowledgement: {
            sheetId: req.request.sheetId,
            requestId: req.request.requestId,
            revision: patches.length + 1,
            affectedRange: req.request.range,
          },
          projection: { ...req.projection, revision: patches.length + 1, cells: [] },
        }
      }
      return {
        ...(payload as { request: VisibleProjectionRequest }).request,
        revision: 1,
        cells: [],
      }
    })
    const connection: RustWorkbookConnection = {
      request: request as RustWorkbookConnection['request'],
      dispose() {},
    }
    const core = createSpreadsheetUi({ connection })
    core.store.setter(initializeWorkbookDocumentAtom, {
      title: 'ThemeBook',
      sheets: [{ id: 's1', index: 0, name: 'Sheet1', rowCount: 20, colCount: 10 }],
    })
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 0, col: 0 } })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    })

    expect(await core.store.setter(runCellStylesAtom, 'open')).toBe(true)
    expect(core.store.getter(cellStylesPanelAtom).open).toBe(true)

    // Switching theme updates workbookThemeAtom and applied accent color
    await core.store.setter(runCellStylesAtom, { type: 'theme', themeId: 'facet' })
    expect(core.store.getter(workbookThemeAtom).id).toBe('facet')
    expect(await core.store.setter(runCellStylesAtom, { type: 'apply', presetId: 'accent-1' })).toBe(
      true,
    )
    expect(patches[0]).toMatchObject({ bgColor: '#90c226', fgColor: '#ffffff' })
    expect(core.store.getter(cellStylesPanelAtom).open).toBe(false)

    // Protected locked cell blocks cell style application and shows error
    core.store.setter(setSheetProtectionAtom, {
      sheetId: 's1',
      state: { mode: 'protected', unlockedRanges: [] },
    })
    await core.store.setter(runCellStylesAtom, 'open')
    expect(await core.store.setter(runCellStylesAtom, { type: 'apply', presetId: 'good' })).toBe(
      false,
    )
    expect(core.store.getter(cellStylesPanelAtom).error).toContain('Could not apply cell style')
  })
})
