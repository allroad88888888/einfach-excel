//! 把 [`Expr`] 语法树渲染回公式源码文本。

use super::edit::is_invalid;
use super::render_number::render_number;
use super::render_ref::{render_abs_addr, render_range_body, renderable_shape};
use crate::formula::{push_sheet_name, BinOperator, Expr, TableArea};

/// Render an AST back to a formula string (for paste-and-store flows that
/// need text representation). Round-trip: parse(render(parse(s))) == parse(s).
pub fn render_formula(expr: &Expr) -> String {
    let mut out = String::from("=");
    render_into(expr, &mut out);
    out
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
            match renderable_shape(*start, *end, *unbounded) {
                Some(shape) => render_range_body(*start, *end, shape, *abs, out),
                None => out.push_str("#REF!"),
            }
        }
        Expr::SheetRef { sheet, addr, abs } => {
            if is_invalid(*addr) {
                out.push_str("#REF!");
            } else {
                push_sheet_name(out, sheet);
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
            match renderable_shape(*start, *end, *unbounded) {
                Some(shape) => {
                    push_sheet_name(out, sheet);
                    out.push('!');
                    render_range_body(*start, *end, shape, *abs, out)
                }
                None => out.push_str("#REF!"),
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
