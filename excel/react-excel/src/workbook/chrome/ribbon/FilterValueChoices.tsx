import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId } from 'react'
import { configureNativeFilterValuesAtom, nativeFilterValuesAtom } from '@einfach/spreadsheet-ui-core'

/** 候选、数量和页界直接来自 Rust；选中的原始字符串留在 UI Core 条件草稿。 */
export function FilterValueChoices({ index }: { index: number }) {
  const state = useAtomValue(nativeFilterValuesAtom)
  const run = useSetAtom(configureNativeFilterValuesAtom)
  const id = useId()
  const open = state?.index === index
  const page = open ? state.page : undefined
  return <div className="filter-values">
    <button type="button" aria-expanded={open} aria-controls={id}
      aria-label={`${open ? 'Hide' : 'Choose'} values for condition ${index + 1}`}
      onClick={() => void run(open ? 'close' : { type: 'open', index })}>
      {open ? 'Hide values' : 'Choose values…'}
    </button>
    {open && <section id={id} aria-label="Filter values" aria-busy={state.busy}>
      <p className="size-hint">Choose values to show. Other column filters still apply.</p>
      <div className="filter-values-search">
        <input type="search" aria-label="Search filter values" placeholder="Search values"
          maxLength={32767} value={state.search}
          onChange={(event) => void run({ type: 'search-text', value: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); void run('search') }
          }} />
        <button type="button" disabled={state.busy} onClick={() => void run('search')}>Search</button>
      </div>
      {state.busy && <p role="status">Loading values…</p>}
      {state.error && <div role="alert" className="size-error">
        <p>{state.error}</p>
        {!page && <button type="button" onClick={() => void run('retry')}>Retry values</button>}
      </div>}
      {!state.busy && !state.error && !page && <p role="status">Press Search to load matching values.</p>}
      {page && <>
        <div className="filter-values-actions">
          <button type="button" disabled={!page.values.length} onClick={() => void run('select-page')}>Select page</button>
          <button type="button" disabled={!state.selected.length}
            onClick={() => void run('clear-selection')}>Clear selection</button>
          <span aria-label="Selected filter values">{state.selected.length} selected</span>
        </div>
        {page.values.length ? <div className="filter-values-list">
          {page.values.map((entry) => {
            const label = entry.value === '' ? '(Blanks)'
              : entry.value.trim() === '' ? `(Whitespace: ${entry.value.length})` : entry.value
            return <label key={entry.value}>
              <input type="checkbox" aria-label={`Select value ${label}`}
                checked={state.selected.includes(entry.value)}
                onChange={() => void run({ type: 'toggle', value: entry.value })} />
              <span className="filter-values-label">{label}</span>
              <span className="filter-values-count" title="Matching rows">{entry.count}</span>
            </label>
          })}
        </div> : <p role="status">No matching values. Try another search.</p>}
        <div className="filter-values-pages">
          <button type="button" aria-label="Previous filter values page" disabled={page.offset === 0}
            onClick={() => void run('previous')}>Previous</button>
          <span role="status" aria-label="Filter values page">
            {page.values.length ? page.offset + 1 : 0}–{page.offset + page.values.length}
            {' of '}{page.total}
          </span>
          <button type="button" aria-label="Next filter values page"
            disabled={page.offset + page.values.length >= page.total} onClick={() => void run('next')}>Next</button>
        </div>
      </>}
    </section>}
  </div>
}
