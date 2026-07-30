import { A } from '@solidjs/router'
import { useLocale } from '../i18n/use-site-t'

const copy = {
  en: {
    eyebrow: 'Open source · atom-based',
    headline: 'An atom-based spreadsheet engine, built for the web',
    subhead:
      'Solid.js renders only what changed, a headless UI-core carries the spreadsheet ' +
      'semantics, and a Rust/WASM engine crunches the formulas.',
    ctaDemos: 'Explore demos',
    ctaWorkbench: 'Open workbench',
    note: 'MIT licensed · TypeScript · Rust',
  },
  zh: {
    eyebrow: '开源 · 原子化状态',
    headline: '基于原子状态的表格引擎，为 Web 而生',
    subhead:
      'Solid.js 只重渲染真正变化的部分，无头的 UI-core 承载表格语义，' +
      'Rust/WASM 引擎负责公式计算。',
    ctaDemos: '查看演示',
    ctaWorkbench: '打开工作台',
    note: 'MIT 协议 · TypeScript · Rust',
  },
} as const

export default function HeroSection() {
  const locale = useLocale()
  const t = () => copy[locale()]

  return (
    <section class="site-hero">
      <p class="site-hero-eyebrow">{t().eyebrow}</p>
      <h1 class="site-hero-headline">{t().headline}</h1>
      <p class="site-hero-subhead">{t().subhead}</p>
      <div class="site-hero-actions">
        <A href="/demos" class="site-hero-cta site-hero-cta-primary">
          {t().ctaDemos}
        </A>
        <A href="/workbench" class="site-hero-cta site-hero-cta-secondary">
          {t().ctaWorkbench}
        </A>
      </div>
      <p class="site-hero-note">{t().note}</p>
    </section>
  )
}
