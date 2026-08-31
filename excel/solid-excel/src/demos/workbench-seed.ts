import { createStaticNamedRangeCapabilityPort, createStaticSpreadsheetBackend } from '../adapter'

export const workbenchSheets = [
  { id: 'sheet-1', name: 'Sales' },
  { id: 'sheet-2', name: 'Forecast' },
]

export const workbenchNamedRangeCapabilityPort = createStaticNamedRangeCapabilityPort()

export const workbenchBackend = createStaticSpreadsheetBackend({
  revision: 1,
  sheets: workbenchSheets,
  matrix: [
    ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
    ['North', 120, 180, 240, 300, 840], ['South', 80, 160, 240, 320, 800],
    ['East', 200, 100, 50, 150, 500], ['West', 140, 110, 250, 175, 675],
    ['Central', 90, 130, 200, 280, 700], ['Mountain', 65, 95, 130, 210, 500],
    ['Pacific', 175, 220, 280, 360, 1035], ['Total', 870, 995, 1390, 1795, 5050],
  ],
  cells: [
    { row: 0, col: 0, displayValue: 'Region', valueKind: 'string', format: { bgColor: '#1e3a8a', fgColor: '#ffffff', bold: true } },
    { row: 0, col: 5, displayValue: 'Total', valueKind: 'string', format: { bgColor: '#1e3a8a', fgColor: '#ffffff', bold: true } },
    { row: 8, col: 0, displayValue: 'Total', valueKind: 'string', format: { bgColor: '#94a3b8', fgColor: '#0f172a', bold: true } },
    { row: 3, col: 4, displayValue: '150', valueKind: 'number', conditionalFormat: { bgColor: '#fef3c7' } },
    { row: 6, col: 4, displayValue: '210', valueKind: 'number', conditionalFormat: { bgColor: '#fef3c7' } },
    { row: 7, col: 5, displayValue: '1035', valueKind: 'number', conditionalFormat: { bgColor: '#dcfce7', bold: true } },
  ],
})

export const workbenchViewport = {
  scrollTop: 0, scrollLeft: 0, viewportHeight: 240, viewportWidth: 720,
  rowHeight: 24, colWidth: 96, rowCount: 50, colCount: 16, overscanRows: 1, overscanCols: 1,
}
