import { createStore, type Store } from '@einfach/core'
import { editingSessionAtom, type SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetEditing, type SpreadsheetEditing } from '../src/use-spreadsheet-editing'

const backend = {} as SpreadsheetBackend

interface MountedEditing {
  readonly app: ReturnType<typeof createApp>
  readonly editing: SpreadsheetEditing
}

function mountEditing(store: Store): MountedEditing {
  let editing: SpreadsheetEditing | undefined
  const Capture = defineComponent({
    name: 'EditingCapture',
    setup: function EditingCaptureSetup() {
      editing = useSpreadsheetEditing()
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

  if (editing === undefined) throw new Error('Editing hook was not mounted.')
  return { app, editing }
}

function startInput(sheetId = 'sheet-1') {
  return { sheetId, cell: { row: 4, col: 6 }, draft: '=SUM(A1:A3)', source: 'cell' } as const
}

describe('useSpreadsheetEditing', () => {
  it('starts a session, updates its draft, and stages a core commit', async () => {
    const store = createStore()
    const mounted = mountEditing(store)

    const session = mounted.editing.start(startInput())
    await nextTick()

    expect(session).toMatchObject({ status: 'drafting', draft: '=SUM(A1:A3)' })
    expect(mounted.editing.session.value).toMatchObject({
      status: 'drafting',
      source: { sheetId: 'sheet-1', cell: { row: 4, col: 6 }, source: 'cell' },
    })
    expect(mounted.editing.draft.value).toBe('=SUM(A1:A3)')

    mounted.editing.setDraft({ draft: '=SUM(A1:A4)', source: 'formula-bar' })
    await nextTick()

    expect(mounted.editing.draft.value).toBe('=SUM(A1:A4)')
    expect(mounted.editing.session.value.source?.source).toBe('formula-bar')
    expect(mounted.editing.commit({ input: '=SUM(A1:A5)', move: 'down' })).toEqual({
      type: 'editing.commit',
      sheetId: 'sheet-1',
      cell: { row: 4, col: 6 },
      source: 'formula-bar',
      input: '=SUM(A1:A5)',
      move: 'down',
    })
    await nextTick()
    expect(mounted.editing.draft.value).toBe('=SUM(A1:A5)')
    mounted.app.unmount()
  })

  it('cancels the current core-owned session', async () => {
    const store = createStore()
    const mounted = mountEditing(store)
    mounted.editing.start(startInput())

    expect(mounted.editing.cancel()).toEqual({
      type: 'editing.cancel',
      sheetId: 'sheet-1',
      cell: { row: 4, col: 6 },
      source: 'cell',
    })
    await nextTick()
    expect(mounted.editing.session.value).toEqual({
      status: 'cancelled',
      source: null,
      draft: '',
      diagnostic: null,
    })
    expect(mounted.editing.draft.value).toBe('')
    mounted.app.unmount()
  })

  it('uses the nearest provider store without changing a sibling editor', async () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const first = mountEditing(firstStore)
    const second = mountEditing(secondStore)

    first.editing.start(startInput('first'))
    await nextTick()

    expect(first.editing.session.value.source?.sheetId).toBe('first')
    expect(second.editing.session.value).toEqual({
      status: 'idle',
      source: null,
      draft: '',
      diagnostic: null,
    })
    expect(secondStore.getter(editingSessionAtom)).toEqual(second.editing.session.value)
    first.app.unmount()
    second.app.unmount()
  })
})
