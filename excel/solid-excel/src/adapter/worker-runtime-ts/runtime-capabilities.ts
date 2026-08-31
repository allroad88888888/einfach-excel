import type { WorkerRuntimeCapabilitiesWire } from '../worker-protocol'

/**
 * Honest, fail-closed capability declaration for the TypeScript worker.
 * A `false` capability must be refused by the command dispatcher rather
 * than acknowledged without performing the requested work.
 */
export const TS_WORKER_RUNTIME_CAPABILITIES: WorkerRuntimeCapabilitiesWire = Object.freeze({
  structuralEdits: false,
  formats: false,
  formatSnapshots: false,
  tsvChunkExport: false,
  persistenceFormats: false,
  autoFill: false,
  sortRange: false,
  evalHiddenRows: false,
  evalFilterHiddenRows: false,
  structuredTables: false,
  engineHiddenState: false,
})
