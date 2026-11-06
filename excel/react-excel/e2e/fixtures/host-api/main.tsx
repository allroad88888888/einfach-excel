import { createRoot } from 'react-dom/client'
import { createStore } from '@einfach/core'
import { createWorkbookApi, type RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import { Spreadsheet, type WorkbookUiOptions } from '../../../src'
import { actions, target } from './actions'

const definition: RustWorkbookDefinition = {
  title: 'Host API',
  sheets: ['main', 'other'].map((id, index) => ({
    id,
    index,
    name: id === 'main' ? 'Main' : 'Other',
    rowCount: 200,
    colCount: 20,
  })),
  createImportChunks: () => [
    [
      { sheet: 0, row: 0, col: 0, kind: 'text', value: 'Main' },
      { sheet: 1, row: 0, col: 0, kind: 'text', value: 'Numbers' },
      { sheet: 1, row: 1, col: 0, kind: 'number', value: 3 },
      { sheet: 1, row: 2, col: 0, kind: 'number', value: 1 },
      { sheet: 1, row: 3, col: 0, kind: 'number', value: 2 },
      { sheet: 1, row: 2, col: 2, kind: 'text', value: 'Target' },
      { sheet: 1, row: 2, col: 3, kind: 'text', value: 'Neighbor' },
    ],
  ],
}
const store = createStore(),
  api = createWorkbookApi(store)
const root = createRoot(document.getElementById('root')!)
let ui: WorkbookUiOptions = {}
const renderer =
  new URLSearchParams(location.search).get('renderer') === 'canvas' ? 'canvas' : 'dom'
let painted = 0
function render() {
  root.render(
    <Spreadsheet
      definition={definition}
      store={store}
      renderer={renderer}
      ui={ui}
      cellPaintHooks={
        renderer === 'canvas'
          ? {
              after: ({ context, bounds, range }) => {
                painted++
                if (range.rowStart === 0 && range.colStart === 0) {
                  context.fillStyle = '#12ab34'
                  context.fillRect(bounds.x + 5, bounds.y + 5, 8, 8)
                }
              },
            }
          : undefined
      }
    />,
  )
}
render()
const counts = { change: 0, selection: 0, sheet: 0, editing: 0, structure: 0 }
let lastChange: unknown = null
const stops = [
  api.onChange((value) => {
    counts.change++
    lastChange = value
  }),
  api.onSelectionChange(() => counts.selection++),
  api.onActiveSheetChange(() => counts.sheet++),
  api.onEditingChange(() => counts.editing++),
  api.onStructureChange(() => counts.structure++),
]
const controls = {
  ...actions(api),
  Inspect: async () => ({
    display: await api.readDisplay(target),
    document: api.getDocument(),
    selection: api.getSelection(),
    editing: api.getEditing(),
    counts: { ...counts },
    lastChange,
    painted,
  }),
  'Hide controls': () => {
    ui = {
      ribbon: { hidden: ['format.bold', 'history.undo'] },
      rowHeaderWidth: 80,
      columnHeaderHeight: 40,
    }
    render()
    return { status: 'ok' }
  },
  'Show controls': () => {
    ui = {}
    render()
    return { status: 'ok' }
  },
  'Cancel changes': () => {
    api.hooks({ beforeChange: () => false })
    return { status: 'ok' }
  },
  'Allow changes': () => {
    api.hooks({})
    return { status: 'ok' }
  },
  Unsubscribe: () => {
    stops.forEach((stop) => stop())
    return { status: 'ok' }
  },
}
for (const [label, action] of Object.entries(controls)) {
  const button = document.createElement('button')
  button.textContent = label
  // Host toolbar actions keep the editor focused, as the built-in formatting toolbar does.
  button.onpointerdown = event => event.preventDefault()
  button.onclick = async () => {
    const output = document.getElementById('result')!
    output.textContent = 'pending'
    try {
      output.textContent = JSON.stringify(await action())
    } catch (error) {
      output.textContent = JSON.stringify({ failure: String(error) })
    }
  }
  document.getElementById('controls')!.append(button)
}

// The browser fixture exposes its host facade for interactive debugging.
export { api }
