import type { createSheetTabInteractionController } from './sheet-tab-controller'

interface SpreadsheetSheetTabActionsProps {
  readonly controller: ReturnType<typeof createSheetTabInteractionController>
}

/** Renders non-tab sheet commands beside the semantic tablist.
 *  重排把手已删除 —— 拖页签本体即可重排(SpreadsheetSheetTabItem),
 *  这里只剩"新建 sheet"。 */
export function SpreadsheetSheetTabActions(props: SpreadsheetSheetTabActionsProps) {
  return (
    <div
      class="spreadsheet-sheet-tab-actions"
      role="group"
      aria-label="Sheet actions"
      style={{ display: 'flex', 'align-items': 'stretch' }}
    >
      <button
        type="button"
        class="spreadsheet-sheet-tab-add"
        data-testid="sheet-tab-add"
        aria-label="Add sheet"
        title={props.controller.commandTitle('add', 'Add sheet')}
        disabled={props.controller.commandDisabled('add')}
        onClick={() => props.controller.addSheet()}
      >
        +
      </button>
    </div>
  )
}
