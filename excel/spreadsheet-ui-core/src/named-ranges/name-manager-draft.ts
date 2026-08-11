import { atom, type Getter, type Setter } from '@einfach/core'
import { nextSessionId } from './primitives'
import { copyNamedRange } from './snapshots'
import { normalizeNamedRangeName } from './types'
import type {
  NamedRange,
  NamedRangeRefersTo,
  NamedRangeScope,
  NameManagerEditorState,
} from './types'

const CLOSED_EDITOR: NameManagerEditorState = Object.freeze({ status: 'closed' })

export type NameManagerKind = 'range' | 'value' | 'lambda'

export const nameManagerEditorAtom = atom<NameManagerEditorState>(CLOSED_EDITOR)
export const nameManagerSessionIdAtom = atom<number>(0)
export const nameManagerDraftGenerationSourceAtom = atom<number>(0)
const nameManagerKindDraftSourceAtom = atom<NameManagerKind>('range')
const nameManagerParamsDraftSourceAtom = atom<string>('')
const nameManagerRefersToDraftSourceAtom = atom<string>('')
const nameManagerNameDraftSourceAtom = atom<string>('')
const nameManagerScopeDraftSourceAtom = atom<string>('workbook')
const nameManagerSelectedEntrySourceAtom = atom<NamedRange | null>(null)

nameManagerEditorAtom.debugLabel = 'spreadsheet.namedRanges.editor'
nameManagerSessionIdAtom.debugLabel = 'spreadsheet.namedRanges.managerSessionId'
nameManagerDraftGenerationSourceAtom.debugLabel =
  'spreadsheet.namedRanges.managerDraftGenerationSource'

function bumpDraftGeneration(get: Getter, set: Setter): void {
  set(
    nameManagerDraftGenerationSourceAtom,
    nextSessionId(get(nameManagerDraftGenerationSourceAtom)),
  )
}

function draftTextAtom(source: ReturnType<typeof atom<string>>, label: string) {
  const result = atom(
    (get) => get(source),
    (get, set, value: string): void => {
      if (Object.is(get(source), value)) return
      set(source, value)
      bumpDraftGeneration(get, set)
    },
  )
  result.debugLabel = `spreadsheet.namedRanges.${label}`
  return result
}

export const nameManagerKindDraftAtom = atom(
  (get) => get(nameManagerKindDraftSourceAtom),
  (get, set, value: NameManagerKind): void => {
    if (Object.is(get(nameManagerKindDraftSourceAtom), value)) return
    set(nameManagerKindDraftSourceAtom, value)
    bumpDraftGeneration(get, set)
  },
)
export const nameManagerParamsDraftAtom = draftTextAtom(
  nameManagerParamsDraftSourceAtom,
  'paramsDraft',
)
export const nameManagerRefersToDraftAtom = draftTextAtom(
  nameManagerRefersToDraftSourceAtom,
  'refersToDraft',
)
export const nameManagerNameDraftAtom = draftTextAtom(nameManagerNameDraftSourceAtom, 'nameDraft')
export const nameManagerScopeDraftAtom = draftTextAtom(
  nameManagerScopeDraftSourceAtom,
  'scopeDraft',
)
export const nameManagerDraftGenerationAtom = atom((get) =>
  get(nameManagerDraftGenerationSourceAtom),
)
export const nameManagerSelectedEntryAtom = atom(
  (get) => get(nameManagerSelectedEntrySourceAtom),
  (get, set, value: NamedRange | null): void => {
    if (Object.is(get(nameManagerSelectedEntrySourceAtom), value)) return
    const snapshot = value === null ? null : copyNamedRange(value)
    if (value !== null && snapshot === null) return
    set(nameManagerSelectedEntrySourceAtom, snapshot)
    bumpDraftGeneration(get, set)
  },
)

nameManagerKindDraftAtom.debugLabel = 'spreadsheet.namedRanges.kindDraft'
nameManagerDraftGenerationAtom.debugLabel = 'spreadsheet.namedRanges.managerDraftGeneration'
nameManagerSelectedEntryAtom.debugLabel = 'spreadsheet.namedRanges.managerSelectedEntry'

