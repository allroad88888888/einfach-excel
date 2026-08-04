const LOG_SQRT_TWO_PI = 0.9189385332046727

export function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    0.000009984369578019572,
    0.00000015056327351493116,
  ] as const
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z)
  }
  const y = z - 1
  let x = 0.9999999999998099
  for (let i = 0; i < coefficients.length; i++) {
    x += coefficients[i] / (y + i + 1)
  }
  const t = y + coefficients.length - 0.5
  return LOG_SQRT_TWO_PI + (y + 0.5) * Math.log(t) - t + Math.log(x)
}

export function regularizedBetaContinuedFraction(x: number, a: number, b: number): number {
  const maxIterations = 200
  const eps = 3e-14
  const tiny = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < eps) break
  }
  return h
}

export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const logFactor = logGamma(a + b) - logGamma(a) - logGamma(b)
  const bt = Math.exp(logFactor + a * Math.log(x) + b * Math.log1p(-x))
  if (x < (a + 1) / (a + b + 2)) {
    return bt * regularizedBetaContinuedFraction(x, a, b) / a
  }
  return 1 - bt * regularizedBetaContinuedFraction(1 - x, b, a) / b
}

export function regularizedGammaSeriesP(a: number, x: number): number {
  const maxIterations = 200
  const eps = 1e-14
  let ap = a
  let del = 1 / a
  let sum = del
  for (let n = 1; n <= maxIterations; n++) {
    ap += 1
    del *= x / ap
    sum += del
    if (Math.abs(del) < Math.abs(sum) * eps) break
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a))
}

export function regularizedGammaContinuedFractionQ(a: number, x: number): number {
  const maxIterations = 200
  const eps = 1e-14
  const tiny = 1e-300
  let b = x + 1 - a
  if (Math.abs(b) < tiny) b = tiny
  let c = 1 / tiny
  let d = 1 / b
  if (Math.abs(d) < tiny) d = tiny
  let h = d
  for (let i = 1; i <= maxIterations; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < eps) break
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h
}

export function regularizedGammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) return Number.NaN
  if (x === 0) return 1
  if (x < a + 1) return 1 - regularizedGammaSeriesP(a, x)
  return regularizedGammaContinuedFractionQ(a, x)
}
