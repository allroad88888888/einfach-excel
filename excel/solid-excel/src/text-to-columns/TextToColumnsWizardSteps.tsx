/** @jsxImportSource solid-js */

import { For, Show } from 'solid-js'
import { useT } from '../i18n'
import type {
  TextToColumnsColumnFormat,
  TextToColumnsDelimitedConfig,
  TextToColumnsDelimiter,
  TextToColumnsFixedConfig,
  TextToColumnsIntent,
  TextToColumnsTextQualifier,
  TextToColumnsWizardState,
} from '@einfach/spreadsheet-ui-core'

const DELIMITER_KEYS: readonly TextToColumnsDelimiter[] = [
  'tab',
  'semicolon',
  'comma',
  'space',
  'other',
]

interface TextToColumnsWizardStepsProps {
  readonly wizard: TextToColumnsWizardState
  readonly columnCount: number
  readonly disabled: boolean
  readonly onIntent: (intent: TextToColumnsIntent) => void
}

/** Presents the current Core wizard state without owning any wizard state. */
export function TextToColumnsWizardSteps(props: TextToColumnsWizardStepsProps) {
  return (
    <Show when={props.wizard.step === 'step-1'} fallback={<WizardStepTwoOrThree {...props} />}>
      <Step1
        mode={(props.wizard as Extract<TextToColumnsWizardState, { step: 'step-1' }>).mode}
        disabled={props.disabled}
        onMode={(mode) => props.onIntent({ kind: 'set-mode', mode })}
      />
    </Show>
  )
}

function WizardStepTwoOrThree(props: TextToColumnsWizardStepsProps) {
  return (
    <Show
      when={props.wizard.step === 'step-2-delimited'}
      fallback={<WizardStepFixedOrFormats {...props} />}
    >
      <Step2Delimited
        config={
          (props.wizard as Extract<TextToColumnsWizardState, { step: 'step-2-delimited' }>)
            .delimited
        }
        disabled={props.disabled}
        onToggle={(delimiter) => props.onIntent({ kind: 'toggle-delimiter', delimiter })}
        onOther={(value) => props.onIntent({ kind: 'set-other-char', value })}
        onTreatConsecutive={(value) => props.onIntent({ kind: 'set-treat-consecutive', value })}
        onQualifier={(value) => props.onIntent({ kind: 'set-text-qualifier', value })}
      />
    </Show>
  )
}

function WizardStepFixedOrFormats(props: TextToColumnsWizardStepsProps) {
  return (
    <Show when={props.wizard.step === 'step-2-fixed'} fallback={<WizardStepFormats {...props} />}>
      <Step2Fixed
        config={(props.wizard as Extract<TextToColumnsWizardState, { step: 'step-2-fixed' }>).fixed}
        disabled={props.disabled}
        onBreakpoints={(value) => props.onIntent({ kind: 'set-fixed-breakpoints', value })}
      />
    </Show>
  )
}

function WizardStepFormats(props: TextToColumnsWizardStepsProps) {
  const state = () => props.wizard as Extract<TextToColumnsWizardState, { step: 'step-3' }>
  return (
    <Step3
      formats={state().formats}
      columnCount={props.columnCount}
      disabled={props.disabled}
      onFormat={(columnIndex, format) =>
        props.onIntent({ kind: 'set-column-format', columnIndex, format })
      }
    />
  )
}

interface Step1Props {
  readonly mode: 'delimited' | 'fixed'
  readonly disabled: boolean
  readonly onMode: (mode: 'delimited' | 'fixed') => void
}

function Step1(props: Step1Props) {
  const t = useT()
  return (
    <fieldset class="ttc-section" data-testid="ttc-step-1" disabled={props.disabled}>
      <legend class="ttc-section-title">{t('textToColumns.step1.title')}</legend>
      <label class="ttc-radio">
        <input
          type="radio"
          name="ttc-mode"
          data-testid="ttc-mode-delimited"
          checked={props.mode === 'delimited'}
          disabled={props.disabled}
          onChange={() => props.onMode('delimited')}
        />
        {t('textToColumns.step1.delimited')}
      </label>
      <label class="ttc-radio">
        <input
          type="radio"
          name="ttc-mode"
          data-testid="ttc-mode-fixed"
          checked={props.mode === 'fixed'}
          disabled={props.disabled}
          onChange={() => props.onMode('fixed')}
        />
        {t('textToColumns.step1.fixed')}
      </label>
    </fieldset>
  )
}

interface Step2DelimitedProps {
  readonly config: TextToColumnsDelimitedConfig
  readonly disabled: boolean
  readonly onToggle: (delimiter: TextToColumnsDelimiter) => void
  readonly onOther: (value: string) => void
  readonly onTreatConsecutive: (value: boolean) => void
  readonly onQualifier: (value: TextToColumnsTextQualifier) => void
}

