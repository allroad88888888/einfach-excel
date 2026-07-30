/**
 * Chrome around every individual demo page: back-to-gallery link, title +
 * blurb + backend badge + "view source" link, then a light card that hosts
 * the demo body (`children`). The card is permanently light — the
 * spreadsheet chrome has no dark mode of its own — via `.site-demo-surface`
 * in `demo-shell.css`, which uses hardcoded light color values rather than
 * `var(--site-*)` tokens so the site's dark theme can never leak in.
 */
import type { JSX } from 'solid-js'
import { A } from '@solidjs/router'
import type { BackendKind } from '../spreadsheet/chrome-types'
import type { DemoMeta } from './registry-types'
import { useSiteT } from '../i18n/use-site-t'
import './demo-shell.css'

const GITHUB_DEMO_PAGES_BASE =
  'https://github.com/allroad88888888/einfach/blob/main/excel/excel-site/src/demos/pages'

const BACKEND_LABEL_KEY: Record<BackendKind, string> = {
  static: 'site.demo.backend.static',
  'worker-wasm': 'site.demo.backend.workerWasm',
  'worker-ts': 'site.demo.backend.workerTs',
}

/** `find-replace` -> `FindReplace`, `basics` -> `Basics`. */
function toPascalCase(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function sourceUrlFor(id: string): string {
  return `${GITHUB_DEMO_PAGES_BASE}/${toPascalCase(id)}Demo.tsx`
}

export interface DemoShellProps {
  meta: DemoMeta
  children: JSX.Element
}

export default function DemoShell(props: DemoShellProps) {
  const t = useSiteT()

  return (
    <section class="site-demo-page">
      <A href="/demos" class="site-demo-back">
        ← {t('site.demo.backToGallery')}
      </A>

      <header class="site-demo-header">
        <div class="site-demo-heading-row">
          <h1 class="site-demo-title">{t(props.meta.titleKey)}</h1>
          <span class="site-demo-badge">{t(BACKEND_LABEL_KEY[props.meta.backend])}</span>
        </div>
        <p class="site-demo-blurb">{t(props.meta.blurbKey)}</p>
        <a
          class="site-demo-source-link"
          href={sourceUrlFor(props.meta.id)}
          target="_blank"
          rel="noreferrer"
        >
          {t('site.demo.viewSource')}
        </a>
      </header>

      <div class="site-demo-surface">{props.children}</div>
    </section>
  )
}
