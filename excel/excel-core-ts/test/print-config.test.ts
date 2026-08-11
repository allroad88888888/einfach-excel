import { describe, expect, test } from '@jest/globals'
import {
  createWorkbook,
  readWorkbookPrintConfig,
  restoreWorkbookPrintConfigs,
  setWorkbookPrintConfig,
  snapshotWorkbookPrintConfigs,
} from '../src'

describe('workbook print configuration', () => {
  test('owns detached sheet snapshots and only advances a changed configuration revision', () => {
    const workbook = createWorkbook([{ id: 'sheet-1', name: 'Sheet1' }])
    const initial = readWorkbookPrintConfig(workbook, 'sheet-1')
    expect(initial).toMatchObject({ sheetId: 'sheet-1', revision: 0 })

    initial.config.orientation = 'landscape'
    expect(readWorkbookPrintConfig(workbook, 'sheet-1').config.orientation).toBe('portrait')

    const firstWrite = setWorkbookPrintConfig(workbook, 'sheet-1', {
      ...initial.config,
      orientation: 'landscape',
      scale: { kind: 'fit', pagesWide: 1 },
    })
    const sameWrite = setWorkbookPrintConfig(workbook, 'sheet-1', firstWrite.config)
    expect(firstWrite.revision).toBe(1)
    expect(sameWrite.revision).toBe(1)
    expect(readWorkbookPrintConfig(workbook, 'sheet-1')).toEqual(sameWrite)
  })

  test('rejects a malformed restore without changing the live configuration', () => {
    const workbook = createWorkbook([
      { id: 'sheet-1', name: 'Sheet1' },
      { id: 'sheet-2', name: 'Sheet2' },
    ])
    const saved = setWorkbookPrintConfig(workbook, 'sheet-1', {
      ...readWorkbookPrintConfig(workbook, 'sheet-1').config,
      orientation: 'landscape',
    })
    const snapshots = snapshotWorkbookPrintConfigs(workbook)

    expect(() =>
      restoreWorkbookPrintConfigs(workbook, [
        saved,
        { ...saved, config: { ...saved.config, orientation: 'portrait' } },
      ]),
    ).toThrow('duplicate print configuration restore')
    expect(snapshotWorkbookPrintConfigs(workbook)).toEqual(snapshots)
  })
})
