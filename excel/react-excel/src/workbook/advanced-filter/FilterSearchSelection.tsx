import { Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { configureNativeFilterValuesAtom, nativeFilterValuesAtom } from '@einfach/spreadsheet-ui-core'

/** A single Rust query verifies the entire search result before changing the draft. */
export function FilterSearchSelection() {
  const state = useAtomValue(nativeFilterValuesAtom)
  const configure = useSetAtom(configureNativeFilterValuesAtom)
  if (!state?.page) return null
  return <>
    <button type="button" disabled={state.busy || !state.page.total}
      onClick={() => void configure('select-search')}><Trans>Select all search matches</Trans></button>
    <button type="button" disabled={state.busy || !state.page.total || !state.selected.length}
      onClick={() => void configure('clear-search')}><Trans>Clear all search matches</Trans></button>
    <span className="size-hint"><Trans>{state.page.total} search matches</Trans></span>
  </>
}