export function resetNameManagerDraft(
  get: Getter,
  set: Setter,
  draft: NamedRange | undefined,
): void {
  if (draft === undefined) {
    set(nameManagerKindDraftSourceAtom, 'range')
    set(nameManagerParamsDraftSourceAtom, '')
    set(nameManagerRefersToDraftSourceAtom, '')
    set(nameManagerNameDraftSourceAtom, '')
    set(nameManagerScopeDraftSourceAtom, 'workbook')
  } else {
    set(nameManagerNameDraftSourceAtom, draft.name)
    set(
      nameManagerScopeDraftSourceAtom,
      draft.scope === 'workbook' ? 'workbook' : `sheet:${draft.scope.sheetId}`,
    )
    if (draft.refersTo.kind === 'range') {
      set(nameManagerKindDraftSourceAtom, 'range')
      set(nameManagerParamsDraftSourceAtom, '')
      set(nameManagerRefersToDraftSourceAtom, draft.refersTo.address)
    } else if (draft.refersTo.kind === 'constant') {
      set(nameManagerKindDraftSourceAtom, 'value')
      set(nameManagerParamsDraftSourceAtom, '')
      set(nameManagerRefersToDraftSourceAtom, draft.refersTo.value)
    } else {
      set(nameManagerKindDraftSourceAtom, 'lambda')
      set(nameManagerParamsDraftSourceAtom, draft.refersTo.params.join(', '))
      set(nameManagerRefersToDraftSourceAtom, draft.refersTo.body)
    }
  }
  bumpDraftGeneration(get, set)
}

export function managerDraftEntry(
  get: Getter,
  activeSheetId: string | undefined,
): NamedRange | null {
  const name = normalizeNamedRangeName(get(nameManagerNameDraftAtom))
  if (name === null) return null
  const normalizedScope = get(nameManagerScopeDraftAtom).trim()
  const scope: NamedRangeScope = normalizedScope.startsWith('sheet:')
    ? { sheetId: normalizedScope.slice('sheet:'.length).trim() }
    : normalizedScope === 'workbook'
      ? 'workbook'
      : { sheetId: normalizedScope }
  const editorDraft = get(nameManagerEditorAtom).draft
  const kind = get(nameManagerKindDraftAtom)
  let refersTo: NamedRangeRefersTo
  if (kind === 'range') {
    const value = get(nameManagerRefersToDraftAtom).trim()
    const separator = value.indexOf('!')
    const explicitSheetId = separator < 0 ? null : value.slice(0, separator).trim()
    const address = separator < 0 ? value : value.slice(separator + 1).trim()
    const fallback =
      editorDraft?.refersTo.kind === 'range'
        ? editorDraft.refersTo.sheetId
        : scope === 'workbook'
          ? (activeSheetId?.trim() ?? '')
          : scope.sheetId
    if ((explicitSheetId ?? fallback).length === 0 || address.length === 0) return null
    refersTo = { kind: 'range', sheetId: explicitSheetId ?? fallback, address }
  } else if (kind === 'value') {
    refersTo = { kind: 'constant', value: get(nameManagerRefersToDraftAtom).trim() }
  } else {
    const body = get(nameManagerRefersToDraftAtom).trim()
    if (body.length === 0) return null
    refersTo = {
      kind: 'lambda',
      params: get(nameManagerParamsDraftAtom)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      body: body.startsWith('=') ? body : `=${body}`,
    }
  }
  return copyNamedRange({ name, scope, refersTo })
}

export function closeNameManagerEditor(get: Getter, set: Setter): void {
  set(nameManagerSessionIdAtom, nextSessionId(get(nameManagerSessionIdAtom)))
  set(nameManagerEditorAtom, CLOSED_EDITOR)
  set(nameManagerSelectedEntrySourceAtom, null)
  resetNameManagerDraft(get, set, undefined)
}
