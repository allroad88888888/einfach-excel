//! 配色方案：与 `plugins/plugin-chart/src/core/convert/theme.ts` 的调色板逐色一致，按序号循环取色。
//! "office" 不在表里：没有显式颜色时交给 Excel 主题强调色。

const COLORFUL: [&str; 8] = ["5B9BD5", "70AD47", "FFC000", "ED7D31", "A5A5A5", "4472C4", "264478", "636363"];
const WARM: [&str; 8] = ["C0504D", "F79646", "FFC000", "9E480E", "E46C0A", "D99694", "FFD966", "843C0C"];
const COOL: [&str; 8] = ["4472C4", "5B9BD5", "4BACC6", "70AD47", "264478", "8064A2", "2E75B6", "548235"];
const BLUE: [&str; 8] = ["4472C4", "264478", "698ED0", "335AA1", "8FAADC", "203864", "B4C7E7", "2F5597"];
const ORANGE: [&str; 8] = ["ED7D31", "9E480E", "F1975A", "C55A11", "F4B183", "843C0C", "F8CBAD", "C65911"];
const GREEN: [&str; 8] = ["70AD47", "43682B", "8CC168", "548235", "A9D18E", "385723", "C5E0B4", "507E32"];
const GRAY: [&str; 8] = ["7F7F7F", "404040", "A5A5A5", "595959", "BFBFBF", "262626", "D9D9D9", "737373"];

/// 非 office 的方案返回第 `index % 8` 色（大写 RRGGBB）；office 与未知名返回 `None`。
pub fn color(palette: &str, index: usize) -> Option<&'static str> {
    let colors = match palette {
        "colorful" => &COLORFUL,
        "warm" => &WARM,
        "cool" => &COOL,
        "blue" => &BLUE,
        "orange" => &ORANGE,
        "green" => &GREEN,
        "gray" => &GRAY,
        _ => return None,
    };
    Some(colors[index % 8])
}

#[cfg(test)]
mod tests {
    use super::color;

    #[test]
    fn colors_cycle_and_office_has_none() {
        assert_eq!(color("warm", 0), Some("C0504D"));
        assert_eq!(color("warm", 9), Some("F79646"));
        assert_eq!(color("office", 0), None);
        assert_eq!(color("nope", 0), None);
    }
}
