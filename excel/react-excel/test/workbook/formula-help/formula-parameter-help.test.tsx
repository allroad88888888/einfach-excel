import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { FormulaFunctionSpec } from '@einfach/spreadsheet-ui-core'
import { FormulaParameterHelp } from '../../../src/workbook/formula-help/FormulaParameterHelp'

afterEach(cleanup)

const letSpec: FormulaFunctionSpec = {
  name: 'LET', signatureAvailable: true, summary: 'Binds names before evaluating the calculation.',
  summaryZh: '绑定名称后计算末尾表达式。', repeat: { start: 0, length: 2, minGroups: 1 },
  args: [
    { name: 'name', repeats: true, description: 'Bare binding identifier.', descriptionZh: '绑定标识符。' },
    { name: 'value', repeats: true, description: 'Value bound to the identifier.', descriptionZh: '绑定到标识符的值。' },
    { name: 'calculation', description: 'Final expression in scope.', descriptionZh: '作用域内的末尾表达式。' },
  ],
  examples: ['=LET(x,3,x*2)'],
  limitations: [{ en: 'Binding names must be identifiers.', zh: '绑定名称必须为标识符。' }],
}

function show(spec = letSpec, props: { compact?: boolean; activeArgIndex?: number } = {}, locale = 'en') {
  const i18n = setupI18n({ locale, messages: { en: {}, zh: {} } })
  return render(
    <I18nProvider i18n={i18n}>
      <FormulaParameterHelp spec={spec} {...props} />
    </I18nProvider>,
  )
}

test('full help exposes required/repeated roles, native semantics, examples and limits with no action controls', () => {
  const { container } = show()
  expect(container.querySelector('[data-formula-help-signature]'))
    .toHaveTextContent('LET((name, value), ..., calculation)')
  expect(screen.getByText('Bare binding identifier.')).toBeVisible()
  expect(screen.getByText('Value bound to the identifier.')).toBeVisible()
  expect(screen.getByText('Final expression in scope.')).toBeVisible()
  expect(screen.getByText('=LET(x,3,x*2)')).toBeVisible()
  expect(screen.getByText('Binding names must be identifiers.')).toBeVisible()
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
})

test('compact help highlights the exact prototype slot and describes the fixed suffix', () => {
  const { container } = show(letSpec, { compact: true, activeArgIndex: 2 })
  expect(container.querySelector('strong')).toHaveTextContent('calculation')
  expect(container.querySelector('[data-formula-active-argument]')).toHaveTextContent('Final expression in scope.')
  expect(screen.queryByText('Bare binding identifier.')).toBeNull()
  expect(screen.getByText('=LET(x,3,x*2)')).toBeVisible()
})

test('Chinese metadata is displayed consistently without changing the formula example', () => {
  const { container } = show(letSpec, { compact: true, activeArgIndex: 0 }, 'zh')
  expect(screen.getByText('绑定名称后计算末尾表达式。')).toBeVisible()
  expect(container.querySelector('[data-formula-active-argument]')).toHaveTextContent('绑定标识符。')
  expect(screen.getByText('绑定名称必须为标识符。')).toBeVisible()
  expect(screen.getByText('=LET(x,3,x*2)')).toBeVisible()
})

test('zero-argument calls and unavailable legacy signatures are not confused', () => {
  const { container, rerender } = show({ name: 'PI', args: [], summary: 'Pi.', signatureAvailable: true })
  expect(container.querySelector('[data-formula-help-signature]')).toHaveTextContent('PI()')
  const i18n = setupI18n({ locale: 'en', messages: { en: {} } })
  rerender(<I18nProvider i18n={i18n}><FormulaParameterHelp spec={{
    name: 'OLDHOST', args: [], summary: 'Legacy metadata.', signatureAvailable: false,
  }} /></I18nProvider>)
  expect(container.querySelector('[data-formula-help-signature]')).toHaveTextContent('OLDHOST(…)')
})
