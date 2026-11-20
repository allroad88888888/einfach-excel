import { atom } from '@einfach/core'
import type { SpreadsheetCellFormat } from '../contracts'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { runSelectionMutationAtom } from './selection-mutation-command'
import { closeToolbarSurfaceAtom } from './surface-state'
import {
  DEFAULT_WORKBOOK_THEME_ID,
  workbookThemeIdAtom,
  type WorkbookThemeId,
} from './workbook-theme-state'

export { DEFAULT_WORKBOOK_THEME_ID, workbookThemeIdAtom, type WorkbookThemeId }

export interface WorkbookThemeDefinition {
  readonly id: WorkbookThemeId
  readonly headingFont: string
  readonly headingColor: string
  readonly accents: readonly [string, string, string, string, string, string]
}

export const WORKBOOK_THEMES: readonly WorkbookThemeDefinition[] = Object.freeze([
  Object.freeze({
    id: 'office',
    headingFont: 'Calibri',
    headingColor: '#1f4e79',
    accents: ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'] as const,
  }),
  Object.freeze({
    id: 'facet',
    headingFont: 'Trebuchet MS',
    headingColor: '#2c3c43',
    accents: ['#90c226', '#54a021', '#e6b91e', '#e76618', '#c42f1a', '#918655'] as const,
  }),
  Object.freeze({
    id: 'integral',
    headingFont: 'Segoe UI',
    headingColor: '#104862',
    accents: ['#1cade4', '#2683c6', '#27ced7', '#42ba97', '#3e8853', '#62a39f'] as const,
  }),
  Object.freeze({
    id: 'slate',
    headingFont: 'Georgia',
    headingColor: '#1e293b',
    accents: ['#475569', '#0f766e', '#b45309', '#4f46e5', '#be123c', '#0369a1'] as const,
  }),
  Object.freeze({
    id: 'warm',
    headingFont: 'Cambria',
    headingColor: '#431407',
    accents: ['#c2410c', '#b45309', '#15803d', '#0f766e', '#7c2d12', '#a16207'] as const,
  }),
])

export function getWorkbookTheme(id: WorkbookThemeId): WorkbookThemeDefinition {
  return WORKBOOK_THEMES.find((theme) => theme.id === id) ?? WORKBOOK_THEMES[0]!
}

/** Blends a #RRGGBB hex color toward white by `amount` in [0, 1] for soft theme tints. */
export function tintHexColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  if (!/^[\da-f]{6}$/i.test(clean) || !Number.isFinite(amount)) return hex.toLowerCase()
  const factor = Math.max(0, Math.min(1, amount))
  const mix = (offset: number) => {
    const channel = Number.parseInt(clean.slice(offset, offset + 2), 16)
    const blended = Math.round(channel + (255 - channel) * factor)
    return blended.toString(16).padStart(2, '0')
  }
  return `#${mix(0)}${mix(2)}${mix(4)}`
}

export const workbookThemeAtom = atom((get): WorkbookThemeDefinition =>
  getWorkbookTheme(get(workbookThemeIdAtom)),
)
workbookThemeAtom.debugLabel = 'spreadsheet.toolbar.workbookTheme'

export const setWorkbookThemeAtom = atom(null, (_get, set, themeId: WorkbookThemeId): void => {
  if (!WORKBOOK_THEMES.some((theme) => theme.id === themeId)) return
  set(workbookThemeIdAtom, themeId)
})
setWorkbookThemeAtom.debugLabel = 'spreadsheet.toolbar.setWorkbookTheme'

export type CellStylePresetId =
  | 'normal'
  | 'good'
  | 'bad'
  | 'neutral'
  | 'input'
  | 'output'
  | 'calculation'
  | 'note'
  | 'warning'
  | 'explanatory'
  | 'title'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'total'
  | 'accent-1'
  | 'accent-2'
  | 'accent-3'
  | 'accent-4'
  | 'accent-5'
  | 'accent-6'
  | 'accent-1-soft'
  | 'accent-2-soft'
  | 'accent-3-soft'
  | 'accent-4-soft'
  | 'accent-5-soft'
  | 'accent-6-soft'

export interface CellStylePatch {
  readonly format: SpreadsheetCellFormat
  readonly clearFormatFields?: readonly (keyof SpreadsheetCellFormat)[]
}

const NORMAL_CLEAR_FIELDS: readonly (keyof SpreadsheetCellFormat)[] = [
  'bgColor',
  'fill',
  'fgColor',
  'fontFamily',
  'fontSize',
  'borders',
]

const SOLID_BORDERLESS_CLEAR: readonly (keyof SpreadsheetCellFormat)[] = [
  'fill',
  'fontFamily',
  'fontSize',
  'borders',
]

const SOLID_BOXED_CLEAR: readonly (keyof SpreadsheetCellFormat)[] = [
  'fill',
  'fontFamily',
  'fontSize',
]

const UNSHADED_BORDERLESS_CLEAR: readonly (keyof SpreadsheetCellFormat)[] = [
  'bgColor',
  'fill',
  'fontFamily',
  'fontSize',
  'borders',
]

