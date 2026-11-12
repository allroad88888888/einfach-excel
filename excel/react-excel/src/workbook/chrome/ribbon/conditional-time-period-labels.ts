import { useLingui } from '@lingui/react/macro'
import type { TimePeriodRule } from '@einfach-excel/spreadsheet-ui-core'

export function useConditionalTimePeriodLabels(): Record<TimePeriodRule['period'], string> {
  const { t } = useLingui()
  return {
    today: t`Today`, yesterday: t`Yesterday`, tomorrow: t`Tomorrow`,
    last7Days: t`In the last 7 days`,
    thisWeek: t`This week`, lastWeek: t`Last week`, nextWeek: t`Next week`,
    thisMonth: t`This month`, lastMonth: t`Last month`, nextMonth: t`Next month`,
  }
}
