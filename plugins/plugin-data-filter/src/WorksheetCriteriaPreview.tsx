import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { configureWorksheetCriteriaAtom, worksheetCriteriaPanelAtom } from './core/worksheet-criteria'
import { criteriaLabels } from './worksheet-criteria-messages'

export function WorksheetCriteriaPreview() {
  const { i18n } = useLingui()
  const panel = useAtomValue(worksheetCriteriaPanelAtom)
  const configure = useSetAtom(configureWorksheetCriteriaAtom)
  if (!panel?.preview) return null
  const { preview } = panel
  const [headers = [], ...rows] = preview.sample
  return <>
    <p role="status">{i18n._(preview.matchedRows === 1 ? criteriaLabels.matchesOne
      : { ...criteriaLabels.matches, values: { n: preview.matchedRows } })}</p>
    <div className="worksheet-criteria-sample">
      <table aria-label={i18n._(criteriaLabels.preview)}>
        <thead><tr>{headers.map((header, column) => <th scope="col" key={column}>{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>
          {row.map((value, column) => <td key={column}>{value}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {preview.sampleTruncated && <p>{i18n._(criteriaLabels.limited)}</p>}
    {preview.overwrittenCells > 0 && <label>
      <input type="checkbox" checked={panel.confirmOverwrite} disabled={panel.busy}
        onChange={event => void configure({ type: 'overwrite', value: event.currentTarget.checked })} />
      {i18n._(preview.overwrittenCells === 1 ? criteriaLabels.overwriteOne
        : { ...criteriaLabels.overwrite, values: { n: preview.overwrittenCells } })}
    </label>}
  </>
}
