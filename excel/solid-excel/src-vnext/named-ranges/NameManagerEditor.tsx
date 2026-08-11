/** @jsxImportSource solid-js */

import { For, Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  nameManagerEditorAtom,
  nameManagerKindDraftAtom,
  nameManagerNameDraftAtom,
  nameManagerParamsDraftAtom,
  nameManagerRefersToDraftAtom,
  nameManagerScopeDraftAtom,
  nameManagerSelectedEntryAtom,
  namedRangeCapabilitiesAtom,
  namedRangeMutationBlockedAtom,
  namedRangeMutationStateAtom,
  namedRangeRegistryStateAtom,
  openNameManagerAtom,
  sheetTabsSheetsAtom,
  type NameManagerKind,
  type NamedRange,
} from '@einfach/spreadsheet-ui-core'
import { locale, useT } from '../../src/i18n'
import { useSpreadsheetUiStore } from '../provider'
import {
  bindingKind,
  fallbackStatusCopy,
  localizedCoreError,
  scopeKind,
  scopeToString,
} from './name-manager-dialog-copy'

export interface NameManagerEditorProps {
  readonly onClose: () => void
  readonly onDelete: () => void
  readonly onSave: () => void
}

export function NameManagerEditor(props: NameManagerEditorProps) {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const editor = useAtomValue(nameManagerEditorAtom)
  const capability = useAtomValue(namedRangeCapabilitiesAtom)
  const registry = useAtomValue(namedRangeRegistryStateAtom)
  const mutation = useAtomValue(namedRangeMutationStateAtom)
  const mutationBlocked = useAtomValue(namedRangeMutationBlockedAtom)
  const selected = useAtomValue(nameManagerSelectedEntryAtom)
  const sheets = useAtomValue(sheetTabsSheetsAtom)
  const name = useAtomValue(nameManagerNameDraftAtom)
  const scope = useAtomValue(nameManagerScopeDraftAtom)
  const refersTo = useAtomValue(nameManagerRefersToDraftAtom)
  const kind = useAtomValue(nameManagerKindDraftAtom)
  const params = useAtomValue(nameManagerParamsDraftAtom)
  const interactionLocked = () =>
    mutation().status === 'pending' || registry().status === 'refreshing'
  const controllerReady = () =>
    capability().status === 'ready' && registry().status === 'ready' && !mutationBlocked()
  const selectedEntry = (entry: NamedRange) =>
    selected() !== null &&
    selected()!.name === entry.name &&
    scopeToString(selected()!.scope) === scopeToString(entry.scope)
  const supportsSave = () => {
    const current = capability().capabilities
    const binding = bindingKind(kind())
    return (
      controllerReady() &&
      current !== null &&
      current.scopes.includes(scopeKind(scope())) &&
      current.bindings[binding] &&
      (binding !== 'range' || current.rangeSemantics !== 'unsupported')
    )
  }
  const supportsDelete = () => {
    const entry = selected() ?? editor().draft
    const current = capability().capabilities
    return (
      controllerReady() &&
      entry !== undefined &&
      current !== null &&
      current.delete &&
      current.scopes.includes(entry.scope === 'workbook' ? 'workbook' : 'sheet')
    )
  }
  const statusMessage = () => {
    const current = mutation()
    if (current.status === 'blocked' && current.error === '名称或引用无效') {
      if (name().trim().length === 0) return t('nameManager.error.nameRequired')
      if (refersTo().trim().length === 0) return t('nameManager.error.refersToRequired')
    }
    if (current.error !== null) return localizedCoreError(locale(), current.error)
    if (current.status === 'outcome-unknown') return fallbackStatusCopy(locale(), 'outcomeUnknown')
    if (current.status === 'confirmed-not-applied')
      return fallbackStatusCopy(locale(), 'confirmedNotApplied')
    if (registry().status === 'projection-unknown')
      return fallbackStatusCopy(locale(), 'projectionUnknown')
    if (capability().status === 'unavailable')
      return fallbackStatusCopy(locale(), 'capabilityUnavailable')
    return registry().status === 'refreshing' ? fallbackStatusCopy(locale(), 'refreshing') : null
  }
  return (
    <>
      <ul data-testid="name-list">
        <For each={registry().names}>
          {(entry) => (
            <li data-name={entry.name}>
              <button
                type="button"
                aria-pressed={selectedEntry(entry)}
                disabled={interactionLocked()}
                onClick={() =>
                  store.setter(openNameManagerAtom, { status: 'editing-existing', draft: entry })
                }
              >
                {entry.name} ({scopeToString(entry.scope)})
              </button>
            </li>
          )}
        </For>
      </ul>
      <div class="nm-form">
        <label for="name-input">{t('nameManager.name')}</label>
        <input
          id="name-input"
          data-testid="name-input"
          type="text"
          value={name()}
          disabled={interactionLocked()}
          onInput={(event) => store.setter(nameManagerNameDraftAtom, event.currentTarget.value)}
        />
        <label for="name-scope-select">{t('nameManager.scope')}</label>
        <select
          id="name-scope-select"
          data-testid="name-scope-select"
          value={scope()}
          disabled={interactionLocked()}
          onChange={(event) => store.setter(nameManagerScopeDraftAtom, event.currentTarget.value)}
        >
          <option value="workbook">{t('nameManager.scope.workbook')}</option>
          <For each={sheets()}>
            {(sheet) => <option value={`sheet:${sheet.id}`}>{sheet.name}</option>}
          </For>
        </select>
        <label for="name-mgr-kind-select">{t('nameManager.kind')}</label>
        <select
          id="name-mgr-kind-select"
          data-testid="name-mgr-kind-select"
          value={kind()}
          disabled={interactionLocked()}
          onChange={(event) =>
            store.setter(nameManagerKindDraftAtom, event.currentTarget.value as NameManagerKind)
          }
        >
          <option value="range">{t('nameManager.kind.range')}</option>
          <option value="value">{t('nameManager.kind.value')}</option>
          <option value="lambda">{t('nameManager.kind.lambda')}</option>
        </select>
        <Show when={kind() === 'lambda'}>
          <label for="name-mgr-params-input">{t('nameManager.params')}</label>
          <input
            id="name-mgr-params-input"
            data-testid="name-mgr-params-input"
            type="text"
            placeholder="x, y, z"
            value={params()}
            disabled={interactionLocked()}
            onInput={(event) => store.setter(nameManagerParamsDraftAtom, event.currentTarget.value)}
          />
        </Show>
        <label for="name-refers-to">
          {kind() === 'lambda' ? t('nameManager.lambdaBody') : t('nameManager.refersTo')}
        </label>
        <input
          id="name-refers-to"
          data-testid="name-refers-to"
          type="text"
          value={refersTo()}
          disabled={interactionLocked()}
          onInput={(event) => store.setter(nameManagerRefersToDraftAtom, event.currentTarget.value)}
        />
      </div>
      <Show when={statusMessage()}>
        {(message) => (
          <div data-testid="name-error-text" role="status">
            {message()}
          </div>
        )}
      </Show>
      <div class="nm-actions">
        <button
          type="button"
          data-testid="name-save-button"
          disabled={!supportsSave()}
          onClick={props.onSave}
        >
          {t('nameManager.save')}
        </button>
        <button
          type="button"
          data-testid="name-delete-button"
          disabled={!supportsDelete()}
          onClick={props.onDelete}
        >
          {t('nameManager.delete')}
        </button>
        <button type="button" data-testid="name-close-button" onClick={props.onClose}>
          {t('nameManager.close')}
        </button>
      </div>
    </>
  )
}
