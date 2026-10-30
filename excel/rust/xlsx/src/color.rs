//! XLSX 颜色（ARGB、主题色加 tint、旧版索引色）与原生 `#rrggbb` 互转。

/// Office 默认主题，按 XLSX `theme` 索引排列（0=lt1、1=dk1、2=lt2、3=dk2、4..9=accent1..6）。
pub const DEFAULT_THEME: [&str; 12] = [
    "FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5",
    "70AD47", "0563C1", "954F72",
];

/// 旧版调色板前 8 色之外极少见；未知索引按无颜色处理。
const INDEXED: [&str; 8] = ["000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF"];

pub fn from_argb(argb: &str) -> Option<String> {
    let hex = argb.trim_start_matches('#');
    let rgb = match hex.len() {
        8 => &hex[2..],
        6 => hex,
        _ => return None,
    };
    rgb.chars().all(|c| c.is_ascii_hexdigit()).then(|| format!("#{}", rgb.to_ascii_lowercase()))
}

pub fn to_argb(color: &str) -> Option<String> {
    let hex = color.trim_start_matches('#');
    (hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()))
        .then(|| format!("FF{}", hex.to_ascii_uppercase()))
}

pub fn from_indexed(index: usize) -> Option<String> {
    match index {
        0..=7 => from_argb(INDEXED[index]),
        8..=15 => from_argb(INDEXED[index - 8]),
        _ => None,
    }
}

/// 主题色加 tint（-1..1）：按 Excel 的 HLS 亮度规则变亮/变暗。
pub fn from_theme(theme: &[String], index: usize, tint: f64) -> Option<String> {
    let base = theme.get(index)?;
    let rgb = u32::from_str_radix(base.get(base.len().saturating_sub(6)..)?, 16).ok()?;
    let channel = |shift: u32| f64::from((rgb >> shift) & 0xff) / 255.0;
    let (h, l, s) = rgb_to_hls(channel(16), channel(8), channel(0));
    let l = if tint < 0.0 { l * (1.0 + tint) } else { l * (1.0 - tint) + tint };
    let (r, g, b) = hls_to_rgb(h, l.clamp(0.0, 1.0), s);
    let byte = |v: f64| (v * 255.0).round() as u8;
    Some(format!("#{:02x}{:02x}{:02x}", byte(r), byte(g), byte(b)))
}

fn rgb_to_hls(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < f64::EPSILON {
        return (0.0, l, 0.0);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if max == r {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h / 6.0, l, s)
}

fn hls_to_rgb(h: f64, l: f64, s: f64) -> (f64, f64, f64) {
    if s == 0.0 {
        return (l, l, l);
    }
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    let hue = |mut t: f64| {
        if t < 0.0 {
            t += 1.0;
        }
        if t > 1.0 {
            t -= 1.0;
        }
        if t < 1.0 / 6.0 {
            p + (q - p) * 6.0 * t
        } else if t < 0.5 {
            q
        } else if t < 2.0 / 3.0 {
            p + (q - p) * (2.0 / 3.0 - t) * 6.0
        } else {
            p
        }
    };
    (hue(h + 1.0 / 3.0), hue(h), hue(h - 1.0 / 3.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_argb_and_theme_tints() {
        assert_eq!(from_argb("FFFF0000").as_deref(), Some("#ff0000"));
        assert_eq!(to_argb("#00ff00").as_deref(), Some("FF00FF00"));
        let theme: Vec<String> = DEFAULT_THEME.iter().map(|c| c.to_string()).collect();
        assert_eq!(from_theme(&theme, 4, 0.0).as_deref(), Some("#4472c4"));
        // accent1 加 0.8 tint 是 Excel 色板里的浅蓝 DAE3F3。
        assert_eq!(from_theme(&theme, 4, 0.7999816888943144).as_deref(), Some("#dae3f3"));
        assert_eq!(from_theme(&theme, 1, 0.0).as_deref(), Some("#000000"));
    }
}
