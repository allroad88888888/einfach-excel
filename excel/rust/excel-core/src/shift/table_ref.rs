//! 表名 / 列名改掉之后，重写 AST 里的结构化引用（`Table[Col]`）节点。

use crate::formula::Expr;

/// A structured-reference rename to apply to formula text (design doc #32
/// §4.3). Table rename rewrites the `Expr::TableRef::table` field; column
/// rename rewrites the endpoints of `Expr::TableRef::columns` — but only on
/// references that target the renamed Table.
///
/// String fields are owned and matched case-insensitively; a rename is a
/// low-frequency dialog op so the allocation is irrelevant.
#[derive(Clone, Debug)]
pub(crate) enum TableRefEditSpec {
    /// `<from>[…]` → `<to>[…]` for every reference whose table name matches
    /// `from` (case-insensitively).
    RenameTable { from: String, to: String },
    /// `<table>[…<from>…]` → `<table>[…<to>…]`. `table_upper` is the
    /// uppercased target Table name; a table-less `[Col]` reference is only
    /// rewritten when the caller passes `apply_bare` (its cell sits inside
    /// the renamed Table).
    RenameColumn {
        table_upper: String,
        from: String,
        to: String,
    },
}

/// Rewrite `Expr::TableRef` nodes per `spec`, returning `Some(new)` iff any
/// node changed (so callers skip untouched formulas). `apply_bare` toggles
/// whether table-less `[Col]` references count as targeting the renamed
/// Table — set by the driver per formula cell (design doc #32 §4.3).
///
/// The node carries no A1 coordinates, so this is the ONLY structural-edit
/// walker that touches a Table reference; `map_addrs` / `shift_refs` leave
/// it transparent. Every child-bearing variant is recursed explicitly;
/// leaves (and `ArrayLit`, whose cells are literals only) can hold no
/// `TableRef` and return `None`.
pub(crate) fn rewrite_table_refs(
    expr: &Expr,
    spec: &TableRefEditSpec,
    apply_bare: bool,
) -> Option<Expr> {
    match expr {
        Expr::TableRef {
            table,
            area,
            columns,
        } => match spec {
            TableRefEditSpec::RenameTable { from, to } => match table {
                Some(t) if t.eq_ignore_ascii_case(from) => Some(Expr::TableRef {
                    table: Some(to.clone()),
                    area: *area,
                    columns: columns.clone(),
                }),
                _ => None,
            },
            TableRefEditSpec::RenameColumn {
                table_upper,
                from,
                to,
            } => {
                let targets = match table {
                    Some(t) => t.eq_ignore_ascii_case(table_upper),
                    None => apply_bare,
                };
                if !targets {
                    return None;
                }
                let (a, b) = columns.as_ref()?;
                let na = if a.eq_ignore_ascii_case(from) {
                    to.clone()
                } else {
                    a.clone()
                };
                let nb = if b.eq_ignore_ascii_case(from) {
                    to.clone()
                } else {
                    b.clone()
                };
                if &na == a && &nb == b {
                    return None;
                }
                Some(Expr::TableRef {
                    table: table.clone(),
                    area: *area,
                    columns: Some((na, nb)),
                })
            }
        },
        Expr::Negate(inner) => {
            rewrite_table_refs(inner, spec, apply_bare).map(|e| Expr::Negate(Box::new(e)))
        }
        Expr::Percent(inner) => {
            rewrite_table_refs(inner, spec, apply_bare).map(|e| Expr::Percent(Box::new(e)))
        }
        Expr::BinOp { op, left, right } => {
            let l = rewrite_table_refs(left, spec, apply_bare);
            let r = rewrite_table_refs(right, spec, apply_bare);
            if l.is_none() && r.is_none() {
                return None;
            }
            Some(Expr::BinOp {
                op: *op,
                left: Box::new(l.unwrap_or_else(|| (**left).clone())),
                right: Box::new(r.unwrap_or_else(|| (**right).clone())),
            })
        }
        Expr::FuncCall { name, args } => {
            rewrite_table_ref_children(args, spec, apply_bare).map(|args| Expr::FuncCall {
                name: name.clone(),
                args,
            })
        }
        Expr::Call(callee, args) => {
            let c = rewrite_table_refs(callee, spec, apply_bare);
            let a = rewrite_table_ref_children(args, spec, apply_bare);
            if c.is_none() && a.is_none() {
                return None;
            }
            Some(Expr::Call(
                Box::new(c.unwrap_or_else(|| (**callee).clone())),
                a.unwrap_or_else(|| args.clone()),
            ))
        }
        Expr::MultiArea(parts) => {
            rewrite_table_ref_children(parts, spec, apply_bare).map(Expr::MultiArea)
        }
        Expr::SpillRef(anchor) => {
            rewrite_table_refs(anchor, spec, apply_bare).map(|e| Expr::SpillRef(Box::new(e)))
        }
        Expr::DynamicRange { start, end } => {
            let s = rewrite_table_refs(start, spec, apply_bare);
            let e = rewrite_table_refs(end, spec, apply_bare);
            if s.is_none() && e.is_none() {
                return None;
            }
            Some(Expr::DynamicRange {
                start: Box::new(s.unwrap_or_else(|| (**start).clone())),
                end: Box::new(e.unwrap_or_else(|| (**end).clone())),
            })
        }
        _ => None,
    }
}

fn rewrite_table_ref_children(
    children: &[Expr],
    spec: &TableRefEditSpec,
    apply_bare: bool,
) -> Option<Vec<Expr>> {
    let mut any = false;
    let mut out = Vec::with_capacity(children.len());
    for child in children {
        match rewrite_table_refs(child, spec, apply_bare) {
            Some(new_child) => {
                any = true;
                out.push(new_child);
            }
            None => out.push(child.clone()),
        }
    }
    if any {
        Some(out)
    } else {
        None
    }
}
