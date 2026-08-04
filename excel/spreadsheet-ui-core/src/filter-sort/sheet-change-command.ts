import { atom } from '@einfach/core'
import { closeFilterDropdownAtom } from './basic-commands'
import { filterDropdownAtom, filterSortCanCloseAtom } from './projection-atoms'
export const notifyActiveSheetChangedAtom = atom((get) => get(filterDropdownAtom), (get, set, nextSheetId: string | null) => { const dropdown = get(filterDropdownAtom); if (dropdown.status !== 'open' || dropdown.sheetId === nextSheetId || !get(filterSortCanCloseAtom)) return; set(closeFilterDropdownAtom) }); notifyActiveSheetChangedAtom.debugLabel = 'spreadsheet.filterSort.notifyActiveSheet'
