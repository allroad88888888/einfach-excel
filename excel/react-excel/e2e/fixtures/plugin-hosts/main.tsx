import { createRoot } from 'react-dom/client'
import type { RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import { cellAppearancePlugin } from '@einfach-excel/plugin-cell-appearance'
import { dataFilterPlugin } from '@einfach-excel/plugin-data-filter'
import { textFormatPlugin } from '@einfach-excel/plugin-text-format'
import {
  Spreadsheet,
  type SpreadsheetPlugin,
  type SpreadsheetProps,
} from '../../../src'
import { createDefaultWorkbookWorker } from '../../../src/worker/create-workbook-worker'

const params = new URLSearchParams(window.location.search)
const hostCase = params.get('case') ?? 'appearance'
const root = document.getElementById('root')!

function mountSlots(html: string, zeroMargin = true) {
  if (zeroMargin) document.body.style.margin = '0'
  root.innerHTML = html
}

function mountDualToggleHost(options: {
  heightPx: number
  plugin: SpreadsheetPlugin
  secondPlugins: readonly SpreadsheetPlugin[]
  makeDefinition: (tag: string) => RustWorkbookDefinition
  firstTag: string
  secondTag: string
  reinstallOnAltU: boolean
  withToggleButton?: boolean
}) {
  const buttonHtml = options.withToggleButton
    ? '<button id="toggle">Toggle plugin</button>'
    : ''
  mountSlots(
    `${buttonHtml}<div id="first" style="height:${options.heightPx}px"></div>` +
      `<div id="second" style="height:${options.heightPx}px"></div>` +
      '<output id="host-event"></output>',
    !options.withToggleButton,
  )
  const firstRoot = createRoot(document.getElementById('first')!)
  const secondRoot = createRoot(document.getElementById('second')!)
  const firstDef = options.makeDefinition(options.firstTag)
  const secondDef = options.makeDefinition(options.secondTag)
  let installed = true
  const renderFirst = () => {
    firstRoot.render(
      <Spreadsheet
        definition={firstDef}
        plugins={installed ? [options.plugin] : []}
        locale="en"
        style={{ height: '100%' }}
      />,
    )
  }
  renderFirst()
  secondRoot.render(
    <Spreadsheet
      definition={secondDef}
      plugins={options.secondPlugins}
      locale="en"
      style={{ height: '100%' }}
    />,
  )
  const toggleBtn = document.getElementById('toggle')
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      installed = !installed
      renderFirst()
    }
  }
  document.addEventListener('keydown', (event) => {
    if (!event.altKey || event.code !== 'KeyU') return
    event.preventDefault()
    installed = options.reinstallOnAltU ? !installed : false
    renderFirst()
    document.getElementById('host-event')!.textContent = installed ? 'installed' : 'uninstalled'
  })
}

function mountColorAsyncHost() {
  mountSlots('<div id="host" style="height:850px"></div>')
  const pending: (() => void)[] = []
  let hold = true
  document.documentElement.dataset.pendingColors = '0'
  document.addEventListener('keydown', (event) => {
    if (!event.altKey || event.code !== 'KeyR') return
    event.preventDefault()
    hold = false
    pending.splice(0).forEach((deliver) => deliver())
    document.documentElement.dataset.pendingColors = String(pending.length)
  })
  type WorkerHandle = ReturnType<NonNullable<SpreadsheetProps['workerFactory']>>
  function workerFactory(): WorkerHandle {
    const worker = createDefaultWorkbookWorker()
    const requests = new Set<unknown>()
    const listeners = new Set<(event: MessageEvent<unknown>) => void>()
    worker.addEventListener('message', (event) => {
      const recipients = [...listeners]
      const deliver = () => recipients.forEach((listener) => listener(event))
      const data = event.data as { id?: unknown } | undefined
      if (requests.delete(data?.id) && hold) {
        pending.push(deliver)
        document.documentElement.dataset.pendingColors = String(pending.length)
      } else {
        deliver()
      }
    })
    return {
      postMessage(message: unknown) {
        const msg = message as {
          id?: unknown
          command?: string
          payload?: { colorSource?: unknown }
        }
        if (msg.command === 'sheet.filterValues' && msg.payload?.colorSource) {
          requests.add(msg.id)
        }
        worker.postMessage(message)
      },
      addEventListener(type, listener) {
        if (type === 'message') {
          listeners.add(listener as (event: MessageEvent<unknown>) => void)
        } else {
          worker.addEventListener(type, listener as never)
        }
      },
      removeEventListener(type, listener) {
        if (type === 'message') {
          listeners.delete(listener as (event: MessageEvent<unknown>) => void)
        } else {
          worker.removeEventListener(type, listener as never)
        }
      },
      terminate() {
        worker.terminate()
      },
    }
  }
  const initialSnapshot = (window as unknown as { __COLOR_SNAPSHOT__?: string }).__COLOR_SNAPSHOT__
  const definition: RustWorkbookDefinition = {
    title: 'Color candidate timing',
    sheets: [{ id: 'colors', name: 'Colors', rowCount: 70, colCount: 8 }],
    createImportChunks: () => [],
  }
  createRoot(document.getElementById('host')!).render(
    <Spreadsheet
      definition={definition}
      workerFactory={workerFactory}
      initialSnapshot={initialSnapshot}
      plugins={[dataFilterPlugin]}
      locale="en"
      style={{ height: '100%' }}
    />,
  )
}

