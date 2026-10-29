import { atom, type Getter, type Setter } from '@einfach/core'
import type { CellRange } from '../shared'
import { MAX_UNLOCKED_RANGES } from './sheet-state'
import { isCellRange } from './range-guards'
import { addUnlockedRange } from './commands'
import type { SheetProtectionPersistencePort } from './persistence'
import {
  closeProtectionUnlockAtom,
  protectionUnlockMachineAtom,
  setUnlockEditingError,
} from './unlock-state'
import type {
  ProtectionUnlockTarget,
  SubmitProtectionUnlockInput,
  VerifySheetProtectionPort,
  VerifySheetProtectionResult,
} from './unlock-state'

const DEFAULT_VERIFY_TIMEOUT_MS = 10_000
const OPERATION_TIMEOUT = Symbol('protection-operation-timeout')

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
}

function verifyTimeout(timeoutMs: number | undefined): number {
  return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_VERIFY_TIMEOUT_MS
}

async function waitWithTimeout<Value>(
  promise: Promise<Value>,
  timeoutMs: number | undefined,
): Promise<Value | typeof OPERATION_TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof OPERATION_TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(OPERATION_TIMEOUT), verifyTimeout(timeoutMs))
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

interface ProtectionUnlockSession {
  readonly sessionId: number
  readonly target: ProtectionUnlockTarget & { readonly range: Readonly<CellRange> }
}

function unlockSessionIsCurrent(get: Getter, session: ProtectionUnlockSession): boolean {
  const machine = get(protectionUnlockMachineAtom)
  return machine.sessionId === session.sessionId && machine.phase === 'verifying'
}

function failUnlockVerification(
  get: Getter,
  set: Setter,
  session: ProtectionUnlockSession,
  error: string,
): void {
  if (!unlockSessionIsCurrent(get, session)) return
  set(protectionUnlockMachineAtom, (machine) => {
    if (machine.sessionId !== session.sessionId || machine.phase !== 'verifying') return machine
    return { ...machine, phase: 'editing', error }
  })
}

/**
 * Commit the unlock locally: add the target range to the sheet's unlocked
 * ranges and close the dialog. A cap violation keeps the dialog editing
 * with an error; 'unchanged' (already editable) still closes.
 */
function commitProtectionUnlock(
  get: Getter,
  set: Setter,
  target: ProtectionUnlockSession['target'],
  source: SheetProtectionPersistencePort | undefined,
): void {
  const outcome = addUnlockedRange(get, set, {
    sheetId: target.sheetId,
    range: target.range,
    source,
  })
  if (outcome === 'invalid') {
    setUnlockEditingError(
      set,
      `Cannot unlock more than ${MAX_UNLOCKED_RANGES} ranges on one sheet.`,
    )
    return
  }
  set(closeProtectionUnlockAtom)
}

async function runProtectionUnlockVerification(
  get: Getter,
  set: Setter,
  session: ProtectionUnlockSession,
  password: string,
  verify: VerifySheetProtectionPort,
  timeoutMs: number | undefined,
  source: SheetProtectionPersistencePort | undefined,
): Promise<void> {
  let verification: VerifySheetProtectionResult | typeof OPERATION_TIMEOUT
  try {
    verification = await waitWithTimeout(
      verify({
        sheetId: session.target.sheetId,
        range: session.target.range,
        password,
      }),
      timeoutMs,
    )
  } catch (error) {
    failUnlockVerification(
      get,
      set,
      session,
      errorMessage(error, 'Could not verify the protection password.'),
    )
    return
  }
  if (verification === OPERATION_TIMEOUT) {
    failUnlockVerification(get, set, session, 'Password verification timed out. Try again.')
    return
  }
  // The dialog closed or reopened for another target while verifying —
  // a late verification result must never commit against a stale target.
  if (!unlockSessionIsCurrent(get, session)) return
  if (typeof verification !== 'object' || verification === null || verification.ok !== true) {
    failUnlockVerification(
      get,
      set,
      session,
      typeof verification === 'object' && verification !== null && verification.message
        ? verification.message
        : 'Incorrect password.',
    )
    return
  }
  commitProtectionUnlock(get, set, session.target, source)
}

export const submitProtectionUnlockAtom = atom(
  null,
  (get, set, input?: SubmitProtectionUnlockInput) => {
    const machine = get(protectionUnlockMachineAtom)
    // Single-flight: a submit while verification is pending is ignored.
    if (machine.phase !== 'editing' || machine.target === null) return
    if (machine.target.range === undefined) {
      setUnlockEditingError(set, 'Select a range to unlock.')
      return
    }
    if (!isCellRange(machine.target.range)) {
      setUnlockEditingError(set, 'Select a valid range to unlock.')
      return
    }
    const session: ProtectionUnlockSession = {
      sessionId: machine.sessionId,
      target: { sheetId: machine.target.sheetId, range: machine.target.range },
    }
    const verify = input?.verifySheetProtection
    if (typeof verify !== 'function') {
      commitProtectionUnlock(get, set, session.target, input?.source)
      return
    }
    set(protectionUnlockMachineAtom, { ...machine, phase: 'verifying', error: null })
    void runProtectionUnlockVerification(
      get,
      set,
      session,
      machine.password,
      verify,
      input?.verifyTimeoutMs,
      input?.source,
    )
  },
)
submitProtectionUnlockAtom.debugLabel = 'spreadsheet.protection.submitUnlock'
