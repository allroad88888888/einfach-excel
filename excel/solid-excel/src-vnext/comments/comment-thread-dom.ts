import type { CommentSessionState } from '@einfach/spreadsheet-ui-core'

const VIEWPORT_GUTTER = 12
const ANCHOR_GAP = 8

function matchingCellSelector(session: Readonly<CommentSessionState>): string {
  return `.spreadsheet-grid-cell[data-row="${session.cell.row}"][data-col="${session.cell.col}"]`
}

/** Finds the rendered target cell without turning DOM identity into product state. */
export function findCommentCellAnchor(
  session: Readonly<CommentSessionState> | null,
): HTMLElement | null {
  if (session === null) return null
  const cells = Array.from(document.querySelectorAll<HTMLElement>(matchingCellSelector(session)))
  return (
    cells.find((cell) => cell.dataset.active === 'true' && cell.isConnected) ??
    cells.find((cell) => cell.isConnected) ??
    null
  )
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

/** Positions the comments-owned popover beside its cell, with a viewport fallback. */
export function positionCommentThread(overlay: HTMLElement, anchor: HTMLElement | null): void {
  const width = overlay.offsetWidth || 320
  const height = overlay.offsetHeight || 260
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight
  const anchorRect = anchor?.getBoundingClientRect()

  if (anchorRect === undefined) {
    overlay.style.left = `${Math.max(VIEWPORT_GUTTER, viewportWidth - width - VIEWPORT_GUTTER)}px`
    overlay.style.top = `${VIEWPORT_GUTTER}px`
    overlay.dataset.anchorState = 'viewport'
    return
  }

  const right = anchorRect.right + ANCHOR_GAP
  const left = anchorRect.left - width - ANCHOR_GAP
  const preferredLeft = right + width + VIEWPORT_GUTTER <= viewportWidth ? right : left
  overlay.style.left = `${clamp(preferredLeft, VIEWPORT_GUTTER, viewportWidth - width - VIEWPORT_GUTTER)}px`
  overlay.style.top = `${clamp(anchorRect.top, VIEWPORT_GUTTER, viewportHeight - height - VIEWPORT_GUTTER)}px`
  overlay.dataset.anchorState = 'cell'
}
