import { parseA1Cell } from '../name-box/address'
import type { RustWorkbookConnection } from '../rust-workbook'
import type {
  RustTextColumnRule,
  RustTextColumnType,
  RustTextColumnsNumberOptions,
  RustTextColumnsPreview,
  RustTextColumnsRequest,
} from '../rust-workbook/text-columns-commands'
import type { SelectionAuthorityWitness } from '../selection'

export interface TextColumnsDraft {
  kind: 'delimited' | 'fixedWidth'
  delimiters: string
  otherDelimiter: string
  mergeConsecutive: boolean
  qualifier: string | null
  breakpoints: string
  destination: string
  columnTypes: readonly RustTextColumnRule[]
  numberOptions: RustTextColumnsNumberOptions
}

export interface TextColumnsFileSource {
  readonly name: string
  readonly lines: readonly string[]
}

export interface TextColumnsPanelState {
  target: {
    sheetId: string
    source: RustTextColumnsRequest['source']
    connection: RustWorkbookConnection
    witness: SelectionAuthorityWitness
  } | null
  file: TextColumnsFileSource | null
  draft: TextColumnsDraft
  preview:
    | (RustTextColumnsPreview & {
        revision: number
        request: RustTextColumnsRequest
        tsv?: string
      })
    | null
  status: 'idle' | 'previewing' | 'applying'
  overwrite: boolean
  error: string | null
  columnNumber: string
}

export const CLOSED_TEXT_COLUMNS_PANEL: TextColumnsPanelState = {
  target: null,
  file: null,
  draft: {
    kind: 'delimited',
    delimiters: ',',
    otherDelimiter: '',
    mergeConsecutive: false,
    qualifier: '"',
    breakpoints: '2, 5',
    destination: '',
    columnTypes: [],
    numberOptions: { decimalSeparator: '.', groupSeparator: null, trailingMinus: false },
  },
  preview: null,
  status: 'idle',
  overwrite: false,
  error: null,
  columnNumber: '1',
}

export type TextColumnsDraftAction =
  | { type: 'draft'; patch: Partial<TextColumnsDraft> }
  | { type: 'overwrite'; value: boolean }
  | { type: 'delimiter'; value: string; enabled: boolean }
  | { type: 'columnNumber'; value: string }
  | { type: 'columnType'; kind: RustTextColumnType | 'preserve' }

export function requestFromTextColumnsDraft(
  state: TextColumnsPanelState,
): RustTextColumnsRequest | string {
  const { draft, target, file } = state
  if (!target) return 'Select a source column first.'
  if (!file && target.source.colStart !== target.source.colEnd)
    return 'Select one continuous column of cells.'
  const destination = parseA1Cell(draft.destination)
  if (!destination) return 'Enter a destination cell such as C1.'
  const breakpoints = draft.breakpoints.split(',').map((value) => Number(value.trim()))
  if (
    draft.kind === 'fixedWidth' &&
    (!/^\s*\d+(\s*,\s*\d+)*\s*$/.test(draft.breakpoints) ||
      breakpoints.some(
        (value, index) =>
          !Number.isSafeInteger(value) ||
          value <= 0 ||
          value > 0xffff_ffff ||
          (index > 0 && value <= breakpoints[index - 1]!),
      ))
  )
    return 'Enter increasing positive character positions, for example 2, 5.'
  const delimiters = draft.delimiters + draft.otherDelimiter
  if (draft.kind === 'delimited' && !delimiters) return 'Choose at least one delimiter.'
  return {
    sheetId: target.sheetId,
    source: target.source,
    destination,
    ...(draft.columnTypes.length ? { columnTypes: draft.columnTypes } : {}),
    ...(draft.numberOptions.decimalSeparator !== '.' ||
    draft.numberOptions.groupSeparator !== null ||
    draft.numberOptions.trailingMinus
      ? { numberOptions: draft.numberOptions }
      : {}),
    mode:
      draft.kind === 'fixedWidth'
        ? { kind: 'fixedWidth', breakpoints }
        : {
            kind: 'delimited',
            delimiters: [...new Set([...delimiters])],
            mergeConsecutive: draft.mergeConsecutive,
            qualifier: draft.qualifier,
          },
  }
}

export function applyTextColumnsDraftAction(
  state: TextColumnsPanelState,
  action: TextColumnsDraftAction,
):
  | { readonly ok: true; readonly next: TextColumnsPanelState }
  | { readonly ok: false; readonly error?: string } {
  if (action.type === 'columnNumber') {
    if (state.status !== 'idle') return { ok: false }
    return { ok: true, next: { ...state, columnNumber: action.value } }
  }
  if (action.type === 'columnType') {
    const column = Number(state.columnNumber) - 1
    if (!Number.isSafeInteger(column) || column < 0 || column >= 16_384)
      return { ok: false, error: 'Choose a source field number from 1 to 16384.' }
    const columnTypes = state.draft.columnTypes.filter((rule) => rule.column !== column)
    if (action.kind !== 'preserve') columnTypes.push({ column, kind: action.kind })
    columnTypes.sort((a, b) => a.column - b.column)
    return {
      ok: true,
      next: {
        ...state,
        draft: { ...state.draft, columnTypes },
        preview: null,
        status: 'idle',
        overwrite: false,
        error: null,
      },
    }
  }
  if (action.type === 'overwrite') {
    if (!state.preview || state.status !== 'idle') return { ok: false }
    return { ok: true, next: { ...state, overwrite: action.value } }
  }
  const patch =
    action.type === 'draft'
      ? action.patch
      : {
          delimiters: action.enabled
            ? state.draft.delimiters + action.value
            : state.draft.delimiters.split(action.value).join(''),
        }
  const resetTypes = [
    'kind',
    'delimiters',
    'otherDelimiter',
    'mergeConsecutive',
    'qualifier',
    'breakpoints',
  ].some((key) => key in patch)
  return {
    ok: true,
    next: {
      ...state,
      draft: { ...state.draft, ...patch, ...(resetTypes ? { columnTypes: [] } : {}) },
      preview: null,
      status: 'idle',
      overwrite: false,
      error: null,
    },
  }
}
