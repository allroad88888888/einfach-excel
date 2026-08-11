import { For } from 'solid-js'
import { useT } from '../../src/i18n'
import { createLayoutFormatMenuInteraction } from './LayoutFormatMenuInteraction'
import { ToolbarAnchoredMenu } from './ToolbarAnchoredMenu'

/**
 * Discrete horizontal alignment value emitted from the toolbar h-align
 * dropdown. Maps 1:1 onto the `'alignment'` toolbar command value contract
 * (`'left' | 'center' | 'right'`).
 */
export type HAlignValue = 'left' | 'center' | 'right'

export interface HAlignDropdownProps {
  /** Anchored under the toolbar button — the button owns positioning. */
  isOpen: boolean
  /** Currently active h-align on the focused cell, for the depressed row. */
  current: HAlignValue
  /** Apply the alignment and close the dropdown. */
  onSelect: (value: HAlignValue) => void
  /** Click outside / Esc requests a close. */
  onRequestClose: () => void
  /**
   * Root anchor element so click-outside ignores clicks on the toolbar button
   * (otherwise the outside-handler races the button's own toggle).
   */
  anchorRef?: HTMLElement | null
}

interface OptionDescriptor {
  value: HAlignValue
  labelKey: string
  testId: string
}

const OPTIONS: OptionDescriptor[] = [
  { value: 'left', labelKey: 'toolbar.alignLeft', testId: 'toolbar-h-align-left' },
  { value: 'center', labelKey: 'toolbar.alignCenter', testId: 'toolbar-h-align-center' },
  { value: 'right', labelKey: 'toolbar.alignRight', testId: 'toolbar-h-align-right' },
]

export function HAlignDropdown(props: HAlignDropdownProps) {
  const t = useT()
  const interaction = createLayoutFormatMenuInteraction<HAlignValue>({
    anchor: () => props.anchorRef,
    isOpen: () => props.isOpen,
    onClose: props.onRequestClose,
    onSelect: props.onSelect,
  })

  return (
    <ToolbarAnchoredMenu
      anchorRef={props.anchorRef}
      rootRef={interaction.setRoot}
      class="spreadsheet-toolbar-h-align-dropdown"
      role="menu"
      data-testid="toolbar-h-align-dropdown"
      isOpen={props.isOpen}
      minWidth="120px"
    >
      <For each={OPTIONS}>
        {(descriptor) => {
          const isActive = () => props.current === descriptor.value
          return (
            <button
              type="button"
              class="spreadsheet-toolbar-h-align-option"
              role="menuitemradio"
              data-testid={descriptor.testId}
              aria-checked={isActive()}
              tabIndex={-1}
              style={{
                padding: '4px 12px',
                'text-align': 'left',
                background: isActive() ? '#eef3ff' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                font: 'inherit',
              }}
              onClick={() => interaction.select(descriptor.value)}
            >
              {t(descriptor.labelKey)}
            </button>
          )
        }}
      </For>
    </ToolbarAnchoredMenu>
  )
}
