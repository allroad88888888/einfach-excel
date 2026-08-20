import { useT } from '../../src/i18n'
import type { SpreadsheetToolbarCommand } from './types'
import type { ToolbarGroupProps } from './ToolbarGroupProps'
import { BoldIcon, ItalicIcon, StrikethroughIcon, UnderlineIcon } from './ToolbarIcons'

const commands: SpreadsheetToolbarCommand[] = [
  {
    command: 'bold',
    label: 'toolbar.bold',
    title: 'toolbar.bold.title',
    testId: 'toolbar-btn-bold',
    isEnabled: (availability) => availability.bold,
    icon: BoldIcon,
  },
  {
    command: 'italic',
    label: 'toolbar.italic',
    title: 'toolbar.italic.title',
    testId: 'toolbar-btn-italic',
    isEnabled: (availability) => availability.italic,
    icon: ItalicIcon,
  },
  {
    command: 'underline',
    label: 'toolbar.underline',
    title: 'toolbar.underline.title',
    testId: 'toolbar-btn-underline',
    isEnabled: (availability) => availability.underline,
    icon: UnderlineIcon,
  },
  {
    command: 'strikethrough',
    label: 'toolbar.strikethrough',
    title: 'toolbar.strikethrough.title',
    testId: 'toolbar-btn-strikethrough',
    isEnabled: (availability) => availability.strikethrough,
    icon: StrikethroughIcon,
  },
]

/** Boolean text-format controls. */
export function ToolbarTextStyleGroup(props: ToolbarGroupProps) {
  const t = useT()
  return (
    <>
      {commands.map((item) => {
        const enabled = () =>
          item.isEnabled(props.runtime.availability()) && !props.runtime.isProtectionGated()
        const pressed = () =>
          item.command === 'bold'
            ? Boolean(props.runtime.activeCellFormat().bold)
            : item.command === 'italic'
              ? Boolean(props.runtime.activeCellFormat().italic)
              : item.command === 'underline'
                ? Boolean(props.runtime.activeCellFormat().underline)
                : Boolean(props.runtime.activeCellFormat().strikethrough)
        return (
          <button
            type="button"
            class={`spreadsheet-toolbar-button ${pressed() ? 'is-active' : ''}`.trim()}
            data-testid={item.testId}
            data-tooltip={t(item.title)}
            aria-label={t(item.title)}
            aria-pressed={pressed()}
            disabled={!enabled()}
            onClick={() => props.runtime.format.dispatchCommand({ command: item.command })}
          >
            {item.icon ? item.icon() : t(item.label)}
          </button>
        )
      })}
      <span class="spreadsheet-toolbar-separator" aria-hidden="true" />
    </>
  )
}