if (hostCase === 'appearance') {
  const sharedDef: RustWorkbookDefinition = {
    title: 'Appearance host',
    sheets: [{ id: 's', name: 'Host', rowCount: 30, colCount: 8 }],
    createImportChunks: () => [[{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Kept native value' }]],
  }
  mountDualToggleHost({
    heightPx: 430,
    plugin: cellAppearancePlugin,
    secondPlugins: [],
    makeDefinition: () => sharedDef,
    firstTag: 'Host',
    secondTag: 'Host',
    reinstallOnAltU: true,
    withToggleButton: true,
  })
} else if (hostCase === 'gradient' || hostCase === 'pattern') {
  mountDualToggleHost({
    heightPx: 520,
    plugin: cellAppearancePlugin,
    secondPlugins: [cellAppearancePlugin],
    makeDefinition: (tag) => ({
      title: tag,
      sheets: [{ id: 's', name: tag, rowCount: 40, colCount: 5 }],
      createImportChunks: () => [[{ sheet: 0, row: 0, col: 0, kind: 'text', value: tag }]],
    }),
    firstTag: 'First',
    secondTag: 'Second',
    reinstallOnAltU: true,
  })
} else if (hostCase === 'shrink') {
  mountDualToggleHost({
    heightPx: 520,
    plugin: textFormatPlugin,
    secondPlugins: [textFormatPlugin],
    makeDefinition: (tag) => ({
      title: tag,
      sheets: [{ id: 's', name: tag, rowCount: 40, colCount: 5 }],
      createImportChunks: () => [[{
        sheet: 0,
        row: 0,
        col: 0,
        kind: 'text',
        value: `${tag} long inventory 2026-000000123456`,
        format: { fontSize: 20 },
      }]],
    }),
    firstTag: 'First',
    secondTag: 'Second',
    reinstallOnAltU: true,
  })
} else if (hostCase === 'filter') {
  mountDualToggleHost({
    heightPx: 600,
    plugin: dataFilterPlugin,
    secondPlugins: [dataFilterPlugin],
    makeDefinition: (tag) => ({
      title: tag,
      sheets: [{ id: 's', name: tag, rowCount: 40, colCount: 5 }],
      createImportChunks: () => [[
        { sheet: 0, row: 0, col: 0, kind: 'text', value: 'Score' },
        { sheet: 0, row: 0, col: 1, kind: 'text', value: 'Record' },
        ...[1, 3, 2].flatMap((value, index) => [
          { sheet: 0, row: index + 1, col: 0, kind: 'number' as const, value },
          { sheet: 0, row: index + 1, col: 1, kind: 'text' as const, value: `${tag}${value}` },
        ]),
      ]],
    }),
    firstTag: 'A',
    secondTag: 'B',
    reinstallOnAltU: false,
  })
} else if (hostCase === 'color-async') {
  mountColorAsyncHost()
}
