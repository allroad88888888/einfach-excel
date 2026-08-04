use super::*;

pub(super) fn matrix_inverse_inplace(a_in: Vec<Vec<f64>>) -> Result<Vec<Vec<f64>>, ValueError> {
    let n = a_in.len();
    if n == 0 || a_in.iter().any(|r| r.len() != n) {
        return Err(ValueError::InvalidValue);
    }
    let mut a: Vec<Vec<f64>> = a_in;
    let mut inv: Vec<Vec<f64>> = (0..n)
        .map(|i| {
            let mut row = vec![0.0; n];
            row[i] = 1.0;
            row
        })
        .collect();
    for i in 0..n {
        // Partial pivot.
        let mut piv = i;
        let mut piv_val = a[i][i].abs();
        for r in (i + 1)..n {
            let v = a[r][i].abs();
            if v > piv_val {
                piv_val = v;
                piv = r;
            }
        }
        if piv_val < 1e-12 {
            return Err(ValueError::Overflow);
        }
        if piv != i {
            a.swap(i, piv);
            inv.swap(i, piv);
        }
        // Normalise row i.
        let div = a[i][i];
        for c in 0..n {
            a[i][c] /= div;
            inv[i][c] /= div;
        }
        // Eliminate other rows.
        for r in 0..n {
            if r == i {
                continue;
            }
            let factor = a[r][i];
            if factor == 0.0 {
                continue;
            }
            for c in 0..n {
                a[r][c] -= factor * a[i][c];
                inv[r][c] -= factor * inv[i][c];
            }
        }
    }
    Ok(inv)
}
