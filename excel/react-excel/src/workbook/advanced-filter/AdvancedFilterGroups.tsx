import { Trans, useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  configureAdvancedFilterAtom, configureNativeFilterAtom, nativeAdvancedFilterGroupsAtom,
  nativeFilterFeedbackAtom, nativeFilterPanelAtom,
} from '@einfach/spreadsheet-ui-core'
import { FilterConditionFields } from '../chrome/ribbon/FilterConditionFields'
import './advanced-filter.css'

/** Group boundaries describe OR, while the existing condition fields retain their DOM behavior. */
export function AdvancedFilterGroups() {
  const { t } = useLingui()
  const groups = useAtomValue(nativeAdvancedFilterGroupsAtom)
  const panel = useAtomValue(nativeFilterPanelAtom)
  const feedback = useAtomValue(nativeFilterFeedbackAtom)
  const configure = useSetAtom(configureAdvancedFilterAtom)
  const configureFilter = useSetAtom(configureNativeFilterAtom)
  const busy = feedback.busy || !!panel.browser?.busy
  return <div className="advanced-filter-groups">
    <p className="size-hint"><Trans>All conditions in a group must match. Any group can show a row.</Trans></p>
    {groups.map(({ group, conditions }, position) => <div key={group} className="advanced-filter-group">
      {position > 0 && <p className="advanced-filter-or"><Trans>Or</Trans></p>}
      <fieldset disabled={busy} aria-label={t`Filter group ${position + 1}`}>
        <legend>{t`Group ${position + 1} · AND`}</legend>
        <FilterConditionFields indices={conditions.map((item) => item.index)}
          grouped={panel.advanced} />
        <div className="advanced-filter-group-actions">
          <button type="button" disabled={conditions.length >= 8 || panel.conditions.length >= 32}
            onClick={() => void (panel.advanced
              ? configure({ type: 'add-condition', group }) : configureFilter('add'))}>
            {position === 0 ? t`Add condition` : t`Add condition to group ${position + 1}`}
          </button>
          <button type="button" aria-label={t`Remove group ${position + 1}`}
            disabled={groups.length === 1} onClick={() => void configure({ type: 'remove-group', group })}>
            <Trans>Remove group</Trans>
          </button>
        </div>
      </fieldset>
    </div>)}
    <button type="button" disabled={busy || groups.length >= 8 || panel.conditions.length >= 32}
      onClick={() => void configure('add-group')}><Trans>Add OR group</Trans></button>
    <p className="size-hint"><Trans>Up to 8 groups and 32 conditions; each group can contain up to 8 conditions.</Trans></p>
  </div>
}
