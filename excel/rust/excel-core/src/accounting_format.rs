//! Accounting is a named custom format; the custom engine owns all display rules.
use crate::custom_number_format::{format_number, CustomFormatted};

/// Escape every symbol character so quotes, semicolons and date tokens stay literal.
pub fn code(symbol: &str, digits: u8) -> String {
    let symbol: String = symbol.chars().flat_map(|ch| ['\\', ch]).collect();
    let fraction = if digits == 0 { String::new() } else {
        format!(".{}", "0".repeat(usize::from(digits.min(15))))
    };
    let zeros = "?".repeat(usize::from(digits.min(15)));
    format!("_({symbol}* #,##0{fraction}_);_({symbol}* \\(#,##0{fraction}\\);_({symbol}* \"-\"{zeros}_);_(@_)")
}

pub fn display(symbol: &str, digits: u8, value: f64) -> Option<CustomFormatted> {
    format_number(&code(symbol, digits), value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signs_zero_and_padding_share_custom_layout() {
        for (value, text) in [(1234.5, " $1,234.50 "), (-1234.5, " $(1,234.50)"),
            (0.0, " $-   "), (-0.0, " $-   ")] {
            let shown = display("$", 2, value).unwrap();
            assert_eq!(shown.text, text);
            assert_eq!(shown.fill.unwrap().at, 2);
            assert!(!shown.pads.is_empty());
        }
        assert_eq!(display("", 0, -1234.6).unwrap().text, " (1,235)");
    }

    #[test]
    fn arbitrary_symbol_characters_are_literal() {
        assert!(code("\"".repeat(16).as_str(), 15).chars().count() <= 255);
        assert!(display("\"".repeat(16).as_str(), 15, 12.5).is_some());
        for symbol in ["USD", "¥", "\"", "\\", ";", "[Red]", "*0_@", "yyyy"] {
            let shown = display(symbol, 2, 12.5).unwrap();
            assert_eq!(shown.text, format!(" {symbol}12.50 "));
            assert_eq!(shown.fill.unwrap().at, 1 + symbol.chars().count());
            assert_eq!(shown.color, None);
        }
    }
}
