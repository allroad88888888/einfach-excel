/**
 * Seed data for the "collaboration" demo — a small sprint-planning sheet.
 * Two cells ship with a pre-seeded comment thread (`commentThreadId` +
 * `noteIndicator`, layered over the plain matrix value the same way
 * `seed-basics.ts` layers totals formulas over blank rows — see that file's
 * header comment for why the static backend needs the full `DisplayCell`
 * repeated in `cells`, not just the new fields).
 *
 * `collaborationCommentSeeds` is the single source of truth for which cells
 * carry a thread: `CollaborationDemo.tsx` reads it to open the matching
 * comment session when the active cell lands on one of these coordinates,
 * since the vnext grid does not (yet) render `commentThreadId` as a visual
 * marker on the cell itself — see that file's header comment.
 */
import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'

const matrix: StaticSeedMatrix = [
  ['Task', 'Owner', 'Status', 'Due', 'Priority'],
  ['Design review', 'Mina Cho', 'In Progress', '2026-08-02', 'High'],
  ['API contract draft', 'Diego Alvarez', 'Blocked', '2026-08-05', 'High'],
  ['Migration script', 'Priya Nair', 'Not Started', '2026-08-08', 'Medium'],
  ['QA test plan', "Sam O'Connor", 'In Progress', '2026-08-06', 'Medium'],
  ['Rollout doc', 'Layla Haddad', 'Not Started', '2026-08-10', 'Low'],
]

export interface CollaborationCommentSeed {
  row: number
  col: number
  threadId: string
}

export const collaborationCommentSeeds: readonly CollaborationCommentSeed[] = [
  { row: 2, col: 2, threadId: 'thread-status-blocked' },
  { row: 4, col: 3, threadId: 'thread-due-slip' },
]

// Repeats the matrix `displayValue`/`valueKind` at the same coordinate: the
// static backend's sparse `cells` entries replace the whole `DisplayCell`
// rather than merging fields, so omitting them here would blank the cell.
const cells: DisplayCell[] = [
  {
    row: 2,
    col: 2,
    displayValue: 'Blocked',
    valueKind: 'string',
    noteIndicator: true,
    commentThreadId: 'thread-status-blocked',
  },
  {
    row: 4,
    col: 3,
    displayValue: '2026-08-06',
    valueKind: 'string',
    noteIndicator: true,
    commentThreadId: 'thread-due-slip',
  },
]

export const collaborationSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Sprint Planning'],
  matrix,
  cells,
}
