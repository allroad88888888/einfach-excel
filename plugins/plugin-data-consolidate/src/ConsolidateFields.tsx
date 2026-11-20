import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import {
  CONSOLIDATE_FUNCTIONS,
  type ConsolidateFunction,
} from '@einfach-excel/spreadsheet-ui-core'
import { configureConsolidateAtom, consolidatePanelAtom } from './core'
import { consolidateLabels as labels } from './messages'

export function ConsolidateFields() {
  const { i18n } = useLingui()
  const panel = useAtomValue(consolidatePanelAtom)
  const configure = useSetAtom(configureConsolidateAtom)
  if (!panel) return null
  const { draft, busy } = panel

  return (
    <>
      <div className="consolidate-field">
        <label htmlFor="consolidate-fn-select">{i18n._(labels.function)}</label>
        <select
          id="consolidate-fn-select"
          value={draft.function}
          disabled={busy}
          onChange={(event) =>
            void configure({ patch: { function: event.target.value as ConsolidateFunction } })
          }
        >
          {CONSOLIDATE_FUNCTIONS.map((fn) => (
            <option key={fn} value={fn}>
              {i18n._(labels[fn])}
            </option>
          ))}
        </select>
      </div>

      <div className="consolidate-field">
        <label htmlFor="consolidate-ref-input">{i18n._(labels.reference)}</label>
        <div className="consolidate-ref-row">
          <input
            id="consolidate-ref-input"
            type="text"
            value={draft.referenceInput}
            disabled={busy}
            placeholder={i18n._(labels.referencePlaceholder)}
            onChange={(event) => void configure({ patch: { referenceInput: event.target.value } })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void configure('addReference')
              }
            }}
          />
          <button
            type="button"
            data-consolidate-add=""
            disabled={busy}
            onClick={() => void configure('addReference')}
          >
            {i18n._(labels.add)}
          </button>
        </div>
      </div>

      {draft.references.length > 0 && (
        <div className="consolidate-field">
          <span>{i18n._(labels.allReferences)}</span>
          <ul className="consolidate-ref-list" aria-label={i18n._(labels.allReferences)}>
            {draft.references.map((ref, index) => (
              <li key={`${ref}-${index}`} className="consolidate-ref-item">
                <span>{ref}</span>
                <button
                  type="button"
                  data-consolidate-remove={index}
                  disabled={busy}
                  onClick={() => void configure({ removeIndex: index })}
                >
                  {i18n._(labels.remove)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="consolidate-field">
        <label htmlFor="consolidate-dest-input">{i18n._(labels.destination)}</label>
        <input
          id="consolidate-dest-input"
          type="text"
          value={draft.destination}
          disabled={busy}
          onChange={(event) => void configure({ patch: { destination: event.target.value } })}
        />
      </div>

      <fieldset className="consolidate-options">
        <legend>{i18n._(labels.useLabels)}</legend>
        <label>
          <input
            type="checkbox"
            checked={draft.topRow}
            disabled={busy}
            onChange={(event) => void configure({ patch: { topRow: event.target.checked } })}
          />
          {i18n._(labels.topRow)}
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.leftColumn}
            disabled={busy}
            onChange={(event) => void configure({ patch: { leftColumn: event.target.checked } })}
          />
          {i18n._(labels.leftColumn)}
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.createLinks}
            disabled={busy}
            onChange={(event) => void configure({ patch: { createLinks: event.target.checked } })}
          />
          {i18n._(labels.createLinks)}
        </label>
      </fieldset>
    </>
  )
}
