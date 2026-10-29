import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing'
import { selectionAtom } from '../selection'
import { workspaceSessionAtom } from '../workspace'
import type { ToolbarFormatCommandInput } from './types'
import {
  createToolbarFormatCommandIntent,
  isToolbarFormatCommandAvailable,
  toolbarCommandAvailabilityAtom,
} from './availability'
import { toolbarIntentAtom, toolbarIntentBackingAtom } from './surface-state'

export const dispatchToolbarFormatCommandAtom = atom(
  (get) => get(toolbarIntentAtom),
  (get, set, input: ToolbarFormatCommandInput) => {
    const selection = get(selectionAtom)
    const workspace = get(workspaceSessionAtom)
    const availability = get(toolbarCommandAvailabilityAtom)
    const commandAvailable = isToolbarFormatCommandAvailable(input.command, availability)

    if (!commandAvailable) {
      return null
    }

    const intent = createToolbarFormatCommandIntent(
      {
        ...input,
        sheetId:
          input.sheetId ??
          workspace.activeSheetId ??
          (selection.sheetId.length > 0 ? selection.sheetId : null),
      },
      {
        sheetId:
          workspace.activeSheetId ?? (selection.sheetId.length > 0 ? selection.sheetId : null),
        selectionKind: selection.kind,
        editingMode: get(editingSessionAtom).status,
      },
    )

    if (intent === null) {
      return null
    }

    set(toolbarIntentBackingAtom, intent)
    return intent
  },
)
dispatchToolbarFormatCommandAtom.debugLabel = 'spreadsheet.toolbar.dispatchFormatCommand'
