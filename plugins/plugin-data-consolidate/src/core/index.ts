import { atom } from '@einfach/core'
import {
  applyConsolidateAtom,
  consolidateContextAtom,
  previewConsolidateAtom,
  type ConsolidateContext,
  type ConsolidateFunction,
  type ConsolidatePreviewResult,
} from '@einfach-excel/spreadsheet-ui-core'

export interface ConsolidateDraft {
  readonly function: ConsolidateFunction
  readonly referenceInput: string
  readonly references: readonly string[]
  readonly destination: string
  readonly topRow: boolean
  readonly leftColumn: boolean
  readonly createLinks: boolean
}

export interface ConsolidatePanelState {
  readonly context: ConsolidateContext
  readonly draft: ConsolidateDraft
  readonly preview: ConsolidatePreviewResult | null
  readonly confirmOverwrite: boolean
  readonly busy: boolean
  readonly error: string | null
}

type Action =
  | 'open'
  | 'close'
  | 'addReference'
  | 'preview'
  | 'apply'
  | { readonly removeIndex: number }
  | { readonly patch: Partial<ConsolidateDraft> }
  | { readonly confirmOverwrite: boolean }

const MAX_SOURCES = 32

const stateAtom = atom<ConsolidatePanelState | null>(null)

export const consolidatePanelAtom = atom((get) => {
  const state = get(stateAtom)
  const context = get(consolidateContextAtom)
  return state &&
    context?.connection === state.context.connection &&
    context.sheetId === state.context.sheetId
    ? state
    : null
})

function resetPreview(
  panel: ConsolidatePanelState,
  draft: ConsolidateDraft,
): ConsolidatePanelState {
  return { ...panel, draft, preview: null, confirmOverwrite: false, error: null }
}

export const configureConsolidateAtom = atom(
  null,
  (get, set, action: Action): boolean | Promise<boolean> => {
    const panel = get(consolidatePanelAtom)
    if (action === 'close') {
      set(stateAtom, null)
      return true
    }
    if (panel?.busy) return false
    const context = get(consolidateContextAtom)
    if (!context || context.disabled) return false

    if (action === 'open') {
      if (panel) return false
      set(stateAtom, {
        context,
        draft: {
          function: 'sum',
          referenceInput: '',
          references: [],
          destination: context.destinationA1,
          topRow: true,
          leftColumn: true,
          createLinks: false,
        },
        preview: null,
        confirmOverwrite: false,
        busy: false,
        error: null,
      })
      return true
    }
    if (!panel) return false

    if (typeof action === 'object' && 'patch' in action) {
      const nextDraft = { ...panel.draft, ...action.patch }
      const onlyInputChanged =
        Object.keys(action.patch).length === 1 && 'referenceInput' in action.patch
      set(
        stateAtom,
        onlyInputChanged
          ? { ...panel, draft: nextDraft, error: null }
          : resetPreview(panel, nextDraft),
      )
      return true
    }

    if (typeof action === 'object' && 'confirmOverwrite' in action) {
      set(stateAtom, { ...panel, confirmOverwrite: action.confirmOverwrite, error: null })
      return true
    }

    if (action === 'addReference') {
      const value = panel.draft.referenceInput.trim()
      if (!value) {
        set(stateAtom, {
          ...panel,
          error: 'Enter valid worksheet references for every source range.',
        })
        return false
      }
      if (panel.draft.references.length >= MAX_SOURCES) {
        set(stateAtom, { ...panel, error: 'Add between 1 and 32 source ranges to consolidate.' })
        return false
      }
      set(
        stateAtom,
        resetPreview(panel, {
          ...panel.draft,
          referenceInput: '',
          references: [...panel.draft.references, value],
        }),
      )
      return true
    }

    if (typeof action === 'object' && 'removeIndex' in action) {
      const next = panel.draft.references.filter((_, index) => index !== action.removeIndex)
      set(stateAtom, resetPreview(panel, { ...panel.draft, references: next }))
      return true
    }

    if (action === 'preview') {
      const typed = panel.draft.referenceInput.trim()
      const references = typed ? [...panel.draft.references, typed] : panel.draft.references
      if (references.length === 0 || references.length > MAX_SOURCES) {
        set(stateAtom, { ...panel, error: 'Add between 1 and 32 source ranges to consolidate.' })
        return false
      }
      const nextDraft = typed
        ? { ...panel.draft, referenceInput: '', references }
        : panel.draft
      const pending: ConsolidatePanelState = {
        ...panel,
        context,
        draft: nextDraft,
        preview: null,
        confirmOverwrite: false,
        busy: true,
        error: null,
      }
      set(stateAtom, pending)
      return (async () => {
        try {
          const request = set(previewConsolidateAtom, {
            function: nextDraft.function,
            references,
            destination: nextDraft.destination,
            topRow: nextDraft.topRow,
            leftColumn: nextDraft.leftColumn,
            createLinks: nextDraft.createLinks,
          })
          await Promise.resolve()
          if (get(consolidatePanelAtom) === pending) set(stateAtom, pending)
          const preview = await request
          if (get(consolidatePanelAtom) !== pending) {
            if (get(stateAtom) === pending) set(stateAtom, null)
            return false
          }
          set(stateAtom, { ...pending, preview, busy: false, error: null })
          return true
        } catch (error) {
          if (get(consolidatePanelAtom) === pending) {
            set(stateAtom, {
              ...pending,
              busy: false,
              preview: null,
              error: error instanceof Error ? error.message : String(error),
            })
          } else if (get(stateAtom) === pending) {
            set(stateAtom, null)
          }
          return false
        }
      })()
    }

    if (!panel.preview) return false
    const pending: ConsolidatePanelState = { ...panel, context, busy: true, error: null }
    set(stateAtom, pending)
    const preview = panel.preview
    const confirmOverwrite = panel.confirmOverwrite
    return (async () => {
      try {
        const request = set(applyConsolidateAtom, { preview, confirmOverwrite })
        await Promise.resolve()
        if (get(consolidatePanelAtom) === pending) set(stateAtom, pending)
        await request
        if (get(consolidatePanelAtom) !== pending) {
          if (get(stateAtom) === pending) set(stateAtom, null)
          return false
        }
        set(stateAtom, null)
        return true
      } catch (error) {
        if (get(consolidatePanelAtom) === pending) {
          set(stateAtom, {
            ...pending,
            busy: false,
            error: error instanceof Error ? error.message : String(error),
          })
        } else if (get(stateAtom) === pending) {
          set(stateAtom, null)
        }
        return false
      }
    })()
  },
)

stateAtom.debugLabel = 'plugin.dataConsolidate.state'
consolidatePanelAtom.debugLabel = 'plugin.dataConsolidate.panel'
configureConsolidateAtom.debugLabel = 'plugin.dataConsolidate.configure'
