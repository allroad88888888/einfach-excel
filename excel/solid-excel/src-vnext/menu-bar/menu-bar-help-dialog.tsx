import { For, Show } from 'solid-js'
import { useT } from '../../src/i18n'
import '@einfach/spreadsheet-ui-styles/features/menu-help-dialog.css'

interface MenuBarHelpDialogProps {
  kind: 'closed' | 'shortcuts' | 'about'
  onClose: () => void
}

const KEYBOARD_SHORTCUTS: ReadonlyArray<{ keys: string; labelKey: string }> = [
  { keys: 'Ctrl+Z', labelKey: 'help.shortcuts.undo' },
  { keys: 'Ctrl+Y', labelKey: 'help.shortcuts.redo' },
  { keys: 'Ctrl+C', labelKey: 'help.shortcuts.copy' },
  { keys: 'Ctrl+X', labelKey: 'help.shortcuts.cut' },
  { keys: 'Ctrl+V', labelKey: 'help.shortcuts.paste' },
  { keys: 'Ctrl+F', labelKey: 'help.shortcuts.find' },
  { keys: 'Ctrl+H', labelKey: 'help.shortcuts.replace' },
  { keys: 'Ctrl+A', labelKey: 'help.shortcuts.selectAll' },
  { keys: 'F2', labelKey: 'help.shortcuts.edit' },
  { keys: 'Esc', labelKey: 'help.shortcuts.cancel' },
]

/** Renders the menu-owned help dialog from the existing help-overlay atom state. */
export function MenuBarHelpDialog(props: MenuBarHelpDialogProps) {
  const t = useT()
  return (
    <Show when={props.kind !== 'closed'}>
      <div
        class="spreadsheet-help-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spreadsheet-help-overlay-title"
        aria-describedby="spreadsheet-help-overlay-content"
        data-testid={`spreadsheet-help-overlay-${props.kind}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onClose()
          }
        }}
      >
        <header class="spreadsheet-help-overlay-header">
          <h2 class="spreadsheet-help-overlay-title" id="spreadsheet-help-overlay-title">
            {props.kind === 'shortcuts' ? t('help.shortcuts.title') : t('help.about.title')}
          </h2>
        </header>
        <div class="spreadsheet-help-overlay-content" id="spreadsheet-help-overlay-content">
          <Show
            when={props.kind === 'shortcuts'}
            fallback={
              <p
                class="spreadsheet-help-overlay-body"
                data-testid="spreadsheet-help-overlay-about-body"
              >
                {t('help.about.body')}
              </p>
            }
          >
            <ul
              class="spreadsheet-help-overlay-shortcut-list"
              data-testid="spreadsheet-help-overlay-shortcut-list"
            >
              <For each={KEYBOARD_SHORTCUTS}>
                {(item) => (
                  <li class="spreadsheet-help-overlay-shortcut-item">
                    <kbd class="spreadsheet-help-overlay-keys">{item.keys}</kbd>
                    <span class="spreadsheet-help-overlay-label">{t(item.labelKey)}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
        <div class="spreadsheet-help-overlay-actions">
          <button
            type="button"
            class="spreadsheet-help-overlay-close"
            data-variant="primary"
            data-testid="spreadsheet-help-overlay-close"
            onClick={props.onClose}
          >
            {t('help.close')}
          </button>
        </div>
      </div>
    </Show>
  )
}
