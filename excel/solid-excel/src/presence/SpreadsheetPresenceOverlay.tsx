/** @jsxImportSource solid-js */

import { createMemo, For, Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  presenceStateAtom,
  remoteCursorsAtom,
  workspaceSessionAtom,
  type Participant,
  type RemoteCursor,
  type SelectionState,
} from '@einfach/spreadsheet-ui-core'

export interface PresenceSelectionRect {
  left: number
  top: number
  width: number
  height: number
}

type LegacyCellPosition = PresenceSelectionRect

export interface SpreadsheetPresenceOverlayProps {
  /** Optional active sheet id; when supplied, only cursors on that sheet are rendered. */
  activeSheetId?: string
  /** Grid-owned DOM geometry for one already-clipped selection. */
  resolveSelectionRect?: (
    sheetId: string,
    selection: SelectionState,
  ) => PresenceSelectionRect | null
  /** @deprecated Formal Grid mounts must provide resolveSelectionRect. */
  resolveCellPosition?: (sheetId: string, row: number, col: number) => LegacyCellPosition
  class?: string
  cursorClass?: string
  selectionClass?: string
  labelClass?: string
  /** Allows embedding hosts to retain an existing cursor test-id contract. */
  cursorTestIdPrefix?: string
  'data-testid'?: string
}

function legacySelectionCorners(selection: SelectionState) {
  switch (selection.kind) {
    case 'cell':
    case 'range':
      return {
        start: {
          row: Math.min(selection.anchor.row, selection.focus.row),
          col: Math.min(selection.anchor.col, selection.focus.col),
        },
        end: {
          row: Math.max(selection.anchor.row, selection.focus.row),
          col: Math.max(selection.anchor.col, selection.focus.col),
        },
      }
    case 'row':
      return {
        start: { row: Math.min(selection.rowAnchor, selection.rowFocus), col: 0 },
        end: { row: Math.max(selection.rowAnchor, selection.rowFocus), col: 0 },
      }
    case 'column':
      return {
        start: { row: 0, col: Math.min(selection.colAnchor, selection.colFocus) },
        end: { row: 0, col: Math.max(selection.colAnchor, selection.colFocus) },
      }
    case 'all':
      return { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }
  }
}

export function SpreadsheetPresenceOverlay(props: SpreadsheetPresenceOverlayProps) {
  const cursors = useAtomValue(remoteCursorsAtom)
  const state = useAtomValue(presenceStateAtom)
  const workspace = useAtomValue(workspaceSessionAtom)

  function participantFor(participantId: string): Participant | undefined {
    return state().participants.find((p) => p.id === participantId)
  }

  function visibleCursors(): RemoteCursor[] {
    const list = cursors()
    const activeId = props.activeSheetId ?? workspace().activeSheetId
    if (!activeId) return list
    return list.filter((c) => c.sheetId === activeId)
  }

  function positionFor(cursor: RemoteCursor): PresenceSelectionRect | null {
    if (props.resolveSelectionRect) {
      return props.resolveSelectionRect(cursor.sheetId, cursor.selection)
    }
    const { start, end } = legacySelectionCorners(cursor.selection)
    const startRect = props.resolveCellPosition?.(cursor.sheetId, start.row, start.col)
    const endRect = props.resolveCellPosition?.(cursor.sheetId, end.row, end.col)
    if (startRect && endRect) {
      return {
        left: startRect.left,
        top: startRect.top,
        width: Math.max(0, endRect.left + endRect.width - startRect.left),
        height: Math.max(0, endRect.top + endRect.height - startRect.top),
      }
    }
    return { left: start.col, top: start.row, width: 1, height: 1 }
  }

  return (
    <div
      class={`spreadsheet-presence-overlay ${props.class ?? ''}`.trim()}
      data-testid={props['data-testid'] ?? 'presence-overlay'}
      aria-hidden="true"
      style={{ position: 'absolute', inset: '0', 'pointer-events': 'none' }}
    >
      <For each={visibleCursors()}>
        {(cursor) => {
          const participant = createMemo(() => participantFor(cursor.participantId))
          const pos = createMemo(() => positionFor(cursor))
          const color = createMemo(() => participant()?.colorHint ?? '#888888')
          return (
            <Show when={pos()}>
              {(rect) => (
                <div
                  class={`presence-cursor ${props.cursorClass ?? ''}`.trim()}
                  data-testid={`${props.cursorTestIdPrefix ?? 'presence-cursor'}-${cursor.participantId}`}
                  data-participant-id={cursor.participantId}
                  data-sheet-id={cursor.sheetId}
                  data-selection-kind={cursor.selection.kind}
                  style={{
                    position: 'absolute',
                    left: `${rect().left}px`,
                    top: `${rect().top}px`,
                    width: `${rect().width}px`,
                    height: `${rect().height}px`,
                    border: `2px solid ${color()}`,
                    'box-sizing': 'border-box',
                    'pointer-events': 'none',
                    '--presence-color': color(),
                  }}
                >
                  <div
                    class={`presence-selection ${props.selectionClass ?? ''}`.trim()}
                    data-testid={`presence-selection-${cursor.participantId}`}
                  />
                  <Show when={participant()}>
                    {(p) => (
                      <span
                        class={`presence-label ${props.labelClass ?? ''}`.trim()}
                        data-testid={`presence-label-${cursor.participantId}`}
                        data-last-seen-at={p().lastSeenAt}
                        style={{ 'background-color': color() }}
                      >
                        {p().displayName}
                      </span>
                    )}
                  </Show>
                </div>
              )}
            </Show>
          )
        }}
      </For>
    </div>
  )
}
