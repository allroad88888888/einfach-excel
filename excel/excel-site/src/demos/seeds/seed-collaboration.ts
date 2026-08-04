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

/** A sprint plan with real comment anchors that a collaboration host can extend. */
export const collaborationSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Sprint Planning'],
  matrix,
  cells,
}
