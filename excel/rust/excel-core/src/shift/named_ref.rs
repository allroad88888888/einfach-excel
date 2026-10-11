//! 改写自由的命名区域引用；词法局部名、文本与表名不属于同一次改名。

use crate::formula::Expr;

/// 返回 true 才修改原 AST。局部绑定撞上新名称时 alpha-renaming，避免捕获全局引用。
pub(crate) fn rename_named_reference(expr: &mut Expr, old: &str, new: &str) -> bool {
    let mut candidate = expr.clone();
    let mut rename = Rename {
        old: old.to_uppercase(),
        new,
        new_key: new.to_uppercase(),
        source: super::render_formula(expr).to_uppercase(),
        serial: 0,
        changed: false,
    };
    rename.walk(&mut candidate, &mut Vec::new());
    if rename.changed {
        *expr = candidate;
    }
    rename.changed
}

struct Rename<'a> {
    old: String,
    new: &'a str,
    new_key: String,
    source: String,
    serial: usize,
    changed: bool,
}

// None 表示原局部名保持原样；Some 是为避免捕获而生成的新局部名。
type Locals = Vec<(String, Option<String>)>;

impl Rename<'_> {
    fn local(&self, name: &str, locals: &Locals) -> Option<Option<String>> {
        let key = name.to_uppercase();
        locals
            .iter()
            .rev()
            .find(|(bound, _)| *bound == key)
            .map(|(_, alias)| alias.clone())
    }

    fn bind(&mut self, expr: &mut Expr, locals: &mut Locals) {
        let Expr::Name(name) = expr else { return };
        let key = name.to_uppercase();
        let alias = if key == self.new_key && self.old != self.new_key {
            loop {
                self.serial += 1;
                let candidate = format!("_named_local_{}", self.serial);
                if !self.source.contains(&candidate.to_uppercase()) {
                    *name = candidate.clone();
                    break Some(candidate);
                }
            }
        } else {
            None
        };
        locals.push((key, alias));
    }

    fn walk(&mut self, expr: &mut Expr, locals: &mut Locals) {
        match expr {
            Expr::Name(name) => match self.local(name, locals) {
                Some(Some(alias)) => *name = alias,
                Some(None) => {}
                None if name.to_uppercase() == self.old => {
                    *name = self.new.into();
                    self.changed = true;
                }
                None => {}
            },
            Expr::FuncCall { name, args }
                if name == "LET" && args.len() >= 3 && args.len() % 2 == 1 =>
            {
                let depth = locals.len();
                let last = args.len() - 1;
                for pair in args[..last].chunks_exact_mut(2) {
                    self.walk(&mut pair[1], locals);
                    self.bind(&mut pair[0], locals);
                }
                self.walk(&mut args[last], locals);
                locals.truncate(depth);
            }
            Expr::FuncCall { name, args } if name == "LAMBDA" && !args.is_empty() => {
                let depth = locals.len();
                let last = args.len() - 1;
                for param in &mut args[..last] {
                    self.bind(param, locals);
                }
                self.walk(&mut args[last], locals);
                locals.truncate(depth);
            }
            Expr::FuncCall { name, args } => {
                // 函数位置只跟随局部 alpha-renaming；同名宿主函数不是范围引用。
                if let Some(Some(alias)) = self.local(name, locals) {
                    *name = alias.to_uppercase();
                }
                for arg in args {
                    self.walk(arg, locals);
                }
            }
            Expr::BinOp { left, right, .. }
            | Expr::DynamicRange {
                start: left,
                end: right,
            } => {
                self.walk(left, locals);
                self.walk(right, locals);
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                self.walk(inner, locals)
            }
            Expr::Call(callee, args) => {
                self.walk(callee, locals);
                for arg in args {
                    self.walk(arg, locals);
                }
            }
            Expr::MultiArea(items) | Expr::ArrayLit { data: items, .. } => {
                for item in items {
                    self.walk(item, locals);
                }
            }
            _ => {}
        }
    }
}
