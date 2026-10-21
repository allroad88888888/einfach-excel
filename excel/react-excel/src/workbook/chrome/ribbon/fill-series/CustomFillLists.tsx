import { Trans, useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId } from 'react'
import { configureFillSeriesAtom, directionalFillFeedbackAtom,
  fillSeriesPanelAtom } from '@einfach/spreadsheet-ui-core'

/** 仅渲染会话预设；配置命令直接读写 Core atom，不经 props 传控制器。 */
export function CustomFillLists() {
  const { t } = useLingui()
  const state = useAtomValue(fillSeriesPanelAtom)
  const busy = useAtomValue(directionalFillFeedbackAtom).busy
  const run = useSetAtom(configureFillSeriesAtom)
  const id = useId()
  return <fieldset className="custom-fill-lists" disabled={busy}>
    <legend><Trans>Custom lists</Trans></legend>
    <label htmlFor={`${id}-saved`}><Trans>Saved lists</Trans></label>
    <select id={`${id}-saved`} value={state.selectedList ?? ''}
      onChange={event => void run({ field: 'selectedList', value: event.currentTarget.value })}>
      <option value=""><Trans>New unsaved list</Trans></option>
      {state.lists.map((list, index) => <option key={index} value={index}>{list.name}</option>)}
    </select>
    <label htmlFor={`${id}-name`}><Trans>List name</Trans></label>
    <input id={`${id}-name`} maxLength={64} value={state.listName}
      onChange={event => void run({ field: 'listName', value: event.currentTarget.value })} />
    <label htmlFor={`${id}-items`}><Trans>Custom list items</Trans></label>
    <textarea id={`${id}-items`} rows={4} maxLength={16_384} required value={state.listText}
      placeholder={t`Low
Medium
High`}
      onChange={event => void run({ field: 'listText', value: event.currentTarget.value })} />
    <div className="custom-list-actions">
      <button type="button" onClick={() => void run('new-list')}><Trans>New list</Trans></button>
      <button type="button" onClick={() => void run('save-list')}><Trans>Save list</Trans></button>
      <button type="button" disabled={state.selectedList === null}
        onClick={() => void run('delete-list')}><Trans>Delete list</Trans></button>
    </div>
    <p className="size-hint"><Trans>Lists stay in this workbook session only. Save list stores a preset;
      Apply series changes cells. Unsaved edits do not change the saved list.</Trans></p>
  </fieldset>
}
