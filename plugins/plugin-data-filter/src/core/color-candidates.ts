import { atom } from '@einfach/core'
import {
  nativeFilterPanelAtom,
  readNativeFilterCandidatePageAtom,
  type FilterColorSource,
  type RustFilterValuesPage,
} from '@einfach-excel/spreadsheet-ui-core'

export const colorCandidatePageSize = 24

interface Browser {
  readonly session: symbol
  readonly index: number
  readonly column: number
  readonly source: FilterColorSource
  readonly offset: number
  readonly status: 'loading' | 'error' | 'ready'
  readonly page?: RustFilterValuesPage
}

const browserAtom = atom<Browser | null>(null)

export const colorCandidateBrowserAtom = atom(get => {
  const browser = get(browserAtom)
  const panel = get(nativeFilterPanelAtom)
  const condition = browser && panel.conditions[browser.index]
  const rule = condition && condition.nativeRule
  return browser && browser.session === panel.session && condition?.col === browser.column &&
    condition.kind === 'color' && rule?.kind === 'color' && rule.source === browser.source
    ? browser : null
})
colorCandidateBrowserAtom.debugLabel = 'plugin.dataFilter.colorCandidateBrowser'

type Action = { readonly index: number } & (
  | { readonly type: 'close' }
  | { readonly type: 'read'; readonly offset: number }
)

/** Candidate pages belong to one open filter and never write its condition. */
export const configureColorCandidatesAtom = atom(null, async (get, set, action: Action) => {
  const browser = get(colorCandidateBrowserAtom)
  if (action.type === 'close') {
    if (browser?.index === action.index) set(browserAtom, null)
    return
  }
  const { session, conditions } = get(nativeFilterPanelAtom)
  const condition = conditions[action.index]
  const rule = condition?.nativeRule
  if (!session || condition?.kind !== 'color' || rule?.kind !== 'color') return

  const pending: Browser = {
    session, index: action.index, column: condition.col, source: rule.source, offset: action.offset,
    status: 'loading', page: browser?.index === action.index ? browser.page : undefined,
  }
  set(browserAtom, pending)
  try {
    const response = set(readNativeFilterCandidatePageAtom, {
      index: action.index, offset: action.offset,
      limit: colorCandidatePageSize, colorSource: rule.source,
    })
    // The async atom publishes loading before the Worker response arrives.
    await Promise.resolve()
    if (get(browserAtom) === pending) set(browserAtom, pending)
    const page = await response
    if (get(colorCandidateBrowserAtom) === pending)
      set(browserAtom, { ...pending, status: 'ready', page })
  } catch {
    if (get(colorCandidateBrowserAtom) === pending)
      set(browserAtom, { ...pending, status: 'error' })
  }
})
configureColorCandidatesAtom.debugLabel = 'plugin.dataFilter.configureColorCandidates'
