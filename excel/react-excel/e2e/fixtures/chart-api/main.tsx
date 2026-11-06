import { createRoot } from 'react-dom/client'
import { createStore } from '@einfach/core'
import { createWorkbookApi, type RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import { chartPlugin } from '@einfach-excel/plugin-chart'
import { createChartApi, type ChartChangeEvent } from '@einfach-excel/plugin-chart/core'
import { Spreadsheet } from '../../../src'

const rows = [['Region', 'Sales'], ['North', 3], ['South', 5], ['East', 2]] as const
const definition: RustWorkbookDefinition = {
  title: 'Chart host API',
  sheets: ['main', 'data'].map((id, index) => ({
    id, index, name: id === 'main' ? 'Main' : 'Data', rowCount: 200, colCount: 20,
  })),
  createImportChunks: () => [[
    { sheet: 0, row: 0, col: 0, kind: 'text', value: 'Main' },
    ...rows.flatMap((row, r) => row.map((value, c) => typeof value === 'number'
      ? { sheet: 1, row: r, col: c, kind: 'number' as const, value }
      : { sheet: 1, row: r, col: c, kind: 'text' as const, value })),
  ]],
}
const plugins = [chartPlugin]
const store = createStore()
const workbook = createWorkbookApi(store)
const charts = createChartApi(workbook)
const events: ChartChangeEvent[] = []
charts.onChange((event) => events.push(event))

createRoot(document.getElementById('root')!).render(
  <Spreadsheet definition={definition} store={store} plugins={plugins} />,
)

// 浏览器用例经 window 调用宿主门面，再检查真实 DOM 与事件。
Object.assign(window, { workbook, charts, chartEvents: events })
