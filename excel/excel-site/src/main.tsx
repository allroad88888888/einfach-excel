/* @refresh reload */
// Import only vnext styles exported from solid-excel package.
import '@einfach/solid-excel/vnext-styles.css'
import './styles/site-theme.css'
import './styles/site-layout.css'
import { render } from 'solid-js/web'
import type { Locale } from '@einfach/solid-excel/i18n'
import { setLocale } from './i18n/use-site-t'
import { initSiteTheme } from './shell/ThemeToggle'
import AppRouter from './routes'

function readLocaleParam(search: string): Locale | null {
  const value = new URLSearchParams(search).get('locale')
  return value === 'en' || value === 'zh' ? value : null
}

/**
 * The app is a HashRouter, so a locale override arrives either as a plain
 * query string (`?locale=zh`) or embedded in the hash's own query segment
 * (`#/demos?locale=zh`). Check both, search first.
 */
function resolveBootLocale(): Locale | null {
  const fromSearch = readLocaleParam(window.location.search)
  if (fromSearch) return fromSearch

  const hashQueryIndex = window.location.hash.indexOf('?')
  if (hashQueryIndex === -1) return null
  return readLocaleParam(window.location.hash.slice(hashQueryIndex + 1))
}

initSiteTheme()
setLocale(resolveBootLocale() ?? 'en')

render(() => <AppRouter />, document.getElementById('app')!)
