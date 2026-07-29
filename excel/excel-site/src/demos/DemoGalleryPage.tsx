/**
 * `/demos` — tag-filterable card grid over `DEMO_REGISTRY`. Laid out with
 * `repeat(auto-fill, minmax(...))` so it reads fine whether the registry
 * holds one demo or fourteen-plus.
 */
import { For, Show, createSignal } from 'solid-js'
import { A } from '@solidjs/router'
import { DEMO_REGISTRY } from './registry'
import type { BackendKind } from '../spreadsheet/chrome-types'
import { useLocale, useSiteT } from '../i18n/use-site-t'
import './demo-gallery.css'

const ALL_TAG = 'all'

const copy = {
  en: { allChip: 'All' },
  zh: { allChip: '全部' },
} as const

const BACKEND_LABEL_KEY: Record<BackendKind, string> = {
  static: 'site.demo.backend.static',
  'worker-wasm': 'site.demo.backend.workerWasm',
  'worker-ts': 'site.demo.backend.workerTs',
}

function collectTags(): string[] {
  const tags = new Set<string>()
  for (const demo of DEMO_REGISTRY) {
    for (const tag of demo.tags) tags.add(tag)
  }
  return Array.from(tags).sort()
}

const tags = collectTags()

export default function DemoGalleryPage() {
  const t = useSiteT()
  const locale = useLocale()
  const [activeTag, setActiveTag] = createSignal<string>(ALL_TAG)

  const filteredDemos = () => {
    const tag = activeTag()
    return tag === ALL_TAG ? DEMO_REGISTRY : DEMO_REGISTRY.filter((demo) => demo.tags.includes(tag))
  }

  return (
    <section class="site-demo-gallery">
      <header class="site-demo-gallery-header">
        <h1 class="site-page__title">{t('site.gallery.title')}</h1>
        <p class="site-page__subtitle">{t('site.gallery.subtitle')}</p>
      </header>

      <div class="site-demo-filter" role="group" aria-label={t('site.gallery.tagFilterLabel')}>
        <button
          type="button"
          class="site-demo-filter-chip"
          classList={{ 'site-demo-filter-chip--active': activeTag() === ALL_TAG }}
          onClick={() => setActiveTag(ALL_TAG)}
        >
          {copy[locale()].allChip}
        </button>
        <For each={tags}>
          {(tag) => (
            <button
              type="button"
              class="site-demo-filter-chip"
              classList={{ 'site-demo-filter-chip--active': activeTag() === tag }}
              onClick={() => setActiveTag(tag)}
            >
              {tag}
            </button>
          )}
        </For>
      </div>

      <Show
        when={filteredDemos().length > 0}
        fallback={<p class="site-demo-empty">{t('site.gallery.empty')}</p>}
      >
        <div class="site-demo-grid">
          <For each={filteredDemos()}>
            {(demo) => (
              <A href={`/demos/${demo.id}`} class="site-demo-card">
                <div class="site-demo-card-top">
                  <h2 class="site-demo-card-title">{t(demo.titleKey)}</h2>
                  <span class="site-demo-card-badge">{t(BACKEND_LABEL_KEY[demo.backend])}</span>
                </div>
                <p class="site-demo-card-blurb">{t(demo.blurbKey)}</p>
                <ul class="site-demo-card-tags">
                  <For each={demo.tags}>{(tag) => <li class="site-demo-card-tag">{tag}</li>}</For>
                </ul>
              </A>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}
