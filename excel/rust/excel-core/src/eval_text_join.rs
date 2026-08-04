use super::*;

const TEXTJOIN_MAX_CHARS: u64 = 32767;

pub(super) fn text_join_delimited(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let delim_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = delim_v {
        return Value::Error(e);
    }
    let ignore_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = ignore_v {
        return Value::Error(e);
    }
    let delim = coerce_to_text(&delim_v);
    // ignore_empty 写成空占位 ⇒ FALSE（保留空片段）。`=TEXTJOIN(",",,1,2)`
    // 这条写法在 Excel 里常见，强转失败判 `#TYPE!` 会把整条折掉。
    let ignore_empty = if arg_is_omitted(&args[1]) {
        false
    } else {
        match coerce_to_bool(&ignore_v) {
            Some(b) => b,
            None => return Value::Error(ValueError::WrongType),
        }
    };
    let delim_chars = delim.chars().count() as u64;
    // 见上文闸门 1/2：只有「保留空格」且「分隔符可见」时补洞才有可观测效果。
    let fill_holes = !ignore_empty && delim_chars > 0;

    let mut acc = TextJoinAcc {
        out: String::new(),
        chars: 0,
        first: true,
        delim: &delim,
        delim_chars,
        err: None,
    };

    for arg in &args[2..] {
        if acc.err.is_some() {
            break;
        }
        // 下一个「应该出现」的位次，1-based。回调看到的 pos 比它大就说明中间有洞。
        let mut expected = 1u64;
        let extent = for_each_arg_value_positioned(arg, provider, &mut |pos, v| {
            if acc.err.is_some() {
                return;
            }
            if fill_holes {
                while expected < pos && acc.err.is_none() {
                    acc.push("");
                    expected += 1;
                }
            }
            expected = pos + 1;
            if acc.err.is_some() {
                return;
            }
            match v {
                Value::Error(e) => {
                    acc.err = Some(e);
                    return;
                }
                Value::Null if ignore_empty => return,
                _ => {}
            }
            let piece = coerce_to_text(&v);
            if ignore_empty && piece.is_empty() {
                return;
            }
            acc.push(&piece);
        });
        // 实参尾部的空格：最后一个非空格之后还剩多少个位次没发。
        if fill_holes {
            if let Some(rect) = extent {
                while expected <= rect && acc.err.is_none() {
                    acc.push("");
                    expected += 1;
                }
            }
        }
    }

    match acc.err {
        Some(e) => Value::Error(e),
        None => Value::Text(acc.out),
    }
}

/// `text_join_delimited` 的累加器：把「要不要先推分隔符」和「有没有超字符上限」
/// 收在一处，免得补洞路径和正常路径各写一遍还写岔。
struct TextJoinAcc<'a> {
    out: String,
    /// `out` 的字符数，增量维护 —— 不要改成每次重数（见函数文档末段）。
    chars: u64,
    first: bool,
    delim: &'a str,
    delim_chars: u64,
    err: Option<ValueError>,
}

impl TextJoinAcc<'_> {
    /// 追加一个片段（空片段代表一个「占位的空格」）。
    fn push(&mut self, piece: &str) {
        if !self.first {
            self.out.push_str(self.delim);
            self.chars += self.delim_chars;
        }
        self.out.push_str(piece);
        self.chars += piece.chars().count() as u64;
        self.first = false;
        if self.chars > TEXTJOIN_MAX_CHARS {
            self.err = Some(ValueError::InvalidValue);
        }
    }
}
