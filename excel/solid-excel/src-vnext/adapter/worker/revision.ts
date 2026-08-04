// 一句话：投影 revision 见证值的推进。

import type { ProjectionRevision } from '@einfach/spreadsheet-ui-core'
import type { WorkerBackendState } from './state'

export function escapeAutoFillOpaqueRevisionWitness(value: ProjectionRevision): string {
  const witness = String(value)
  let escaped = ''
  for (let index = 0; index < witness.length; index += 1) {
    const codeUnit = witness.charCodeAt(index)
    const isAsciiAlphaNumeric =
      (codeUnit >= 48 && codeUnit <= 57) ||
      (codeUnit >= 65 && codeUnit <= 90) ||
      (codeUnit >= 97 && codeUnit <= 122)
    if (
      isAsciiAlphaNumeric ||
      codeUnit === 45 ||
      codeUnit === 46 ||
      codeUnit === 95
    ) {
      escaped += witness[index]
    } else {
      // Encode UTF-16 code units directly. Unlike encodeURIComponent this
      // is total for every legal JS string, including lone surrogates.
      escaped += `~${codeUnit.toString(16).padStart(4, '0')}`
    }
  }
  return escaped
}

export function advanceAutoFillOpaqueRevision(state: WorkerBackendState): string {
  if (state.autoFillOpaqueRevisionNamespace === null) {
    state.autoFillOpaqueRevisionNamespace =
      `worker-auto-fill:${escapeAutoFillOpaqueRevisionWitness(state.revision)}`
  }
  state.autoFillOpaqueRevisionEpoch += 1n
  state.revision = `${state.autoFillOpaqueRevisionNamespace}:${state.autoFillOpaqueRevisionEpoch}`
  return state.revision
}

/**
 * AutoFill-only revision advance. Scoped deliberately: every other
 * mutation family bumps through the plain `bumpRevision` below and never
 * sees a BigInt or opaque-namespace value. AutoFill needs a bump that
 * cannot silently fail to produce a fresh witness even at the two edges
 * `bumpRevision` does not promise to handle — a host-supplied non-numeric
 * revision (which `bumpRevision` intentionally leaves unchanged) and the
 * `Number.MAX_SAFE_INTEGER` boundary (where a plain `+1` cannot be told
 * apart from the previous value in IEEE754) — because AutoFill's
 * outcome-unknown lane forces a notify after a native call that may have
 * already committed, and a stuck revision there would mask that commit
 * forever. Once this falls into the opaque namespace it keeps advancing
 * on every subsequent call to THIS function (not `bumpRevision`) so a
 * chain of outcome-unknown auto-fills stays distinguishable.
 */
export function advanceAutoFillEpochRevision(state: WorkerBackendState): ProjectionRevision {
  if (state.autoFillOpaqueRevisionNamespace !== null) {
    return advanceAutoFillOpaqueRevision(state)
  }
  if (typeof state.revision === 'number' && Number.isFinite(state.revision)) {
    if (Number.isSafeInteger(state.revision) && state.revision === Number.MAX_SAFE_INTEGER) {
      state.revision = (BigInt(state.revision) + BigInt(1)).toString()
      return state.revision
    }
    const nextRevision = state.revision + 1
    if (!Object.is(nextRevision, state.revision)) {
      state.revision = nextRevision
      return state.revision
    }
  } else if (typeof state.revision === 'string' && /^(?:0|[1-9]\d*)$/.test(state.revision)) {
    state.revision = (BigInt(state.revision) + BigInt(1)).toString()
    return state.revision
  }
  return advanceAutoFillOpaqueRevision(state)
}

export function bumpRevision(state: WorkerBackendState): ProjectionRevision {
  // The filter-hidden set is NOT dropped here. Its predecessor (the display
  // permutation) was invalidated by every mutation, which is precisely what
  // made filtering re-evaluate itself live; Excel re-evaluates only on an
  // explicit Reapply, so the snapshot has to outlive the revision.
  if (typeof state.revision === 'number' && Number.isFinite(state.revision)) {
    state.revision += 1
  }
  return state.revision
}
