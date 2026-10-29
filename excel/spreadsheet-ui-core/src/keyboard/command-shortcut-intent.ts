import { normalizeSelection } from '../selection'
import type { KeyboardCommandIntent, KeyboardCommandState, KeyboardInput } from './types'

export function getCommandShortcutIntent(
  input: KeyboardInput,
  state: KeyboardCommandState,
): KeyboardCommandIntent {
  if (!input.ctrlKey && !input.metaKey) {
    return {
      type: 'none',
      reason: 'unhandled',
    }
  }

  switch (input.key.toLowerCase()) {
    case 'd':
    case 'r':
      return input.altKey || input.shiftKey
        ? { type: 'none', reason: 'unhandled' }
        : { type: 'range.fill', direction: input.key.toLowerCase() === 'd' ? 'down' : 'right' }
    case 'a':
      return {
        type: 'selection.selectAll',
        selection: normalizeSelection(
          {
            kind: 'all',
            sheetId: state.selection.sheetId,
          },
          state.bounds,
        ),
      }
    case 'c':
      // Ctrl+Shift+C → Copy As (HTML / Markdown / plain text bundle). Sits
      // alongside the plain Ctrl+C copy intent; the host wires the actual
      // encoder + clipboard.write call at the dispatcher case. Mirrors how
      // Ctrl+Alt+V reuses 'v' below as a different intent under a modifier.
      if (input.shiftKey) {
        return {
          type: 'clipboard.copyAs',
        }
      }
      return {
        type: 'clipboard.copy',
      }
    case 'x':
      return {
        type: 'clipboard.cut',
      }
    case 'v':
      // Ctrl+Alt+V is reserved for Paste Special (Excel binding). Without
      // the alt guard, the plain paste intent would fire first and swallow
      // the dispatch. See keyboard/types.ts: KeyboardClipboardIntent.
      if (input.altKey) {
        return {
          type: 'clipboard.pasteSpecial',
        }
      }
      return {
        type: 'clipboard.paste',
      }
    case 'p':
      // Ctrl+Shift+P → Copy As Image (PNG). Sits alongside Ctrl+Shift+C
      // (Copy As text triple) as the second "rich clipboard" accelerator;
      // host wires the actual `exportRangeAsImage` → `ClipboardItem` call
      // at the dispatcher case. The shortcut only fires under Shift —
      // plain Ctrl+P stays free for the host's Print binding.
      if (input.shiftKey) {
        return {
          type: 'clipboard.copyAsImage',
        }
      }
      return {
        type: 'none',
        reason: 'unhandled',
      }
    case 'l':
      // Ctrl+Alt+L → Data → Reapply (Excel's binding). Filter visibility is a
      // snapshot, so this is the explicit recompute. Guarded on Alt because
      // Ctrl+L is Excel's Create Table and Ctrl+Shift+L its filter toggle —
      // neither is bound here, and claiming the bare chord would pre-empt them.
      if (input.altKey && !input.shiftKey) {
        return {
          type: 'filterSort.reapply',
        }
      }
      return {
        type: 'none',
        reason: 'unhandled',
      }
    case 'z':
      return {
        type: input.shiftKey ? 'history.redo' : 'history.undo',
      }
    case 'y':
      return {
        type: 'history.redo',
      }
    case 'g':
      return {
        type: 'go-to.open',
      }
    case 'b':
      return {
        type: 'format.toggle',
        field: 'bold',
      }
    case 'i':
      return {
        type: 'format.toggle',
        field: 'italic',
      }
    case 'u':
      return {
        type: 'format.toggle',
        field: 'underline',
      }
    case 'pageup':
      return {
        type: 'sheet.activate-adjacent',
        direction: 'previous',
      }
    case 'pagedown':
      return {
        type: 'sheet.activate-adjacent',
        direction: 'next',
      }
    default:
      return {
        type: 'none',
        reason: 'unhandled',
      }
  }
}
