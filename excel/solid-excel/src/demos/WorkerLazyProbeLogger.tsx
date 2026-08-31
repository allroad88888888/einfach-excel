import { createEffect } from 'solid-js'
import { getWorkerLazyProbe, type WorkerLazyProbe } from './worker-lazy-probe'
function logWhenComputed(probe: WorkerLazyProbe, attempt = 0) {
  window.setTimeout(() => {
    void Promise.all([
      probe.client.debugFormulaCacheState(probe.sheetIdx, 'C5'),
      probe.client.debugFormulaEvalCount(probe.sheetIdx),
    ]).then(([afterState, afterEvalCount]) => {
      if (afterState !== 'clean') {
        if (attempt < 20) logWhenComputed(probe, attempt + 1)
        else probe.logged = false
        return
      }
      console.log(
        `[vnext-worker-lazy-demo] computed Sheet2!C5 before=${probe.beforeState} after=${afterState} beforeEval=${probe.beforeEvalCount} afterEval=${afterEvalCount}`,
      )
    })
  }, 25)
}
export function WorkerLazyProbeLogger(props: { activeSheetId: () => string }) {
  createEffect(() => {
    if (props.activeSheetId() !== 'sheet-2') return
    const probe = getWorkerLazyProbe()
    if (!probe || probe.logged) return
    probe.logged = true
    logWhenComputed(probe)
  })
  return null
}
