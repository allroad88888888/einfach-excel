import { useAtomValue, useSetAtom } from '@einfach/react'
import { Trans } from '@lingui/react/macro'
import { nativeDataValidationPanelAtom, runNativeDataValidationAtom,
  type NativeValidationErrorStyle } from '@einfach-excel/spreadsheet-ui-core'

export interface AdvancedValidationFieldsProps { readonly id: string }

/** 字段直接读写 Core 表单；公式内容交给 Rust 解析，React 不求值。 */
export function AdvancedValidationFields({ id }: AdvancedValidationFieldsProps) {
  const state = useAtomValue(nativeDataValidationPanelAtom)
  const run = useSetAtom(runNativeDataValidationAtom)
  return (
    <>
      {state.kind === 'custom-formula' && (
        <>
          <label htmlFor={`${id}-formula`}>
            <Trans>Validation formula</Trans>
          </label>
          <input
            id={`${id}-formula`}
            value={state.formula}
            required
            spellCheck={false}
            onChange={(event) => void run({ formula: event.currentTarget.value })}
          />
          <p>
            <Trans>
              References are relative to the top left cell of Applies to. The formula must return
              TRUE.
            </Trans>
          </p>
        </>
      )}
      <label htmlFor={`${id}-show-input`}>
        <Trans>Show input message when selected</Trans>
      </label>
      <input
        id={`${id}-show-input`}
        type="checkbox"
        checked={state.showInputMessage}
        onChange={(event) => void run({ showInputMessage: event.currentTarget.checked })}
      />
      {state.showInputMessage && (
        <>
          <label htmlFor={`${id}-input-title`}>
            <Trans>Input title</Trans>
          </label>
          <input
            id={`${id}-input-title`}
            value={state.inputTitle}
            maxLength={64}
            onChange={(event) => void run({ inputTitle: event.currentTarget.value })}
          />
          <label htmlFor={`${id}-input-message`}>
            <Trans>Input message</Trans>
          </label>
          <textarea
            id={`${id}-input-message`}
            value={state.inputMessage}
            rows={3}
            maxLength={510}
            onChange={(event) => void run({ inputMessage: event.currentTarget.value })}
          />
        </>
      )}
      <label htmlFor={`${id}-error-style`}>
        <Trans>Error alert</Trans>
      </label>
      <select
        id={`${id}-error-style`}
        value={state.errorStyle}
        onChange={(event) =>
          void run({ errorStyle: event.currentTarget.value as NativeValidationErrorStyle })
        }
      >
        <option value="stop">
          <Trans>Stop</Trans>
        </option>
        <option value="warning">
          <Trans>Warning</Trans>
        </option>
        <option value="information">
          <Trans>Information</Trans>
        </option>
      </select>
      <label htmlFor={`${id}-error-title`}>
        <Trans>Error title</Trans>
      </label>
      <input
        id={`${id}-error-title`}
        value={state.errorTitle}
        maxLength={64}
        onChange={(event) => void run({ errorTitle: event.currentTarget.value })}
      />
      <label htmlFor={`${id}-error-message`}>
        <Trans>Error message</Trans>
      </label>
      <textarea
        id={`${id}-error-message`}
        value={state.errorMessage}
        rows={3}
        maxLength={510}
        onChange={(event) => void run({ errorMessage: event.currentTarget.value })}
      />
      {state.errorStyle !== 'stop' && (
        <p>
          <Trans>Invalid input requires an explicit Continue or Cancel choice.</Trans>
        </p>
      )}
    </>
  )
}
