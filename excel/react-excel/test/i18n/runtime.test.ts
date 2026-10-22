import { afterEach, expect, test, vi } from 'vitest'
import {
  activateUiLocale, i18n, resolveUiLocale, UI_LOCALE_STORAGE_KEY,
} from '../../src/page/demo/demo-presentation'
import { supportedUiLocale } from '../../src/i18n/runtime'

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  activateUiLocale('en')
  window.localStorage.clear()
})

test.each([
  ['zh-CN', 'zh'], ['zh-TW', 'zh'], ['ZH_hans', 'zh'], ['en-US', 'en'],
  ['en-GB', 'en'], ['fr', undefined], ['english', undefined], ['', undefined], [null, undefined],
])('normalizes %s without accepting unsupported languages', (value, expected) => {
  expect(supportedUiLocale(value)).toBe(expected)
})

test('resolves URL, explicit preference, browser languages, then English', () => {
  expect(resolveUiLocale('?locale=zh-CN', 'en', ['en-US'])).toBe('zh')
  expect(resolveUiLocale('?locale=unsupported', 'zh', ['en-US'])).toBe('zh')
  expect(resolveUiLocale('', 'en', ['zh-CN'])).toBe('en')
  expect(resolveUiLocale('', null, ['fr-FR', 'zh-TW'])).toBe('zh')
  expect(resolveUiLocale('', null, ['ja-JP'])).toBe('en')
  expect(resolveUiLocale('', null, [])).toBe('en')
})

test('persists the chosen UI language and updates only an existing locale query', () => {
  window.history.replaceState({ marker: 1 }, '', '/?locale=zh&demo=sales-orders#grid')
  activateUiLocale('en')
  expect(i18n.locale).toBe('en')
  expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en')
  expect(window.location.search).toBe('?locale=en&demo=sales-orders')
  expect(window.location.hash).toBe('#grid')
  expect(window.history.state).toEqual({ marker: 1 })
  window.history.replaceState(null, '', '/')
  activateUiLocale('zh')
  expect(window.location.search).toBe('')
})

test('blocked storage does not prevent activation or lose the current catalog', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Denied') })
  expect(() => activateUiLocale('zh')).not.toThrow()
  expect(i18n.locale).toBe('zh')
  expect(i18n._({ id: 'missing-id', message: 'fallback text' })).toBe('fallback text')
})
