use super::*;

pub(super) fn coerce_to_text(v: &Value) -> String {
    match v {
        Value::Text(s) => s.clone(),
        // Excel「General」转文本规格的唯一调用点：15 位有效数字、half-up 收位、
        // 大数指数 > 19 / 小数普通写法超过 20 字符才退到科学计数。规格本身与它
        // 和 `format::value_to_display`（网格渲染，另一条路）的关系写在
        // `crate::general_text` 的模块文档里。散开写就会变成第二份实现。
        Value::Number(n) => crate::general_text::excel_general_to_text(*n),
        Value::Boolean(true) => "TRUE".into(),
        Value::Boolean(false) => "FALSE".into(),
        Value::Null => String::new(),
        Value::Error(e) => format!("{}", e),
        // Phase 1 spill plumbing: scalar coercion of an anchor Array
        // collapses to the top-left element. This branch is reachable
        // only for callers that bypass `for_each_arg_value` (which
        // already iterates Array elements). Falling back to top-left
        // keeps Excel parity (`=A1 & ""` when A1 is a 3x1 spill produces
        // the first element's text).
        Value::Array(arr) => arr.get(0, 0).map(coerce_to_text).unwrap_or_default(),
        // A lambda has no scalar text rendering. Keep coercion pure here;
        // operators that need numeric/boolean lambda values fail through
        // the usual WrongType path, while higher-order array callbacks use
        // Calc for nested dynamic-array results.
        Value::Lambda(_) => "<lambda>".into(),
    }
}

pub(super) fn coerce_to_text_result(v: &Value) -> Result<String, ValueError> {
    match v {
        Value::Error(e) => Err(e.clone()),
        Value::Array(arr) => match arr.get(0, 0) {
            Some(cell) => coerce_to_text_result(cell),
            None => Err(ValueError::InvalidValue),
        },
        _ => Ok(coerce_to_text(v)),
    }
}

pub(super) fn eval_text_arg(arg: &Expr, provider: &dyn EvalProvider) -> Result<String, ValueError> {
    let (_, _, data) = arg_to_2d(arg, provider)?;
    match data.first() {
        Some(value) => coerce_to_text_result(value),
        None => Err(ValueError::InvalidValue),
    }
}


pub(super) fn coerce_to_number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => Some(*n),
        Value::Null => Some(0.0),
        Value::Boolean(true) => Some(1.0),
        Value::Boolean(false) => Some(0.0),
        _ => None,
    }
}

/// 算术运算符（`+ - * / ^`、一元负号、后缀 `%`）专用的数字强制转换。
///
/// 与 [`coerce_to_number`] 的**唯一**差别：接受「看起来是数字的文本」。
/// Excel 里 `=1+"5"` 是 `6`、`="5"*"3"` 是 `15`，本仓的 TS 参考引擎
/// （`excel-core-ts/src/eval/coerce.ts` 的 `toNumber`）也是；Rust 侧过去
/// 一律 `#VALUE!`，是一条活的跨引擎分歧。
///
/// 为什么**不**直接放宽 `coerce_to_number`：它还喂着 [`eval_compare`] 和
/// 两百多个内建函数。比较那条是硬伤 —— Excel 里文本永远大于任何数字，
/// `="5"<10` 是 `FALSE`；`eval_compare` 今天靠「文本不可转数字 ⇒ 退化成
/// 文本比较」拿到这个 Excel 正确答案，一旦文本能转数字就会变成 `TRUE`。
/// 所以放宽只落在算术运算符上，比较与函数实参维持原样。
pub(super) fn coerce_to_number_arith(v: &Value) -> Option<f64> {
    match v {
        Value::Text(s) => coerce_text_to_number(s),
        _ => coerce_to_number(v),
    }
}

/// 文本 → 数字，逐字节对齐 TS 侧 `toNumber` 的 string 分支：
///
/// ```ts
/// const trimmed = v.value.trim()
/// if (trimmed.length === 0) return #VALUE!
/// const n = Number(trimmed)
/// if (!Number.isFinite(n)) return #VALUE!
/// ```
///
/// 坑在于 **JS `Number()` 不是 Rust `str::parse::<f64>()`**。实测差异
/// （trim 之后）：
///
/// | 输入 | `Number(x)` | `x.parse::<f64>()` | 本函数 |
/// |------|-------------|--------------------|--------|
/// | `""` | `0` | `Err` | `None`（TS 有显式空串守卫，先于 `Number`） |
/// | `"0x10"` | `16` | `Err` | `Some(16.0)` |
/// | `"0b101"` / `"0o17"` | `5` / `15` | `Err` | `Some(5.0)` / `Some(15.0)` |
/// | `"inf"` / `"nan"` | `NaN` | `Ok(inf)` / `Ok(NaN)` | `None` |
/// | `"Infinity"` | `∞` | `Ok(inf)` | `None`（非有限） |
/// | `"1e999"` | `∞` | `Ok(inf)` | `None`（非有限） |
/// | `"1_000"` | `NaN` | `Err` | `None` |
/// | `"\u{feff}5"` | `5`（JS trim 吃 BOM） | `Err` | `Some(5.0)` |
/// | `"\u{85}5"` | `NaN`（NEL 不是 JS 空白） | `Err` | `None` |
///
/// 所以这里复用 [`js_trim`] / [`js_numeric_value`] —— filter.rs 里那份
/// 手写的 `StringNumericLiteral` 文法移植，不是 `parse::<f64>()`。
///
/// ⚠️ `0x` / `0b` / `0o` 三行是 **oracle 与 Excel 不一致**的地方：Excel
/// 的 `=1+"0x10"` 是 `#VALUE!`，JS/TS 是 `17`。这里按「与 TS 引擎逐格
/// 一致」取舍（跨引擎 parity 网的价值高于单侧的 Excel 保真度），要改就
/// 两个引擎同批改。
///
/// 顺带一提：`"5%"` / `"1,000"` / `"$5"` / `"TRUE"` 两边都是 `#VALUE!`，
/// 而 Excel 会认前三个（百分号、千分位、货币符号）。那是两个引擎共同
/// 欠 Excel 的，不在本次范围。
pub(super) fn coerce_text_to_number(s: &str) -> Option<f64> {
    let trimmed = js_trim(s);
    // `Number("")` 是 `0` 而不是 NaN，TS 侧靠这道守卫把空串挡在外面。
    // 少了它 `=1+""` 会答 1，而 Excel / TS 都是 `#VALUE!`。
    if trimmed.is_empty() {
        return None;
    }
    js_numeric_value(trimmed)
}
