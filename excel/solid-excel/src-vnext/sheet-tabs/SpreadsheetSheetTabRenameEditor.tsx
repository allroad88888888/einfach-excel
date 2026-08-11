import { Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { SheetTabsState, SpreadsheetSheetMetadata } from '@einfach/spreadsheet-ui-core'

import type { createSheetTabInteractionController } from './sheet-tab-controller'

interface SpreadsheetSheetTabRenameEditorProps {
  readonly sheetTabs: Accessor<SheetTabsState>
  readonly sheets: Accessor<readonly SpreadsheetSheetMetadata[]>
  readonly controller: ReturnType<typeof createSheetTabInteractionController>
}

/** Renders the atom-owned rename editor outside the tablist relationship. */
export function SpreadsheetSheetTabRenameEditor(props: SpreadsheetSheetTabRenameEditorProps) {
  const renameTarget = () => {
    const rename = props.sheetTabs().rename
    if (!rename) return null
    const sheet = props.sheets().find((candidate) => candidate.id === rename.sheetId)
    return sheet ? { rename, sheet } : null
  }

  return (
    <Show when={renameTarget()}>
      {(target) => (
        <input
          class="spreadsheet-sheet-tab-rename"
          type="text"
          aria-label={`Rename ${target().sheet.name}`}
          data-sheet-tab-rename-input={target().sheet.id}
          value={target().rename.draftName}
          disabled={props.controller.commandDisabled('rename')}
          onInput={(event) => props.controller.updateRename(target().sheet.id, event)}
          onKeyDown={(event) => props.controller.handleRenameKeyDown(target().sheet.id, event)}
          onBlur={() => props.controller.cancelRename(target().sheet.id, 'blur')}
          ref={(element) => props.controller.focusRenameInput(element)}
        />
      )}
    </Show>
  )
}