const HEADING_BORDERED_CLEAR: readonly (keyof SpreadsheetCellFormat)[] = ['bgColor', 'fill']

const HEADING_PLAIN_CLEAR: readonly (keyof SpreadsheetCellFormat)[] = [
  'bgColor',
  'fill',
  'borders',
]

const TOTAL_CLEAR: readonly (keyof SpreadsheetCellFormat)[] = [
  'bgColor',
  'fill',
  'fontFamily',
  'fontSize',
]

const PLAIN_DECORATION = {
  underline: false,
  strikethrough: false,
} as const

/** Resolves a built-in cell style preset against the active workbook theme. */
export function resolveCellStylePreset(
  presetId: CellStylePresetId,
  theme: WorkbookThemeDefinition,
): CellStylePatch {
  const accent0 = theme.accents[0]
  switch (presetId) {
    case 'normal':
      return {
        format: { bold: false, italic: false, ...PLAIN_DECORATION },
        clearFormatFields: NORMAL_CLEAR_FIELDS,
      }
    case 'good':
      return {
        format: {
          bgColor: '#c6efce',
          fgColor: '#006100',
          bold: false,
          italic: false,
          ...PLAIN_DECORATION,
        },
        clearFormatFields: SOLID_BORDERLESS_CLEAR,
      }
    case 'bad':
      return {
        format: {
          bgColor: '#ffc7ce',
          fgColor: '#9c0006',
          bold: false,
          italic: false,
          ...PLAIN_DECORATION,
        },
        clearFormatFields: SOLID_BORDERLESS_CLEAR,
      }
    case 'neutral':
      return {
        format: {
          bgColor: '#ffeb9c',
          fgColor: '#9c6500',
          bold: false,
          italic: false,
          ...PLAIN_DECORATION,
        },
        clearFormatFields: SOLID_BORDERLESS_CLEAR,
      }
    case 'input':
      return {
        format: {
          bgColor: '#ffcc99',
          fgColor: '#3f3f76',
          bold: false,
          italic: false,
          ...PLAIN_DECORATION,
          borders: {
            top: { style: 'thin', color: '#7f7f7f' },
            right: { style: 'thin', color: '#7f7f7f' },
            bottom: { style: 'thin', color: '#7f7f7f' },
            left: { style: 'thin', color: '#7f7f7f' },
          },
        },
        clearFormatFields: SOLID_BOXED_CLEAR,
      }
    case 'output':
      return {
        format: {
          bgColor: '#f2f2f2',
          fgColor: '#3f3f3f',
          bold: true,
          italic: false,
          ...PLAIN_DECORATION,
          borders: {
            top: { style: 'thin', color: '#3f3f3f' },
            right: { style: 'thin', color: '#3f3f3f' },
            bottom: { style: 'thin', color: '#3f3f3f' },
            left: { style: 'thin', color: '#3f3f3f' },
          },
        },
        clearFormatFields: SOLID_BOXED_CLEAR,
      }
    case 'calculation':
      return {
        format: {
          bgColor: '#f2f2f2',
          fgColor: '#fa7d00',
          bold: true,
          italic: false,
          ...PLAIN_DECORATION,
          borders: {
            top: { style: 'thin', color: '#7f7f7f' },
            right: { style: 'thin', color: '#7f7f7f' },
            bottom: { style: 'thin', color: '#7f7f7f' },
            left: { style: 'thin', color: '#7f7f7f' },
          },
        },
        clearFormatFields: SOLID_BOXED_CLEAR,
      }
    case 'note':
      return {
        format: {
          bgColor: '#ffffcc',
          fgColor: '#1f2937',
          bold: false,
          italic: false,
          ...PLAIN_DECORATION,
          borders: {
            top: { style: 'thin', color: '#b2b2b2' },
            right: { style: 'thin', color: '#b2b2b2' },
            bottom: { style: 'thin', color: '#b2b2b2' },
            left: { style: 'thin', color: '#b2b2b2' },
          },
        },
        clearFormatFields: SOLID_BOXED_CLEAR,
      }
    case 'warning':
      return {
        format: { fgColor: '#c00000', bold: true, italic: false, ...PLAIN_DECORATION },
        clearFormatFields: UNSHADED_BORDERLESS_CLEAR,
      }
    case 'explanatory':
      return {
        format: { fgColor: '#7f7f7f', italic: true, bold: false, ...PLAIN_DECORATION },
        clearFormatFields: UNSHADED_BORDERLESS_CLEAR,
      }
    case 'title':
      return {
        format: {
          fontFamily: theme.headingFont,
          fontSize: 18,
          bold: true,
          italic: false,
          ...PLAIN_DECORATION,
          fgColor: theme.headingColor,
        },
        clearFormatFields: HEADING_PLAIN_CLEAR,
      }
    case 'heading-1':
      return {
        format: {
          fontFamily: theme.headingFont,
          fontSize: 15,
          bold: true,
          italic: false,
          ...PLAIN_DECORATION,
          fgColor: theme.headingColor,
          borders: { bottom: { style: 'thick', color: accent0 } },
        },
        clearFormatFields: HEADING_BORDERED_CLEAR,
      }
    case 'heading-2':
      return {
        format: {
          fontFamily: theme.headingFont,
          fontSize: 13,
          bold: true,
          italic: false,
          ...PLAIN_DECORATION,
          fgColor: theme.headingColor,
          borders: { bottom: { style: 'medium', color: tintHexColor(accent0, 0.35) } },
        },
        clearFormatFields: HEADING_BORDERED_CLEAR,
      }
    case 'heading-3':
      return {
        format: {
          fontFamily: theme.headingFont,
          fontSize: 11,
          bold: true,
          italic: false,
          ...PLAIN_DECORATION,
          fgColor: theme.headingColor,
          borders: { bottom: { style: 'thin', color: tintHexColor(accent0, 0.5) } },
        },
        clearFormatFields: HEADING_BORDERED_CLEAR,
      }
    case 'heading-4':
      return {
        format: {
          fontFamily: theme.headingFont,
          fontSize: 11,
          bold: true,
          italic: false,
          ...PLAIN_DECORATION,
          fgColor: theme.headingColor,
        },
        clearFormatFields: HEADING_PLAIN_CLEAR,
      }
    case 'total':
      return {
        format: {
          bold: true,
          italic: false,
          ...PLAIN_DECORATION,
          fgColor: '#000000',
          borders: {
            top: { style: 'thin', color: accent0 },
            bottom: { style: 'double', color: accent0 },
          },
        },
        clearFormatFields: TOTAL_CLEAR,
      }
    default: {
      const soft = presetId.endsWith('-soft')
      const idx = Number(presetId.replace('accent-', '').replace('-soft', '')) - 1
      const accent = theme.accents[idx] ?? accent0
      if (soft) {
        return {
          format: {
            bgColor: tintHexColor(accent, 0.78),
            fgColor: '#1f2937',
            bold: false,
            italic: false,
            ...PLAIN_DECORATION,
          },
          clearFormatFields: SOLID_BORDERLESS_CLEAR,
        }
      }
      return {
        format: {
          bgColor: accent,
          fgColor: '#ffffff',
          bold: false,
          italic: false,
          ...PLAIN_DECORATION,
        },
        clearFormatFields: SOLID_BORDERLESS_CLEAR,
      }
    }
  }
}

