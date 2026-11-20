import { Trans, useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  runTextColumnsPanelAtom,
  textColumnsPanelAtom,
  toA1,
} from '@einfach-excel/spreadsheet-ui-core'

/** 分列样本预览与覆盖确认；直接读取面板 atom，不经 props 传递控制器。 */
export function TextColumnsPreview() {
  const { t } = useLingui()
  const state = useAtomValue(textColumnsPanelAtom)
  const run = useSetAtom(runTextColumnsPanelAtom)
  const busy = state.status === 'applying'
  const { preview } = state

  return (
    <div className="text-columns-preview" aria-busy={state.status === 'previewing'}>
      <div role="status">
        {busy
          ? t`Applying split…`
          : state.status === 'previewing'
            ? t`Loading preview…`
            : preview
              ? t`Output: ${toA1(preview.target.rowStart, preview.target.colStart)}:${toA1(preview.target.rowEnd, preview.target.colEnd)}`
              : t`Update the preview to apply your changes.`}
      </div>
      {preview && (
        <>
          <div className="text-columns-table-scroll" tabIndex={0} aria-label={t`Preview cells`}>
            <table>
              <caption>
                <Trans>Split preview</Trans>
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <Trans>Row</Trans>
                  </th>
                  {preview.sample[0]?.map((_, col) => (
                    <th scope="col" key={col}>
                      {toA1(preview.target.rowStart, preview.target.colStart + col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row, index) => (
                  <tr key={index}>
                    <th scope="row">{preview.target.rowStart + index + 1}</th>
                    {row.map((value, col) => (
                      <td key={col}>
                        {value || (
                          <span className="text-columns-hint">
                            <Trans>(Empty)</Trans>
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.sampleTruncated && (
            <p className="text-columns-hint">
              <Trans>
                Sample shortened: up to 20 rows, 12 columns and 120 characters per field. Apply
                processes all source rows.
              </Trans>
            </p>
          )}
          {preview.overwrittenCells > 0 && (
            <label className="text-columns-check text-columns-warning">
              <input
                type="checkbox"
                checked={state.overwrite}
                disabled={busy}
                onChange={(event) =>
                  void run({ type: 'overwrite', value: event.currentTarget.checked })
                }
              />
              <Trans>Overwrite </Trans>
              {preview.overwrittenCells}
              <Trans> occupied destination cells</Trans>
            </label>
          )}
        </>
      )}
    </div>
  )
}
