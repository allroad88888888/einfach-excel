import { createStore } from '@einfach/core'
import { createRoot } from 'react-dom/client'
import {
  createWorkbookApi,
  readWorkbookRangesAtom,
  writeWorkbookCellsAtom,
  workbookChangeAtom,
  hostControlsAtom,
  configureHostControlsAtom,
  rustWorkbookConnectionAtom,
  replaceRustWorkbookRuntimeAtom,
  workbookDocumentAtom,
  type ReadWorkbookRangesInput,
  type WriteWorkbookCellsInput,
  type HostControls,
  type WorkbookChangeEvent,
} from '@einfach-excel/spreadsheet-ui-core'
import { createChartApi } from '@einfach-excel/plugin-chart/core'
import { patternFillPanelAtom } from '@einfach-excel/plugin-cell-appearance/core'
import { datePickerStateAtom } from '@einfach-excel/plugin-date-picker/core'
import { definition } from './definition'
import type { PackageHost } from './bridge'
import { mountFacadeControls } from './facade'

const style = () =>
  [document.body, document.getElementById('host-button')!].map((node) => {
    const value = getComputedStyle(node)
    return [
      value.fontFamily,
      value.color,
      value.margin,
      value.padding,
      value.boxSizing,
      value.overflow,
    ]
  })
const before = style()
const workers = { created: 0, terminated: 0, live: 0, customCalls: 0 }
const OriginalWorker = window.Worker
window.Worker = class extends OriginalWorker {
  private stopped = false
  constructor(url: URL | string, options?: WorkerOptions) {
    super(url, options)
    workers.created++
    workers.live++
  }

  terminate() {
    if (!this.stopped) {
      this.stopped = true
      workers.terminated++
      workers.live--
    }
    super.terminate()
  }
}
// 先采集宿主样式，再加载已安装库、公开插件及显式 CSS；没有源码入口或 alias。
const { Spreadsheet } = await import('@einfach-excel/react-excel')
const { chartPlugin } = await import('@einfach-excel/plugin-chart')
const { cellAppearancePlugin } = await import('@einfach-excel/plugin-cell-appearance')
const { datePickerPlugin } = await import('@einfach-excel/plugin-date-picker')
await import('@einfach-excel/react-excel/style.css')
await import('@einfach-excel/plugin-chart/style.css')
await import('@einfach-excel/plugin-cell-appearance/style.css')
await import('@einfach-excel/plugin-date-picker/style.css')

const loadXlsx = async () => {
  const xlsx = await import('@einfach-excel/xlsx')
  await xlsx.default()
  return xlsx
}
const installedPlugins = [chartPlugin, cellAppearancePlugin, datePickerPlugin] as const
const stores = { first: createStore(), second: createStore() }
const chartApi = createChartApi(createWorkbookApi(stores.first))
mountFacadeControls(stores.first)
const events: Record<keyof typeof stores, WorkbookChangeEvent[]> = { first: [], second: [] }
for (const key of ['first', 'second'] as const)
  stores[key].sub(workbookChangeAtom, () => {
    const event = stores[key].getter(workbookChangeAtom)
    if (event) events[key].push(structuredClone(event))
  })
let first = createRoot(document.getElementById('first')!)
const second = createRoot(document.getElementById('second')!)
let fail = false
const workerFactory = () => {
  workers.customCalls++
  if (fail) throw new Error('Host factory failure')
  return new Worker(new URL('./host.worker.ts', import.meta.url), { type: 'module' })
}
const renderFirst = (factory?: typeof workerFactory, invalid = false) =>
  first.render(
    <Spreadsheet
      definition={
        invalid
          ? {
              ...definition,
              *createImportChunks() {
                throw new Error('Host import failure')
              },
            }
          : definition
      }
      store={stores.first}
      workerFactory={factory}
      locale="en"
      xlsx={loadXlsx}
      plugins={installedPlugins}
    />,
  )
renderFirst()
second.render(
  <Spreadsheet
    definition={definition}
    store={stores.second}
    workerFactory={workerFactory}
    locale="zh"
  />,
)
document.getElementById('unmount')!.onclick = () => first.unmount()
document.getElementById('remount')!.onclick = () => {
  first.unmount()
  first = createRoot(document.getElementById('first')!)
  fail = false
  renderFirst()
}
document.getElementById('fail')!.onclick = () => {
  fail = true
  renderFirst(workerFactory)
}
document.getElementById('fail-native')!.onclick = () => {
  fail = false
  renderFirst(workerFactory, true)
}

export const packageHost: PackageHost = {
  workers,
  events,
  before,
  style,
  read: (input: ReadWorkbookRangesInput, key: keyof typeof stores = 'first') =>
    stores[key].setter(readWorkbookRangesAtom, input),
  write: (input: WriteWorkbookCellsInput, key: keyof typeof stores = 'first') =>
    stores[key].setter(writeWorkbookCellsAtom, input),
  controls: (input: Partial<HostControls>, key: keyof typeof stores = 'first') =>
    stores[key].setter(configureHostControlsAtom, input),
  currentControls: () => stores.first.getter(hostControlsAtom),
  sheets: () => stores.first.getter(workbookDocumentAtom).sheets,
  export: () =>
    stores.first
      .getter(rustWorkbookConnectionAtom)!
      .request('workbook.exportFile', { title: 'Saved' }),
  replace: (text: string | null) => stores.first.setter(replaceRustWorkbookRuntimeAtom, text),
  xlsxRoundTrip: async () => {
    const xlsx = await loadXlsx()
    const saved = await stores.first
      .getter(rustWorkbookConnectionAtom)!
      .request('workbook.exportFile', { title: 'Saved' })
    const bytes = xlsx.nativeToXlsx(saved.text)
    const roundTripped = JSON.parse(xlsx.xlsxToNative(bytes, 'RoundTrip')) as {
      workbook: { sheets: unknown[] }
    }
    return { byteLength: bytes.byteLength, sheetCount: roundTripped.workbook.sheets.length }
  },
  insertChart: async () => {
    const sheetId = stores.first.getter(workbookDocumentAtom).sheets[0].id
    const res = await chartApi.insert({
      sheetId,
      data: 'A1:A5',
      type: 'column',
      spec: { title: 'Installed Chart' },
    })
    const listed = await chartApi.list(sheetId)
    return { status: res.status, count: listed.status === 'ok' ? listed.charts.length : 0 }
  },
  pluginCoreState: () => ({
    patternOpen: stores.first.getter(patternFillPanelAtom).open,
    datePickerVisible: stores.first.getter(datePickerStateAtom).visible,
  }),
}
window.packageHost = packageHost
