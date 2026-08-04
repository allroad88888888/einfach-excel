import { meanOf, sumSquaredDeviations } from './numeric'
import { standardNormalInv } from './normal-distribution'
import { logGamma, regularizedBeta, regularizedGammaQ } from './special-functions'

export function studentTCdf(t: number, df: number): number {
  if (t === 0) return 0.5
  const x = df / (df + t * t)
  const beta = regularizedBeta(x, df / 2, 0.5)
  return t > 0 ? 1 - beta / 2 : beta / 2
}
export function studentTInv(p: number, df: number): number {
  if (p === 0.5) return 0
  // Cauchy closed form for df = 1.
  if (df === 1) return Math.tan(Math.PI * (p - 0.5))
  // Newton-Raphson seeded from the standard-normal inverse (valid as df → ∞).
  // Falls back to bisection on divergence.
  let x = standardNormalInv(p)
  if (!Number.isFinite(x)) x = 0
  const tol = 1e-12
  let lastErr = Number.POSITIVE_INFINITY
  for (let i = 0; i < 50; i++) {
    const cdf = studentTCdf(x, df)
    const err = cdf - p
    if (Math.abs(err) <= tol * Math.max(1, Math.abs(p))) return x
    const pdf = studentTPdf(x, df)
    if (!Number.isFinite(pdf) || pdf <= 0) break
    const step = err / pdf
    const next = x - step
    if (!Number.isFinite(next)) break
    if (Math.abs(err) > lastErr) break
    lastErr = Math.abs(err)
    x = next
  }
  // Bisection fallback — bracket and refine.
  let lo = -1
  let hi = 1
  while (studentTCdf(lo, df) > p) {
    hi = lo
    lo *= 2
  }
  while (studentTCdf(hi, df) < p) {
    lo = hi
    hi *= 2
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (studentTCdf(mid, df) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function sampleVariance(values: ReadonlyArray<number>): number | undefined {
  if (values.length < 2) return undefined
  return sumSquaredDeviations(values, meanOf(values)) / (values.length - 1)
}

export function poissonPmf(k: number, mean: number): number {
  return Math.exp(k * Math.log(mean) - mean - logGamma(k + 1))
}

export function poissonCdf(k: number, mean: number): number {
  return regularizedGammaQ(k + 1, mean)
}


export function studentTPdf(x: number, df: number): number {
  const half = (df + 1) / 2
  return Math.exp(
    logGamma(half) -
      logGamma(df / 2) -
      0.5 * Math.log(df * Math.PI) -
      half * Math.log1p((x * x) / df),
  )
}
