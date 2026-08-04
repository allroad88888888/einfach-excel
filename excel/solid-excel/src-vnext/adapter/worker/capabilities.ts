// 一句话：读取 worker runtime 声明的能力见证。

import type { WorkerRuntimeCapabilitiesWire } from '../worker-protocol'
import type { WorkerBackendState } from './state'

/**
 * `null` witness → legacy full trust. A declared witness gates each
 * family, and undeclared keys on a declared witness read as
 * unsupported (fail-closed).
 */
export function runtimeSupports(
  state: WorkerBackendState,
  key: keyof WorkerRuntimeCapabilitiesWire,
): boolean {
  return state.runtimeCapabilities === null || state.runtimeCapabilities[key] === true
}

// Capability-gated port implementations. Exposed through getters below
// so a runtime that declares `structuralEdits: false` / `formats: false`
// in the `describeCapabilities` handshake makes the optional port read
// as `undefined` — UI core then hides the matching entries (the same
// fail-closed degradation the removeRowsExact witness uses).
export function autoFillIsSupported(state: WorkerBackendState): boolean {
  return state.autoFillCapability && typeof state.client.applyAutoFill === 'function'
}
