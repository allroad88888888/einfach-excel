import { createStore, type Store } from '@einfach/core'
import {
  formulaBarStateAtom,
  type FormulaBarSyncInput,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import {
  useSpreadsheetFormulaBar,
  type SpreadsheetFormulaBar,
} from '../src/use-spreadsheet-formula-bar'

const backend = {} as SpreadsheetBackend

interface MountedFormulaBar {
  readonly app: ReturnType<typeof createApp>
  readonly formulaBar: SpreadsheetFormulaBar
}

function mountFormulaBar(store: Store): MountedFormulaBar {
  let formulaBar: SpreadsheetFormulaBar | undefined
  const Capture = defineComponent({
    name: 'FormulaBarCapture',
    setup: function FormulaBarCaptureSetup() {
      formulaBar = useSpreadsheetFormulaBar()
      return () => null
    },
  })
  const Root = defineComponent({
    setup() {
      return () => h(SpreadsheetUiProvider, { backend, store }, { default: () => h(Capture) })
    },
  })
  const app = createApp(Root)
  app.mount(document.createElement('div'))

  if (formulaBar === undefined) throw new Error('Formula-bar hook was not mounted.')
  return { app, formulaBar }
}

function syncInput(sheetId = 'sheet-1'): FormulaBarSyncInput {
  return {
    sheetId,
    cell: { row: 4, col: 6 },
    draft: '=SUM(A1:A3)',
    source: 'selection',
    revision: 7,
  }
}

describe('useSpreadsheetFormulaBar', () => {
  it('reactively reads the provider-owned formula-bar state and draft', async () => {
    const store = createStore()
    const mounted = mountFormulaBar(store)

    mounted.formulaBar.sync(syncInput())
    await nextTick()

    expect(mounted.formulaBar.state.value).toMatchObject({
      status: 'idle',
      sheetId: 'sheet-1',
      cell: { row: 4, col: 6 },
      draft: '=SUM(A1:A3)',
      revision: 7,
    })
    expect(mounted.formulaBar.draft.value).toBe('=SUM(A1:A3)')
    mounted.app.unmount()
  })

  it('forwards formula-bar commands through the provider store', async () => {
    const store = createStore()
    const mounted = mountFormulaBar(store)

    mounted.formulaBar.sync(syncInput())
    mounted.formulaBar.focus()
    mounted.formulaBar.setDraft('=A1+2')
    mounted.formulaBar.setDiagnostic({
      code: 'FORMULA_WARNING',
      message: 'Check this reference.',
      level: 'warning',
    })
    mounted.formulaBar.setError({ code: 'INVALID_FORMULA', message: 'Invalid formula.' })
    await nextTick()

    expect(mounted.formulaBar.draft.value).toBe('=A1+2')
    expect(mounted.formulaBar.state.value).toMatchObject({
      status: 'error',
      diagnostic: { code: 'FORMULA_WARNING' },
      error: { code: 'INVALID_FORMULA' },
    })
    mounted.formulaBar.setError(null)
    mounted.formulaBar.focus(false)
    await nextTick()
    expect(mounted.formulaBar.state.value).toMatchObject({
      status: 'idle',
      focused: false,
      error: null,
    })
    mounted.app.unmount()
  })

  it('keeps sibling provider formula bars isolated', async () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const first = mountFormulaBar(firstStore)
    const second = mountFormulaBar(secondStore)

    first.formulaBar.sync(syncInput('first'))
    first.formulaBar.setDraft('=A1')
    await nextTick()

    expect(first.formulaBar.state.value).toMatchObject({ sheetId: 'first', draft: '=A1' })
    expect(second.formulaBar.state.value).toMatchObject({ sheetId: null, draft: '' })
    expect(secondStore.getter(formulaBarStateAtom)).toEqual(second.formulaBar.state.value)
    first.app.unmount()
    second.app.unmount()
  })

  it('unsubscribes both formula-bar readers when its component unmounts', () => {
    const backingStore = createStore()
    let unsubscribeCalls = 0
    const store = Object.create(backingStore) as Store
    Object.defineProperty(store, 'sub', {
      value(atom: Parameters<Store['sub']>[0], listener: Parameters<Store['sub']>[1]) {
        const unsubscribe = backingStore.sub(atom, listener)
        return () => {
          unsubscribeCalls += 1
          unsubscribe()
        }
      },
    })
    const mounted = mountFormulaBar(store)

    mounted.app.unmount()

    expect(unsubscribeCalls).toBe(2)
  })
})
