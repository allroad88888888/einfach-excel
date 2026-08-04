pub(super) fn complex_mul(a: f64, b: f64, c: f64, d: f64) -> (f64, f64) {
    (a * c - b * d, a * d + b * c)
}

pub(super) fn complex_div(a: f64, b: f64, c: f64, d: f64) -> Option<(f64, f64)> {
    let denom = c * c + d * d;
    if denom == 0.0 {
        return None;
    }
    Some(((a * c + b * d) / denom, (b * c - a * d) / denom))
}
