//! 把 [`Expr`] 语法树渲染回公式源码文本。

use super::edit::{is_invalid, range_has_invalid_ref};
use super::render_number::render_number;
use crate::cell::{push_abs_addr, push_abs_col, push_abs_row, CellAddress};
use crate::formula::{BinOperator, Expr, RangeAbs, RangeBounds, RefAbs, TableArea};

/// Render an AST back to a formula string (for paste-and-store flows that
/// need text representation). Round-trip: parse(render(parse(s))) == parse(s).
pub fn render_formula(expr: &Expr) -> String {
    let mut out = String::from("=");
    render_into(expr, &mut out);
    out
}

/// Render one cell address with its `$` absolute markers (`$A$1`, `$A1`,
/// `A$1`, `A1`). Absoluteness is a written-form annotation only; the address
/// coordinates are unchanged from `to_string_repr`.
///
/// 只做 `RefAbs` → 两个裸 `bool` 的拆包，写出实现是
/// [`crate::cell::push_abs_addr`] 那唯一一份。拆包留在这一侧而不是下沉进
/// `cell.rs`：`RefAbs` 住在 `formula::ast`，而 `formula` 依赖 `cell`，
/// 让 `cell` 反过来认识 `RefAbs` 就把依赖方向倒过来了。
fn render_abs_addr(addr: CellAddress, abs: RefAbs, out: &mut String) {
    push_abs_addr(out, addr, abs.col, abs.row);
}

fn render_range_body(
    start: CellAddress,
    end: CellAddress,
    unbounded: RangeBounds,
    abs: RangeAbs,
    out: &mut String,
) {
    match unbounded {
        RangeBounds::None | RangeBounds::Both => {
            render_abs_addr(start, abs.start, out);
            out.push(':');
            render_abs_addr(end, abs.end, out);
        }
        RangeBounds::Rows => {
            // Whole-column range — only the column carries a `$`.
            push_abs_col(out, start.col, abs.start.col);
            out.push(':');
            push_abs_col(out, end.col, abs.end.col);
        }
        RangeBounds::Cols => {
            // Whole-row range — only the row carries a `$`.
            push_abs_row(out, start.row, abs.start.row);
            out.push(':');
            push_abs_row(out, end.row, abs.end.row);
        }
    }
}

