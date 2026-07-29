/**
 * Thin wrappers over `@einfach/solid-excel/vnext`'s backend factories. Every
 * parameter and return type here is the library's real shape — nothing is
 * invented — so callers can reach past these helpers into the underlying
 * options/return types whenever they need to.
 */
import type {
  StaticSpreadsheetBackend,
  StaticSpreadsheetSeedInput,
  WorkerWorkbookSpreadsheetBackend,
  WorkerWorkbookSpreadsheetBackendOptions,
} from '@einfach/solid-excel/vnext'
import {
  createStaticSpreadsheetBackend,
  createWorkerWorkbookSpreadsheetBackend,
  defaultExcelCoreTsWorkerFactory,
  defaultVNextWorkbookWorkerFactory,
} from '@einfach/solid-excel/vnext'

/** In-memory backend for demos that need no worker/WASM round trip. */
export function makeStaticBackend(seed?: StaticSpreadsheetSeedInput): StaticSpreadsheetBackend {
  return createStaticSpreadsheetBackend(seed)
}

/** Worker-hosted backend backed by the Rust/WASM workbook engine. */
export function makeWasmWorkerBackend(
  options?: WorkerWorkbookSpreadsheetBackendOptions,
): WorkerWorkbookSpreadsheetBackend {
  return createWorkerWorkbookSpreadsheetBackend({
    workerFactory: defaultVNextWorkbookWorkerFactory,
    ...options,
  })
}

/** Worker-hosted backend backed by the in-process TS formula engine. */
export function makeTsWorkerBackend(
  options?: WorkerWorkbookSpreadsheetBackendOptions,
): WorkerWorkbookSpreadsheetBackend {
  return createWorkerWorkbookSpreadsheetBackend({
    workerFactory: defaultExcelCoreTsWorkerFactory,
    ...options,
  })
}
