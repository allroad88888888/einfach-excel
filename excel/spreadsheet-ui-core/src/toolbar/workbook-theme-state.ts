import { atom } from '@einfach/core'

export type WorkbookThemeId = 'office' | 'facet' | 'integral' | 'slate' | 'warm'

export const DEFAULT_WORKBOOK_THEME_ID: WorkbookThemeId = 'office'

/** Active workbook theme ID; session view/palette state reset on new workbook load. */
export const workbookThemeIdAtom = atom<WorkbookThemeId>(DEFAULT_WORKBOOK_THEME_ID)
workbookThemeIdAtom.debugLabel = 'spreadsheet.toolbar.workbookThemeId'