function Step2Delimited(props: Step2DelimitedProps) {
  const t = useT()
  return (
    <fieldset class="ttc-section" data-testid="ttc-step-2-delimited" disabled={props.disabled}>
      <legend class="ttc-section-title">{t('textToColumns.step2.delimited.title')}</legend>
      <div class="ttc-delim-grid">
        <For each={DELIMITER_KEYS}>
          {(delimiter) => (
            <label class="ttc-checkbox">
              <input
                type="checkbox"
                data-testid={`ttc-delim-${delimiter}`}
                checked={props.config.delimiters.has(delimiter)}
                disabled={props.disabled}
                onChange={() => props.onToggle(delimiter)}
              />
              {t(`textToColumns.step2.delimited.${delimiter}`)}
            </label>
          )}
        </For>
      </div>
      <label class="ttc-field-row">
        {t('textToColumns.step2.delimited.otherChar')}
        <input
          type="text"
          class="ttc-input"
          data-testid="ttc-delim-other-char"
          value={props.config.otherChar}
          maxLength={1}
          disabled={props.disabled}
          onInput={(event) => props.onOther(event.currentTarget.value)}
        />
      </label>
      <label class="ttc-checkbox">
        <input
          type="checkbox"
          data-testid="ttc-consecutive"
          checked={props.config.treatConsecutiveAsOne}
          disabled={props.disabled}
          onChange={(event) => props.onTreatConsecutive(event.currentTarget.checked)}
        />
        {t('textToColumns.step2.delimited.consecutive')}
      </label>
      <label class="ttc-field-row">
        {t('textToColumns.step2.delimited.qualifier')}
        <select
          class="ttc-select"
          data-testid="ttc-qualifier"
          value={props.config.textQualifier}
          disabled={props.disabled}
          onChange={(event) =>
            props.onQualifier(event.currentTarget.value as TextToColumnsTextQualifier)
          }
        >
          <option value={'"'}>{'"'}</option>
          <option value="'">{"'"}</option>
          <option value="none">{t('textToColumns.step2.delimited.qualifier.none')}</option>
        </select>
      </label>
    </fieldset>
  )
}

interface Step2FixedProps {
  readonly config: TextToColumnsFixedConfig
  readonly disabled: boolean
  readonly onBreakpoints: (raw: string) => void
}

function Step2Fixed(props: Step2FixedProps) {
  const t = useT()
  return (
    <fieldset class="ttc-section" data-testid="ttc-step-2-fixed" disabled={props.disabled}>
      <legend class="ttc-section-title">{t('textToColumns.step2.fixed.title')}</legend>
      <label class="ttc-field-row">
        {t('textToColumns.step2.fixed.breakpoints')}
        <input
          type="text"
          class="ttc-input"
          data-testid="ttc-breakpoints"
          value={props.config.breakpoints.join(',')}
          disabled={props.disabled}
          onInput={(event) => props.onBreakpoints(event.currentTarget.value)}
          placeholder="3,7,11"
        />
      </label>
      <p class="ttc-help">{t('textToColumns.step2.fixed.hint')}</p>
    </fieldset>
  )
}

interface Step3Props {
  readonly formats: readonly TextToColumnsColumnFormat[]
  readonly columnCount: number
  readonly disabled: boolean
  readonly onFormat: (columnIndex: number, format: TextToColumnsColumnFormat) => void
}

function Step3(props: Step3Props) {
  const t = useT()
  const columnIndexes = () =>
    Array.from({ length: Math.max(props.columnCount, props.formats.length) }, (_, index) => index)
  return (
    <fieldset class="ttc-section" data-testid="ttc-step-3" disabled={props.disabled}>
      <legend class="ttc-section-title">{t('textToColumns.step3.title')}</legend>
      <p class="ttc-help">{t('textToColumns.step3.hint')}</p>
      <div class="ttc-format-grid">
        <For each={columnIndexes()}>
          {(columnIndex) => (
            <label class="ttc-field-row">
              {`#${columnIndex + 1}`}
              <select
                class="ttc-select"
                data-testid={`ttc-format-${columnIndex}`}
                value={props.formats[columnIndex] ?? 'general'}
                disabled={props.disabled}
                onChange={(event) =>
                  props.onFormat(
                    columnIndex,
                    event.currentTarget.value as TextToColumnsColumnFormat,
                  )
                }
              >
                <option value="general">{t('textToColumns.step3.format.general')}</option>
                <option value="text">{t('textToColumns.step3.format.text')}</option>
                <option
                  value="date"
                  disabled
                  title={t('textToColumns.step3.format.dateUnsupported')}
                  data-testid={`ttc-format-${columnIndex}-date`}
                >
                  {t('textToColumns.step3.format.date')}
                </option>
                <option value="skip">{t('textToColumns.step3.format.skip')}</option>
              </select>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  )
}
