import type { Atom, AtomState } from '@einfach/core'
import { useAtomValue } from '@einfach/solid'
import { createMemo, type Accessor } from 'solid-js'

import type { SpreadsheetFeedback } from './types'

/** Maps one feature atom into the bounded feedback surface contract. */
export interface AtomFeedbackPresentationOptions<SourceAtom extends Atom<unknown>> {
  readonly sourceAtom: SourceAtom
  readonly map: (source: AtomState<SourceAtom>) => SpreadsheetFeedback | null
}

/**
 * Reads product state through the current Einfach Solid provider, then derives
 * a renderer-ready accessor without creating a second source of truth.
 */
export function useAtomFeedbackPresentation<SourceAtom extends Atom<unknown>>(
  options: AtomFeedbackPresentationOptions<SourceAtom>,
): Accessor<SpreadsheetFeedback | null> {
  const source = useAtomValue(options.sourceAtom)

  // `useAtomValue`'s broad Atom overload resolves to `unknown`; SourceAtom
  // carries the precise state through this adapter's public contract.
  return createMemo(() => options.map(source() as AtomState<SourceAtom>))
}
