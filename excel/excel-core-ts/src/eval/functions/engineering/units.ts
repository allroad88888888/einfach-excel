/** Excel CONVERT unit-category mappings and conversions. */

import type { FunctionImpl } from '../../../types'
import { propagateError, toNumber, toString } from '../../coerce'
import { ERR, NUM } from './shared'

type ConvertCategory =
  | 'length'
  | 'mass'
  | 'time'
  | 'pressure'
  | 'energy'
  | 'power'
  | 'temperature'

interface ConvertUnit {
  readonly category: ConvertCategory
  readonly factor: number
}

function convertUnitFactor(unit: string): ConvertUnit | null {
  switch (unit) {
    case 'm': return { category: 'length', factor: 1 }
    case 'km': return { category: 'length', factor: 1000 }
    case 'cm': return { category: 'length', factor: 0.01 }
    case 'mm': return { category: 'length', factor: 0.001 }
    case 'in': return { category: 'length', factor: 0.0254 }
    case 'ft': return { category: 'length', factor: 0.3048 }
    case 'yd': return { category: 'length', factor: 0.9144 }
    case 'mi': return { category: 'length', factor: 1609.344 }
    case 'Nmi':
    case 'nmi':
      return { category: 'length', factor: 1852 }

    case 'kg': return { category: 'mass', factor: 1 }
    case 'g': return { category: 'mass', factor: 0.001 }
    case 'mg': return { category: 'mass', factor: 1e-6 }
    case 'lbm': return { category: 'mass', factor: 0.45359237 }
    case 'ozm': return { category: 'mass', factor: 0.028349523125 }
    case 'ton': return { category: 'mass', factor: 907.18474 }

    case 'sec':
    case 's':
      return { category: 'time', factor: 1 }
    case 'mn':
    case 'min':
      return { category: 'time', factor: 60 }
    case 'hr': return { category: 'time', factor: 3600 }
    case 'day':
    case 'd':
      return { category: 'time', factor: 86400 }
    case 'yr': return { category: 'time', factor: 31557600 }

    case 'Pa':
    case 'p':
      return { category: 'pressure', factor: 1 }
    case 'atm':
    case 'at':
      return { category: 'pressure', factor: 101325 }
    case 'mmHg': return { category: 'pressure', factor: 133.322387415 }
    case 'psi': return { category: 'pressure', factor: 6894.757293168 }

    case 'J': return { category: 'energy', factor: 1 }
    case 'e': return { category: 'energy', factor: 1e-7 }
    case 'c':
    case 'cal':
      return { category: 'energy', factor: 4.184 }
    case 'HPh':
    case 'hh':
      return { category: 'energy', factor: 2684519.537696173 }
    case 'kWh':
      return { category: 'energy', factor: 3600000 }
    case 'Wh':
    case 'wh':
      return { category: 'energy', factor: 3600 }
    case 'flb':
      return { category: 'energy', factor: 1.3558179483314004 }
    case 'BTU':
    case 'btu':
      return { category: 'energy', factor: 1055.05585262 }
    case 'eV':
    case 'ev':
      return { category: 'energy', factor: 1.602176634e-19 }

    case 'W':
    case 'w':
      return { category: 'power', factor: 1 }
    case 'HP':
    case 'h':
      return { category: 'power', factor: 745.69987158227022 }
    case 'PS': return { category: 'power', factor: 735.49875 }

    case 'C':
    case 'cel':
      return { category: 'temperature', factor: 0 }
    case 'F':
    case 'fah':
      return { category: 'temperature', factor: 1 }
    case 'K':
    case 'kel':
      return { category: 'temperature', factor: 2 }

    default:
      return null
  }
}

function convertTemperature(value: number, fromTag: number, toTag: number): number {
  const celsius = fromTag === 0
    ? value
    : fromTag === 1
      ? (value - 32) * 5 / 9
      : value - 273.15
  return toTag === 0
    ? celsius
    : toTag === 1
      ? celsius * 9 / 5 + 32
      : celsius + 273.15
}

export const CONVERT: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 3) return ERR('#VALUE!')
  const value = toNumber(args[0])
  if (!value.ok) return value.error
  if (!Number.isFinite(value.value)) return ERR('#NUM!')
  const fromText = toString(args[1])
  if (!fromText.ok) return fromText.error
  const toText = toString(args[2])
  if (!toText.ok) return toText.error
  const fromUnit = convertUnitFactor(fromText.value)
  const toUnit = convertUnitFactor(toText.value)
  if (fromUnit === null || toUnit === null || fromUnit.category !== toUnit.category) {
    return ERR('#N/A')
  }
  const result = fromUnit.category === 'temperature'
    ? convertTemperature(value.value, fromUnit.factor, toUnit.factor)
    : value.value * fromUnit.factor / toUnit.factor
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}


export const FUNCTIONS: Record<string, FunctionImpl> = { CONVERT }
