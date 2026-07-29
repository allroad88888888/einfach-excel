import { A } from '@solidjs/router'
import { For } from 'solid-js'
import { DEMO_REGISTRY } from '../demos/registry'
import { useLocale, useSiteT } from '../i18n/use-site-t'

const copy = {
  en: {
    heading: 'Try it live',
    subhead: 'Every demo runs the real engine in your browser — no backend, no account.',
    viewAll: 'View all demos',
  },
  zh: {
    heading: '在线体验',
    subhead: '每个演示都在浏览器里运行真实引擎——无需后端，无需账号。',
    viewAll: '查看全部演示',
  },
} as const

export default function FeatureGridSection() {
  const locale = useLocale()
  const t = () => copy[locale()]
  const siteT = useSiteT()

  return (
    <section class="site-features">
      <div class="site-features-header">
        <div>
          <h2 class="site-features-heading">{t().heading}</h2>
          <p class="site-features-subhead">{t().subhead}</p>
        </div>
        <A href="/demos" class="site-features-viewall">
          {t().viewAll}
        </A>
      </div>
      <div class="site-features-grid">
        <For each={DEMO_REGISTRY}>
          {(demo) => (
            <A href={`/demos/${demo.id}`} class="site-feature-card">
              <h3 class="site-feature-title">{siteT(demo.titleKey)}</h3>
              <p class="site-feature-blurb">{siteT(demo.blurbKey)}</p>
              <ul class="site-feature-tags">
                <For each={demo.tags}>{(tag) => <li class="site-feature-tag">{tag}</li>}</For>
              </ul>
            </A>
          )}
        </For>
      </div>
    </section>
  )
}
