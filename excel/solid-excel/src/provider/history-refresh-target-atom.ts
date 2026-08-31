import { atom } from '@einfach/core'

/** The Store-scoped history target used when retrying a failed refresh. */
export const historyRefreshTargetSheetIdAtom = atom<string | null>(null)
historyRefreshTargetSheetIdAtom.debugLabel = 'spreadsheet.vnext.history.refreshTargetSheetId'
