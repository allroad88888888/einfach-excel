import { Trans, useLingui } from '@lingui/react/macro'
import { renderActiveSignatureSlots, renderFormulaFunctionSignature,
  type FormulaFunctionSpec } from '@einfach/spreadsheet-ui-core'
import { translateFeedback } from '../../i18n/translate-feedback'
import './formula-parameter-help.css'

export interface FormulaParameterHelpProps {
  spec: FormulaFunctionSpec
  /** Prototype index resolved by Core from the real call's argument positions. */
  activeArgIndex?: number
  compact?: boolean
}

/** One read-only rendering for search, cell input and formula-bar input. */
export function FormulaParameterHelp({
  spec,
  activeArgIndex = -1,
  compact = false,
}: FormulaParameterHelpProps) {
  const { i18n } = useLingui()
  const chinese = i18n.locale.toLowerCase().startsWith('zh')
  const slots = renderActiveSignatureSlots({ spec, activeArgIndex })
  const summary = chinese && spec.summaryZh ? spec.summaryZh : translateFeedback(i18n, spec.summary)
  const active = spec.args[activeArgIndex]
  const signature =
    spec.signatureAvailable === false ? `${spec.name}(…)` : renderFormulaFunctionSignature(spec)
  const description = (arg: FormulaFunctionSpec['args'][number]) =>
    chinese && arg.descriptionZh ? arg.descriptionZh : arg.description
  return (
    <section
      className={`formula-parameter-help${compact ? ' is-compact' : ''}`}
      data-formula-help={spec.name}
    >
      <code className="formula-help-signature" data-formula-help-signature>
        {activeArgIndex < 0 ? (
          signature
        ) : (
          <>
            {spec.name}(
            {slots.map((slot, index) => (
              <span key={index}>
                {index > 0 && ', '}
                {slot.active ? <strong>{slot.text}</strong> : slot.text}
              </span>
            ))}
            )
          </>
        )}
      </code>
      <p className="formula-help-summary">{summary}</p>
      {compact && active && description(active) && (
        <p className="formula-help-active" data-formula-active-argument>
          <code>{active.name}</code>: {description(active)}
        </p>
      )}
      {!compact && spec.args.some((arg) => arg.description) && (
        <>
          <h3>
            <Trans>Parameters</Trans>
          </h3>
          {spec.repeat && (
            <p className="formula-help-group">
              <Trans>Repeat the marked parameters together, in order.</Trans>
            </p>
          )}
          <dl className="formula-help-parameters">
            {spec.args.map((arg, index) => (
              <div key={index} data-parameter={arg.name}>
                <dt>
                  <code>{arg.name}</code>{' '}
                  <span className="formula-help-qualifier">
                    {arg.optional ? <Trans>Optional</Trans> : <Trans>Required</Trans>}
                    {arg.repeats && <> · <Trans>Repeating group</Trans></>}
                  </span>
                </dt>
                <dd>{description(arg)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {spec.examples && spec.examples.length > 0 && (
        <div className="formula-help-examples">
          <h3>
            <Trans>Examples</Trans>
          </h3>
          {spec.examples.map((example) => (
            <code key={example}>{example}</code>
          ))}
        </div>
      )}
      {spec.limitations && spec.limitations.length > 0 && (
        <div className="formula-help-limitations">
          <h3>
            <Trans>Implementation limits</Trans>
          </h3>
          <ul>
            {spec.limitations.map((limit) => (
              <li key={limit.en}>{chinese ? limit.zh : limit.en}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
