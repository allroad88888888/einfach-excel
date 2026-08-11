import type { JSX } from 'solid-js'
import type { SpreadsheetToolbarProps } from './types'
import type { ToolbarRuntime } from './useToolbarRuntime'
import { ToolbarAlignmentGroup } from './ToolbarAlignmentGroup'
import { ToolbarColorBorderGroup } from './ToolbarColorBorderGroup'
import { ToolbarEntrypointGroup } from './ToolbarEntrypointGroup'
import { ToolbarFontGroup } from './ToolbarFontGroup'
import { ToolbarHistoryGroup } from './ToolbarHistoryGroup'
import { ToolbarMergeGroup } from './ToolbarMergeGroup'
import { ToolbarNumberGroup } from './ToolbarNumberGroup'
import { ToolbarOverlays } from './ToolbarOverlays'
import { ToolbarShell } from './ToolbarShell'
import { ToolbarTextStyleGroup } from './ToolbarTextStyleGroup'

interface ToolbarPresenterProps extends SpreadsheetToolbarProps {
  runtime: ToolbarRuntime
}

/** Shell composition for independently responsible toolbar control groups. */
export function ToolbarPresenter(props: ToolbarPresenterProps) {
  const { runtime } = props
  const preserveGridFocus: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent> = (event) => {
    const target = event.target as HTMLElement | null
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable
    )
      return
    event.preventDefault()
  }
  return (
    <ToolbarShell
      class={props.class}
      data-testid={props['data-testid'] ?? 'spreadsheet-toolbar'}
      data-filter-sort-status={runtime.filterSortEntrypoint().status}
      data-filter-sort-error={runtime.filterSortEntrypoint().error || undefined}
      data-toolbar-mutation-status={runtime.toolbarMutationLifecycle().status}
      data-toolbar-mutation-error={runtime.toolbarMutationLifecycle().error || undefined}
      onMouseDown={preserveGridFocus}
    >
      <ToolbarHistoryGroup runtime={runtime} />
      <ToolbarFontGroup runtime={runtime} />
      <ToolbarTextStyleGroup runtime={runtime} />
      <ToolbarColorBorderGroup runtime={runtime} />
      <ToolbarAlignmentGroup runtime={runtime} />
      <ToolbarMergeGroup runtime={runtime} />
      <ToolbarEntrypointGroup runtime={runtime} />
      <ToolbarNumberGroup runtime={runtime} />
      <ToolbarOverlays runtime={runtime} />
    </ToolbarShell>
  )
}
