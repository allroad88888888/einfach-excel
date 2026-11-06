import { atom } from '@einfach/core'
import type { ProjectionSnapshot } from '../projection/types'

/** One bounded display frame; workbook content continues to live exclusively in Rust. */
export const drawingSuspensionAtom = atom<{ depth: number; snapshot: ProjectionSnapshot } | null>(
  null,
)
export const workbookDrawingSuspendedAtom = atom((get) => get(drawingSuspensionAtom) !== null)
drawingSuspensionAtom.debugLabel = 'spreadsheet.host.drawingSuspension.state'
workbookDrawingSuspendedAtom.debugLabel = 'spreadsheet.host.drawingSuspended'
