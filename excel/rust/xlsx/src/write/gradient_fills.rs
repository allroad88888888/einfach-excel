//! Serialize native gradient facts without normalizing angles, edges or repeated stops.
use crate::{color::to_argb, native::CellFormat, native_fill::CellFill, report::ReportBuilder};

pub fn xml(fill: &CellFill) -> String {
    let attributes = match fill {
        CellFill::LinearGradient { degree, .. } => format!(r#"type="linear" degree="{degree}""#),
        CellFill::PathGradient { left, right, top, bottom, .. } => format!(
            r#"type="path" left="{left}" right="{right}" top="{top}" bottom="{bottom}""#),
        CellFill::Pattern { .. } => unreachable!("gradient serializer receives gradient variants"),
    };
    let stops = fill.gradient_stops().unwrap_or_default().iter().map(|stop| format!(
        r#"<stop position="{}"><color rgb="{}"/></stop>"#,
        stop.position, to_argb(&stop.color).expect("validated gradient color"))).collect::<String>();
    format!("<fill><gradientFill {attributes}>{stops}</gradientFill></fill>")
}

/// XLSX gradientFill has no independent fallback background field.
pub fn report(format: &CellFormat, report: &mut ReportBuilder) {
    let Some(fill) = format.fill.as_ref().and_then(Option::as_ref) else { return };
    let Some(stops) = fill.gradient_stops() else { return };
    if stops.is_empty() { report.add("incompleteGradients", 1); }
    let background = format.bg_color.as_ref().and_then(|value| value.as_deref()).and_then(to_argb)
        .unwrap_or_else(|| "FFFFFFFF".into());
    let fallback = to_argb(fill.gradient_base().unwrap_or("#000000")).expect("validated color");
    if !background.eq_ignore_ascii_case(&fallback) { report.add("gradientBackground", 1); }
}
