import { useAtomValue } from '@einfach/solid'
import type { PerformanceMetricsAtom } from './performance-metrics'

interface PerformanceHudProps {
  metricsAtom: PerformanceMetricsAtom
}

/** Renders the performance facts observed at the browser-to-worker boundary. */
export default function PerformanceHud(props: PerformanceHudProps) {
  const metrics = useAtomValue(props.metricsAtom)

  return (
    <aside class="performance-hud" aria-label="Live performance measurements">
      <p class="performance-hud-label">LIVE PROJECTION HUD</p>
      <dl>
        <div>
          <dt>Projection window</dt>
          <dd>{metrics().projectionWindow}</dd>
        </div>
        <div>
          <dt>Total rows</dt>
          <dd>{metrics().totalRows.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Worker messages this projection</dt>
          <dd>{metrics().outboundMessages} out / {metrics().inboundMessages} in</dd>
        </div>
        <div>
          <dt>Projection round trip</dt>
          <dd>
            {metrics().projectionDurationMs === null
              ? 'Waiting'
              : `${metrics().projectionDurationMs.toFixed(1)} ms`}
          </dd>
        </div>
      </dl>
      <p class="performance-hud-note">
        {'Transport counts are measured here. '}
        {'Engine cell-traversal counts await the pending engine merge.'}
      </p>
    </aside>
  )
}
