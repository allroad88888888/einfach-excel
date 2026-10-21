import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId } from 'react'
import { configureNativeFilterValuesAtom, nativeFilterValuesAtom } from '@einfach/spreadsheet-ui-core'
import { FilterSearchSelection } from '../../advanced-filter/FilterSearchSelection'

/** 候选、数量和页界直接来自 Rust；选中的原始字符串留在 UI Core 条件草稿。 */
export function FilterValueChoices({ index }: { index: number }) {
  const { i18n, t } = useLingui()
  const state = useAtomValue(nativeFilterValuesAtom)
  const run = useSetAtom(configureNativeFilterValuesAtom)
  const id = useId()
  const open = state?.index === index
  const page = open ? state.page : undefined
  return <div className="filter-values">
    <button type="button" aria-expanded={open} aria-controls={id}
      aria-label={open ? t`Hide values for condition ${index + 1}` : t`Choose values for condition ${index + 1}`}
      onClick={() => void run(open ? 'close' : { type: 'open', index })}>
      {open ? t`Hide values` : t`Choose values…`}
    </button>
    {open && <section id={id} aria-label={t`Filter values`} aria-busy={state.busy}>
      <p className="size-hint"><Trans>Choose values to show. Other column filters still apply.</Trans></p>
      <div className="filter-values-search">
        <input type="search" aria-label={t`Search filter values`} placeholder={t`Search values`}
          maxLength={32767} value={state.search}
          onChange={(event) => void run({ type: 'search-text', value: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); void run('search') }
          }} />
        <button type="button" disabled={state.busy} onClick={() => void run('search')}><Trans>Search</Trans></button>
      </div>
      {state.busy && <p role="status"><Trans>Loading values…</Trans></p>}
      {state.error && <div role="alert" className="size-error">
        <p>{translateFeedback(i18n, state.error)}</p>
        {!page && <button type="button" onClick={() => void run('retry')}><Trans>Retry values</Trans></button>}
      </div>}
      {!state.busy && !state.error && !page && <p role="status"><Trans>Press Search to load matching values.</Trans></p>}
      {page && <>
        <div className="filter-values-actions">
          <button type="button" disabled={!page.values.length} onClick={() => void run('select-page')}><Trans>Select page</Trans></button>
          <button type="button" disabled={!state.selected.length}
            onClick={() => void run('clear-selection')}><Trans>Clear selection</Trans></button>
          <span aria-label={t`Selected filter values`}><Trans>{state.selected.length} selected</Trans></span>
          <FilterSearchSelection />
        </div>
        {page.values.length ? <div className="filter-values-list">
          {page.values.map((entry) => {
            const label = entry.value === '' ? t`(Blanks)`
              : entry.value.trim() === '' ? t`(Whitespace: ${entry.value.length})` : entry.value
            return <label key={entry.value}>
              <input type="checkbox" aria-label={t`Select value ${label}`}
                checked={state.selected.includes(entry.value)}
                onChange={() => void run({ type: 'toggle', value: entry.value })} />
              <span className="filter-values-label">{label}</span>
              <span className="filter-values-count" title={t`Matching rows`}>{entry.count}</span>
            </label>
          })}
        </div> : <p role="status"><Trans>No matching values. Try another search.</Trans></p>}
        <div className="filter-values-pages">
          <button type="button" aria-label={t`Previous filter values page`} disabled={page.offset === 0}
            onClick={() => void run('previous')}><Trans>Previous</Trans></button>
          <span role="status" aria-label={t`Filter values page`}>
            {page.values.length ? page.offset + 1 : 0}–{page.offset + page.values.length}
            {t` of `}{page.total}
          </span>
          <button type="button" aria-label={t`Next filter values page`}
            disabled={page.offset + page.values.length >= page.total} onClick={() => void run('next')}><Trans>Next</Trans></button>
        </div>
      </>}
    </section>}
  </div>
}
