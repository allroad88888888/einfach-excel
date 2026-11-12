import { useId } from 'react'
import { Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  configureFillSeriesAtom,
  directionalFillFeedbackAtom,
  fillSeriesPanelAtom,
} from '@einfach-excel/spreadsheet-ui-core'

/** Explicit geometric parameters are drafts; native Rust reads the starting cell. */
export function SeriesStepFields() {
  const id = useId()
  const state = useAtomValue(fillSeriesPanelAtom)
  const { busy } = useAtomValue(directionalFillFeedbackAtom)
  const run = useSetAtom(configureFillSeriesAtom)
  return (
    <>
      <label htmlFor={`${id}-step`}>
        <Trans>Step value</Trans>
      </label>
      <input
        id={`${id}-step`}
        type="text"
        inputMode="decimal"
        required
        value={state.step}
        disabled={busy}
        onChange={(event) => void run({ field: 'step', value: event.currentTarget.value })}
      />
      <label htmlFor={`${id}-stop`}>
        <Trans>Stop value (optional)</Trans>
      </label>
      <input
        id={`${id}-stop`}
        type="text"
        inputMode="decimal"
        value={state.stop}
        disabled={busy}
        onChange={(event) => void run({ field: 'stop', value: event.currentTarget.value })}
      />
    </>
  )
}
