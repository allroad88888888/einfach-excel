import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { zoomBySheetAtom } from './state'

export const MIN_SHEET_ZOOM = 10
export const MAX_SHEET_ZOOM = 400
export const SHEET_ZOOM_STEP = 10
const DEFAULT_SHEET_ZOOM = 100

export type SheetZoomAction =
  | { readonly kind: 'set'; readonly percent: number }
  | { readonly kind: 'step'; readonly direction: 1 | -1 }
  | { readonly kind: 'reset' }

/** 当前工作表的缩放百分比；只是会话内视图状态，不进 Rust 数据和撤销历史。 */
export const activeSheetZoomAtom = atom((get) => {
  const sheetId = get(activeWorkbookSheetAtom)?.id
  return (sheetId === undefined ? undefined : get(zoomBySheetAtom)[sheetId]) ?? DEFAULT_SHEET_ZOOM
})
activeSheetZoomAtom.debugLabel = 'spreadsheet.zoom.activeSheet'

export function clampSheetZoom(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_SHEET_ZOOM
  return Math.min(MAX_SHEET_ZOOM, Math.max(MIN_SHEET_ZOOM, Math.round(percent)))
}

/** 步进对齐到 10% 网格：从 115% 放大得 120%，缩小得 110%。 */
function stepZoom(current: number, direction: 1 | -1): number {
  const aligned = direction > 0
    ? Math.floor(current / SHEET_ZOOM_STEP) * SHEET_ZOOM_STEP + SHEET_ZOOM_STEP
    : Math.ceil(current / SHEET_ZOOM_STEP) * SHEET_ZOOM_STEP - SHEET_ZOOM_STEP
  return clampSheetZoom(aligned)
}

export const setSheetZoomAtom = atom(null, (get, set, action: SheetZoomAction) => {
  const sheetId = get(activeWorkbookSheetAtom)?.id
  if (sheetId === undefined) return
  const current = get(activeSheetZoomAtom)
  const next = action.kind === 'reset' ? DEFAULT_SHEET_ZOOM
    : action.kind === 'set' ? clampSheetZoom(action.percent)
      : stepZoom(current, action.direction)
  if (next === current) return
  set(zoomBySheetAtom, { ...get(zoomBySheetAtom), [sheetId]: next })
})
setSheetZoomAtom.debugLabel = 'spreadsheet.zoom.set'