interface CellStylesPanelBacking {
  readonly connection: RustWorkbookConnection | null
  readonly open: boolean
  readonly busy: boolean
  readonly error: string | null
}

const CLOSED_PANEL: CellStylesPanelBacking = Object.freeze({
  connection: null,
  open: false,
  busy: false,
  error: null,
})

const panelBackingAtom = atom<CellStylesPanelBacking>(CLOSED_PANEL)
panelBackingAtom.debugLabel = 'spreadsheet.toolbar.cellStylesPanelBacking'

export const cellStylesPanelAtom = atom((get) => {
  const state = get(panelBackingAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!state.open || state.connection !== connection) {
    return { open: false, busy: false, error: null as string | null }
  }
  return { open: true, busy: state.busy, error: state.error }
})
cellStylesPanelAtom.debugLabel = 'spreadsheet.toolbar.cellStylesPanel'

export type CellStylesAction =
  | 'open'
  | 'close'
  | { readonly type: 'theme'; readonly themeId: WorkbookThemeId }
  | { readonly type: 'apply'; readonly presetId: CellStylePresetId }

/** Controls the Cell Styles & Themes gallery and applies presets atomically. */
export const runCellStylesAtom = atom(
  null,
  async (get, set, action: CellStylesAction): Promise<boolean> => {
    if (get(panelBackingAtom).busy) return false
    if (action === 'close') {
      set(panelBackingAtom, CLOSED_PANEL)
      return true
    }
    const connection = get(rustWorkbookConnectionAtom)
    if (!connection) return false
    if (action === 'open') {
      if (get(editingSessionAtom).source !== null) return false
      set(closeToolbarSurfaceAtom)
      set(panelBackingAtom, { connection, open: true, busy: false, error: null })
      return true
    }
    if (action.type === 'theme') {
      set(setWorkbookThemeAtom, action.themeId)
      return true
    }
    if (get(editingSessionAtom).source !== null) return false
    const theme = get(workbookThemeAtom)
    const patch = resolveCellStylePreset(action.presetId, theme)
    const pending: CellStylesPanelBacking = { connection, open: true, busy: true, error: null }
    set(panelBackingAtom, pending)
    await Promise.resolve()
    if (get(panelBackingAtom) === pending) set(panelBackingAtom, pending)
    const outcome = await set(runSelectionMutationAtom, { kind: 'format', ...patch })
    if (get(rustWorkbookConnectionAtom) !== connection || get(panelBackingAtom) !== pending) {
      return false
    }
    if (outcome === 'completed') {
      set(panelBackingAtom, CLOSED_PANEL)
      return true
    }
    set(panelBackingAtom, {
      connection,
      open: true,
      busy: false,
      error: 'Could not apply cell style to the current selection.',
    })
    return false
  },
)
runCellStylesAtom.debugLabel = 'spreadsheet.toolbar.runCellStyles'
