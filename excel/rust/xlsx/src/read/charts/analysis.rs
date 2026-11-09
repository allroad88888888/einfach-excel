//! 系列里的 `c:trendline` / `c:errBars` → 载荷的 `trendlines` / `errorBars`。
//! 趋势线按系列绘制序（与颜色同一排序）取每个系列的第一条；误差线整张图一份，取第一个带误差线的系列。
//! 读不懂的类型（含自定义误差值 `cust`）按没有处理。

use super::tree::val;
use crate::chart_analysis::{ErrorBars, Trendline};
use crate::read::dom::Node;

fn trendline(ser: &Node) -> Option<Trendline> {
    let node = ser.child("trendline")?;
    let kind = match val(node, &["trendlineType"])? {
        "linear" => "linear",
        "exp" => "exponential",
        "log" => "logarithmic",
        "poly" => "polynomial",
        "power" => "power",
        "movingAvg" => "movingAverage",
        _ => return None,
    };
    let number = |name: &str, min: u32, max: u32| {
        node.child(name).and_then(|n| n.attr_u32("val")).map_or(2, |n| n.clamp(min, max))
    };
    let flag = |name: &str| node.child(name).is_some_and(|n| n.attr_bool("val", true));
    Some(Trendline {
        kind: kind.into(),
        order: number("order", 2, 6),
        period: number("period", 2, 255),
        show_equation: flag("dispEq"),
        show_r2: flag("dispRSqr"),
    })
}

/// 散点只认 Y 方向的误差线（无 `errDir` 视为 Y）。
fn error_bars(ser: &Node, scatter: bool) -> Option<ErrorBars> {
    let node = ser.each("errBars").find(|bars| !scatter || matches!(val(bars, &["errDir"]), None | Some("y")))?;
    let (kind, default_amount) = match val(node, &["errValType"])? {
        "fixedVal" => ("fixed", 1.0),
        "percentage" => ("percent", 5.0),
        "stdDev" => ("stdDev", 1.0),
        "stdErr" => ("stdErr", 1.0),
        _ => return None,
    };
    let direction = match val(node, &["errBarType"]) {
        Some("plus") => "plus",
        Some("minus") => "minus",
        _ => "both",
    };
    let amount = node.child("val").and_then(|n| n.attr_f64("val")).unwrap_or(default_amount);
    Some(ErrorBars { kind: kind.into(), amount, direction: direction.into() })
}

/// `sers` 按绘制顺序；末尾的 `None` 去掉。
pub fn apply(payload: &mut crate::chart_payload::ChartPayload, sers: &[&Node], scatter: bool) {
    let mut trendlines: Vec<Option<Trendline>> = sers.iter().map(|ser| trendline(ser)).collect();
    while trendlines.last().is_some_and(Option::is_none) {
        trendlines.pop();
    }
    payload.trendlines = trendlines;
    payload.error_bars = sers.iter().find_map(|ser| error_bars(ser, scatter));
}
