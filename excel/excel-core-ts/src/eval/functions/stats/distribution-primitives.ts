import { logGamma, regularizedBeta, regularizedGammaContinuedFractionQ, regularizedGammaSeriesP } from './special-functions'

export function regularizedGammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return Number.NaN
  if (x === 0) return 0
  if (x < a + 1) return regularizedGammaSeriesP(a, x)
  return 1 - regularizedGammaContinuedFractionQ(a, x)
}

export function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b)
}

export function betaPdfUnit(x: number, a: number, b: number): number {
  if (x <= 0) {
    if (a === 1) return b
    return a > 1 ? 0 : Number.POSITIVE_INFINITY
  }
  if (x >= 1) {
    if (b === 1) return a
    return b > 1 ? 0 : Number.POSITIVE_INFINITY
  }
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - logBeta(a, b))
}

export function betaInvUnitBisection(p: number, a: number, b: number): number {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (regularizedBeta(mid, a, b) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function betaInvUnit(p: number, a: number, b: number): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  // Newton-Raphson seeded from the analytical mean a/(a+b); fall back to
  // bisection on divergence or non-finite PDF. The CDF derivative is the PDF.
  let x = a / (a + b)
  if (!(x > 0 && x < 1)) x = 0.5
  const tol = 1e-12
  let lastErr = Number.POSITIVE_INFINITY
  for (let i = 0; i < 50; i++) {
    const cdf = regularizedBeta(x, a, b)
    const err = cdf - p
    if (Math.abs(err) <= tol * Math.max(1, Math.abs(p))) return x
    const pdf = betaPdfUnit(x, a, b)
    if (!Number.isFinite(pdf) || pdf <= 0) break
    let step = err / pdf
    // Damp the step to stay strictly inside (0, 1).
    let next = x - step
    while ((next <= 0 || next >= 1) && Math.abs(step) > 0) {
      step /= 2
      next = x - step
    }
    if (!(next > 0 && next < 1)) break
    // Divergence guard: |err| growing for 2 steps → bisection.
    if (Math.abs(err) > lastErr) break
    lastErr = Math.abs(err)
    x = next
  }
  return betaInvUnitBisection(p, a, b)
}

export function gammaValue(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaValue(1 - x))
  return Math.exp(logGamma(x))
}

export function gammaPdf(x: number, alpha: number, beta: number): number {
  if (x < 0) return Number.NaN
  if (x === 0) {
    if (alpha === 1) return 1 / beta
    return alpha > 1 ? 0 : Number.POSITIVE_INFINITY
  }
  const scaled = x / beta
  return Math.exp((alpha - 1) * Math.log(scaled) - scaled - logGamma(alpha)) / beta
}

export function gammaCdf(x: number, alpha: number, beta: number): number {
  if (x <= 0) return 0
  return regularizedGammaP(alpha, x / beta)
}

export function inversePositiveCdf(p: number, cdf: (x: number) => number): number {
  if (p <= 0) return 0
  let hi = 1
  while (cdf(hi) < p && hi < Number.MAX_VALUE / 2) hi *= 2
  let lo = 0
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (cdf(mid) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Newton-Raphson on a positive-support CDF, falling back to bisection.
 * Both `cdf` and `pdf` (its derivative) must be defined for x > 0.
 * `seed` is the initial guess (e.g. mean of the distribution).
 */
export function inversePositiveCdfNewton(
  p: number,
  seed: number,
  cdf: (x: number) => number,
  pdf: (x: number) => number,
): number {
  if (p <= 0) return 0
  let x = seed > 0 && Number.isFinite(seed) ? seed : 1
  const tol = 1e-12
  let lastErr = Number.POSITIVE_INFINITY
  for (let i = 0; i < 50; i++) {
    const c = cdf(x)
    const err = c - p
    if (Math.abs(err) <= tol * Math.max(1, Math.abs(p))) return x
    const d = pdf(x)
    if (!Number.isFinite(d) || d <= 0) break
    let step = err / d
    let next = x - step
    while (next <= 0 && Math.abs(step) > 0) {
      step /= 2
      next = x - step
    }
    if (!(next > 0) || !Number.isFinite(next)) break
    if (Math.abs(err) > lastErr) break
    lastErr = Math.abs(err)
    x = next
  }
  return inversePositiveCdf(p, cdf)
}


export function fCdf(x: number, df1: number, df2: number): number {
  if (x <= 0) return 0
  const ratio = (df1 * x) / (df1 * x + df2)
  return regularizedBeta(ratio, df1 / 2, df2 / 2)
}

export function fPdf(x: number, df1: number, df2: number): number {
  if (x < 0) return Number.NaN
  if (x === 0) {
    if (df1 === 2) return Math.exp((df1 / 2) * Math.log(df1 / df2) - logBeta(df1 / 2, df2 / 2))
    return df1 > 2 ? 0 : Number.POSITIVE_INFINITY
  }
  return Math.exp(
    (df1 / 2) * Math.log(df1 / df2) +
      (df1 / 2 - 1) * Math.log(x) -
      logBeta(df1 / 2, df2 / 2) -
      ((df1 + df2) / 2) * Math.log1p((df1 * x) / df2),
  )
}

export function chiSquareCdf(x: number, df: number): number {
  if (x <= 0) return 0
  return regularizedGammaP(df / 2, x / 2)
}

export function chiSquarePdf(x: number, df: number): number {
  if (x < 0) return Number.NaN
  const half = df / 2
  if (x === 0) {
    if (half === 1) return 0.5
    return half > 1 ? 0 : Number.POSITIVE_INFINITY
  }
  return Math.exp((half - 1) * Math.log(x) - x / 2 - half * Math.log(2) - logGamma(half))
}

export function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1)
}

export function binomPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0
  if (p === 0) return k === 0 ? 1 : 0
  if (p === 1) return k === n ? 1 : 0
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p))
}

export function binomCdf(k: number, n: number, p: number): number {
  let total = 0
  for (let i = 0; i <= k; i++) total += binomPmf(i, n, p)
  return total
}

export function hypergeomPmf(sampleS: number, numSample: number, popS: number, numPop: number): number {
  const logP =
    logChoose(popS, sampleS) +
    logChoose(numPop - popS, numSample - sampleS) -
    logChoose(numPop, numSample)
  return Number.isFinite(logP) ? Math.exp(logP) : 0
}

export function hypergeomCdf(sampleS: number, numSample: number, popS: number, numPop: number): number {
  const min = Math.max(0, numSample - (numPop - popS))
  const max = Math.min(sampleS, numSample, popS)
  let total = 0
  for (let k = min; k <= max; k++) total += hypergeomPmf(k, numSample, popS, numPop)
  return total
}

export function negbinomPmf(numF: number, numS: number, p: number): number {
  if (p === 1) return numF === 0 ? 1 : 0
  return Math.exp(logChoose(numF + numS - 1, numF) + numS * Math.log(p) + numF * Math.log1p(-p))
}

export function negbinomCdf(numF: number, numS: number, p: number): number {
  let total = 0
  for (let k = 0; k <= numF; k++) total += negbinomPmf(k, numS, p)
  return total
}

export function integerValue(value: number): number | undefined {
  return Number.isFinite(value) && Math.trunc(value) === value ? value : undefined
}
