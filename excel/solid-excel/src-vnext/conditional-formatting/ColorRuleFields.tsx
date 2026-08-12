/** @jsxImportSource solid-js */

import { Match, Switch, type Accessor } from 'solid-js'
import type {
  ColorScaleRule,
  ConditionalFormatEditorDraft,
  ConditionalFormatEditorDraftUpdate,
  DataBarRule,
} from '@einfach/spreadsheet-ui-core'

interface ColorRuleFieldsProps {
  readonly draft: Accessor<ConditionalFormatEditorDraft | null>
  readonly disabled: Accessor<boolean>
  readonly onUpdate: (update: ConditionalFormatEditorDraftUpdate) => void
}

export function ColorRuleFields(props: ColorRuleFieldsProps) {
  function dataBarRule(): DataBarRule | null {
    const rule = props.draft()?.rule
    return rule?.kind === 'data-bar' ? rule : null
  }

  function colorScaleRule(): ColorScaleRule | null {
    const rule = props.draft()?.rule
    return rule?.kind === 'color-scale' ? rule : null
  }

  function updateDataBar(patch: Partial<DataBarRule>) {
    const rule = dataBarRule()
    if (rule !== null) props.onUpdate({ kind: 'rule', rule: { ...rule, ...patch } })
  }

  function updateColorScale(patch: Partial<ColorScaleRule>) {
    const rule = colorScaleRule()
    if (rule !== null) props.onUpdate({ kind: 'rule', rule: { ...rule, ...patch } })
  }

  return (
    <Switch>
      <Match when={dataBarRule() !== null}>
        <div class="cf-form-row">
          <label class="cf-form-label" for="cf-data-bar-min-color">
            Minimum color
          </label>
          <input
            id="cf-data-bar-min-color"
            data-testid="cf-data-bar-min-color"
            disabled={props.disabled()}
            value={dataBarRule()?.minColor ?? ''}
            onChange={(event) => {
              const minColor = (event.target as HTMLInputElement).value
              updateDataBar({ ...(minColor.length === 0 ? { minColor: undefined } : { minColor }) })
            }}
          />
        </div>
        <div class="cf-form-row">
          <label class="cf-form-label" for="cf-data-bar-max-color">
            Maximum color
          </label>
          <input
            id="cf-data-bar-max-color"
            data-testid="cf-data-bar-max-color"
            disabled={props.disabled()}
            value={dataBarRule()?.maxColor ?? ''}
            onChange={(event) => {
              const maxColor = (event.target as HTMLInputElement).value
              updateDataBar({ ...(maxColor.length === 0 ? { maxColor: undefined } : { maxColor }) })
            }}
          />
        </div>
      </Match>
      <Match when={colorScaleRule() !== null}>
        <div class="cf-form-row">
          <label class="cf-form-label" for="cf-color-scale-min-color">
            Minimum color
          </label>
          <input
            id="cf-color-scale-min-color"
            data-testid="cf-color-scale-min-color"
            disabled={props.disabled()}
            value={colorScaleRule()?.minColor ?? ''}
            onChange={(event) =>
              updateColorScale({ minColor: (event.target as HTMLInputElement).value })
            }
          />
        </div>
        <div class="cf-form-row">
          <label class="cf-form-label" for="cf-color-scale-mid-color">
            Middle color
          </label>
          <input
            id="cf-color-scale-mid-color"
            data-testid="cf-color-scale-mid-color"
            disabled={props.disabled()}
            value={colorScaleRule()?.midColor ?? ''}
            onChange={(event) => {
              const midColor = (event.target as HTMLInputElement).value
              updateColorScale({
                ...(midColor.length === 0 ? { midColor: undefined } : { midColor }),
              })
            }}
          />
        </div>
        <div class="cf-form-row">
          <label class="cf-form-label" for="cf-color-scale-max-color">
            Maximum color
          </label>
          <input
            id="cf-color-scale-max-color"
            data-testid="cf-color-scale-max-color"
            disabled={props.disabled()}
            value={colorScaleRule()?.maxColor ?? ''}
            onChange={(event) =>
              updateColorScale({ maxColor: (event.target as HTMLInputElement).value })
            }
          />
        </div>
      </Match>
    </Switch>
  )
}
