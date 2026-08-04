/** Argument adapter shared by Bessel-function implementations. */

import type { Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'

export function evalBessel(
  args: ReadonlyArray<Value>,
  kernel: (x: number, n: number) => number | null,
): Value {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 2) return ERR('#VALUE!')
  const x = toNumber(args[0])
  if (!x.ok) return x.error
  const order = toNumber(args[1])
  if (!order.ok) return order.error
  if (!Number.isFinite(x.value) || !Number.isFinite(order.value)) return ERR('#NUM!')
  const n = Math.trunc(order.value)
  if (n < 0) return ERR('#NUM!')
  const result = kernel(x.value, n)
  if (result === null || !Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}
