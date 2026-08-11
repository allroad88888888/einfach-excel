/** @jsxImportSource solid-js */

import { Show, createEffect, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  closeNameManagerAtom,
  deleteNameManagerEntryAtom,
  lastRenamedTableAtom,
  nameManagerEditorAtom,
  nameManagerSessionIdAtom,
  namedRangeCapabilitiesAtom,
  namedRangeMutationStateAtom,
  namedRangeRegistryStateAtom,
  refreshTableCatalogAtom,
  saveNameManagerAtom,
  sheetTabsSheetsAtom,
  settleNameManagerTableRenameAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import { useT } from '../../src/i18n'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'
import { NameManagerEditor } from './NameManagerEditor'
import { NameManagerTables } from './NameManagerTables'

export interface SpreadsheetNameManagerDialogProps {
  class?: string
  'data-testid'?: string
}

export function SpreadsheetNameManagerDialog(props: SpreadsheetNameManagerDialogProps) {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const editor = useAtomValue(nameManagerEditorAtom)
  const capability = useAtomValue(namedRangeCapabilitiesAtom)
  const registry = useAtomValue(namedRangeRegistryStateAtom)
  const mutation = useAtomValue(namedRangeMutationStateAtom)
  const sessionId = useAtomValue(nameManagerSessionIdAtom)
  const lastRenamedTable = useAtomValue(lastRenamedTableAtom)
  const sheets = useAtomValue(sheetTabsSheetsAtom)
  const workspace = useAtomValue(workspaceSessionAtom)
  const isOpen = () => editor().status !== 'closed'
  const tablesSupported = () => typeof backend.listTables === 'function'
  const close = () => store.setter(closeNameManagerAtom)
  const save = () =>
    store.setter(saveNameManagerAtom, {
      source: backend,
      sessionId: sessionId(),
      activeSheetId: workspace().activeSheetId ?? sheets()[0]?.id,
    })
  const remove = () =>
    store.setter(deleteNameManagerEntryAtom, { source: backend, sessionId: sessionId() })

  createEffect<boolean>((wasOpen) => {
    const open = isOpen()
    if (open && !wasOpen && tablesSupported()) store.setter(refreshTableCatalogAtom, backend)
    return open
  }, false)

  createEffect<{ from: string; to: string } | null>((previous) => {
    const applied = lastRenamedTable()
    if (applied !== null && applied !== previous) {
      store.setter(settleNameManagerTableRenameAtom, { sessionId: sessionId(), ...applied })
    }
    return applied
  }, null)

  createEffect(() => {
    if (!isOpen()) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })

  return (
    <Show when={isOpen()}>
      <div
        class={`name-manager-dialog ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'name-manager-dialog'}
        data-capability-status={capability().status}
        data-registry-status={registry().status}
        data-mutation-status={mutation().status}
        role="dialog"
        aria-modal="true"
        aria-label={t('nameManager.title')}
      >
        <button
          type="button"
          class="dialog-close-x"
          data-testid="dialog-close-x"
          aria-label={t('dialog.close.label')}
          onClick={close}
        >
          ×
        </button>
        <NameManagerEditor onClose={close} onDelete={remove} onSave={save} />
        <Show when={tablesSupported()}>
          <NameManagerTables />
        </Show>
      </div>
    </Show>
  )
}
