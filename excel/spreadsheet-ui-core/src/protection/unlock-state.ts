import { atom, type Setter } from '@einfach/core'
import type { CellRange } from '../shared'
import { snapshotRange } from './range-guards'
import type { SheetProtectionPersistencePort } from './persistence'

// --- unlock dialog session ---
//
// The unlock flow is a local session: open → (optional host password
// verification) → synchronous local commit of the target range as an
// unlocked range → close. There is no mutation ACK, no canonical
// refresh, and no recovery phase — the only asynchronous step is the
// optional host verifier, guarded by a session id so a verification that
// settles after close/reopen can never commit against a stale target.

export type ProtectionUnlockPhase = 'closed' | 'editing' | 'verifying'

export interface ProtectionUnlockTarget {
  readonly sheetId: string
  readonly range?: Readonly<CellRange>
}

export interface ProtectionUnlockState {
  readonly phase: ProtectionUnlockPhase
  readonly isOpen: boolean
  readonly target: ProtectionUnlockTarget | null
  readonly pending: boolean
  readonly error: string | null
  /** Always false since the UI-core canonical flip; kept for shape compatibility. */
  readonly recoveryRequired: boolean
}

export const DEFAULT_PROTECTION_UNLOCK_STATE: ProtectionUnlockState = Object.freeze({
  phase: 'closed',
  isOpen: false,
  target: null,
  pending: false,
  error: null,
  recoveryRequired: false,
})

export interface VerifySheetProtectionInput {
  readonly sheetId: string
  readonly range: Readonly<CellRange>
  readonly password: string
}

export interface VerifySheetProtectionResult {
  readonly ok: boolean
  readonly message?: string
}

export type VerifySheetProtectionPort = (
  input: VerifySheetProtectionInput,
) => Promise<VerifySheetProtectionResult>

export interface SubmitProtectionUnlockInput {
  /** Optional host password verifier. A rejection prevents the local commit. */
  readonly verifySheetProtection?: VerifySheetProtectionPort
  readonly verifyTimeoutMs?: number
  /** Optional persistence hook mirroring the committed unlock. */
  readonly source?: SheetProtectionPersistencePort
}

export interface ProtectionUnlockMachine {
  readonly nextSessionId: number
  readonly sessionId: number
  readonly phase: ProtectionUnlockPhase
  readonly target: ProtectionUnlockTarget | null
  readonly password: string
  readonly error: string | null
}

const INITIAL_PROTECTION_UNLOCK_MACHINE: ProtectionUnlockMachine = {
  nextSessionId: 1,
  sessionId: 0,
  phase: 'closed',
  target: null,
  password: '',
  error: null,
}

export const protectionUnlockMachineAtom = atom<ProtectionUnlockMachine>(
  INITIAL_PROTECTION_UNLOCK_MACHINE,
)
protectionUnlockMachineAtom.debugLabel = 'spreadsheet.protection.unlockMachine'

function snapshotTarget(target: ProtectionUnlockTarget): ProtectionUnlockTarget {
  return Object.freeze({
    sheetId: target.sheetId,
    range: target.range ? snapshotRange(target.range) : undefined,
  })
}

export const protectionUnlockStateAtom = atom((get): ProtectionUnlockState => {
  const machine = get(protectionUnlockMachineAtom)
  if (machine === INITIAL_PROTECTION_UNLOCK_MACHINE) return DEFAULT_PROTECTION_UNLOCK_STATE
  return Object.freeze({
    phase: machine.phase,
    isOpen: machine.phase !== 'closed',
    target: machine.target,
    pending: machine.phase === 'verifying',
    error: machine.error,
    recoveryRequired: false,
  })
})
protectionUnlockStateAtom.debugLabel = 'spreadsheet.protection.unlockState'

export const protectionUnlockPasswordAtom = atom(
  (get): string => get(protectionUnlockMachineAtom).password,
)
protectionUnlockPasswordAtom.debugLabel = 'spreadsheet.protection.unlockPassword'

export const protectionUnlockPhaseAtom = atom(
  (get): ProtectionUnlockPhase => get(protectionUnlockMachineAtom).phase,
)
protectionUnlockPhaseAtom.debugLabel = 'spreadsheet.protection.unlockPhase'

export const protectionUnlockOpenAtom = atom(
  (get): boolean => get(protectionUnlockMachineAtom).phase !== 'closed',
)
protectionUnlockOpenAtom.debugLabel = 'spreadsheet.protection.unlockOpen'

export const setProtectionUnlockPasswordAtom = atom(null, (get, set, password: string) => {
  const machine = get(protectionUnlockMachineAtom)
  if (machine.phase !== 'editing') return
  set(protectionUnlockMachineAtom, { ...machine, password })
})
setProtectionUnlockPasswordAtom.debugLabel = 'spreadsheet.protection.setUnlockPassword'

export const openProtectionUnlockAtom = atom(null, (get, set, input: ProtectionUnlockTarget) => {
  const machine = get(protectionUnlockMachineAtom)
  const sessionId = machine.nextSessionId
  set(protectionUnlockMachineAtom, {
    nextSessionId: sessionId + 1,
    sessionId,
    phase: 'editing',
    target: snapshotTarget(input),
    password: '',
    error: null,
  })
})
openProtectionUnlockAtom.debugLabel = 'spreadsheet.protection.openUnlock'

export const closeProtectionUnlockAtom = atom(null, (get, set) => {
  const machine = get(protectionUnlockMachineAtom)
  const sessionId = machine.nextSessionId
  set(protectionUnlockMachineAtom, {
    nextSessionId: sessionId + 1,
    sessionId,
    phase: 'closed',
    target: null,
    password: '',
    error: null,
  })
})
closeProtectionUnlockAtom.debugLabel = 'spreadsheet.protection.closeUnlock'

export function setUnlockEditingError(set: Setter, error: string): void {
  set(protectionUnlockMachineAtom, (machine) => {
    if (machine.phase === 'closed') return machine
    return { ...machine, phase: 'editing', error }
  })
}
