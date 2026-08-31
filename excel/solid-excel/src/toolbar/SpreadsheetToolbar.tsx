import type { SpreadsheetToolbarProps } from './types'
import { ToolbarPresenter } from './ToolbarPresenter'
import { useToolbarRuntime } from './useToolbarRuntime'

/** Public toolbar entry point: atom-backed controller plus presentational shell. */
export function SpreadsheetToolbar(props: SpreadsheetToolbarProps) {
  return <ToolbarPresenter {...props} runtime={useToolbarRuntime()} />
}
