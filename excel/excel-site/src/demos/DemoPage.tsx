/**
 * Route target for `/demos/:id`. Resolves the id against the registry,
 * bounces unknown ids back to the gallery, and lazy-loads the demo body
 * inside `DemoShell`. `ErrorBoundary` wraps `Suspense` so it also catches
 * failures that happen while the lazy chunk resolves (a worker/WASM demo
 * that fails to boot), not just render-time throws — but the fallback text
 * is generic enough to read fine for a non-worker failure too, since it is
 * the only error copy this page has.
 */
import { ErrorBoundary, Show, Suspense, lazy } from 'solid-js'
import { Navigate, useParams } from '@solidjs/router'
import { findDemo } from './registry'
import { useLocale, useSiteT } from '../i18n/use-site-t'
import DemoShell from './DemoShell'

const copy = {
  en: { loading: 'Loading demo…' },
  zh: { loading: '演示加载中…' },
} as const

export default function DemoPage() {
  const params = useParams<{ id: string }>()
  const t = useSiteT()
  const locale = useLocale()
  const meta = () => findDemo(params.id)

  return (
    <Show when={meta()} fallback={<Navigate href="/demos" />} keyed>
      {(resolvedMeta) => {
        const LazyDemo = lazy(resolvedMeta.load)

        return (
          <DemoShell meta={resolvedMeta}>
            <ErrorBoundary
              fallback={() => (
                <p class="site-demo-error">{t('site.demo.workerError')}</p>
              )}
            >
              <Suspense
                fallback={<p class="site-demo-loading">{copy[locale()].loading}</p>}
              >
                <LazyDemo />
              </Suspense>
            </ErrorBoundary>
          </DemoShell>
        )
      }}
    </Show>
  )
}
