import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { configureConsolidateAtom, consolidatePanelAtom } from './core'
import { consolidateLabels as labels } from './messages'

export function ConsolidatePreview() {
  const { i18n } = useLingui()
  const panel = useAtomValue(consolidatePanelAtom)
  const configure = useSetAtom(configureConsolidateAtom)
  if (!panel?.preview) return null
  const { preview, confirmOverwrite, busy } = panel

  return (
    <div className="consolidate-preview" data-consolidate-preview="">
      <p>
        <strong>{i18n._(labels.previewHeading)}:</strong>{' '}
        {i18n._({
          ...labels.previewSummary,
          values: { rows: preview.rowCount, cols: preview.colCount },
        })}
      </p>
      {preview.sample.length > 0 && (
        <table className="consolidate-preview-table">
          <tbody>
            {preview.sample.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => (
                  <td key={colIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {preview.sampleTruncated && <p>{i18n._(labels.previewTruncated)}</p>}
      {preview.overwrittenCells > 0 && (
        <label>
          <input
            type="checkbox"
            checked={confirmOverwrite}
            disabled={busy}
            onChange={(event) =>
              void configure({ confirmOverwrite: event.target.checked })
            }
          />
          {i18n._({ ...labels.confirmOverwrite, values: { count: preview.overwrittenCells } })}
        </label>
      )}
    </div>
  )
}
