import { onCleanup } from 'solid-js'
import {
  createWorkerNamedRangeCapabilityPort,
  createWorkerWorkbookSpreadsheetBackend,
} from '../adapter'
import {
  defaultExcelCoreTsWorkerFactory,
  defaultVNextWorkbookWorkerFactory,
} from '../adapter/worker-factory'
import { SpreadsheetUiProvider } from '../provider'
import { WorkerWorkbookRuntimeBootstrap } from './WorkerWorkbookRuntimeBootstrap'
import { clearWorkerLazyProbe, initializeWorkerLazyProbe } from './worker-lazy-probe'
import { workerDemoSheets } from './worker-workbook-config'
import { seedWorkerWorkbook } from './worker-workbook-seed'

type BackendChoice = 'ts' | 'wasm'

function readBackendChoice(): BackendChoice {
  if (typeof window === 'undefined') return 'wasm'
  return new URLSearchParams(window.location.search).get('backend') === 'ts' ? 'ts' : 'wasm'
}

export function SpreadsheetWorkerDemo() {
  const backendChoice = readBackendChoice()
  const backend = createWorkerWorkbookSpreadsheetBackend({
    workerFactory:
      backendChoice === 'ts' ? defaultExcelCoreTsWorkerFactory : defaultVNextWorkbookWorkerFactory,
    sheets: workerDemoSheets,
    removeRowsExactCapability: backendChoice === 'wasm' ? 'worker-engine-delete-rows' : false,
    afterInit: async (client, sheets) => {
      await seedWorkerWorkbook(client, sheets)
      await initializeWorkerLazyProbe(client, sheets)
    },
  })
  const namedRangeCapabilityPort = createWorkerNamedRangeCapabilityPort(
    backendChoice === 'ts' ? 'worker-ts' : 'worker-wasm',
  )

  onCleanup(() => {
    backend.dispose()
    clearWorkerLazyProbe()
  })

  return (
    <div class="demo-page vnext-demo">
      <div class="demo-header">
        <h3>vNext Worker Spreadsheet</h3>
        <p class="demo-desc">
          vNext UI backed by{' '}
          {backendChoice === 'ts' ? 'the in-process TS core' : 'the Rust workbook worker'} through
          the framework-agnostic backend port.
        </p>
        <p class="demo-desc" data-testid="custom-formulas-banner">
          Custom formulas registered: <code>MYTAX</code>, <code>GREET</code>, <code>CELSIUS</code>,{' '}
          <code>SUMSQ2</code>. Try <code>=MYTAX(B4)</code> or <code>=SUMSQ2(B2:B4)</code> in any
          cell.
        </p>
      </div>
      <SpreadsheetUiProvider backend={backend} namedRangeCapabilityPort={namedRangeCapabilityPort}>
        <WorkerWorkbookRuntimeBootstrap />
      </SpreadsheetUiProvider>
    </div>
  )
}