fn render_into(expr: &Expr, out: &mut String) {
    match expr {
        Expr::Number(n) => render_number(*n, out),
        Expr::Text(s) => {
            out.push('"');
            out.push_str(s);
            out.push('"');
        }
        Expr::Bool(b) => out.push_str(if *b { "TRUE" } else { "FALSE" }),
        Expr::Error(e) => out.push_str(&e.to_string()),
        Expr::CellRef(addr, abs) => {
            if is_invalid(*addr) {
                out.push_str("#REF!");
            } else {
                render_abs_addr(*addr, *abs, out);
            }
        }
        Expr::Range {
            start,
            end,
            unbounded,
            abs,
        } => {
            // For whole-col / whole-row ranges, only the bounded axis can
            // carry a #REF! sentinel. is_invalid() checks BOTH axes, so
            // we'd false-positive on the u32::MAX sentinel. Check the
            // bounded axes explicitly.
            if range_has_invalid_ref(*start, *end, *unbounded) {
                out.push_str("#REF!");
            } else {
                render_range_body(*start, *end, *unbounded, *abs, out);
            }
        }
        Expr::SheetRef { sheet, addr, abs } => {
            if is_invalid(*addr) {
                out.push_str("#REF!");
            } else {
                out.push_str(sheet);
                out.push('!');
                render_abs_addr(*addr, *abs, out);
            }
        }
        Expr::SheetRange {
            sheet,
            start,
            end,
            unbounded,
            abs,
        } => {
            if range_has_invalid_ref(*start, *end, *unbounded) {
                out.push_str("#REF!");
            } else {
                out.push_str(sheet);
                out.push('!');
                render_range_body(*start, *end, *unbounded, *abs, out);
            }
        }
        Expr::SpillRef(anchor) => {
            render_into(anchor, out);
            out.push('#');
        }
        Expr::DynamicRange { start, end } => {
            render_into(start, out);
            out.push(':');
            render_into(end, out);
        }
        Expr::Negate(inner) => {
            out.push('-');
            render_into(inner, out);
        }
        // 后缀 `%`。`BinOp` 那条臂无条件加括号，所以 `(1+2)%` 回写成
        // `((1+2))%` 也仍然重解析成同一棵树；`50%%` / `2^2%` 同理。
        Expr::Percent(inner) => {
            render_into(inner, out);
            out.push('%');
        }
        Expr::BinOp { op, left, right } => {
            // Always parenthesize binops to avoid having to track precedence
            // on the way back. Parser handles redundant parens fine.
            out.push('(');
            render_into(left, out);
            out.push_str(match op {
                BinOperator::Add => "+",
                BinOperator::Sub => "-",
                BinOperator::Mul => "*",
                BinOperator::Div => "/",
                BinOperator::Pow => "^",
                BinOperator::Concat => "&",
                BinOperator::Eq => "=",
                BinOperator::NotEq => "<>",
                BinOperator::Lt => "<",
                BinOperator::LtEq => "<=",
                BinOperator::Gt => ">",
                BinOperator::GtEq => ">=",
            });
            render_into(right, out);
            out.push(')');
        }
        Expr::FuncCall { name, args } => {
            out.push_str(name);
            out.push('(');
            for (i, a) in args.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                render_into(a, out);
            }
            out.push(')');
        }
        // LET-style bound name (or future LAMBDA parameter). Round-trips
        // verbatim — the parser will rebuild the same `Expr::Name`.
        Expr::Name(n) => out.push_str(n),
        // Immediate-call: render `(callee)(args, ...)`. The wrapping
        // parens around the callee keep the round-trip unambiguous —
        // without them, `LAMBDA(x, x)(5)` and `LAMBDA(x, x(5))` would
        // share the same surface string when the callee is itself a
        // FuncCall with one body arg.
        Expr::ArrayLit { rows, cols, data } => {
            // Render `{a,b;c,d}` — comma separates columns, semicolon
            // separates rows, row-major. Round-trip with parse_formula.
            out.push('{');
            for r in 0..*rows {
                if r > 0 {
                    out.push(';');
                }
                for c in 0..*cols {
                    if c > 0 {
                        out.push(',');
                    }
                    let idx = (r as usize) * (*cols as usize) + (c as usize);
                    render_into(&data[idx], out);
                }
            }
            out.push('}');
        }
        Expr::Call(callee, args) => {
            out.push('(');
            render_into(callee, out);
            out.push(')');
            out.push('(');
            for (i, a) in args.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                render_into(a, out);
            }
            out.push(')');
        }
        // Multi-area: render as `(part1, part2, ...)`. Parens are
        // required for round-trip — the parser only recognises the
        // multi-area form inside parens (a bare `A1, B1` outside parens
        // would be ambiguous with a function-arg list).
        Expr::MultiArea(parts) => {
            out.push('(');
            for (i, p) in parts.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                render_into(p, out);
            }
            out.push(')');
        }
        // Structured (Table) reference. Column names in a parsed TableRef
        // can never contain `[ ] # @` (both the bare and bracketed colref
        // lexers stop at those), so single columns render bare and only
        // multi-column segments need inner brackets — the round-trip
        // (`parse(render(parse(s))) == parse(s)`) holds at the AST level.
        Expr::TableRef {
            table,
            area,
            columns,
        } => {
            if let Some(name) = table {
                out.push_str(name);
            }
            out.push('[');
            match area {
                TableArea::All => out.push_str("#All"),
                TableArea::Headers => out.push_str("#Headers"),
                TableArea::Totals => out.push_str("#Totals"),
                TableArea::Data => match columns {
                    None => out.push_str("#Data"),
                    Some((a, b)) if a == b => out.push_str(a),
                    Some((a, b)) => render_table_segment(a, b, out),
                },
                TableArea::ThisRow => {
                    out.push('@');
                    match columns {
                        None => {}
                        Some((a, b)) if a == b => out.push_str(a),
                        Some((a, b)) => render_table_segment(a, b, out),
                    }
                }
            }
            out.push(']');
        }
    }
}

/// Render a multi-column structured-reference segment `[a]:[b]` (design
/// doc §5.1). Both endpoints are bracketed so the `:` reads as the segment
/// separator on re-parse rather than as part of a bare column name.
fn render_table_segment(a: &str, b: &str, out: &mut String) {
    out.push('[');
    out.push_str(a);
    out.push_str("]:[");
    out.push_str(b);
    out.push(']');
}

#[cfg(test)]
#[path = "render_tests.rs"]
mod tests;
