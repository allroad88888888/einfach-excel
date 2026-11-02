import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  runWatchWindowAtom,
  watchWindowPanelAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import type { JSX } from 'react'
import './formula-auditing.css'

export function WatchWindowPanel(): JSX.Element | null {
  const { t } = useLingui()
  const panel = useAtomValue(watchWindowPanelAtom)
  const runWatch = useSetAtom(runWatchWindowAtom)

  if (!panel.open) return null

  return (
    <section
      className="watch-window-panel"
      data-watch-window-panel="true"
      aria-label={t`Watch Window`}
    >
      <div className="watch-window-header">
        <span>{t`Watch Window`}</span>
        <button
          type="button"
          className="workbook-button"
          data-watch-action="close"
          onClick={() => void runWatch('close')}
        >
          {t`Close`}
        </button>
      </div>

      <div className="watch-window-controls">
        <input
          type="text"
          className="watch-window-input"
          data-watch-input="true"
          value={panel.draftInput}
          placeholder={t`Cell or Sheet!A1 (blank = selection)`}
          aria-label={t`Watch cell reference`}
          onChange={(event) => {
            void runWatch({ setDraft: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void runWatch('add-selection')
            }
          }}
        />
        <button
          type="button"
          className="workbook-button"
          data-watch-action="add"
          onClick={() => void runWatch('add-selection')}
        >
          {t`Add Watch`}
        </button>
        <button
          type="button"
          className="workbook-button"
          data-watch-action="delete"
          disabled={!panel.selectedId}
          onClick={() => void runWatch('delete-selected')}
        >
          {t`Delete Watch`}
        </button>
      </div>

      {panel.error ? (
        <div className="watch-window-error" data-watch-error="true">
          {panel.error}
        </div>
      ) : null}

      <div className="watch-window-table-wrap">
        {panel.entries.length === 0 ? (
          <div className="watch-window-empty" data-watch-empty="true">
            {t`No watched cells yet. Select a cell and click Add Watch.`}
          </div>
        ) : (
          <table className="watch-window-table" data-watch-table="true">
            <thead>
              <tr>
                <th>{t`Sheet`}</th>
                <th>{t`Name`}</th>
                <th>{t`Cell`}</th>
                <th>{t`Value`}</th>
                <th>{t`Formula`}</th>
              </tr>
            </thead>
            <tbody>
              {panel.entries.map((entry) => {
                const isSelected = panel.selectedId === entry.id
                return (
                  <tr
                    key={entry.id}
                    className="watch-window-row"
                    data-watch-row={entry.id}
                    data-selected={isSelected ? 'true' : 'false'}
                    onClick={() => {
                      void runWatch({ navigate: entry.id })
                    }}
                    onDoubleClick={() => {
                      void runWatch({ navigate: entry.id })
                    }}
                  >
                    <td data-watch-col="sheet">{entry.sheetName}</td>
                    <td data-watch-col="name">{entry.name}</td>
                    <td data-watch-col="cell">{entry.addr}</td>
                    <td data-watch-col="value">{entry.value}</td>
                    <td data-watch-col="formula">{entry.formula}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
