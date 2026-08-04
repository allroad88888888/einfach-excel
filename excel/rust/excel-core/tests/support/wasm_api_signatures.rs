//! WASM public-API signature extraction for architecture invariant tests.

/// Captures the public methods exposed by `wasm_bindgen` implementations.
pub(crate) fn extract_wasm_signatures(src: &str) -> Vec<String> {
    let normalize = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut sigs = Vec::new();
    let mut owner = String::from("<free>");
    let mut pending_attrs: Vec<String> = Vec::new();
    let mut lines = src.lines().map(str::trim).peekable();
    while let Some(line) = lines.next() {
        if line.starts_with("impl ") {
            owner = normalize(line.trim_end_matches('{').trim());
            pending_attrs.clear();
        } else if line.starts_with("#[wasm_bindgen") {
            let mut attr = line.to_string();
            while !attr.trim_end().ends_with(']') {
                match lines.next() {
                    Some(cont) => attr.push_str(cont),
                    None => break,
                }
            }
            pending_attrs.push(normalize(&attr));
        } else if line.starts_with("pub fn ") {
            let mut sig = line.to_string();
            while !sig.contains('{') && !sig.trim_end().ends_with(';') {
                match lines.next() {
                    Some(cont) => {
                        sig.push(' ');
                        sig.push_str(cont);
                    }
                    None => break,
                }
            }
            let sig = normalize(sig.split('{').next().unwrap_or(&sig).trim());
            sigs.push(format!("{owner} :: [{}] :: {sig}", pending_attrs.join(" ")));
            pending_attrs.clear();
        } else if !line.starts_with("#[") && !line.is_empty() && !line.starts_with("//") {
            pending_attrs.clear();
        }
    }
    sigs.sort();
    sigs
}
