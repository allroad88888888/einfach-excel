use super::*;

pub(super) fn bessel_j_n(x: f64, n: i64) -> Option<f64> {
    let ax = x.abs();
    if n == 0 {
        return Some(bessel_j0(x));
    }
    if n == 1 {
        return Some(bessel_j1(x));
    }
    if ax == 0.0 {
        // J_n(0) = 0 for n >= 1.
        return Some(0.0);
    }
    // Sign convention: J_n(-x) = (-1)^n J_n(x). Compute with |x|, fix sign.
    let sign_flip = if x < 0.0 && n % 2 != 0 { -1.0 } else { 1.0 };

    let n_us = n as usize;
    // Forward recurrence is stable when n <= ax. Else Miller downward.
    if (n as f64) <= ax {
        let mut jm1 = bessel_j0(ax);
        let mut j = bessel_j1(ax);
        let mut k = 1i64;
        while k < n {
            let jp1 = (2.0 * (k as f64) / ax) * j - jm1;
            jm1 = j;
            j = jp1;
            k += 1;
        }
        return Some(sign_flip * j);
    }
    // Miller downward recurrence. Start index needs to be well above
    // n; the classic choice is n + sqrt(40*n). The recurrence we walk
    // is J_{k-1}(x) = (2k/x) J_k(x) - J_{k+1}(x), with the scratch
    // initial values J_{M+1} = 0, J_M = 1 (unnormalised). After the
    // loop, `j_high` holds the unnormalised J_0(x); we rescale every
    // unnormalised quantity by J_0_true / j_high to recover the true
    // values, including the J_n captured along the way.
    let m_start = (n_us + ((40.0 * n_us as f64).sqrt() as usize)).max(2 * n_us + 8);
    let mut j_higher: f64 = 0.0; // unnormalised J_{k+1}
    let mut j_high: f64 = 1.0; // unnormalised J_k (starts at k = m_start)
    let mut value_at_n: f64 = 0.0;
    // Iterate k = m_start, m_start - 1, ..., 1 and compute J_{k-1}.
    for k in (1..=m_start).rev() {
        let j_lower = (2.0 * (k as f64) / ax) * j_high - j_higher;
        j_higher = j_high;
        j_high = j_lower;
        // After the shift, j_high == J_{k-1}.
        if (k as i64) - 1 == n {
            value_at_n = j_high;
        }
        // Rescale to keep magnitudes manageable.
        if j_high.abs() > 1e10 {
            j_high *= 1e-10;
            j_higher *= 1e-10;
            value_at_n *= 1e-10;
        }
    }
    // After the loop, j_high ≈ unnormalised J_0(x). Renormalise.
    let j0_true = bessel_j0(ax);
    if j_high == 0.0 {
        return Some(0.0);
    }
    Some(sign_flip * value_at_n * (j0_true / j_high))
}

/// BESSELY — Bessel function of the second kind, integer order n ≥ 0.
/// Singular at x = 0 for all n, and undefined for x < 0 (Excel
/// returns `#NUM!`).
pub(super) fn bessel_y_n(x: f64, n: i64) -> Option<f64> {
    if x <= 0.0 {
        return None; // singular / undefined
    }
    if n == 0 {
        return Some(bessel_y0(x));
    }
    if n == 1 {
        return Some(bessel_y1(x));
    }
    // Forward recurrence is stable for Y_n.
    let mut ym1 = bessel_y0(x);
    let mut y = bessel_y1(x);
    let mut k = 1i64;
    while k < n {
        let yp1 = (2.0 * (k as f64) / x) * y - ym1;
        ym1 = y;
        y = yp1;
        k += 1;
    }
    Some(y)
}

/// BESSELI — Modified Bessel function of the first kind, integer
/// order n ≥ 0.
pub(super) fn bessel_i_n(x: f64, n: i64) -> Option<f64> {
    let ax = x.abs();
    if n == 0 {
        return Some(bessel_i0(ax));
    }
    if n == 1 {
        // Sign convention: I_n(-x) = (-1)^n I_n(x). For n=1, odd → flip.
        let s = if x < 0.0 { -1.0 } else { 1.0 };
        return Some(s * bessel_i1(ax));
    }
    if ax == 0.0 {
        return Some(0.0);
    }
    let sign_flip = if x < 0.0 && n % 2 != 0 { -1.0 } else { 1.0 };
    let n_us = n as usize;

    // Miller-downward for stability. Recurrence:
    //   I_{k-1}(x) = (2k/x) I_k(x) + I_{k+1}(x)
    // (NOTE: plus, not minus, because I is the *modified* Bessel.)
    // Start from a high index M with I_M = 1, I_{M+1} = 0, recur down,
    // then renormalise via the true I_0(x).
    let m_start = (n_us + ((40.0 * n_us as f64).sqrt() as usize)).max(2 * n_us + 8);
    let mut i_higher: f64 = 0.0; // unnormalised I_{k+1}
    let mut i_high: f64 = 1.0; // unnormalised I_k (starts at k = m_start)
    let mut value_at_n: f64 = 0.0;
    for k in (1..=m_start).rev() {
        let i_lower = (2.0 * (k as f64) / ax) * i_high + i_higher;
        i_higher = i_high;
        i_high = i_lower;
        // After the shift, i_high == I_{k-1}.
        if (k as i64) - 1 == n {
            value_at_n = i_high;
        }
        if i_high.abs() > 1e10 {
            i_high *= 1e-10;
            i_higher *= 1e-10;
            value_at_n *= 1e-10;
        }
    }
    let i0_true = bessel_i0(ax);
    if i_high == 0.0 {
        return Some(0.0);
    }
    Some(sign_flip * value_at_n * (i0_true / i_high))
}

/// BESSELK — Modified Bessel function of the second kind, integer
/// order n ≥ 0. Singular at x = 0 and undefined for x < 0.
pub(super) fn bessel_k_n(x: f64, n: i64) -> Option<f64> {
    if x <= 0.0 {
        return None;
    }
    if n == 0 {
        return Some(bessel_k0(x));
    }
    if n == 1 {
        return Some(bessel_k1(x));
    }
    // Forward recurrence is stable for K_n (K_n grows in n).
    let mut km1 = bessel_k0(x);
    let mut k = bessel_k1(x);
    let mut j = 1i64;
    while j < n {
        let kp1 = (2.0 * (j as f64) / x) * k + km1;
        km1 = k;
        k = kp1;
        j += 1;
    }
    Some(k)
}
