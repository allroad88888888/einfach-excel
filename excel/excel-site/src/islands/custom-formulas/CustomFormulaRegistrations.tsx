import { onCleanup, onMount } from 'solid-js'
import {
  registerCustomFormulaAtom,
  unregisterCustomFormulaAtom,
} from '@einfach/spreadsheet-ui-core'
import { useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'

const formulas = [
  { name: 'MYTAX', source: 'return Number(args[0]) * 0.2', paramLabels: ['amount'] },
  { name: 'GREET', source: "return 'Hello, ' + String(args[0] ?? '')", paramLabels: ['name'] },
  { name: 'CELSIUS', source: 'return (Number(args[0]) - 32) * 5 / 9', paramLabels: ['fahrenheit'] },
  {
    name: 'SLOWSQR',
    source: 'await new Promise((resolve) => setTimeout(resolve, 800)); return Number(args[0]) ** 2',
    paramLabels: ['n'],
    isAsync: true,
  },
]

/** Registers the scenario's real host functions for the lifetime of its workbook provider. */
export default function CustomFormulaRegistrations() {
  const store = useSpreadsheetUiStore()

  onMount(() => {
    for (const formula of formulas) store.setter(registerCustomFormulaAtom, formula)
    onCleanup(() => {
      for (const formula of formulas) store.setter(unregisterCustomFormulaAtom, formula.name)
    })
  })

  return null
}
