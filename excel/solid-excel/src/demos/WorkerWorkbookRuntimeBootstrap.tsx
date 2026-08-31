import { useAtomValue } from '@einfach/solid'
import { onCleanup, onMount } from 'solid-js'
import {
  registerCustomFormulaAtom,
  selectCellAtom,
  selectionAtom,
  setWorkspaceActiveSheetAtom,
  unregisterCustomFormulaAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import { useSpreadsheetUiStore } from '../provider'
import { WorkerLazyProbeLogger } from './WorkerLazyProbeLogger'
import { WorkerWorkbookHost } from './WorkerWorkbookHost'
import { workerDemoSheets } from './worker-workbook-config'

const workerDemoFormulas = [
  { name: 'MYTAX', source: 'return Number(args[0]) * 0.2', paramLabels: ['amount'] },
  { name: 'GREET', source: "return 'Hello, ' + String(args[0] ?? '')", paramLabels: ['name'] },
  { name: 'CELSIUS', source: 'return (Number(args[0]) - 32) * 5 / 9', paramLabels: ['fahrenheit'] },
  {
    name: 'SUMSQ2',
    source:
      'const xs = Array.isArray(args[0]) ? args[0].flat() : [args[0]]; return xs.reduce((s,v)=>s+Number(v)*Number(v),0)',
    paramLabels: ['range'],
  },
  {
    name: 'SLOWTAX',
    source: 'await new Promise((r) => setTimeout(r, 800)); return Number(args[0]) * 0.2',
    isAsync: true,
    paramLabels: ['amount'],
  },
]

/** Provider-bound lifecycle bootstrap; it renders no DOM surface. */
export function WorkerWorkbookRuntimeBootstrap() {
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const activeSheetId = () => workspace().activeSheetId ?? workerDemoSheets[0].id

  onMount(() => {
    const sheetId = store.getter(workspaceSessionAtom).activeSheetId ?? workerDemoSheets[0].id
    if (!store.getter(workspaceSessionAtom).activeSheetId) {
      store.setter(setWorkspaceActiveSheetAtom, { sheetId: workerDemoSheets[0].id })
    }
    if (!store.getter(selectionAtom).sheetId) {
      store.setter(selectCellAtom, { sheetId, coord: { row: 0, col: 0 } })
    }
    for (const formula of workerDemoFormulas) store.setter(registerCustomFormulaAtom, formula)
    onCleanup(() => {
      for (const formula of workerDemoFormulas)
        store.setter(unregisterCustomFormulaAtom, formula.name)
    })
  })

  return (
    <>
      <WorkerLazyProbeLogger activeSheetId={activeSheetId} />
      <WorkerWorkbookHost activeSheetId={activeSheetId} />
    </>
  )
}
