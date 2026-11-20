import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { configureWorksheetCriteriaAtom, worksheetCriteriaPanelAtom } from './core/worksheet-criteria'
import { criteriaLabels } from './worksheet-criteria-messages'

export function WorksheetCriteriaFields() {
  const { i18n } = useLingui()
  const panel = useAtomValue(worksheetCriteriaPanelAtom)
  const configure = useSetAtom(configureWorksheetCriteriaAtom)
  if (!panel) return null
  const { draft } = panel
  return <fieldset disabled={panel.busy}>
    <div className="worksheet-criteria-modes">
      <label><input type="radio" name="worksheet-criteria-mode" checked={panel.mode === 'in-place'}
        onChange={() => void configure({ type: 'mode', mode: 'in-place' })} />
      {i18n._(criteriaLabels.inPlace)}</label>
      <label><input type="radio" name="worksheet-criteria-mode" checked={panel.mode === 'copy'}
        onChange={() => void configure({ type: 'mode', mode: 'copy' })} />
      {i18n._(criteriaLabels.copy)}</label>
    </div>
    <label className="worksheet-criteria-field">{i18n._(criteriaLabels.source)}
      <input type="text" value={draft.source} maxLength={1024} spellCheck={false}
        onChange={event => void configure({ type: 'draft', patch: { source: event.currentTarget.value } })} />
    </label>
    <label className="worksheet-criteria-field">{i18n._(criteriaLabels.criteria)}
      <input type="text" value={draft.criteria} maxLength={1024} spellCheck={false}
        onChange={event => void configure({ type: 'draft', patch: { criteria: event.currentTarget.value } })} />
    </label>
    {panel.mode === 'copy' && <>
      <label className="worksheet-criteria-field">{i18n._(criteriaLabels.destination)}
        <input type="text" value={draft.destination} maxLength={1024} spellCheck={false}
          onChange={event => void configure({ type: 'draft', patch: { destination: event.currentTarget.value } })} />
      </label>
      <label className="worksheet-criteria-field">{i18n._(criteriaLabels.fields)}
        <textarea value={draft.outputFields} rows={2} maxLength={32767}
          onChange={event => void configure({ type: 'draft', patch: { outputFields: event.currentTarget.value } })} />
      </label>
    </>}
    <label><input type="checkbox" checked={draft.uniqueOnly}
      onChange={event => void configure({ type: 'draft', patch: { uniqueOnly: event.currentTarget.checked } })} />
    {i18n._(criteriaLabels.unique)}</label>
  </fieldset>
}
