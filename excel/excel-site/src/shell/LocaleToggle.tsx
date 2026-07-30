import type { Component } from 'solid-js'
import { setLocale, useLocale } from '../i18n/use-site-t'

const LocaleToggle: Component = () => {
  const locale = useLocale()
  const nextLocale = () => (locale() === 'en' ? 'zh' : 'en')

  return (
    <button
      type="button"
      class="site-toggle site-toggle--locale"
      onClick={() => setLocale(nextLocale())}
      aria-label={nextLocale() === 'zh' ? 'Switch to Chinese' : 'Switch to English'}
    >
      {locale() === 'en' ? '中文' : 'EN'}
    </button>
  )
}

export default LocaleToggle
