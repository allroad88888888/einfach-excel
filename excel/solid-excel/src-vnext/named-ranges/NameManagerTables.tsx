/** @jsxImportSource solid-js */

import { For, Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  allTablesAtom,
  beginNameManagerTableRenameAtom,
  cancelNameManagerTableRenameAtom,
  nameManagerSessionIdAtom,
  nameManagerTableEditorAtom,
  runDeleteTableAtom,
  runRenameTableAtom,
  setNameManagerTablePendingDeleteAtom,
  tableDiagnosticAtom,
  updateNameManagerTableRenameDraftAtom,
  type SpreadsheetTableDescriptor,
} from '@einfach/spreadsheet-ui-core'
import { useT } from '../../src/i18n'
import {
  createHistoryEntryRecorder,
  refreshVisibleProjection,
  useSpreadsheetBackend,
  useSpreadsheetUiStore,
} from '../provider'
import { TABLE_DIAGNOSTIC_COPY_KEY } from './name-manager-dialog-copy'

export function NameManagerTables() {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const tables = useAtomValue(allTablesAtom)
  const editor = useAtomValue(nameManagerTableEditorAtom)
  const sessionId = useAtomValue(nameManagerSessionIdAtom)
  const diagnostic = useAtomValue(tableDiagnosticAtom)
  const supportsRename = () => typeof backend.renameTable === 'function'
  const supportsDelete = () => typeof backend.deleteTable === 'function'
  const tableStatusMessage = () => {
    const current = diagnostic()
    if (current === null) return null
    const copyKey = TABLE_DIAGNOSTIC_COPY_KEY[current.code]
    return copyKey === undefined ? current.message : t(copyKey)
  }

  function beginRename(table: SpreadsheetTableDescriptor): void {
    store.setter(beginNameManagerTableRenameAtom, { sessionId: sessionId(), name: table.name })
  }

  function cancelRename(): void {
    store.setter(cancelNameManagerTableRenameAtom, sessionId())
  }

  function commitRename(table: SpreadsheetTableDescriptor): void {
    void store.setter(runRenameTableAtom, {
      source: backend,
      historyEntryRecorder: createHistoryEntryRecorder(backend),
      name: table.name,
      newName: editor().renameDraft,
      sheetId: table.sheetId,
      refreshProjection: (sheetId?: string) =>
        refreshVisibleProjection(store, backend, sheetId, 'toolbar'),
    })
  }

  function confirmDelete(table: SpreadsheetTableDescriptor): void {
    store.setter(setNameManagerTablePendingDeleteAtom, { sessionId: sessionId(), name: null })
    void store.setter(runDeleteTableAtom, {
      source: backend,
      historyEntryRecorder: createHistoryEntryRecorder(backend),
      name: table.name,
      sheetId: table.sheetId,
      refreshProjection: (sheetId?: string) =>
        refreshVisibleProjection(store, backend, sheetId, 'toolbar'),
    })
  }

  return (
    <section class="nm-tables" data-testid="name-manager-tables">
      <h3 class="nm-tables-title">{t('nameManager.tables.title')}</h3>
      <Show
        when={tables().length > 0}
        fallback={
          <p class="nm-tables-empty" data-testid="name-manager-tables-empty">
            {t('nameManager.tables.empty')}
          </p>
        }
      >
        <ul class="nm-tables-list" data-testid="name-manager-tables-list">
          <For each={tables()}>
            {(table) => (
              <li class="nm-table-row" data-table-name={table.name}>
                <span class="nm-table-name">{table.name}</span>
                <span class="nm-table-location">
                  {t('nameManager.tables.location', {
                    sheet: table.sheetName,
                    range: table.range,
                  })}
                </span>
                <span class="nm-table-columns">
                  {t('nameManager.tables.columns', { columns: table.columns.join(', ') })}
                </span>
                <Show when={table.hasTotals}>
                  <span class="nm-table-totals" data-testid="name-manager-table-totals">
                    {t('nameManager.tables.hasTotals')}
                  </span>
                </Show>
                <Show when={editor().renamingTable === table.name}>
                  <span class="nm-table-rename">
                    <input
                      type="text"
                      class="nm-table-rename-input"
                      data-testid="name-manager-table-rename-input"
                      aria-label={t('nameManager.tables.rename.label', { name: table.name })}
                      value={editor().renameDraft}
                      onInput={(event) =>
                        store.setter(updateNameManagerTableRenameDraftAtom, {
                          sessionId: sessionId(),
                          value: event.currentTarget.value,
                        })
                      }
                    />
                    <button
                      type="button"
                      data-testid="name-manager-table-rename-save"
                      onClick={() => commitRename(table)}
                    >
                      {t('nameManager.tables.rename.save')}
                    </button>
                    <button
                      type="button"
                      data-testid="name-manager-table-rename-cancel"
                      onClick={cancelRename}
                    >
                      {t('nameManager.tables.cancel')}
                    </button>
                  </span>
                </Show>
                <Show when={editor().pendingDeleteTable === table.name}>
                  <span class="nm-table-delete-confirm" role="alert">
                    <span data-testid="name-manager-table-delete-prompt">
                      {t('nameManager.tables.delete.prompt', { name: table.name })}
                    </span>
                    <button
                      type="button"
                      data-testid="name-manager-table-delete-confirm"
                      onClick={() => confirmDelete(table)}
                    >
                      {t('nameManager.tables.delete.confirm')}
                    </button>
                    <button
                      type="button"
                      data-testid="name-manager-table-delete-cancel"
                      onClick={() =>
                        store.setter(setNameManagerTablePendingDeleteAtom, {
                          sessionId: sessionId(),
                          name: null,
                        })
                      }
                    >
                      {t('nameManager.tables.cancel')}
                    </button>
                  </span>
                </Show>
                <span class="nm-table-actions">
                  <Show when={supportsRename() && editor().renamingTable !== table.name}>
                    <button
                      type="button"
                      data-testid="name-manager-table-rename"
                      onClick={() => beginRename(table)}
                    >
                      {t('nameManager.tables.rename')}
                    </button>
                  </Show>
                  <Show when={supportsDelete() && editor().pendingDeleteTable !== table.name}>
                    <button
                      type="button"
                      data-testid="name-manager-table-delete"
                      onClick={() =>
                        store.setter(setNameManagerTablePendingDeleteAtom, {
                          sessionId: sessionId(),
                          name: table.name,
                        })
                      }
                    >
                      {t('nameManager.tables.delete')}
                    </button>
                  </Show>
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={tableStatusMessage()}>
        {(message) => (
          <div
            class="nm-tables-error"
            data-testid="name-manager-tables-error"
            data-table-diagnostic-code={diagnostic()?.code}
            role="status"
          >
            {message()}
          </div>
        )}
      </Show>
    </section>
  )
}
