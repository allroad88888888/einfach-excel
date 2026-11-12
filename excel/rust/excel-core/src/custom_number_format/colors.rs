//! 段颜色标签：八个具名颜色与 `[Color1]`..`[Color56]` 默认调色板。

/// Excel 97-2003 默认调色板；具名颜色就是其中前八项。
const PALETTE: [&str; 56] = [
    "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
    "#800000", "#008000", "#000080", "#808000", "#800080", "#008080", "#c0c0c0", "#808080",
    "#9999ff", "#993366", "#ffffcc", "#ccffff", "#660066", "#ff8080", "#0066cc", "#ccccff",
    "#000080", "#ff00ff", "#ffff00", "#00ffff", "#800080", "#800000", "#008080", "#0000ff",
    "#00ccff", "#ccffff", "#ccffcc", "#ffff99", "#99ccff", "#ff99cc", "#cc99ff", "#ffcc99",
    "#3366ff", "#33cccc", "#99cc00", "#ffcc00", "#ff9900", "#ff6600", "#666699", "#969696",
    "#003366", "#339966", "#003300", "#333300", "#993300", "#993366", "#333399", "#333333",
];

const NAMED: [&str; 8] = ["black", "white", "red", "green", "blue", "yellow", "magenta", "cyan"];

/// `Some(Ok)` 是颜色标签，`Some(Err)` 是越界的 `[ColorN]`，`None` 不是颜色标签。
pub(super) fn color_tag(tag: &str) -> Option<Result<&'static str, ()>> {
    let lower = tag.trim().to_ascii_lowercase();
    // NAMED 与调色板前八项同序：Black=Color1 … Cyan=Color8。
    if let Some(index) = NAMED.iter().position(|name| *name == lower) {
        return Some(Ok(PALETTE[index]));
    }
    let number = lower.strip_prefix("color")?;
    Some(
        number
            .parse::<usize>()
            .ok()
            .filter(|index| (1..=56).contains(index))
            .map(|index| PALETTE[index - 1])
            .ok_or(()),
    )
}
