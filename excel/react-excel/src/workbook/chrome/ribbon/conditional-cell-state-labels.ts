import { useLingui } from '@lingui/react/macro'

export function useConditionalCellStateLabels() {
  const { t } = useLingui()
  return {
    blank: t`Blank cells`,
    'not-blank': t`Non-blank cells`,
    error: t`Error cells`,
    'not-error': t`Non-error cells`,
  }
}
