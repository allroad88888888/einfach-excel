import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId } from 'react'
import {
  activeWorkbookSheetAtom,
  configureNativeFilterAtom,
  getColumnLabel,
  nativeFilterFeedbackAtom,
  nativeFilterPanelAtom,
  type ColumnFilterRule,
} from '@einfach/spreadsheet-ui-core'
import { FilterValueChoices } from './FilterValueChoices'

/** 条件字段只编辑面板草稿，不读取工作簿数据或决定哪些行隐藏。 */
export function FilterConditionFields() {
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const panel = useAtomValue(nativeFilterPanelAtom)
  const feedback = useAtomValue(nativeFilterFeedbackAtom)
  const configure = useSetAtom(configureNativeFilterAtom)
  const id = useId()
  const start = panel.range?.colStart ?? 0
  const end = panel.range?.colEnd ?? (sheet?.colCount ?? 1) - 1
  return (
    <>
      {panel.conditions.map((item, index) => (
        <fieldset key={index} disabled={feedback.busy}>
          <legend>{index === 0 ? 'Show rows where' : 'And'}</legend>
          <label htmlFor={`${id}-col-${index}`}>Column</label>
          <select
            id={`${id}-col-${index}`}
            aria-label={`Filter column ${index + 1}`}
            value={item.col}
            disabled={panel.column !== undefined}
            onChange={(event) =>
              void configure({
                type: 'change',
                index,
                patch: { col: Number(event.currentTarget.value) },
              })
            }
          >
            {Array.from({ length: end - start + 1 }, (_, offset) => start + offset).map((col) => (
              <option
                key={col}
                value={col}
                disabled={panel.conditions.some((other, i) => i !== index && other.col === col)}
              >
                {getColumnLabel(col)}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-kind-${index}`}>Condition</label>
          <select
            id={`${id}-kind-${index}`}
            aria-label={`Filter condition ${index + 1}`}
            value={item.kind}
            onChange={(event) =>
              void configure({
                type: 'change',
                index,
                patch: { kind: event.currentTarget.value as ColumnFilterRule['kind'] },
              })
            }
          >
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
            <option value="range">Number range</option>
            <option value="list">One of these values</option>
          </select>
          {panel.browser?.index !== index && (item.kind === 'range' ? (
            <>
              {(['min', 'max'] as const).map((bound) => (
                <label key={bound} className="filter-number-bound">
                  {bound === 'min' ? 'Minimum' : 'Maximum'}
                  <input
                    aria-label={`${bound === 'min' ? 'Minimum' : 'Maximum'} ${index + 1}`}
                    inputMode="decimal"
                    value={item[bound]}
                    onChange={(event) =>
                      void configure({
                        type: 'change',
                        index,
                        patch: { [bound]: event.currentTarget.value },
                      })
                    }
                  />
                </label>
              ))}
            </>
          ) : (
            <>
              <label htmlFor={`${id}-value-${index}`}>
                {item.kind === 'list' ? 'Values (one per line)' : 'Value'}
              </label>
              {item.kind === 'list' ? (
                <textarea
                  id={`${id}-value-${index}`}
                  aria-label={`Filter value ${index + 1}`}
                  value={item.values.join('\n')}
                  readOnly={item.values.some((value) => value.includes('\n'))}
                  onChange={(event) =>
                    void configure({
                      type: 'change',
                      index,
                      patch: { values: event.currentTarget.value.split('\n') },
                    })
                  }
                />
              ) : (
                <input
                  id={`${id}-value-${index}`}
                  aria-label={`Filter value ${index + 1}`}
                  value={item.value}
                  onChange={(event) =>
                    void configure({
                      type: 'change',
                      index,
                      patch: { value: event.currentTarget.value },
                    })
                  }
                />
              )}
              {item.kind !== 'list' && (
                <label className="filter-case">
                  <input
                    type="checkbox"
                    checked={item.caseSensitive}
                    onChange={(event) =>
                      void configure({
                        type: 'change',
                        index,
                        patch: { caseSensitive: event.currentTarget.checked },
                      })
                    }
                  />
                  Match case
                </label>
              )}
            </>
          ))}
          <FilterValueChoices index={index} />
          {panel.browser?.index !== index && item.kind === 'list' && item.values.some((value) => value.includes('\n')) &&
            <p className="size-hint filter-values-hint">Multi-line values stay intact. Use Choose values to change them.</p>}
          {panel.column === undefined && (
            <button
              type="button"
              aria-label={`Remove condition ${index + 1}`}
              disabled={panel.conditions.length === 1}
              onClick={() => void configure({ type: 'remove', index })}
            >
              Remove
            </button>
          )}
        </fieldset>
      ))}
    </>
  )
}
