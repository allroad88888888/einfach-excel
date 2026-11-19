import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui, Trans } from '@lingui/react/macro'
import {
  findReplacePanelAtom,
  hasFindFormatCriteria,
  runFindReplaceAtom,
  type FindNumberFormatKind,
  type RustFindFormatFilter,
} from '@einfach-excel/spreadsheet-ui-core'

function triValue(value: boolean | undefined): '' | 'true' | 'false' {
  return value === undefined ? '' : value ? 'true' : 'false'
}

function parseTri(value: string): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined
}

function FormatFields({
  kind,
  value,
  disabled,
  onPatch,
  onSample,
  onClear,
}: {
  readonly kind: 'find' | 'replace'
  readonly value: RustFindFormatFilter | undefined
  readonly disabled: boolean
  readonly onPatch: (patch: Partial<RustFindFormatFilter>) => void
  readonly onSample: () => void
  readonly onClear: () => void
}) {
  const { t } = useLingui()
  const current = value ?? {}
  const active = hasFindFormatCriteria(value)
  const heading = kind === 'find' ? t`Find format` : t`Replace format`

  return (
    <fieldset
      className="find-format-group"
      disabled={disabled}
      data-find-format-group={kind}
    >
      <div className="find-format-header">
        <legend>{heading}</legend>
        <div className="find-format-buttons">
          <button type="button" onClick={onSample}>
            <Trans>From active cell</Trans>
          </button>
          <button type="button" disabled={!active} onClick={onClear}>
            <Trans>Clear format</Trans>
          </button>
        </div>
      </div>
      <div className="find-format-grid">
        <label>
          <span><Trans>Bold</Trans></span>
          <select
            aria-label={kind === 'find' ? t`Find bold` : t`Replace bold`}
            value={triValue(current.bold)}
            onChange={(event) => onPatch({ bold: parseTri(event.currentTarget.value) })}
          >
            <option value=""><Trans>Any</Trans></option>
            <option value="true"><Trans>Yes</Trans></option>
            <option value="false"><Trans>No</Trans></option>
          </select>
        </label>
        <label>
          <span><Trans>Italic</Trans></span>
          <select
            aria-label={kind === 'find' ? t`Find italic` : t`Replace italic`}
            value={triValue(current.italic)}
            onChange={(event) => onPatch({ italic: parseTri(event.currentTarget.value) })}
          >
            <option value=""><Trans>Any</Trans></option>
            <option value="true"><Trans>Yes</Trans></option>
            <option value="false"><Trans>No</Trans></option>
          </select>
        </label>
        <label>
          <span><Trans>Underline</Trans></span>
          <select
            aria-label={kind === 'find' ? t`Find underline` : t`Replace underline`}
            value={triValue(current.underline)}
            onChange={(event) => onPatch({ underline: parseTri(event.currentTarget.value) })}
          >
            <option value=""><Trans>Any</Trans></option>
            <option value="true"><Trans>Yes</Trans></option>
            <option value="false"><Trans>No</Trans></option>
          </select>
        </label>
        <label>
          <span><Trans>Fill color</Trans></span>
          <input
            aria-label={kind === 'find' ? t`Find fill color` : t`Replace fill color`}
            type="text"
            placeholder={t`#fff2cc or none`}
            value={current.bgColor ?? ''}
            onChange={(event) =>
              onPatch({ bgColor: event.currentTarget.value || undefined })
            }
          />
        </label>
        <label>
          <span><Trans>Text color</Trans></span>
          <input
            aria-label={kind === 'find' ? t`Find text color` : t`Replace text color`}
            type="text"
            placeholder={t`#c00000 or none`}
            value={current.textColor ?? ''}
            onChange={(event) =>
              onPatch({ textColor: event.currentTarget.value || undefined })
            }
          />
        </label>
        <label>
          <span><Trans>Number format</Trans></span>
          <select
            aria-label={kind === 'find' ? t`Find number format` : t`Replace number format`}
            value={current.numberFormat ?? ''}
            onChange={(event) =>
              onPatch({
                numberFormat: (event.currentTarget.value || undefined) as
                  | FindNumberFormatKind
                  | undefined,
              })
            }
          >
            <option value=""><Trans>Any</Trans></option>
            <option value="general"><Trans>General</Trans></option>
            <option value="number"><Trans>Number</Trans></option>
            <option value="currency"><Trans>Currency</Trans></option>
            <option value="accounting"><Trans>Accounting</Trans></option>
            <option value="percent"><Trans>Percent</Trans></option>
            <option value="date"><Trans>Date</Trans></option>
            <option value="time"><Trans>Time</Trans></option>
            <option value="text"><Trans>Text</Trans></option>
            <option value="custom"><Trans>Custom</Trans></option>
          </select>
        </label>
      </div>
    </fieldset>
  )
}

export function FindFormatSection() {
  const state = useAtomValue(findReplacePanelAtom)
  const run = useSetAtom(runFindReplaceAtom)
  const busy = state.busy !== null
  const hasFind = hasFindFormatCriteria(state.form.format)
  const hasReplace = hasFindFormatCriteria(state.form.replaceFormat)

  return (
    <details
      className="find-format-details"
      open={hasFind || hasReplace ? true : undefined}
    >
      <summary>
        <Trans>Format criteria</Trans>
        {(hasFind || hasReplace) && <span className="find-format-badge">●</span>}
      </summary>
      <div className="find-format-body">
        <FormatFields
          kind="find"
          value={state.form.format}
          disabled={busy}
          onPatch={(patch) =>
            void run({ form: { format: { ...state.form.format, ...patch } } })
          }
          onSample={() => void run('sample-find-format')}
          onClear={() => void run({ form: { format: undefined } })}
        />
        {state.tab === 'replace' && (
          <FormatFields
            kind="replace"
            value={state.form.replaceFormat}
            disabled={busy}
            onPatch={(patch) =>
              void run({
                form: { replaceFormat: { ...state.form.replaceFormat, ...patch } },
              })
            }
            onSample={() => void run('sample-replace-format')}
            onClear={() => void run({ form: { replaceFormat: undefined } })}
          />
        )}
      </div>
    </details>
  )
}
