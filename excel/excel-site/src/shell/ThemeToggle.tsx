import { createSignal, type Component } from 'solid-js'

type SiteTheme = 'light' | 'dark'

const STORAGE_KEY = 'einfach-site-theme'

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readStoredTheme(): SiteTheme | null {
  const value = window.localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

function resolveInitialTheme(): SiteTheme {
  return readStoredTheme() ?? (prefersDark() ? 'dark' : 'light')
}

function applyTheme(theme: SiteTheme): void {
  document.documentElement.dataset.theme = theme
}

/**
 * Boot-time theme application. Called once from main.tsx before render so
 * `document.documentElement` always carries an explicit `data-theme` before
 * the first paint (no flash of the wrong theme).
 */
export function initSiteTheme(): void {
  applyTheme(resolveInitialTheme())
}

const SUN_RAYS_PATH =
  'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2' +
  'M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41'

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d={SUN_RAYS_PATH} />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
    </svg>
  )
}

const ThemeToggle: Component = () => {
  const [theme, setTheme] = createSignal<SiteTheme>(resolveInitialTheme())

  const toggle = () => {
    const next: SiteTheme = theme() === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <button
      type="button"
      class="site-toggle site-toggle--theme"
      onClick={toggle}
      aria-label={theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme() === 'dark' ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}

export default ThemeToggle
