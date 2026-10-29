import { atom } from '@einfach/core'
import type {
  FormatCellsBackendCapabilities,
  FormatCellsBackendCapabilitySource,
  FormatCellsReadVisibleProjectionPort,
  FormatCellsSetFormatRangePort,
} from './types'

export const INTRINSIC_REFLECT_APPLY = Reflect.apply

const INTRINSIC_REFLECT_GET = Reflect.get

interface FormatCellsCapabilityCaptureReservation {
  readonly kind: 'capturing-format-cells-capabilities'
  readonly token: object
}

export const formatCellsCapabilityCaptureReservationAtom =
  atom<FormatCellsCapabilityCaptureReservation | null>(null)

const EMPTY_FORMAT_CELLS_BACKEND_CAPABILITIES: Readonly<FormatCellsBackendCapabilities> =
  Object.freeze({})

function captureFormatCellsBackendCapability<TArgs extends unknown[], TResult>(
  source: FormatCellsBackendCapabilitySource,
  key: 'setFormatRange' | 'readVisibleProjection',
): ((...args: TArgs) => TResult) | undefined {
  let capability: unknown
  try {
    capability = INTRINSIC_REFLECT_GET(source, key)
  } catch {
    return undefined
  }
  if (typeof capability !== 'function') return undefined
  return Object.freeze(
    (...args: TArgs): TResult => INTRINSIC_REFLECT_APPLY(capability, source, args) as TResult,
  )
}

/**
 * Capture backend capabilities exactly once under a per-store synchronous lock.
 * Wrappers preserve the provider receiver without consulting a potentially
 * poisoned `.bind` property. Throwing getters degrade to unavailable ports.
 */
export const captureFormatCellsBackendCapabilitiesAtom = atom(
  null,
  (
    get,
    set,
    source: FormatCellsBackendCapabilitySource,
  ): Readonly<FormatCellsBackendCapabilities> => {
    if (get(formatCellsCapabilityCaptureReservationAtom) !== null) {
      return EMPTY_FORMAT_CELLS_BACKEND_CAPABILITIES
    }
    const reservation: FormatCellsCapabilityCaptureReservation = Object.freeze({
      kind: 'capturing-format-cells-capabilities',
      token: Object.freeze({}),
    })
    set(formatCellsCapabilityCaptureReservationAtom, reservation)
    try {
      const setFormatRange = captureFormatCellsBackendCapability<
        Parameters<FormatCellsSetFormatRangePort>,
        ReturnType<FormatCellsSetFormatRangePort>
      >(source, 'setFormatRange')
      const readVisibleProjection = captureFormatCellsBackendCapability<
        Parameters<FormatCellsReadVisibleProjectionPort>,
        ReturnType<FormatCellsReadVisibleProjectionPort>
      >(source, 'readVisibleProjection')
      return Object.freeze({ setFormatRange, readVisibleProjection })
    } finally {
      if (get(formatCellsCapabilityCaptureReservationAtom) === reservation) {
        set(formatCellsCapabilityCaptureReservationAtom, null)
      }
    }
  },
)
captureFormatCellsBackendCapabilitiesAtom.debugLabel =
  'spreadsheet.formatCells.captureBackendCapabilities'
