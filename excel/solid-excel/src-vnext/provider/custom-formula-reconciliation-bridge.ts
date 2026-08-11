import type { Store } from '@einfach/core'
import {
  customFormulaRegistryAtom,
  MAX_CUSTOM_FORMULA_REGISTRY_ENTRIES,
  type CustomFormulaRegistration,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

type CustomFormulaOp =
  | { kind: 'unregister'; name: string }
  | { kind: 'register'; name: string; entry: CustomFormulaRegistration }

function registrationsEqual(
  before: CustomFormulaRegistration,
  after: CustomFormulaRegistration,
): boolean {
  return (
    before.source === after.source &&
    (before.isAsync === true) === (after.isAsync === true) &&
    before.description === after.description &&
    (before.paramLabels?.join('|') ?? '') === (after.paramLabels?.join('|') ?? '')
  )
}

/**
 * Pick one remote mutation at a time. Stale removals always win over installs.
 * If any removal failed in this desired generation, new installs stay blocked
 * so repeated churn cannot grow the remote set.
 */
function nextOperation(
  installed: ReadonlyMap<string, CustomFormulaRegistration>,
  desired: ReadonlyMap<string, CustomFormulaRegistration>,
  failedNames: ReadonlySet<string>,
  cleanupFailed: boolean,
): CustomFormulaOp | null {
  for (const [name, entry] of installed) {
    const next = desired.get(name)
    if ((!next || !registrationsEqual(entry, next)) && !failedNames.has(name)) {
      return { kind: 'unregister', name }
    }
  }

  if (!cleanupFailed && installed.size < MAX_CUSTOM_FORMULA_REGISTRY_ENTRIES) {
    for (const [name, entry] of desired) {
      if (!installed.has(name) && !failedNames.has(name)) {
        return { kind: 'register', name, entry }
      }
    }
  }

  return null
}

/**
 * Reconciles one provider's desired formula-registry atom with its backend.
 *
 * The registry atom is the only desired product state. This closure keeps only
 * the provider-local transport ledger needed to compensate non-cancellable
 * backend acknowledgements after a registry update or provider disposal.
 */
export function attachCustomFormulaReconciliationBridge(
  store: Store,
  backend: SpreadsheetBackend,
): () => void {
  if (!backend.registerCustomFormula || !backend.unregisterCustomFormula) return () => {}
  const register = backend.registerCustomFormula
  const unregister = backend.unregisterCustomFormula

  const installed = new Map<string, CustomFormulaRegistration>()
  let desired: ReadonlyMap<string, CustomFormulaRegistration> = new Map()
  let desiredGeneration = 0
  let failedNames = new Set<string>()
  let cleanupFailed = false
  let reconcileRunning = false
  let reconcileBlockedGeneration: number | null = null
  let disposed = false

  async function reconcile(): Promise<void> {
    while (true) {
      const operation = nextOperation(installed, desired, failedNames, cleanupFailed)
      if (!operation) return
      try {
        if (operation.kind === 'unregister') {
          await unregister(operation.name)
          installed.delete(operation.name)
        } else {
          await register(operation.name, operation.entry.source, {
            isAsync: operation.entry.isAsync === true,
          })
          installed.set(operation.name, operation.entry)
        }
      } catch (error) {
        if (operation.kind === 'unregister') {
          const current = installed.get(operation.name)
          const next = desired.get(operation.name)
          if (current && (!next || !registrationsEqual(current, next))) {
            failedNames.add(operation.name)
            cleanupFailed = true
          }
        } else if (!installed.has(operation.name) && desired.has(operation.name)) {
          failedNames.add(operation.name)
        }
        // eslint-disable-next-line no-console
        console.warn(`[customFormulas] ${operation.kind} ${operation.name} failed`, error)
      }
    }
  }

  function requestReconcile(): void {
    if (reconcileRunning) return
    reconcileRunning = true
    void reconcile()
      .catch((error: unknown) => {
        reconcileBlockedGeneration = desiredGeneration
        // eslint-disable-next-line no-console
        console.warn('[customFormulas] reconcile failed', error)
      })
      .finally(() => {
        reconcileRunning = false
        if (
          reconcileBlockedGeneration !== desiredGeneration &&
          nextOperation(installed, desired, failedNames, cleanupFailed)
        ) {
          requestReconcile()
        }
      })
  }

  function setDesired(next: ReadonlyMap<string, CustomFormulaRegistration>): void {
    desired = next
    desiredGeneration += 1
    failedNames = new Set()
    cleanupFailed = false
    reconcileBlockedGeneration = null
    requestReconcile()
  }

  function scheduleReconcile(): void {
    if (!disposed) setDesired(store.getter(customFormulaRegistryAtom))
  }

  const unsubscribe = store.sub(customFormulaRegistryAtom, scheduleReconcile)
  // Registrations written before mount still need to reach this backend.
  scheduleReconcile()

  return () => {
    disposed = true
    unsubscribe()
    // An in-flight register can still ACK after disposal. Keep the same serial
    // pump alive until that remote fact is compensated by an unregister.
    setDesired(new Map())
  }
}
