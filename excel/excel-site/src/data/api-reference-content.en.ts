import type { ApiReferenceContent } from './api-reference-types'

export const apiReferenceContentEn: ApiReferenceContent = {
  title: 'UI operation reference',
  eyebrow: 'INTERACTION API',
  summary: 'Select cells, edit values and formulas, work with clipboard state, and move through history from UI code.',
  intro: 'This is the frontend API used by an application surface. Every entry says which UI state it changes, which value to give it, and what interaction it completes.',
  task: {
    title: 'Set the value of one cell',
    description: 'To set A1, make that cell active, open an editing session, update its draft, then commit the session. The grid follows the same sequence for typing and formula-bar edits.',
    steps: [
      { symbol: 'selectCellAtom', detail: 'Make the target coordinate the active cell.' },
      { symbol: 'startEditingAtom', detail: 'Open an editing session for that cell with its current text.' },
      { symbol: 'editingDraftAtom', detail: 'Write the next text or formula while the editor is open.' },
      { symbol: 'runEditingCommitAtom', detail: 'Commit the current draft and optionally move to the next cell.' },
    ],
  },
  groups: [
    {
      title: 'Select and navigate',
      description: 'Use these APIs whenever a button, name box, keyboard handler, or custom UI needs to control the active cell or range.',
      symbols: [
        { name: 'selectCellAtom', kind: 'WRITE ATOM', description: 'Makes one cell active, or extends the current selection to a rectangular range.', input: 'A row and column coordinate; optionally a sheet id and extend flag.', output: 'The canonical selected cell or range becomes the current UI selection.', usage: 'Use for “go to cell”, cell click, or a keyboard move that should update visible selection state.', route: 'docs/atoms/selection/' },
        { name: 'setSelectionAtom', kind: 'WRITE ATOM', description: 'Replaces the current selection with a complete cell, range, row, column, or all-sheet selection.', input: 'One SelectionState object with its sheet id and bounds.', output: 'A normalized selection that every spreadsheet surface can read.', usage: 'Use when your UI already knows the exact selection shape, such as after parsing a name-box address.', route: 'docs/atoms/selection/' },
        { name: 'getActiveCell', kind: 'PURE FUNCTION', description: 'Reads the active coordinate from any valid selection, including a multi-cell range.', input: 'A selection plus the sheet bounds.', output: 'The active row, column, and sheet id.', usage: 'Use before positioning an editor, formula bar, context menu, or keyboard command.', route: 'docs/atoms/selection/' },
        { name: 'moveSelection', kind: 'PURE FUNCTION', description: 'Calculates the next selection without touching application state.', input: 'Current selection, sheet bounds, and a row/column move or absolute target.', output: 'The next clamped cell selection, or an extended range when requested.', usage: 'Use in custom keyboard navigation; write the returned selection through setSelectionAtom.', route: 'docs/atoms/selection/' },
      ],
    },
    {
      title: 'Edit one cell',
      description: 'These atoms form the deliberate lifecycle for changing a displayed value or formula: open, update, commit, or cancel.',
      symbols: [
        { name: 'startEditingAtom', kind: 'WRITE ATOM', description: 'Opens an editable session for one cell and switches the interaction into editing mode.', input: 'Sheet id, cell coordinate, initial draft text, and input source.', output: 'The new editing session, with its draft available to the editor UI.', usage: 'Call after a double-click, Enter, F2, or formula-bar focus. Do not start a second session while one is committing.', route: 'docs/getting-started/' },
        { name: 'editingDraftAtom', kind: 'READ / WRITE ATOM', description: 'Holds exactly the text currently being edited, whether it is a value or a formula.', input: 'Write a draft string; optionally state which UI surface supplied it.', output: 'The latest draft for rendering in the cell editor or formula bar.', usage: 'Bind an input’s value and input event to this atom while the editing session is active.', route: 'docs/getting-started/' },
        { name: 'runEditingCommitAtom', kind: 'ASYNC WRITE ATOM', description: 'Finishes the current editing session and applies its draft as the cell’s next value or formula.', input: 'The configured edit action plus an optional post-commit move direction.', output: 'A completion, rejection, refresh-failure, unknown-outcome, or blocked status.', usage: 'Call on Enter, Tab, or an explicit save action. Read editingCommitLifecycleAtom to present pending or failed feedback.', route: 'docs/getting-started/' },
        { name: 'cancelEditingAtom', kind: 'WRITE ATOM', description: 'Discards the current uncommitted draft and returns interaction to navigation mode.', input: 'No arguments.', output: 'A cancellation intent, or null when there is no active editable session.', usage: 'Call on Escape or when an editor closes without saving. It never turns a discarded draft into a cell value.', route: 'docs/getting-started/' },
      ],
    },
    {
      title: 'Clipboard and history',
      description: 'These APIs give menus and keyboard handlers one shared interaction state for copy, paste, undo, and redo.',
      symbols: [
        { name: 'copyClipboardAtom', kind: 'WRITE ATOM', description: 'Creates the UI copy intent for the current source range and remembers it as clipboard state.', input: 'A source range, target descriptor, and optional payload.', output: 'A copy intent and clipboard status for the UI to observe.', usage: 'Call from a Copy menu item or keyboard shortcut, then let the clipboard surface complete the user-visible transfer.', route: 'docs/getting-started/' },
        { name: 'pasteClipboardAtom', kind: 'WRITE ATOM', description: 'Creates a paste intent that identifies the saved source content and the target range.', input: 'A source descriptor, target descriptor, and optional clipboard payload.', output: 'A paste intent and a pasting status.', usage: 'Call after the user chooses a destination cell or range. Use clipboardStateAtom to render pending and error states.', route: 'docs/getting-started/' },
        { name: 'runUndoHistoryAtom', kind: 'ASYNC WRITE ATOM', description: 'Moves the spreadsheet interaction back one recorded user action.', input: 'The configured undo action and projection refresh callback.', output: 'A completed, blocked, refresh-failed, or unknown-outcome status.', usage: 'Call from Ctrl/Cmd+Z or an Undo menu item only when canUndoAtom reports that an entry is available.', route: 'docs/getting-started/' },
        { name: 'runRedoHistoryAtom', kind: 'ASYNC WRITE ATOM', description: 'Reapplies the next action in the interaction history after an undo.', input: 'The configured redo action and projection refresh callback.', output: 'A completed, blocked, refresh-failed, or unknown-outcome status.', usage: 'Call from Ctrl/Cmd+Shift+Z or Redo when canRedoAtom reports that an entry is available.', route: 'docs/getting-started/' },
      ],
    },
  ],
}
