pub(super) fn format_image_payload(
    source: &str,
    alt: Option<&str>,
    sizing: u8,
    height: Option<f64>,
    width: Option<f64>,
) -> String {
    let mut out = String::with_capacity(16 + source.len());
    out.push_str("<IMAGE: ");
    out.push_str(source);
    if let Some(a) = alt {
        out.push_str(" alt=\"");
        for ch in a.chars() {
            match ch {
                '\\' => out.push_str("\\\\"),
                '"' => out.push_str("\\\""),
                _ => out.push(ch),
            }
        }
        out.push('"');
    }
    if sizing != 0 {
        out.push_str(" sizing=");
        out.push_str(&sizing.to_string());
    }
    if let (Some(h), Some(w)) = (height, width) {
        // Trim trailing-zero noise the same way `coerce_to_text` does for
        // integer-valued doubles, so `120` round-trips as `120` not `120.0`.
        out.push_str(" height=");
        out.push_str(&format_image_number(h));
        out.push_str(" width=");
        out.push_str(&format_image_number(w));
    }
    out.push('>');
    out
}

pub(super) fn format_image_number(n: f64) -> String {
    if n == n.floor() && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        format!("{}", n)
    }
}
