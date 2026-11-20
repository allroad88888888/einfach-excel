import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { useId } from 'react'
import {
  colorCandidateBrowserAtom, colorCandidatePageSize as pageSize, configureColorCandidatesAtom,
} from './core/color-candidates'
import { colorLabels as labels } from './color-messages'

interface Props {
  readonly index: number
  readonly selected: string
  readonly automaticLabel: string
  readonly onChoose: (value: string) => void
}

export function ColorChoices({ index, selected, automaticLabel, onChoose }: Props) {
  const { i18n } = useLingui()
  const state = useAtomValue(colorCandidateBrowserAtom)
  const configure = useSetAtom(configureColorCandidatesAtom)
  const browser = state?.index === index ? state : null
  const id = useId()
  const openPage = (offset: number) => void configure({ type: 'read', index, offset })
  const page = browser?.page
  const busy = browser?.status === 'loading'
  return <div className="filter-color-choices">
    <button type="button" aria-expanded={browser !== null} aria-controls={id}
      onClick={() => browser ? void configure({ type: 'close', index }) : openPage(0)}>
      {i18n._(browser ? labels.hide : labels.browse)}
    </button>
    {browser && <section id={id} aria-busy={busy}>
      {busy && <p role="status">{i18n._(labels.loading)}</p>}
      {browser.status === 'error' && <div role="alert"><p>{i18n._(labels.readError)}</p>
        <button type="button" onClick={() => openPage(browser.offset)}>{i18n._(labels.retry)}</button>
      </div>}
      {page && (page.values.length ? <>
        <ul>
          {page.values.map(({ value, count }) => {
            const color = value === 'automatic' ? automaticLabel : value
            return <li key={value}>
              <button type="button" disabled={busy} aria-pressed={value === selected} onClick={() => onChoose(value)}>
                {value !== 'automatic' && <span aria-hidden="true" style={{ backgroundColor: value }} />}
                {i18n._({ ...(count === 1 ? labels.matchingOne : labels.matching),
                  values: { color, count } })}
              </button>
            </li>
          })}
        </ul>
        {page.total > pageSize && <div className="filter-color-pages">
          <button type="button" disabled={busy || page.offset === 0}
            onClick={() => openPage(page.offset - pageSize)}>{i18n._(labels.previous)}</button>
          <p role="status">{i18n._({ ...labels.page, values: {
            first: page.offset + 1, last: page.offset + page.values.length, total: page.total,
          } })}</p>
          <button type="button" disabled={busy || page.offset + page.values.length >= page.total}
            onClick={() => openPage(page.offset + pageSize)}>{i18n._(labels.next)}</button>
        </div>}
      </> : <p role="status">{i18n._(labels.empty)}</p>)}
    </section>}
  </div>
}
