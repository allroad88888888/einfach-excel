import { atom } from '@einfach/core'
import type { PrintConfig } from './types'

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  manualPageBreaks: [],
  scale: { kind: 'percent', percent: 100 },
  orientation: 'portrait',
}

export const printConfigStateAtom = atom<Record<string, PrintConfig>>({})
printConfigStateAtom.debugLabel = 'spreadsheet.print.config'

export const printPreviewOpenAtom = atom(false)
printPreviewOpenAtom.debugLabel = 'spreadsheet.print.previewOpen'

/** Writes a confirmed engine-owned print configuration into the view cache. */
export const setPrintConfigAtom = atom(
  null,
  (_get, set, input: { sheetId: string; config: PrintConfig }) => {
    set(printConfigStateAtom, (previous) => ({ ...previous, [input.sheetId]: input.config }))
  },
)
setPrintConfigAtom.debugLabel = 'spreadsheet.print.setConfig'

export const clearPrintConfigAtom = atom(null, (_get, set, sheetId: string) => {
  set(printConfigStateAtom, (previous) => {
    const next = { ...previous }
    delete next[sheetId]
    return next
  })
})
clearPrintConfigAtom.debugLabel = 'spreadsheet.print.clearConfig'

export const togglePrintPreviewAtom = atom(null, (get, set) => {
  set(printPreviewOpenAtom, !get(printPreviewOpenAtom))
})
togglePrintPreviewAtom.debugLabel = 'spreadsheet.print.togglePreview'
