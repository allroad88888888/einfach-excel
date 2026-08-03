// The REGEX* built-ins (REGEXTEST / REGEXEXTRACT / REGEXREPLACE) and the
// compiled-regex cache they share. Gating the whole module here is what keeps
// the `regex` crate out of the lite wasm build — see the `regex-formulas`
// feature in `Cargo.toml`. The only other `#[cfg]`s the feature needs are the
// three dispatch arms in `eval_func`. `#[path]` keeps the file flat in `src/`
// alongside the crate's other modules while leaving it a child of `eval`, so
// it can use this module's private helpers without widening their visibility.
#[cfg(feature = "regex-formulas")]
#[path = "eval_regex.rs"]
mod eval_regex;

// WRAPROWS / WRAPCOLS。同样用 `#[path]` 平铺在 `src/`、仍是 `eval` 的子模块，
// 理由与上面那块一致，外加一条：本文件已经三万九千行，远超本仓 500 行上限，
// 新增内建不该继续往里堆。无 `#[cfg]` —— 这两个不属于任何 feature 门控。
#[path = "eval_wrap.rs"]
mod eval_wrap;

use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::sync::Arc;

use einfach_core::{ArrayData, AtomId, LambdaValue, Value, ValueError};

use crate::cell::CellAddress;
use crate::filter::{js_numeric_value, js_trim};
use crate::formula::{BinOperator, Expr, TableArea};
use crate::range::CellRange;
use crate::shift::{REF_INVALID_COL, REF_INVALID_ROW};

/// Lexical-scope frame for a single `LET(...)` activation. Bindings are
/// pushed sequentially in source order so a later `(name, value)` pair
/// can reference earlier names in the same LET, and a nested `LET`'s
/// frame links to the surrounding frame so outer bindings remain
/// visible through the parent chain.
///
/// Why a frame rather than a flat `HashMap`? A LET inside another LET
/// must shadow — `=LET(x, 5, LET(x, 10, x*2))` returns 20. Linking a
/// fresh frame to the parent gives shadow semantics in O(depth) lookup
/// without copying the outer table.
#[derive(Debug)]
struct LetFrame {
    bindings: HashMap<String, Value>,
}

impl LetFrame {
    fn new() -> Self {
        LetFrame {
            bindings: HashMap::new(),
        }
    }

    fn bind(&mut self, name: String, value: Value) {
        self.bindings.insert(name, value);
    }
}

thread_local! {
    /// Thread-local stack of active LET frames. The top of the stack is
    /// the innermost LET; lookup walks down. The stack is empty outside
    /// any LET body — `Expr::Name` then surfaces `#NAME?`.
    ///
    /// Why TLS rather than a parameter? Threading a `&Scope` through
    /// every helper (`for_each_arg_value`, `eval_func` arms, range
    /// resolvers, etc.) would touch the entire 16k-line `eval.rs`. The
    /// LET arm pushes/pops a frame in a save/restore guard so the stack
    /// stays balanced even when the body short-circuits on an error,
    /// and `Expr::Name` only ever reads — no aliasing hazards.
    static LET_FRAMES: RefCell<Vec<LetFrame>> = const { RefCell::new(Vec::new()) };

    /// Thread-local recursion depth counter for named-LAMBDA calls. A
    /// recursive defined name (e.g. `fact` = `LAMBDA(n, IF(n<=1, 1,
    /// n*fact(n-1)))`) reaches itself through `provider.lookup_named`
    /// every time the body's `fact(...)` resolves; without a guard a
    /// pathological recursive definition (`bad` = `LAMBDA(n, bad(n))`)
    /// would blow the OS stack. We cap the depth at `MAX_NAMED_CALL_DEPTH`
    /// and surface `#NUM!` on overflow — matches Excel's behaviour for
    /// stack-busting recursion.
    ///
    /// LET-frame depth is not bounded here: LET binds eagerly during
    /// evaluation, so a runaway LET would already overflow at parse /
    /// AST construction. The named-call counter only ticks when an
    /// `Expr::Name` or `Expr::FuncCall` arm finds a `Value::Lambda` in
    /// the workbook registry and is about to evaluate its body — i.e.
    /// the entry/exit points where unbounded self-reference happens.
    static NAMED_CALL_DEPTH: Cell<usize> = const { Cell::new(0) };
}

/// Maximum nesting depth for `apply_lambda` recursion. Exceeded depth
/// returns `Value::Error(ValueError::Overflow)` (Excel's `#NUM!`) so a
/// pathological recursive named LAMBDA (`bad` = `LAMBDA(n, bad(n))`)
/// surfaces an error instead of overflowing the OS thread stack.
///
/// **Why 32 rather than the "obvious" 256**: each recursion level
/// allocates a Rust stack frame for `apply_lambda` plus
/// `eval_expr_with_provider` plus `eval_func`. `eval_func` is a 7k-line
/// `match` that in debug builds carries an enormous stack frame
/// (≈50KB) — the test runner's default 2MB thread stack only fits
/// ~40 such frames. Cap chosen with headroom for nested `IF` arms and
/// builtin auxiliary frames so realistic recursive helpers (factorial,
/// fib up to n≈20, small tree walks) all work in debug mode while the
/// release build still has comfortable margin.
///
/// If the host wants deeper recursion they can run a release build (the
/// cap is the same constant but each frame is ~10× smaller, leaving
/// the same 32-level cap with abundant unused stack budget). A future
/// refactor could shrink `eval_func` via dispatch-table indirection,
/// at which point this cap can be raised toward Excel's documented
/// limit of 8191.
pub(crate) const MAX_NAMED_CALL_DEPTH: usize = 32;

/// True iff `name` (already uppercased per Excel name conventions) is
/// on the reserved-name list. Used by the workbook defined-name
/// registry to reject `define_name("SUM", ...)`-style shadowing — the
/// dispatch table would beat the registry anyway, so forbidding the
/// registration avoids a silently-ignored entry.
///
/// **This list must cover every name `eval_func` dispatches, minus an
/// explicit whitelist.** It used to be a silent strict subset: 74 of
/// the 500 dispatched names were missing (the whole `IM*` complex
/// family, the extended finance batch — `ACCRINT` / `PRICE` / `YIELD` /
/// `DB` / `SLN` / `XIRR` / … — the `ARRAYTOTEXT` / `UNICHAR` / `SHEET`
/// text-info batch, and the undotted `RANKEQ` / `RANKAVG` aliases), so
/// registering any of them was accepted and evaluation then shadowed
/// it — exactly the silently-ignored entry this function exists to
/// prevent. 71 of the 74 were added; the parity is now asserted, see
/// below.
///
/// **The one deliberate exception** is the `REGEX*` trio
/// (`REGEXTEST` / `REGEXEXTRACT` / `REGEXREPLACE`). They are the only
/// dispatch arms behind `#[cfg(feature = "regex-formulas")]`, so under
/// a lite build they are not built-ins at all and a host polyfilling
/// them with a JS custom formula is a legitimate use. Reserving them
/// unconditionally would kill that; not reserving them means the same
/// workbook can compute different values under lite vs full. Both
/// sides cost something and the call is the owner's, so they stay off
/// the list and are registered in the gate's whitelist rather than
/// merely forgotten. TODO(owner): decide.
///
/// **Maintenance**: the JS mirror
/// `excel/spreadsheet-ui-core/src/custom-formulas/engine-builtin-names.ts`
/// is generated from these arms — regenerate it with
/// `node excel/spreadsheet-ui-core/scripts/extract-builtin-names.mjs`
/// whenever an arm is added or removed. Drift between the two lists is
/// caught by `excel/spreadsheet-ui-core/test/engine-builtin-mirror.test.ts`,
/// which ALSO asserts `eval_func` dispatch ⊇ this list with the diff
/// pinned to the `REGEX*` whitelist above. Add a built-in without
/// adding it here and that suite fails.
pub fn is_builtin_function_name(name: &str) -> bool {
    matches!(
        name,
        "ABS"
            | "ACCRINT"
            | "ACCRINTM"
            | "ACOS"
            | "ACOSH"
            | "ACOT"
            | "ACOTH"
            | "ACSC"
            | "ADDRESS"
            | "AGGREGATE"
            | "AMORDEGRC"
            | "AMORLINC"
            | "AND"
            | "ARABIC"
            | "AREAS"
            | "ARRAYTOTEXT"
            | "ASC"
            | "ASEC"
            | "ASIN"
            | "ASINH"
            | "ATAN"
            | "ATAN2"
            | "ATANH"
            | "AVEDEV"
            | "AVERAGE"
            | "AVERAGEA"
            | "AVERAGEIF"
            | "AVERAGEIFS"
            | "BASE"
            | "BESSELI"
            | "BESSELJ"
            | "BESSELK"
            | "BESSELY"
            | "BETA.DIST"
            | "BETA.INV"
            | "BETADIST"
            | "BETAINV"
            | "BIN2DEC"
            | "BIN2HEX"
            | "BIN2OCT"
            | "BINOM.DIST"
            | "BINOM.DIST.RANGE"
            | "BINOM.INV"
            | "BINOMDIST"
            | "BITAND"
            | "BITLSHIFT"
            | "BITOR"
            | "BITRSHIFT"
            | "BITXOR"
            | "BYCOL"
            | "BYROW"
            | "CEILING"
            | "CEILING.MATH"
            | "CEILING.PRECISE"
            | "CELL"
            | "CHAR"
            | "CHIDIST"
            | "CHIINV"
            | "CHISQ.DIST"
            | "CHISQ.DIST.RT"
            | "CHISQ.INV"
            | "CHISQ.INV.RT"
            | "CHISQ.TEST"
            | "CHITEST"
            | "CHOOSE"
            | "CHOOSECOLS"
            | "CHOOSEROWS"
            | "CLEAN"
            | "CODE"
            | "COLUMN"
            | "COLUMNS"
            | "COMBIN"
            | "COMBINA"
            | "COMPLEX"
            | "CONCAT"
            | "CONCATENATE"
            | "CONFIDENCE"
            | "CONFIDENCE.NORM"
            | "CONFIDENCE.T"
            | "CONVERT"
            | "CORREL"
            | "COS"
            | "COSH"
            | "COT"
            | "COTH"
            | "COUNT"
            | "COUNTA"
            | "COUNTBLANK"
            | "COUNTIF"
            | "COUNTIFS"
            | "COUPDAYBS"
            | "COUPDAYS"
            | "COUPDAYSNC"
            | "COUPNCD"
            | "COUPNUM"
            | "COUPPCD"
            | "COVAR"
            | "COVAR.P"
            | "COVAR.S"
            | "COVARIANCE.P"
            | "COVARIANCE.S"
            | "CRITBINOM"
            | "CSC"
            | "CSCH"
            | "CUMIPMT"
            | "CUMPRINC"
            | "DATE"
            | "DATEDIF"
            | "DATEVALUE"
            | "DAVERAGE"
            | "DAY"
            | "DAYS"
            | "DAYS360"
            | "DB"
            | "DBCS"
            | "DCOUNT"
            | "DCOUNTA"
            | "DDB"
            | "DEC2BIN"
            | "DEC2HEX"
            | "DEC2OCT"
            | "DECIMAL"
            | "DEGREES"
            | "DELTA"
            | "DEVSQ"
            | "DGET"
            | "DISC"
            | "DMAX"
            | "DMIN"
            | "DOLLAR"
            | "DOLLARDE"
            | "DOLLARFR"
            | "DPRODUCT"
            | "DROP"
            | "DSTDEV"
            | "DSTDEVP"
            | "DSUM"
            | "DURATION"
            | "DVAR"
            | "DVARP"
            | "EDATE"
            | "EFFECT"
            | "ENCODEURL"
            | "EOMONTH"
            | "ERF"
            | "ERF.PRECISE"
            | "ERFC"
            | "ERFC.PRECISE"
            | "ERROR.TYPE"
            | "EVEN"
            | "EXACT"
            | "EXP"
            | "EXPAND"
            | "EXPON.DIST"
            | "EXPONDIST"
            | "F.DIST"
            | "F.DIST.RT"
            | "F.INV"
            | "F.INV.RT"
            | "F.TEST"
            | "FACT"
            | "FACTDOUBLE"
            | "FALSE"
            | "FDIST"
            | "FILTER"
            | "FIND"
            | "FINDB"
            | "FINV"
            | "FISHER"
            | "FISHERINV"
            | "FIXED"
            | "FLOOR"
            | "FLOOR.MATH"
            | "FLOOR.PRECISE"
            | "FORECAST"
            | "FORECAST.LINEAR"
            | "FORMULATEXT"
            | "FTEST"
            | "FREQUENCY"
            | "FV"
            | "FVSCHEDULE"
            | "GAMMA"
            | "GAMMA.DIST"
            | "GAMMA.INV"
            | "GAMMADIST"
            | "GAMMAINV"
            | "GAMMALN"
            | "GAMMALN.PRECISE"
            | "GAUSS"
            | "GCD"
            | "GEOMEAN"
            | "GESTEP"
            | "GROWTH"
            | "HARMEAN"
            | "HEX2BIN"
            | "HEX2DEC"
            | "HEX2OCT"
            | "HLOOKUP"
            | "HOUR"
            | "HSTACK"
            | "HYPERLINK"
            | "HYPGEOM.DIST"
            | "HYPGEOMDIST"
            | "IF"
            | "IFERROR"
            | "IFNA"
            | "IFS"
            | "IMABS"
            | "IMAGE"
            | "IMAGINARY"
            | "IMARGUMENT"
            | "IMCONJUGATE"
            | "IMCOS"
            | "IMCOSH"
            | "IMCOT"
            | "IMCSC"
            | "IMCSCH"
            | "IMDIV"
            | "IMEXP"
            | "IMLN"
            | "IMLOG10"
            | "IMLOG2"
            | "IMPOWER"
            | "IMPRODUCT"
            | "IMREAL"
            | "IMSEC"
            | "IMSECH"
            | "IMSIN"
            | "IMSINH"
            | "IMSQRT"
            | "IMSUB"
            | "IMSUM"
            | "IMTAN"
            | "INDEX"
            | "INDIRECT"
            | "INFO"
            | "INT"
            | "INTERCEPT"
            | "INTRATE"
            | "IPMT"
            | "IRR"
            | "ISBLANK"
            | "ISERR"
            | "ISERROR"
            | "ISEVEN"
            | "ISFORMULA"
            | "ISLOGICAL"
            | "ISNA"
            | "ISNONTEXT"
            | "ISNUMBER"
            | "ISO.CEILING"
            | "ISODD"
            | "ISOMITTED"
            | "ISOWEEKNUM"
            | "ISPMT"
            | "ISREF"
            | "ISTEXT"
            | "JIS"
            | "KURT"
            | "LAMBDA"
            | "LARGE"
            | "LCM"
            | "LEFT"
            | "LEFTB"
            | "LEN"
            | "LENB"
            | "LET"
            | "LINEST"
            | "LN"
            | "LOG"
            | "LOG10"
            | "LOGINV"
            | "LOGNORM.DIST"
            | "LOGNORM.INV"
            | "LOGNORMDIST"
            | "LOGEST"
            | "LOOKUP"
            | "LOWER"
            | "MAKEARRAY"
            | "MAP"
            | "MATCH"
            | "MAX"
            | "MAXA"
            | "MAXIFS"
            | "MDETERM"
            | "MDURATION"
            | "MEDIAN"
            | "MID"
            | "MIDB"
            | "MIN"
            | "MINA"
            | "MINIFS"
            | "MINUTE"
            | "MINVERSE"
            | "MIRR"
            | "MMULT"
            | "MOD"
            | "MODE"
            | "MODE.MULT"
            | "MODE.SNGL"
            | "MONTH"
            | "MROUND"
            | "MULTINOMIAL"
            | "MUNIT"
            | "N"
            | "NA"
            | "NEGBINOM.DIST"
            | "NEGBINOMDIST"
            | "NETWORKDAYS"
            | "NETWORKDAYS.INTL"
            | "NOMINAL"
            | "NORM.DIST"
            | "NORM.INV"
            | "NORM.S.DIST"
            | "NORM.S.INV"
            | "NORMDIST"
            | "NORMINV"
            | "NORMSDIST"
            | "NORMSINV"
            | "NOT"
            | "NOW"
            | "NPER"
            | "NPV"
            | "NUMBERVALUE"
            | "OCT2BIN"
            | "OCT2DEC"
            | "OCT2HEX"
            | "ODD"
            | "ODDFPRICE"
            | "ODDFYIELD"
            | "ODDLPRICE"
            | "ODDLYIELD"
            | "OFFSET"
            | "OR"
            | "PDURATION"
            | "PEARSON"
            | "PERCENTILE"
            | "PERCENTILE.EXC"
            | "PERCENTILE.INC"
            | "PERCENTRANK"
            | "PERCENTRANK.EXC"
            | "PERCENTRANK.INC"
            | "PERMUT"
            | "PERMUTATIONA"
            | "PHI"
            | "PHONETIC"
            | "PI"
            | "PMT"
            | "POISSON"
            | "POISSON.DIST"
            | "POWER"
            | "PPMT"
            | "PRICE"
            | "PRICEDISC"
            | "PRICEMAT"
            | "PROB"
            | "PRODUCT"
            | "PROPER"
            | "PV"
            | "QUARTILE"
            | "QUARTILE.EXC"
            | "QUARTILE.INC"
            | "QUOTIENT"
            | "RADIANS"
            | "RAND"
            | "RANDARRAY"
            | "RANDBETWEEN"
            | "RANK"
            | "RANK.AVG"
            | "RANK.EQ"
            | "RANKAVG"
            | "RANKEQ"
            | "RATE"
            | "RECEIVED"
            | "REDUCE"
            // REGEX* 受 `regex-formulas` feature 门控，lite 构建下这三个内建并不
            // 存在 —— 但保留名清单**刻意不跟着门控**。理由是跨构建一致性优先：
            // 不保留的话，同一份工作簿在 lite 下跑用户注册的 REGEXTEST、在 full
            // 下被内建静默遮蔽，两种构建算出不同的值，而用户没有任何提示。
            // 代价是 lite 用户不能用 JS 自定义公式 polyfill REGEX*（owner 已权衡：
            // 「想用 REGEX* 就换 full」是一句能说清的话，「你的工作簿在别人机器上
            // 算出别的数」不是）。见 excel/rust/wasm/README.md § 两份产物。
            | "REGEXEXTRACT"
            | "REGEXREPLACE"
            | "REGEXTEST"
            | "REPLACE"
            | "REPLACEB"
            | "REPT"
            | "RIGHT"
            | "RIGHTB"
            | "ROMAN"
            | "ROUND"
            | "ROUNDDOWN"
            | "ROUNDUP"
            | "ROW"
            | "ROWS"
            | "RRI"
            | "RSQ"
            | "SCAN"
            | "SEARCH"
            | "SEARCHB"
            | "SEC"
            | "SECH"
            | "SECOND"
            | "SEQUENCE"
            | "SERIESSUM"
            | "SHEET"
            | "SHEETS"
            | "SIGN"
            | "SIN"
            | "SINH"
            | "SKEW"
            | "SKEW.P"
            | "SLN"
            | "SLOPE"
            | "SMALL"
            | "SORT"
            | "SORTBY"
            | "SQRT"
            | "SQRTPI"
            | "STANDARDIZE"
            | "STDEV"
            | "STDEV.P"
            | "STDEV.S"
            | "STEYX"
            | "STDEVA"
            | "STDEVP"
            | "STDEVPA"
            | "SUBSTITUTE"
            | "SUBTOTAL"
            | "SUM"
            | "SUMIF"
            | "SUMIFS"
            | "SUMPRODUCT"
            | "SUMSQ"
            | "SUMX2MY2"
            | "SUMX2PY2"
            | "SUMXMY2"
            | "SWITCH"
            | "SYD"
            | "T"
            | "T.DIST"
            | "T.DIST.2T"
            | "T.DIST.RT"
            | "T.INV"
            | "T.INV.2T"
            | "T.TEST"
            | "TAKE"
            | "TAN"
            | "TANH"
            | "TBILLEQ"
            | "TBILLPRICE"
            | "TBILLYIELD"
            | "TDIST"
            | "TEXT"
            | "TEXTAFTER"
            | "TEXTBEFORE"
            | "TEXTJOIN"
            | "TEXTSPLIT"
            | "TIME"
            | "TIMEVALUE"
            | "TINV"
            | "TOCOL"
            | "TODAY"
            | "TOROW"
            | "TRANSLATE"
            | "TRANSPOSE"
            | "TREND"
            | "TRIM"
            | "TRIMMEAN"
            | "TRUE"
            | "TRUNC"
            | "TTEST"
            | "TYPE"
            | "UNICHAR"
            | "UNICODE"
            | "UNIQUE"
            | "UPPER"
            | "VALUE"
            | "VALUETOTEXT"
            | "VAR"
            | "VAR.P"
            | "VAR.S"
            | "VARA"
            | "VARP"
            | "VARPA"
            | "VDB"
            | "VLOOKUP"
            | "VSTACK"
            | "WEEKDAY"
            | "WEEKNUM"
            | "WEIBULL"
            | "WEIBULL.DIST"
            | "WORKDAY"
            | "WORKDAY.INTL"
            | "WRAPCOLS"
            | "WRAPROWS"
            | "XIRR"
            | "XLOOKUP"
            | "XMATCH"
            | "XNPV"
            | "XOR"
            | "YEAR"
            | "YEARFRAC"
            | "YIELD"
            | "YIELDDISC"
            | "YIELDMAT"
            | "Z.TEST"
            | "ZTEST"
    )
}

/// Walk the active LET frame stack from innermost to outermost. Returns
/// the first binding for `name`, or `None` if unbound.
fn lookup_let_binding(name: &str) -> Option<Value> {
    LET_FRAMES.with(|frames| {
        let frames = frames.borrow();
        for frame in frames.iter().rev() {
            if let Some(v) = frame.bindings.get(name) {
                return Some(v.clone());
            }
        }
        None
    })
}

/// Snapshot every binding visible at the call site into a flat
/// `Vec<(String, Value)>`. Used by `LAMBDA` to capture the active LET
/// scope at the point the lambda literal is evaluated — the lambda
/// outlives its enclosing LET and must keep those bindings alive in
/// its own state rather than relying on a reference to the live stack
/// (which is empty by the time the lambda is later applied).
///
/// Inner frames shadow outer ones (innermost-first walk), and we
/// dedupe on first occurrence so the snapshot mirrors `lookup_let_binding`
/// semantics exactly. Order is irrelevant to the consumer (`apply_lambda`
/// builds a HashMap-backed frame from the result) but we keep
/// innermost-first for readability when debugging.
fn snapshot_let_frames() -> Vec<(String, Value)> {
    LET_FRAMES.with(|frames| {
        let frames = frames.borrow();
        let mut out: Vec<(String, Value)> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        for frame in frames.iter().rev() {
            for (k, v) in &frame.bindings {
                if seen.insert(k.clone()) {
                    out.push((k.clone(), v.clone()));
                }
            }
        }
        out
    })
}

/// Push a fresh frame onto the LET stack and seed it with the provided
/// bindings. Used by `apply_lambda` to extend the scope chain with the
/// lambda's captured snapshot + parameter bindings before evaluating the
/// body. `pop_let_frame` MUST be called after — the public API leaks
/// the imbalance otherwise; callers use a guard to enforce that.
fn push_let_frame(initial: Vec<(String, Value)>) {
    LET_FRAMES.with(|frames| {
        let mut frame = LetFrame::new();
        for (k, v) in initial {
            frame.bind(k, v);
        }
        frames.borrow_mut().push(frame);
    });
}

fn pop_let_frame() {
    LET_FRAMES.with(|frames| {
        frames.borrow_mut().pop();
    });
}

/// Concrete lambda payload used by the formula evaluator. The `params`
/// vec stores parameter names (in declaration order); `body` is the AST
/// the LAMBDA literal wraps; `captured` is the snapshot of LET bindings
/// visible when the lambda literal was evaluated. Owned by an `Arc` at
/// the `Value::Lambda` boundary so clones are cheap (lambdas pass
/// through array higher-order functions and get cloned per call).
#[derive(Debug)]
pub(crate) struct ExcelLambda {
    pub params: Vec<String>,
    pub body: Expr,
    pub captured: Vec<(String, Value)>,
}

impl LambdaValue for ExcelLambda {
    fn arity(&self) -> usize {
        self.params.len()
    }
    fn param_names(&self) -> &[String] {
        &self.params
    }
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

/// Apply a lambda value to a positional argument list. Returns
/// `WrongType` if the value isn't a lambda (or a downcast fails), and
/// `WrongArgCount` on arity mismatch. The body is evaluated against a
/// fresh LET frame seeded with the lambda's captured bindings PLUS the
/// new parameter bindings (parameters shadow same-named captured
/// bindings).
///
/// Errors from the body propagate out as-is. The frame is popped via a
/// guard so the LET stack stays balanced even when the body
/// short-circuits.
pub(crate) fn apply_lambda(lambda: &Value, args: Vec<Value>, provider: &dyn EvalProvider) -> Value {
    let arc = match lambda {
        Value::Lambda(a) => a.clone(),
        Value::Error(e) => return Value::Error(e.clone()),
        _ => return Value::Error(ValueError::WrongType),
    };
    let excel_lambda = match arc.as_any().downcast_ref::<ExcelLambda>() {
        Some(l) => l,
        None => return Value::Error(ValueError::WrongType),
    };
    if args.len() != excel_lambda.params.len() {
        return Value::Error(ValueError::WrongArgCount);
    }
    // Build the activation frame: start with the captured snapshot, then
    // overwrite/append each parameter binding. Parameters with the same
    // name as a captured binding shadow it (Excel parity — `LAMBDA(x,
    // ...)` body sees the new `x`, not the outer LET's `x`).
    let mut frame_bindings: Vec<(String, Value)> = excel_lambda.captured.clone();
    for (name, value) in excel_lambda.params.iter().zip(args) {
        if let Some(slot) = frame_bindings.iter_mut().find(|(n, _)| n == name) {
            slot.1 = value;
        } else {
            frame_bindings.push((name.clone(), value));
        }
    }
    // Wrap body eval in the named-call depth guard. Each lambda
    // application — whether triggered by `Expr::Call`, `eval_named_call`,
    // or one of the higher-order callers (MAP / REDUCE / SCAN / BYROW /
    // BYCOL / MAKEARRAY) — bumps the depth by one and restores it on
    // return. The cap (`MAX_NAMED_CALL_DEPTH`) only bites when bodies
    // recursively call back into `apply_lambda`; the sequential per-element
    // dispatch inside MAP/REDUCE oscillates depth between N and N+1, so
    // legitimate array work isn't blocked. Recursion overflow surfaces as
    // `#NUM!` (Excel parity for stack-busting recursion).
    let depth = NAMED_CALL_DEPTH.with(|c| c.get());
    if depth >= MAX_NAMED_CALL_DEPTH {
        return Value::Error(ValueError::Overflow);
    }
    NAMED_CALL_DEPTH.with(|c| c.set(depth + 1));
    push_let_frame(frame_bindings);
    // Save/restore-style guard equivalent: any early-return from the
    // body still has the pop executed because we route everything
    // through the closure below.
    let result = eval_expr_with_provider(&excel_lambda.body, provider);
    pop_let_frame();
    NAMED_CALL_DEPTH.with(|c| c.set(depth));
    result
}

fn apply_lambda_for_array_cell(
    lambda: &Value,
    args: Vec<Value>,
    provider: &dyn EvalProvider,
) -> Result<Value, ValueError> {
    let value = apply_lambda(lambda, args, provider);
    match value {
        Value::Array(_) | Value::Lambda(_) => Err(ValueError::Calc),
        other => Ok(other),
    }
}

/// Host-side custom-formula registry. Lives behind an `Arc<dyn ...>` on
/// the `Workbook` so the formula engine can call out to JS-supplied
/// functions (or any other host code) without `einfach-excel-core` ever
/// learning what `js_sys::Function` is. The wasm crate ships the canonical
/// implementation (`WasmCustomFormulaRegistry`); native tests can supply
/// their own.
///
/// Contract:
///   - `lookup(name, args)` returns `Some(Value)` when a function is
///     registered under `name` (case-insensitive lookup is the host's
///     responsibility — both the wasm registry and the in-file unit-test
///     stubs upper-case keys at insertion AND query). Returns `None` to
///     mean "no function with this name; fall through to `#NAME?`".
///   - Args are already evaluated `Value`s. Per the precedence rule in
///     `eval_named_call`, an error in any arg short-circuits before the
///     registry is consulted, so a host implementation will never see
///     `Value::Error(_)` in `args`.
///   - The host is responsible for catching any panics / exceptions
///     thrown by the underlying callback and turning them into a
///     `Value::Error(_)`. The engine treats `Some(Value::Error(_))` as a
///     successfully-dispatched-but-failed call (the cell shows the error)
///     and does NOT then try the unknown-function fallback.
///
/// `Send + Sync` so a future multi-threaded workbook can keep the
/// registry on the workbook without re-architecting. The single-threaded
/// wasm impl wraps `js_sys::Function` in `SendWrapper` (or equivalent) to
/// satisfy this bound.
pub trait CustomFunctionRegistry: Send + Sync + std::fmt::Debug {
    fn lookup(&self, name: &str, args: &[Value]) -> Option<Value>;

    /// True when `name` is registered as an ASYNC custom formula. Async
    /// functions are never dispatched through `lookup` during evaluation —
    /// the engine memoizes per (name, args) call: a cache miss enqueues a
    /// `PendingAsyncCustomCall` and the cell holds `#BUSY!` until the host
    /// drains the queue, runs the callback on its own event loop, and
    /// writes the result back via `Workbook::resolve_async_custom_call`.
    /// Names default to sync so existing registries are source-compatible.
    fn is_async(&self, _name: &str) -> bool {
        false
    }
}

/// Address-based evaluation source. Both production (Workbook) and the
/// legacy `eval_expr(get, cell_map)` shim route through this trait.
///
/// `Sheet`/`Workbook` use their own implementations (`SheetEvalProvider`,
/// `WorkbookEvalProvider`) to handle cross-sheet refs without ever
/// touching a thread-local. The legacy `AtomEvalProvider` below treats
/// any `SheetRef` as `#REF!` — it's a single-sheet shim used only by the
/// in-file eval tests + `eval_expr` callers that don't carry workbook
/// context.
/// A Table resolved from the workbook registry for a structured reference
/// (design doc #32 §5.3). Carries the full occupied rectangle (header +
/// data + optional totals) plus the metadata the area/column band math
/// needs; the resolver (`resolve_table_ref`) turns this into a concrete
/// runtime range that flows through the same machinery as a typed
/// `A1:A10` / `Sheet2!A1:A10`.
#[derive(Clone, Debug)]
pub struct ResolvedTable {
    /// Name of the sheet the Table is anchored to.
    pub sheet_name: String,
    /// 0-based index of that sheet (used to decide same-sheet vs
    /// cross-sheet resolution).
    pub sheet_index: usize,
    /// Normalized rectangle covering header + data (+ totals when shown).
    pub range: CellRange,
    /// Whether the first row of `range` is a header row (MVP: always true).
    pub has_headers: bool,
    /// Whether the last row of `range` is a totals row.
    pub has_totals: bool,
    /// Column display names left→right; index 0 maps to `range.start.col`.
    pub columns: Vec<String>,
}

pub trait EvalProvider {
    fn cell(&self, addr: CellAddress) -> Value;
    fn sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value;

    /// Read a cell without implicit-intersection collapse of dynamic-array
    /// anchors. Most evaluators want `cell()`; spill references (`A1#`) need
    /// the raw anchor array shape.
    fn raw_cell(&self, addr: CellAddress) -> Value {
        self.cell(addr)
    }

    /// Cross-sheet raw-cell variant for spill references such as `Data!A1#`.
    fn raw_sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value {
        self.sheet_cell(sheet, addr)
    }

    /// Iterate every cell address in `range`, yielding `(addr, value)` to
    /// the closure. Used by `SUM` / `COUNT` / `AVERAGE` / `MIN` / `MAX` /
    /// `COUNTIF` / `SUMIF` for O(1)-memory streaming, and by the stateful
    /// aggregates (`MEDIAN`, `MODE`, `STDEV`, `VAR`, `LARGE`, `SMALL`,
    /// `VLOOKUP`, `HLOOKUP`, `INDEX`, `MATCH`) so they can build their
    /// local temp `Vec` without creating cell atoms.
    ///
    /// "Streaming" here means **no cell atom materialization**, not "O(1)
    /// memory" — the trait contract permits the callee body to keep a
    /// `Vec` if its algorithm demands one. Providers that know which
    /// addresses are sparse (e.g. `SheetEvalProvider` reads only
    /// `cells ∪ formula_cells`) should override this method so
    /// `SUM(A:A)` walks the dozen real cells instead of the column's
    /// nominal extent.
    ///
    /// The default impl iterates the rectangle densely via `range.iter()`
    /// and calls `self.cell(addr)` per cell — fine for small ranges and
    /// for shim providers that don't have sparse-index data.
    fn for_each_range_cell(&self, range: CellRange, f: &mut dyn FnMut(CellAddress, Value)) {
        for addr in range.iter() {
            let v = self.cell(addr);
            f(addr, v);
        }
    }

    /// Iterate a range on another sheet. Workbook providers override this
    /// with sparse sheet-aware traversal; single-sheet shims surface #REF!
    /// without walking the nominal rectangle.
    fn for_each_sheet_range_cell(
        &self,
        _sheet: &str,
        range: CellRange,
        f: &mut dyn FnMut(CellAddress, Value),
    ) {
        f(
            range.normalize().start,
            Value::Error(ValueError::InvalidRef),
        );
    }

    /// The cell currently being evaluated, if known. Used by `ROW()` /
    /// `COLUMN()` (no-arg) to return the formula's own row/column. Providers
    /// that don't track this (e.g. the legacy single-sheet shim) return None.
    fn current_cell(&self) -> Option<CellAddress> {
        None
    }

    /// Set the current cell being evaluated. Providers that surface
    /// `current_cell()` use this to push/pop the address as the evaluator
    /// recurses into nested formula cells. Default impl is a no-op so
    /// providers without a current-cell concept ignore the call.
    fn set_current_cell(&self, _addr: Option<CellAddress>) {}

    /// Explicit width in physical pixels of column `col` (0-based), or `None`
    /// when the column has no explicit width (the UI default). Consulted by
    /// `CELL("width")`, which converts pixels to Excel character units.
    ///
    /// Default `None`: providers without sheet-dimension access (the legacy
    /// single-sheet shim, the wasm-side and test shims) report "no explicit
    /// width", so `CELL("width")` falls back to Excel's default column width
    /// (8 characters). Sheet-backed providers (`SheetEvalProvider`,
    /// `AtomFormulaProvider`, `WorkbookEvalProvider`) override to read the
    /// per-column width map.
    fn col_width(&self, _col: u32) -> Option<u32> {
        None
    }

    /// Workbook-scope defined-name lookup. Returns a clone of the value
    /// registered under `name` (case-insensitive), or `None` if the
    /// workbook has no entry for that name.
    ///
    /// Default impl returns `None`: the legacy single-sheet shim
    /// (`AtomEvalProvider`) and any provider without a workbook context
    /// has no named registry, so an unbound `Expr::Name` still surfaces
    /// `#NAME?` exactly as before. Workbook-backed providers
    /// (`WorkbookEvalProvider`, the tracking wrapper) override to
    /// consult the workbook's `named_values` map.
    ///
    /// Consulted by `Expr::Name` (after LET-frame lookup) and by
    /// `Expr::FuncCall` dispatch (before the InvalidName fallback) so a
    /// registered `LAMBDA` value can be invoked with the function-call
    /// syntax `=SQUARE(5)`. LET bindings win over workbook names per
    /// Excel parity — `=LET(answer, 1, answer*2)` returns 2 even when
    /// `answer` is registered as 42.
    fn lookup_named(&self, _name: &str) -> Option<Value> {
        None
    }

    /// Does the cell at `addr` contain a formula? Default `false`.
    fn cell_has_formula(&self, _addr: CellAddress) -> bool {
        false
    }

    /// Does the cell at `(sheet, addr)` contain a formula? Providers without
    /// workbook context cannot resolve a sheet name, so the default is false.
    fn sheet_cell_has_formula(&self, _sheet: &str, addr: CellAddress) -> bool {
        let _ = addr;
        false
    }

    /// 0-based index of the sheet that owns the currently-active eval
    /// frame (in workbook context). Default `None`.
    fn current_sheet_index(&self) -> Option<usize> {
        None
    }

    /// Look up a sheet by name and return its 0-based index. Default `None`.
    fn sheet_index_of(&self, _name: &str) -> Option<usize> {
        None
    }

    /// Total sheets in the host workbook. Default `1`.
    fn sheet_count(&self) -> usize {
        1
    }

    /// Source formula text at `addr`, if any (for `FORMULATEXT(ref)`).
    /// Returns the literal formula source as the user typed it (leading
    /// `=` included), or `None` when the cell holds a primitive value
    /// (in which case the FORMULATEXT arm surfaces `#N/A`).
    ///
    /// Default returns `None` so legacy / sheet-less providers
    /// (`AtomEvalProvider`) consistently report "no formula" — they have
    /// no formula registry to consult. `SheetEvalProvider` (sheet.rs)
    /// and `WorkbookEvalProvider` (workbook.rs) override to look up the
    /// stored source in their `formula_texts` map.
    fn cell_formula_text(&self, _addr: CellAddress) -> Option<String> {
        None
    }

    /// Cross-sheet variant of `cell_formula_text`. Providers without workbook
    /// context cannot resolve a sheet name, so the default reports no formula
    /// instead of accidentally reading the same address on the current sheet.
    fn sheet_cell_formula_text(&self, _sheet: &str, addr: CellAddress) -> Option<String> {
        let _ = addr;
        None
    }

    // Custom function dispatch hook — see `CustomFunctionRegistry` below
    // for the host-side contract.

    /// Called when `eval_func` encounters a function name that is NOT a
    /// built-in and NOT registered as a workbook-level defined name
    /// (`Value::Lambda`). Lets a host plug in user-defined formulas —
    /// in the wasm bridge this delegates to a `js_sys::Function` registry
    /// keyed by upper-cased name (see `CUSTOM_FORMULAS.md`).
    ///
    /// Arguments are evaluated EAGERLY in left-to-right order before this
    /// method runs (no lazy semantics — custom functions can't introduce
    /// LET-style scoping). If any argument evaluates to `Value::Error`,
    /// `eval_named_call` propagates that error and `call_custom` is NOT
    /// invoked, matching the propagation behaviour of `apply_lambda`.
    ///
    /// Return contract:
    ///   - `None` → no custom function registered under `name`;
    ///     `eval_named_call` then surfaces `#NAME?` exactly as before.
    ///   - `Some(Value)` → the custom function ran. `Value::Error(_)` is
    ///     a valid result (the host's choice — e.g. a JS callback that
    ///     threw is typically wrapped as `Value::Error(InvalidValue)`).
    ///
    /// Default `None` so existing providers (`AtomEvalProvider`,
    /// `SheetEvalProvider`, the sparse / cumulative noop providers in
    /// this file) keep their current behaviour without code changes.
    fn call_custom(&self, _name: &str, _args: &[Value]) -> Option<Value> {
        None
    }

    /// Resolve a structured-reference Table (design doc #32 §5.3). `name`
    /// is `Some` for `Table1[...]` and `None` for a table-less `[Col]` /
    /// `[@Col]`, where the provider returns the Table that CONTAINS the
    /// current cell. Returns `None` when no such Table exists — the
    /// structured-reference resolver then surfaces `#NAME?` (named form) or
    /// `#VALUE!` (table-less form).
    ///
    /// Default `None`: providers without a workbook Table registry (the
    /// single-sheet shim, standalone sheets) never resolve structured
    /// references, so `=Table1[Col]` degrades to `#NAME?` exactly as an
    /// unbound name would.
    ///
    /// T2 seam: this reads the registry only. The reactive re-derive on a
    /// Table geometry/name change (the `tables_epoch` tracked read) lands
    /// in T3 — cell-CONTENT edges already register through the facade reads
    /// the resolved range performs, so ordinary recalculation is unaffected.
    fn lookup_table(&self, _name: Option<&str>) -> Option<ResolvedTable> {
        None
    }

    /// Host-pushed per-sheet hidden-row set consumed by SUBTOTAL 101-111
    /// (design doc #32 §6, CANONICAL_OWNERSHIP §7-1). `sheet_index` is the
    /// sheet OWNING the aggregated cells — cross-sheet refs pass the
    /// *referenced* sheet's index so each argument excludes its own sheet's
    /// hidden rows. Returns `None` when the host pushed no hidden rows for
    /// that sheet (or `sheet_index` is `None`). The engine never models
    /// hidden state or infers its source (manual vs filter); this is pure
    /// read-only evaluation input.
    ///
    /// Workbook-backed live providers do a *tracked* read of the
    /// `hidden_epoch` atom inside this method, so a `set_eval_hidden_rows`
    /// push precisely re-derives the 101-111 formulas that consumed it.
    /// Function numbers 1-11 never call this, hold no such edge, and are
    /// therefore left undisturbed by a hidden-set change.
    fn hidden_rows(&self, _sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        None
    }

    /// Host-pushed per-sheet FILTER-hidden row set
    /// (`design-filter-hidden-rows` §6.2). Same shape and per-argument
    /// sheet-resolution contract as `hidden_rows`, but a SEPARATE source: Excel
    /// excludes filter-hidden rows from BOTH SUBTOTAL layers (1-11 and
    /// 101-111), while manually hidden rows are excluded only by 101-111. A
    /// merged set could not express that rule, so the engine keeps two
    /// independent read-only inputs and still models no hidden state of its
    /// own.
    ///
    /// Workbook-backed live providers do a *tracked* read of the
    /// `filter_hidden_epoch` atom (distinct from the manual one) inside this
    /// method, so a `set_eval_filter_hidden_rows` push re-derives both layers
    /// while a manual push leaves the 1-11 formulas alone.
    fn filter_hidden_rows(&self, _sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        None
    }

    // ===== EVAL_PROVIDER TRAIT METHODS: ADD NEW METHODS BEFORE THIS LINE =====
    // Sentinel for parallel-agent merges — when a new feature needs a new
    // EvalProvider hook, add it BEFORE this marker (with a sensible default)
    // and update the provider impls in sheet.rs / workbook.rs separately.
}

struct AtomEvalProvider<'a> {
    get: &'a dyn Fn(AtomId) -> Value,
    cell_map: &'a HashMap<CellAddress, AtomId>,
}

impl<'a> EvalProvider for AtomEvalProvider<'a> {
    fn cell(&self, addr: CellAddress) -> Value {
        self.cell_map
            .get(&addr)
            .map(|&id| (self.get)(id))
            .unwrap_or(Value::Null)
    }

    fn sheet_cell(&self, _sheet: &str, _addr: CellAddress) -> Value {
        // Legacy shim has no workbook context — cross-sheet refs are
        // out of scope. Production cross-sheet eval lives on
        // `WorkbookEvalProvider`.
        Value::Error(ValueError::InvalidRef)
    }
}

/// Evaluate an AST expression using a getter function for cell values.
/// `cell_map` maps CellAddress to AtomId so the evaluator can look up cells.
pub fn eval_expr(
    expr: &Expr,
    get: &dyn Fn(AtomId) -> Value,
    cell_map: &HashMap<CellAddress, AtomId>,
) -> Value {
    let provider = AtomEvalProvider { get, cell_map };
    eval_expr_with_provider(expr, &provider)
}

pub fn eval_expr_with_provider(expr: &Expr, provider: &dyn EvalProvider) -> Value {
    match expr {
        Expr::Number(n) => Value::Number(*n),
        Expr::Text(s) => Value::Text(s.clone()),
        Expr::Bool(b) => Value::Boolean(*b),
        Expr::Error(e) => Value::Error(e.clone()),

        Expr::CellRef(addr, _) => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            provider.cell(*addr)
        }

        Expr::BinOp { op, left, right } => {
            // Implicit arithmetic broadcast: when either operand is a
            // multi-cell range or evaluates to a `Value::Array`, we lift
            // the binop over the array shapes (Excel parity). A single-
            // cell range collapses to a scalar before the broadcast check
            // so `=A1+1` still takes the scalar path even with a `A1:A1`
            // synonym.
            let lv = eval_operand_for_binop(left, provider);
            let rv = eval_operand_for_binop(right, provider);
            if is_array_like(&lv) || is_array_like(&rv) {
                broadcast_binop(*op, lv, rv)
            } else {
                eval_binop(*op, &lv, &rv)
            }
        }

        Expr::Negate(inner) => {
            let v = eval_expr_with_provider(inner, provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            // 一元负号走的是和二元算术运算符**同一套**强制转换，所以
            // `=-"5"` 是 `-5`、`=-TRUE` 是 `-1`、`=-A1`（A1 空）是 `0`。
            match coerce_to_number_arith(&v) {
                Some(n) => Value::Number(-n),
                // Same Excel rule as the binary arithmetic operators: a
                // failed numeric coercion under an arithmetic operator is
                // `#VALUE!`, never `#TYPE!` (a code Excel does not have).
                // `=-"abc"` 仍然落在这里。
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        Expr::Percent(inner) => {
            // 后缀 `%`：`=50%` → 0.5。与一元负号共用强制转换，所以
            // `="50"%` 是 0.5 而 `="abc"%` 是 `#VALUE!`。
            let v = eval_expr_with_provider(inner, provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number_arith(&v) {
                Some(n) => Value::Number(n / 100.0),
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        Expr::FuncCall { name, args } => eval_func(name, args, provider),

        Expr::Range { start, end, .. } | Expr::SheetRange { start, end, .. } => {
            // Ranges should be handled by function evaluators, not standalone
            // If we get here, collect all values into... just return an error
            let _ = (start, end);
            Value::Error(ValueError::InvalidValue)
        }

        Expr::SpillRef(_) | Expr::DynamicRange { .. } | Expr::TableRef { .. } => {
            // A structured reference in value context materializes its
            // resolved region as a `Value::Array` (spilling like `A1#` /
            // `A1:INDEX(...)`), or collapses to the scalar for a 1×1 region
            // (design doc §5.3 value-context arm).
            match runtime_ref_from_expr(expr, provider) {
                Ok(r) => runtime_ref_to_value(&r, provider),
                Err(e) => Value::Error(e),
            }
        }

        Expr::SheetRef { sheet, addr, .. } => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            // Formula-inner evaluation owns the workbook-scoped runtime cycle
            // guard, so recursing into an on-stack cell surfaces CyclicRef.
            provider.sheet_cell(sheet, *addr)
        }

        Expr::Name(name) => {
            // Resolution order (Excel parity):
            //   1. Active LET scope chain. Innermost LET shadows outer
            //      bindings, which in turn shadow workbook names so
            //      `=LET(answer, 1, answer)` returns 1 even when the
            //      workbook has a defined name `answer = 42`.
            //   2. Workbook defined-name registry (consulted via the
            //      provider, which returns None for non-workbook
            //      contexts).
            //   3. Otherwise `#NAME?`.
            if let Some(v) = lookup_let_binding(name) {
                return v;
            }
            if let Some(v) = provider.lookup_named(name) {
                return v;
            }
            Value::Error(ValueError::InvalidName)
        }

        Expr::Call(callee, call_args) => {
            // Immediate-application form: evaluate the callee, then apply
            // the resulting lambda to the evaluated arguments. The L2
            // entry point — `=LAMBDA(x, x*x)(5)` lands here. Argument
            // evaluation happens *outside* the lambda body so it sees the
            // CALLER's LET scope, not the lambda's captured frame
            // (matches Excel call semantics).
            let callee_value = eval_expr_with_provider(callee, provider);
            if let Value::Error(e) = &callee_value {
                return Value::Error(e.clone());
            }
            let mut arg_values: Vec<Value> = Vec::with_capacity(call_args.len());
            for a in call_args {
                let v = eval_expr_with_provider(a, provider);
                if let Value::Error(e) = &v {
                    return Value::Error(e.clone());
                }
                arg_values.push(v);
            }
            apply_lambda(&callee_value, arg_values, provider)
        }

        Expr::ArrayLit { rows, cols, data } => {
            // Excel constant-array literal: evaluate every element
            // (each is a Number / Text / Bool / Error / Negate(Number) per
            // the parser's invariant) and pack the row-major `Vec<Value>`
            // into a `Value::Array`. Error literals stay as error cells in
            // the array instead of collapsing the whole literal.
            //
            // No provider reads are needed (no cell refs inside), and
            // the resulting Array flows into the existing spill /
            // for_each_arg_value paths exactly like a SEQUENCE result
            // would.
            let mut values: Vec<Value> = Vec::with_capacity(data.len());
            for e in data {
                let is_error_literal = matches!(e, Expr::Error(_));
                let v = eval_expr_with_provider(e, provider);
                if !is_error_literal {
                    if let Value::Error(err) = v {
                        return Value::Error(err);
                    }
                }
                values.push(v);
            }
            Value::Array(Arc::new(ArrayData::new(*rows, *cols, values)))
        }

        Expr::MultiArea(_) => {
            // A multi-area reference (`(A1:B2, D5:E6)`) is NOT a scalar
            // value — it's a union of disjoint ranges that only certain
            // built-ins (AREAS at first; SUMIF / COUNTIF criteria-range
            // in advanced cases) know how to consume. Anywhere else it
            // surfaces #VALUE!, matching Excel.
            //
            // AREAS receives the unevaluated `Expr::MultiArea` directly
            // via the func-call arm (see `eval_func`); it never recurses
            // back into this branch for its argument.
            Value::Error(ValueError::InvalidValue)
        }
    }
}

fn eval_binop(op: BinOperator, left: &Value, right: &Value) -> Value {
    // Propagate errors
    if let Value::Error(e) = left {
        return Value::Error(e.clone());
    }
    if let Value::Error(e) = right {
        return Value::Error(e.clone());
    }

    // Concat is the only string-yielding op; handle separately so we don't
    // require both sides to be numeric.
    if let BinOperator::Concat = op {
        return Value::Text(format!("{}{}", coerce_to_text(left), coerce_to_text(right)));
    }

    // Comparisons accept mixed types and return Boolean. Numeric comparison
    // when both sides are numeric, otherwise lexicographic on display text.
    let is_cmp = matches!(
        op,
        BinOperator::Eq
            | BinOperator::NotEq
            | BinOperator::Lt
            | BinOperator::LtEq
            | BinOperator::Gt
            | BinOperator::GtEq
    );
    if is_cmp {
        return Value::Boolean(eval_compare(op, left, right));
    }

    // 算术专用的转换：比 `coerce_to_number` 多认数值字符串（`=1+"5"` → 6）。
    let ln = coerce_to_number_arith(left);
    let rn = coerce_to_number_arith(right);

    match (ln, rn) {
        (Some(l), Some(r)) => match op {
            BinOperator::Add => finite_or_overflow(l + r),
            BinOperator::Sub => finite_or_overflow(l - r),
            BinOperator::Mul => finite_or_overflow(l * r),
            BinOperator::Div => {
                if r == 0.0 {
                    Value::Error(ValueError::DivisionByZero)
                } else {
                    finite_or_overflow(l / r)
                }
            }
            BinOperator::Pow => {
                let result = l.powf(r);
                if result.is_finite() {
                    Value::Number(result)
                } else if l == 0.0 && r < 0.0 {
                    Value::Error(ValueError::DivisionByZero) // 0^negative
                } else {
                    Value::Error(ValueError::Overflow)
                }
            }
            // Concat / comparisons handled above
            _ => Value::Error(ValueError::InvalidValue),
        },
        // Arithmetic op with a non-numeric (non-coercible) operand.
        //
        // Excel reports this as `#VALUE!` (`=1+"x"`, `="x"+"y"`), and there
        // is no `#TYPE!` code in Excel at all. `WrongType` stays reserved
        // for the non-Excel diagnostics the engine deliberately keeps
        // (built-in argument-type validation, custom-formula marshaling —
        // see `CUSTOM_FORMULAS.md`); leaking it out of the arithmetic
        // operators made every cross-engine parity check against the TS
        // reference engine diverge on a plain `=1+"x"`.
        _ => Value::Error(ValueError::InvalidValue),
    }
}

/// 算术结果的出口闸门：**非有限一律 `#NUM!`**。
///
/// Excel 明文按 IEEE 754 存数，但在两个点上刻意不跟：溢出（"Overflow occurs
/// when a number is too large to be represented. Excel uses its own special
/// representation for this case (`#NUM!`)"）与 NaN（"Excel instead immediately
/// generates an error such as `#NUM!` or `#DIV/0!`"）—— 见 Microsoft Learn
/// "Floating-point arithmetic may give inaccurate result in Excel"。所以
/// `=1E308*10` 不是 `inf`（Rust `Display`）也不是 `Infinity`（JS `String`），
/// 是 `#NUM!`。
///
/// **下溢不在这条闸门里**：同一份文档写明 "Underflow ... In IEEE and Excel,
/// the result is 0"，而 IEEE 的下溢结果本来就是 `0.0`，`is_finite()` 判真、
/// 原样落地。`=1E-308/1E10` 要的就是 `0`，不要在这里替它报错。
///
/// `Pow` 不走这里：它要把 `0^负数` 单独分流成 `#DIV/0!`（Excel 的答案），
/// 判非有限之后还得再分一次类，所以保留自己的分支。
fn finite_or_overflow(n: f64) -> Value {
    if n.is_finite() {
        Value::Number(n)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn coerce_to_text(v: &Value) -> String {
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

fn coerce_to_text_result(v: &Value) -> Result<String, ValueError> {
    match v {
        Value::Error(e) => Err(e.clone()),
        Value::Array(arr) => match arr.get(0, 0) {
            Some(cell) => coerce_to_text_result(cell),
            None => Err(ValueError::InvalidValue),
        },
        _ => Ok(coerce_to_text(v)),
    }
}

fn eval_text_arg(arg: &Expr, provider: &dyn EvalProvider) -> Result<String, ValueError> {
    let (_, _, data) = arg_to_2d(arg, provider)?;
    match data.first() {
        Some(value) => coerce_to_text_result(value),
        None => Err(ValueError::InvalidValue),
    }
}

fn eval_compare(op: BinOperator, l: &Value, r: &Value) -> bool {
    let cmp = if let (Some(ln), Some(rn)) = (coerce_to_number(l), coerce_to_number(r)) {
        ln.partial_cmp(&rn)
    } else {
        coerce_to_text(l).partial_cmp(&coerce_to_text(r))
    };
    let cmp = match cmp {
        Some(c) => c,
        // NaN-vs-anything: only Eq compares true if both are NaN values; we
        // already covered numeric NaN via partial_cmp returning None — treat
        // as not-equal for inequality ops.
        None => return matches!(op, BinOperator::NotEq),
    };
    use std::cmp::Ordering::*;
    match (op, cmp) {
        (BinOperator::Eq, Equal) => true,
        (BinOperator::NotEq, Equal) => false,
        (BinOperator::NotEq, _) => true,
        (BinOperator::Lt, Less) => true,
        (BinOperator::LtEq, Less | Equal) => true,
        (BinOperator::Gt, Greater) => true,
        (BinOperator::GtEq, Greater | Equal) => true,
        _ => false,
    }
}

/// Evaluate a binop operand with array-aware semantics.
///
/// Standard `eval_expr_with_provider` collapses a bare `Expr::Range` to
/// `#VALUE!` (ranges are only meaningful as function args), and lets a
/// `Value::Array` from a constructor function (`SEQUENCE`, `={1;2;3}`)
/// flow through as-is. For implicit broadcast we want the OPPOSITE
/// behaviour at the binop boundary: a multi-cell range becomes a
/// `Value::Array`, but a single-cell range collapses to its scalar so
/// `=A1+1` keeps the scalar-arithmetic fast path.
fn eval_operand_for_binop(expr: &Expr, provider: &dyn EvalProvider) -> Value {
    match runtime_ref_from_expr(expr, provider) {
        Ok(r) => return runtime_ref_to_value(&r, provider),
        Err(ValueError::InvalidValue) => {}
        Err(e) => return Value::Error(e),
    }
    // Non-range operand: defer to the normal evaluator. `Value::Array`
    // results (constant-array literals, SEQUENCE, etc.) flow through and
    // trigger broadcast at the call site.
    eval_expr_with_provider(expr, provider)
}

/// Predicate gating the broadcast path in `Expr::BinOp`. Only true for a
/// concrete `Value::Array`; scalars (including a collapsed 1×1 range)
/// keep the scalar arithmetic path.
fn is_array_like(v: &Value) -> bool {
    matches!(v, Value::Array(_))
}

/// Pick the element of an operand that corresponds to output cell
/// `(i, j)` under Excel broadcast rules.
///
/// - Scalar → returned as-is (broadcasts to every output cell).
/// - Array shape `(1, N)` → row 0, column `j`.
/// - Array shape `(M, 1)` → row `i`, column 0.
/// - Array shape matching the output → row `i`, column `j`.
/// - Out-of-shape access (caller passed a mismatched index) → `#VALUE!`.
fn pick_for_broadcast(v: &Value, i: u32, j: u32) -> Value {
    match v {
        Value::Array(arr) => {
            let (rows, cols) = arr.shape();
            let r = if rows == 1 { 0 } else { i };
            let c = if cols == 1 { 0 } else { j };
            arr.get(r, c)
                .cloned()
                .unwrap_or(Value::Error(ValueError::InvalidValue))
        }
        other => other.clone(),
    }
}

/// Compute the broadcast output shape for a binary op on operands `l`
/// and `r`. Returns `None` if the shapes are not compatible:
///   - identical → that shape
///   - one scalar, one array → array's shape
///   - 1×N and N×1 (either order) → N×N outer-product shape
///   - row × row of same width, col × col of same height → that shape
///   - otherwise → incompatible.
///
/// Excel surfaces incompatible shapes as `#N/A`; we use the closest
/// available variant, `#VALUE!` (InvalidValue).
fn broadcast_shape(l: &Value, r: &Value) -> Option<(u32, u32)> {
    let lshape = match l {
        Value::Array(a) => Some(a.shape()),
        _ => None,
    };
    let rshape = match r {
        Value::Array(a) => Some(a.shape()),
        _ => None,
    };
    match (lshape, rshape) {
        (None, None) => Some((1, 1)),
        (Some(s), None) => Some(s),
        (None, Some(s)) => Some(s),
        (Some((lr, lc)), Some((rr, rc))) => {
            if lr == rr && lc == rc {
                Some((lr, lc))
            } else if lr == 1 && rc == 1 {
                // 1×N · M×1  → M×N outer product.
                Some((rr, lc))
            } else if lc == 1 && rr == 1 {
                // M×1 · 1×N → M×N outer product.
                Some((lr, rc))
            } else if lr == 1 && lc == rc {
                // row vector broadcast down a multi-row array.
                Some((rr, rc))
            } else if rr == 1 && rc == lc {
                Some((lr, lc))
            } else if lc == 1 && lr == rr {
                // column vector broadcast across a multi-col array.
                Some((rr, rc))
            } else if rc == 1 && rr == lr {
                Some((lr, lc))
            } else {
                None
            }
        }
    }
}

/// Apply a binary arithmetic op pointwise under broadcast. Errors at
/// individual cells stay in the result array (Excel parity — a single
/// `#DIV/0!` in `=A1:A3/B1:B3` only poisons one output cell, not the
/// whole spill).
fn broadcast_binop(op: BinOperator, l: Value, r: Value) -> Value {
    // Whole-operand errors (e.g. `#REF!` from a malformed range) bypass
    // broadcast and propagate scalar-style, matching how `eval_binop`
    // treats an error operand.
    if let Value::Error(e) = &l {
        return Value::Error(e.clone());
    }
    if let Value::Error(e) = &r {
        return Value::Error(e.clone());
    }
    let (rows, cols) = match broadcast_shape(&l, &r) {
        Some(s) => s,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let cap = match checked_array_len(rows as u64, cols as u64) {
        Ok(cap) => cap,
        Err(e) => return Value::Error(e),
    };
    let mut out: Vec<Value> = Vec::with_capacity(cap);
    for i in 0..rows {
        for j in 0..cols {
            let lv = pick_for_broadcast(&l, i, j);
            let rv = pick_for_broadcast(&r, i, j);
            // Per-cell evaluation reuses the scalar code path. Errors
            // stay in-array — this is the documented behaviour.
            out.push(eval_binop(op, &lv, &rv));
        }
    }
    Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
}

/// Coerce a value to a number. Null → 0, Boolean true → 1, false → 0,
/// Number → itself. **Text is NOT accepted here** — see
/// [`coerce_to_number_arith`] for the arithmetic-operator rule and the
/// reason the two are separate.
fn coerce_to_number(v: &Value) -> Option<f64> {
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
fn coerce_to_number_arith(v: &Value) -> Option<f64> {
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
fn coerce_text_to_number(s: &str) -> Option<f64> {
    let trimmed = js_trim(s);
    // `Number("")` 是 `0` 而不是 NaN，TS 侧靠这道守卫把空串挡在外面。
    // 少了它 `=1+""` 会答 1，而 Excel / TS 都是 `#VALUE!`。
    if trimmed.is_empty() {
        return None;
    }
    js_numeric_value(trimmed)
}

/// Stream a range through `provider.for_each_range_cell`. Used by the
/// stateful aggregates (MEDIAN / MODE / VLOOKUP / INDEX / ...) so they
/// can build their algorithm-required Vec without going through the
/// "collect every cell in the rectangle" path that materialized Nulls
/// for full-column refs. Real-streaming aggregates (SUM / COUNT / ...)
/// drive `for_each_range_cell` directly.
fn stream_range(
    start: &CellAddress,
    end: &CellAddress,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(CellAddress, Value),
) {
    let range = CellRange::new(*start, *end);
    provider.for_each_range_cell(range, f);
}

/// Excel maximum dimensions. Full-column (`A:A`) and full-row (`1:1`)
/// ranges use `u32::MAX` as a sentinel on the unbounded axis. Allocating
/// a grid of that size would overflow in debug builds and attempt a
/// multi-billion-cell allocation in release, so dense materialization paths
/// reject these sentinels before allocation.
const EXCEL_MAX_ROWS: u32 = 1_048_576;
const EXCEL_MAX_COLS: u32 = 16_384;

/// 一个动态数组结果最多能有多少个单元格。SEQUENCE / MAKEARRAY / MAP /
/// MMULT 等所有数组构造器共用这一个闸门，超限一律 `#VALUE!`（而不是去尝试
/// 那次分配）。
///
/// `pub` 是给 WASM 桥用的：宿主 JS 自定义公式的**返回值**也能是二维数组
/// （`einfach-wasm` 的 `js_array_to_value`），它必须复用这同一个上限，
/// 而不是另立一个拍脑袋的常数 —— 否则 `=MYFN()` 能造出内建函数造不出的
/// 尺寸，后面的 spill 路径要为两套上限各写一遍防御。
///
/// # 已知分歧（未决，owner 待定 —— 别顺手「统一」）
///
/// 本闸门只数**格子总数**，不看行列各自是否越过网格。TS 参考引擎有**两道**
/// 闸门且给不同的码。同一批公式今天的答案：
///
/// | 公式 | 本引擎 | TS 引擎 | Excel |
/// |---|---|---|---|
/// | `=SEQUENCE(1048577)` | `#VALUE!` | `#NUM!` | `#NUM!` |
/// | `=SEQUENCE(1,16385)` | `#SPILL!`（数组建出来了，放不下） | `#NUM!` | `#NUM!` |
/// | `=SEQUENCE(2000,2000)` | `#VALUE!` | `#VALUE!` | **不报错**，正常溢出 |
///
/// Excel 那一列的依据是 `Excel.NumErrorCellValueSubType` 这个枚举 —— 它只有
/// 两个成员，其中 `arrayTooLarge` 的原文是 "An error caused by a cell's
/// formula having an array parameter with too many rows or columns. The
/// maximum number of rows and columns in an array parameter is 1048576.
/// Displays as error type #NUM! in Excel."；而 `ValueErrorCellValueSubType`
/// （近百个成员）里**没有任何一条**与数组尺寸有关。所以「越过网格」在 Excel
/// 里是 `#NUM!`，这一半是查实的。
///
/// **另一半查不实**：`DYNAMIC_ARRAY_CELL_CAP` 这条「格数上限」在 Excel 里
/// 根本不是一个概念 —— 2000×2000 = 4e6 格完全塞得进 1048576×16384 的网格，
/// Excel 就是把它溢出去（机器扛不住时弹的是资源耗尽对话框，不是单元格错误）。
/// 它是本引擎自己的内存闸门。因此「两种超限各返回什么」这个问法只有一半有
/// 答案，硬统一成一个码是在替 Excel 编另一半。
pub const DYNAMIC_ARRAY_CELL_CAP: u64 = EXCEL_MAX_ROWS as u64;

fn checked_array_len(rows: u64, cols: u64) -> Result<usize, ValueError> {
    let total = rows.checked_mul(cols).ok_or(ValueError::InvalidValue)?;
    if total > DYNAMIC_ARRAY_CELL_CAP {
        return Err(ValueError::InvalidValue);
    }
    usize::try_from(total).map_err(|_| ValueError::InvalidValue)
}

/// Shared inner loop for VLOOKUP / HLOOKUP. `index` is 1-based; for
/// horizontal=false it picks the column to return from a matched row,
/// for horizontal=true it picks the row to return from a matched column.
///
/// In approximate mode (range_lookup=TRUE) the lookup column/row must
/// be ascending; we find the largest value <= needle. Numeric needles
/// use numeric ordering; otherwise text ordering.
fn lookup_2d(
    grid: &[Vec<Value>],
    needle: &Value,
    index: usize,
    approximate: bool,
    horizontal: bool,
) -> Value {
    if grid.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }

    // Build the key sequence we search through.
    let keys: Vec<Value> = if horizontal {
        grid[0].clone()
    } else {
        grid.iter()
            .map(|r| r.first().cloned().unwrap_or(Value::Null))
            .collect()
    };

    // Find match position.
    let pos: Option<usize> = if approximate {
        // Linear scan picking largest key <= needle. (binary search is an
        // optimization; correctness is identical.)
        //
        // Excel parity: wildcards are NOT honored in approximate mode. A
        // pattern like "a*" is treated as a literal text key and ordered
        // by `compare_lookup` (string compare). This branch intentionally
        // does not call `wildcard_match`.
        let mut best: Option<usize> = None;
        for (i, k) in keys.iter().enumerate() {
            if compare_lookup(k, needle).is_le() {
                best = Some(i);
            } else {
                break; // input is supposed to be sorted; first overshoot ends scan
            }
        }
        best
    } else if let Value::Text(pattern) = needle {
        if pattern_has_wildcard(pattern) {
            // Excel wildcard match for exact-mode text patterns (`?`, `*`,
            // `~` escape). Non-text cells are coerced to text first so a
            // pattern like "4?" matches a numeric 42.
            keys.iter()
                .position(|k| wildcard_match(pattern, &coerce_to_text(k)))
        } else {
            keys.iter().position(|k| values_equal(k, needle))
        }
    } else {
        keys.iter().position(|k| values_equal(k, needle))
    };

    let p = match pos {
        Some(p) => p,
        None => return Value::Error(ValueError::NotAvailable),
    };

    // Return the cell at the requested row/column from the matched line.
    let cell = if horizontal {
        grid.get(index - 1).and_then(|r| r.get(p))
    } else {
        grid.get(p).and_then(|r| r.get(index - 1))
    };
    cell.cloned()
        .unwrap_or(Value::Error(ValueError::InvalidRef))
}

/// Materialize a function argument as a row-major 2D buffer plus shape.
/// Accepts:
///   - `Expr::Range` / `Expr::SheetRange` — collected via the provider.
///   - `OFFSET(...)` — evaluated to a runtime range, then collected.
///   - Anything else — evaluated to a scalar `Value`; a `Value::Array`
///     result returns its shape and data directly, everything else
///     becomes a 1×1 buffer.
///
/// Returns `Err(InvalidValue)` only for ranges whose nominal rectangle
/// exceeds Excel max bounds (full-column / full-row sentinels). Range
/// extraction failures from the provider yield empty grids rather than
/// errors, matching the rest of eval.rs's range-handling.
fn arg_to_2d(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<(u32, u32, Vec<Value>), ValueError> {
    // Range-shaped argument (literal range or OFFSET).
    if let Some(grid) = collect_range_2d_for_arg(arg, provider) {
        if grid.is_empty() {
            // Either an over-bound sentinel range or a 0-row collection.
            // Treat as a 0×0 buffer; callers reject empty arrays as
            // InvalidValue at their own discretion.
            return Ok((0, 0, Vec::new()));
        }
        let rows = grid.len() as u32;
        let cols = grid[0].len() as u32;
        let cap = checked_array_len(rows as u64, cols as u64)?;
        let mut data: Vec<Value> = Vec::with_capacity(cap);
        for row in grid {
            data.extend(row);
        }
        return Ok((rows, cols, data));
    }
    // Non-range argument: evaluate to a value. Array → expand. Scalar → 1×1.
    let v = eval_expr_with_provider(arg, provider);
    match v {
        Value::Array(arr) => {
            let (rows, cols) = arr.shape();
            checked_array_len(rows as u64, cols as u64)?;
            let data = arr.data.clone();
            Ok((rows, cols, data))
        }
        Value::Error(e) => Err(e),
        other => Ok((1, 1, vec![other])),
    }
}

fn compare_lookup(a: &Value, b: &Value) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    if let (Some(an), Some(bn)) = (coerce_to_number(a), coerce_to_number(b)) {
        an.partial_cmp(&bn).unwrap_or(Ordering::Equal)
    } else {
        coerce_to_text(a).cmp(&coerce_to_text(b))
    }
}

fn runtime_ref_from_expr(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    match arg {
        Expr::CellRef(addr, _) => Ok(RuntimeRef {
            sheet: None,
            range: CellRange::single(*addr),
            materialized: None,
        }),
        Expr::Range { start, end, .. } => Ok(RuntimeRef {
            sheet: None,
            range: CellRange::new(*start, *end),
            materialized: None,
        }),
        Expr::SheetRef { sheet, addr, .. } => Ok(RuntimeRef {
            sheet: Some(sheet.clone()),
            range: CellRange::single(*addr),
            materialized: None,
        }),
        Expr::SheetRange {
            sheet, start, end, ..
        } => Ok(RuntimeRef {
            sheet: Some(sheet.clone()),
            range: CellRange::new(*start, *end),
            materialized: None,
        }),
        Expr::SpillRef(anchor) => runtime_ref_from_spill(anchor, provider),
        Expr::DynamicRange { start, end } => {
            let start_ref = top_left_runtime_ref(runtime_ref_from_expr(start, provider)?);
            let end_ref = top_left_runtime_ref(runtime_ref_from_expr(end, provider)?);
            if start_ref.sheet != end_ref.sheet {
                return Err(ValueError::InvalidValue);
            }
            Ok(RuntimeRef {
                sheet: start_ref.sheet,
                range: CellRange::new(start_ref.range.start, end_ref.range.start),
                materialized: None,
            })
        }
        Expr::FuncCall { name, args } if name == "OFFSET" => {
            let range = eval_offset_as_range(args, provider).ok_or(ValueError::InvalidRef)?;
            Ok(RuntimeRef {
                sheet: None,
                range,
                materialized: None,
            })
        }
        Expr::FuncCall { name, args } if name == "INDIRECT" => {
            runtime_ref_from_indirect(args, provider)
        }
        Expr::FuncCall { name, args } if name == "INDEX" => runtime_ref_from_index(args, provider),
        Expr::TableRef {
            table,
            area,
            columns,
        } => resolve_table_ref(table.as_deref(), *area, columns.as_ref(), provider),
        _ => Err(ValueError::InvalidValue),
    }
}

/// Resolve an `Expr::TableRef` to a concrete runtime range (design doc #32
/// §5.3, "delayed resolution + delegate"). The single funnel every
/// consumer routes through — value context (`runtime_ref_to_value`),
/// aggregate streaming (`for_each_arg_value`), 2-D collection
/// (`collect_range_2d_for_arg`), and binop broadcast
/// (`eval_operand_for_binop`) all reach a structured reference via
/// `runtime_ref_from_expr`, so no parallel read path exists. Dependency
/// edges register through the provider's facade reads exactly as for a
/// typed range.
fn resolve_table_ref(
    table: Option<&str>,
    area: TableArea,
    columns: Option<&(String, String)>,
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    let Some(resolved) = provider.lookup_table(table) else {
        // Named table not in the registry → `#NAME?` (unknown name, Excel
        // parity). A table-less `[Col]` / `[@Col]` whose current cell is
        // not inside any Table → `#VALUE!`.
        return Err(match table {
            Some(_) => ValueError::InvalidName,
            None => ValueError::InvalidValue,
        });
    };

    let full = resolved.range.normalize();
    let header_rows: u32 = if resolved.has_headers { 1 } else { 0 };
    let totals_rows: u32 = if resolved.has_totals { 1 } else { 0 };
    let data_start = full.start.row + header_rows;
    let data_end = full
        .end
        .row
        .checked_sub(totals_rows)
        .unwrap_or(full.start.row);

    let (row_start, row_end) = match area {
        TableArea::All => (full.start.row, full.end.row),
        TableArea::Headers => {
            if !resolved.has_headers {
                return Err(ValueError::InvalidRef);
            }
            (full.start.row, full.start.row)
        }
        TableArea::Totals => {
            if !resolved.has_totals {
                return Err(ValueError::InvalidRef);
            }
            (full.end.row, full.end.row)
        }
        TableArea::Data => {
            if data_end < data_start {
                // Zero data rows → `#REF!` (design §4.1 known divergence
                // from Excel's "keep one empty data row").
                return Err(ValueError::InvalidRef);
            }
            (data_start, data_end)
        }
        TableArea::ThisRow => {
            let cur = provider.current_cell().ok_or(ValueError::InvalidValue)?;
            if data_end < data_start || cur.row < data_start || cur.row > data_end {
                // Current row outside the data area (or no current cell) →
                // `#VALUE!` (design §5.3 point 2, Excel parity).
                return Err(ValueError::InvalidValue);
            }
            (cur.row, cur.row)
        }
    };

    let (col_start, col_end) = match columns {
        None => (full.start.col, full.end.col),
        Some((a, b)) => {
            let ia = find_table_column(&resolved.columns, a).ok_or(ValueError::InvalidRef)?;
            let ib = find_table_column(&resolved.columns, b).ok_or(ValueError::InvalidRef)?;
            let ca = full.start.col + ia;
            let cb = full.start.col + ib;
            (ca.min(cb), ca.max(cb))
        }
    };

    let range = CellRange::new(
        CellAddress::new(row_start, col_start),
        CellAddress::new(row_end, col_end),
    );

    // Same-sheet Tables resolve as a bare (`sheet: None`) range so the
    // dependency edges are byte-for-byte identical to a typed `A1:A10`;
    // cross-sheet Tables carry the anchor sheet name so reads route through
    // the cross-sheet facade path (design §5.3 point 4).
    let sheet = if provider.current_sheet_index() == Some(resolved.sheet_index) {
        None
    } else {
        Some(resolved.sheet_name)
    };

    Ok(RuntimeRef {
        sheet,
        range,
        materialized: None,
    })
}

/// Case-insensitive column-name lookup → 0-based offset within a Table's
/// column list. `None` when the name isn't a column (→ `#REF!`).
fn find_table_column(columns: &[String], name: &str) -> Option<u32> {
    columns
        .iter()
        .position(|c| c.eq_ignore_ascii_case(name))
        .map(|i| i as u32)
}

fn top_left_runtime_ref(mut r: RuntimeRef) -> RuntimeRef {
    let n = r.normalized();
    let materialized = r.materialized.take().map(|arr| {
        Arc::new(ArrayData::new(
            1,
            1,
            vec![arr.get(0, 0).cloned().unwrap_or(Value::Null)],
        ))
    });
    RuntimeRef {
        sheet: r.sheet,
        range: CellRange::single(n.start),
        materialized,
    }
}

fn runtime_ref_from_spill(
    anchor: &Expr,
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    let (sheet, addr) = match anchor {
        Expr::CellRef(addr, _) => (None, *addr),
        Expr::SheetRef { sheet, addr, .. } => (Some(sheet.clone()), *addr),
        _ => return Err(ValueError::InvalidRef),
    };
    let raw = match &sheet {
        Some(s) => provider.raw_sheet_cell(s, addr),
        None => provider.raw_cell(addr),
    };
    match raw {
        Value::Array(arr) => {
            let (rows, cols) = arr.shape();
            if rows == 0 || cols == 0 {
                return Err(ValueError::InvalidRef);
            }
            let end = CellAddress::new(addr.row + rows - 1, addr.col + cols - 1);
            Ok(RuntimeRef {
                sheet,
                range: CellRange::new(addr, end),
                materialized: Some(arr),
            })
        }
        Value::Error(e) => Err(e),
        _ => Err(ValueError::InvalidRef),
    }
}

fn runtime_ref_from_indirect(
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    if args.is_empty() || args.len() > 2 {
        return Err(ValueError::WrongArgCount);
    }
    let ref_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = ref_v {
        return Err(e);
    }
    let a1 = if args.len() == 2 {
        let v = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = v {
            return Err(e);
        }
        coerce_to_bool(&v).ok_or(ValueError::WrongType)?
    } else {
        true
    };
    if !a1 {
        return Err(ValueError::InvalidRef);
    }
    let text = coerce_to_text(&ref_v);
    let (sheet, start, end) = parse_indirect_ref(&text).ok_or(ValueError::InvalidRef)?;
    Ok(RuntimeRef {
        sheet,
        range: CellRange::new(start, end),
        materialized: None,
    })
}

fn runtime_ref_from_index(
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    if args.len() < 2 || args.len() > 3 {
        return Err(ValueError::WrongArgCount);
    }
    let source = runtime_ref_from_expr(&args[0], provider)?;
    let (height, width) = source.bounded_shape().ok_or(ValueError::InvalidValue)?;
    let row = match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
        Some(n) if n.is_finite() => n.trunc() as i64,
        _ => return Err(ValueError::WrongType),
    };
    let col_explicit = args.len() == 3;
    let col = if col_explicit {
        match coerce_to_number(&eval_expr_with_provider(&args[2], provider)) {
            Some(n) if n.is_finite() => n.trunc() as i64,
            _ => return Err(ValueError::WrongType),
        }
    } else {
        1
    };
    if row < 0 || col < 0 {
        return Err(ValueError::InvalidRef);
    }
    let row = u32::try_from(row).map_err(|_| ValueError::InvalidRef)?;
    let col = u32::try_from(col).map_err(|_| ValueError::InvalidRef)?;

    if !col_explicit {
        if height == 1 {
            if row == 0 {
                return Ok(source);
            }
            if row > width {
                return Err(ValueError::InvalidRef);
            }
            return source.slice(0, 1, row - 1, 1).ok_or(ValueError::InvalidRef);
        }
        if width == 1 {
            if row == 0 {
                return Ok(source);
            }
            if row > height {
                return Err(ValueError::InvalidRef);
            }
            return source.slice(row - 1, 1, 0, 1).ok_or(ValueError::InvalidRef);
        }
        return Err(ValueError::InvalidValue);
    }

    match (row, col) {
        (0, 0) => Ok(source),
        (0, c) => {
            if c > width {
                return Err(ValueError::InvalidRef);
            }
            source
                .slice(0, height, c - 1, 1)
                .ok_or(ValueError::InvalidRef)
        }
        (r, 0) => {
            if r > height {
                return Err(ValueError::InvalidRef);
            }
            source
                .slice(r - 1, 1, 0, width)
                .ok_or(ValueError::InvalidRef)
        }
        (r, c) => {
            if r > height || c > width {
                return Err(ValueError::InvalidRef);
            }
            source
                .slice(r - 1, 1, c - 1, 1)
                .ok_or(ValueError::InvalidRef)
        }
    }
}

fn runtime_ref_to_grid(r: &RuntimeRef, provider: &dyn EvalProvider) -> Option<Vec<Vec<Value>>> {
    if let Some(arr) = &r.materialized {
        let (rows, cols) = arr.shape();
        if checked_array_len(rows as u64, cols as u64).is_err() {
            return Some(vec![]);
        }
        let mut grid = Vec::with_capacity(rows as usize);
        for row in 0..rows {
            let mut cells = Vec::with_capacity(cols as usize);
            for col in 0..cols {
                cells.push(arr.get(row, col).cloned().unwrap_or(Value::Null));
            }
            grid.push(cells);
        }
        return Some(grid);
    }

    let n = r.normalized();
    if n.end.row > EXCEL_MAX_ROWS || n.end.col > EXCEL_MAX_COLS {
        return Some(vec![]);
    }
    let rows = (n.end.row - n.start.row + 1) as usize;
    let cols = (n.end.col - n.start.col + 1) as usize;
    if checked_array_len(rows as u64, cols as u64).is_err() {
        return Some(vec![]);
    }
    let mut grid: Vec<Vec<Value>> = (0..rows).map(|_| vec![Value::Null; cols]).collect();
    let mut fill = |addr: CellAddress, value: Value| {
        if addr.row < n.start.row || addr.row > n.end.row {
            return;
        }
        if addr.col < n.start.col || addr.col > n.end.col {
            return;
        }
        let dr = (addr.row - n.start.row) as usize;
        let dc = (addr.col - n.start.col) as usize;
        grid[dr][dc] = value;
    };
    match &r.sheet {
        Some(sheet) => provider.for_each_sheet_range_cell(sheet, r.range, &mut fill),
        None => provider.for_each_range_cell(r.range, &mut fill),
    }
    Some(grid)
}

fn runtime_ref_to_value(r: &RuntimeRef, provider: &dyn EvalProvider) -> Value {
    let Some((rows, cols)) = r.bounded_shape() else {
        return Value::Error(ValueError::InvalidValue);
    };
    if rows == 1 && cols == 1 {
        if let Some(arr) = &r.materialized {
            return arr.get(0, 0).cloned().unwrap_or(Value::Null);
        }
        let addr = r.normalized().start;
        return match &r.sheet {
            Some(sheet) => provider.sheet_cell(sheet, addr),
            None => provider.cell(addr),
        };
    }
    if r.normalized().end.row > EXCEL_MAX_ROWS || r.normalized().end.col > EXCEL_MAX_COLS {
        return Value::Error(ValueError::InvalidValue);
    }
    let cap = match checked_array_len(rows as u64, cols as u64) {
        Ok(cap) => cap,
        Err(e) => return Value::Error(e),
    };
    let Some(grid) = runtime_ref_to_grid(r, provider) else {
        return Value::Error(ValueError::InvalidValue);
    };
    let mut data = Vec::with_capacity(cap);
    for row in grid {
        data.extend(row);
    }
    Value::Array(Arc::new(ArrayData::new(rows, cols, data)))
}

/// Build a 2D grid from an argument expression that is either a same-sheet
/// or cross-sheet range. Routes through `for_each_sheet_range_cell` for
/// cross-sheet ranges so the provider resolves cells against the correct
/// sheet rather than the formula's own sheet.
///
/// Also handles dynamic range expressions: if the argument is `OFFSET(...)`,
/// it is evaluated to a runtime `CellRange` which is then materialised as a
/// 2D grid — so `VLOOKUP(x, OFFSET(A1,0,0,10,2), 2, FALSE)` works correctly.
fn collect_range_2d_for_arg(arg: &Expr, provider: &dyn EvalProvider) -> Option<Vec<Vec<Value>>> {
    runtime_ref_from_expr(arg, provider)
        .ok()
        .and_then(|r| runtime_ref_to_grid(&r, provider))
}

/// Evaluate an `OFFSET(ref, row_off, col_off[, height[, width]])` call and
/// return the resolved `CellRange`, or `None` if arguments are invalid.
/// `ref` must be a `CellRef` (single-cell anchor); row/col offsets are
/// applied to produce the top-left corner; height/width (default 1×1) give
/// the extent. All numeric args must be coercible; otherwise returns `None`.
fn eval_offset_as_range(args: &[Expr], provider: &dyn EvalProvider) -> Option<CellRange> {
    if args.len() < 3 || args.len() > 5 {
        return None;
    }
    // First arg must be a cell reference (the anchor).
    let anchor = match &args[0] {
        Expr::CellRef(addr, _) => *addr,
        _ => return None,
    };
    let row_off = coerce_to_number(&eval_expr_with_provider(&args[1], provider))? as i64;
    let col_off = coerce_to_number(&eval_expr_with_provider(&args[2], provider))? as i64;
    let height = if args.len() >= 4 {
        let h = coerce_to_number(&eval_expr_with_provider(&args[3], provider))?;
        if h < 1.0 {
            return None;
        }
        h as u32
    } else {
        1
    };
    let width = if args.len() == 5 {
        let w = coerce_to_number(&eval_expr_with_provider(&args[4], provider))?;
        if w < 1.0 {
            return None;
        }
        w as u32
    } else {
        1
    };
    let start_row = anchor.row as i64 + row_off;
    let start_col = anchor.col as i64 + col_off;
    if start_row < 0 || start_col < 0 {
        return None;
    }
    let start = CellAddress::new(start_row as u32, start_col as u32);
    let end = CellAddress::new(start_row as u32 + height - 1, start_col as u32 + width - 1);
    Some(CellRange::new(start, end))
}

/// Normalized rectangle resolved from a range-shaped argument expression.
/// Used by the multi-criteria aggregates (COUNTIFS / SUMIFS / AVERAGEIF /
/// AVERAGEIFS / MAXIFS / MINIFS) where every range has to share the same
/// (rows, cols) shape. `sheet` is `Some` only for cross-sheet ranges.
#[derive(Clone)]
struct ResolvedRange {
    sheet: Option<String>,
    start_row: u32,
    start_col: u32,
    rows: u32,
    cols: u32,
    materialized: Option<Arc<ArrayData>>,
}

#[derive(Clone)]
struct RuntimeRef {
    sheet: Option<String>,
    range: CellRange,
    materialized: Option<Arc<ArrayData>>,
}

impl RuntimeRef {
    fn normalized(&self) -> CellRange {
        self.range.normalize()
    }

    fn materialized_shape(&self) -> Option<(u32, u32)> {
        self.materialized.as_ref().map(|arr| arr.shape())
    }

    fn bounded_shape(&self) -> Option<(u32, u32)> {
        if let Some(shape) = self.materialized_shape() {
            return Some(shape);
        }
        let n = self.normalized();
        let end_row = if n.end.row > EXCEL_MAX_ROWS {
            EXCEL_MAX_ROWS.checked_sub(1)?
        } else {
            n.end.row
        };
        let end_col = if n.end.col > EXCEL_MAX_COLS {
            EXCEL_MAX_COLS.checked_sub(1)?
        } else {
            n.end.col
        };
        if end_row < n.start.row || end_col < n.start.col {
            return None;
        }
        Some((end_row - n.start.row + 1, end_col - n.start.col + 1))
    }

    fn slice(&self, row_offset: u32, rows: u32, col_offset: u32, cols: u32) -> Option<RuntimeRef> {
        if rows == 0 || cols == 0 {
            return None;
        }
        let (src_rows, src_cols) = self.bounded_shape()?;
        if row_offset.checked_add(rows)? > src_rows || col_offset.checked_add(cols)? > src_cols {
            return None;
        }
        let cap = checked_array_len(rows as u64, cols as u64).ok()?;
        let n = self.normalized();
        let start = CellAddress::new(
            n.start.row.checked_add(row_offset)?,
            n.start.col.checked_add(col_offset)?,
        );
        let end = CellAddress::new(
            start.row.checked_add(rows - 1)?,
            start.col.checked_add(cols - 1)?,
        );
        let materialized = self.materialized.as_ref().map(|arr| {
            let mut data = Vec::with_capacity(cap);
            for r in 0..rows {
                for c in 0..cols {
                    data.push(
                        arr.get(row_offset + r, col_offset + c)
                            .cloned()
                            .unwrap_or(Value::Null),
                    );
                }
            }
            Arc::new(ArrayData::new(rows, cols, data))
        });
        Some(RuntimeRef {
            sheet: self.sheet.clone(),
            range: CellRange::new(start, end),
            materialized,
        })
    }
}

/// Resolve a function-argument expression to a normalized range. Accepts
/// `Expr::Range`, `Expr::SheetRange`, and `OFFSET(...)`. Anything else
/// returns `None` — the caller surfaces `InvalidValue` to keep parity with
/// Excel's `#VALUE!`.
fn resolve_range_arg(arg: &Expr, provider: &dyn EvalProvider) -> Option<ResolvedRange> {
    let r = runtime_ref_from_expr(arg, provider).ok()?;
    let n = r.normalized();
    let (rows, cols) = r.bounded_shape()?;
    Some(ResolvedRange {
        sheet: r.sheet,
        start_row: n.start.row,
        start_col: n.start.col,
        rows,
        cols,
        materialized: r.materialized,
    })
}

/// Look up a single cell within a `ResolvedRange` by (dr, dc) offset.
fn fetch_range_cell(range: &ResolvedRange, dr: u32, dc: u32, provider: &dyn EvalProvider) -> Value {
    if let Some(arr) = &range.materialized {
        return arr.get(dr, dc).cloned().unwrap_or(Value::Null);
    }
    let addr = CellAddress::new(range.start_row + dr, range.start_col + dc);
    match &range.sheet {
        Some(s) => provider.sheet_cell(s, addr),
        None => provider.cell(addr),
    }
}

/// Walk pairs of `(range_arg, criterion_arg)` from a slice of function
/// arguments. The slice's length must be even and ≥ 2 — callers should
/// arg-count check first. All ranges must share the shape of `args[0]`,
/// otherwise `InvalidValue` is returned. Criteria expressions are
/// evaluated once per call (outside the per-cell loop).
fn collect_criteria_pairs(
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Result<Vec<(ResolvedRange, Value)>, ValueError> {
    if args.is_empty() || args.len() % 2 != 0 {
        return Err(ValueError::WrongArgCount);
    }
    let mut pairs: Vec<(ResolvedRange, Value)> = Vec::with_capacity(args.len() / 2);
    let mut shape: Option<(u32, u32)> = None;
    let mut i = 0;
    while i < args.len() {
        let range = match resolve_range_arg(&args[i], provider) {
            Some(r) => r,
            None => return Err(ValueError::InvalidValue),
        };
        if let Some((rows, cols)) = shape {
            if range.rows != rows || range.cols != cols {
                return Err(ValueError::InvalidValue);
            }
        } else {
            shape = Some((range.rows, range.cols));
        }
        let criterion = eval_expr_with_provider(&args[i + 1], provider);
        // criteria 实参本身求值成错误 → 原样传播（普通实参错误规则）。不能落到
        // `matches_criterion`，否则会退化成「数显示文本等于 #REF! 的格子」。
        if let Value::Error(e) = criterion {
            return Err(e);
        }
        pairs.push((range, criterion));
        i += 2;
    }
    Ok(pairs)
}

/// Stream values produced by a function argument. For `Range` args this
/// goes through `provider.for_each_range_cell` (sparse-aware); for any
/// other expression it evaluates once and yields the single value. The
/// closure sees `(Option<addr>, value)` — `Some` for range cells, `None`
/// for evaluated sub-expressions — so callers like `SUMIF` can still
/// align `range`/`sum_range` by relative position when both are ranges.
///
/// Dynamic range expressions: if the argument is `OFFSET(...)`, it is
/// evaluated to a runtime `CellRange` and iterated cell-by-cell via the
/// provider — so `SUM(OFFSET(A1,0,0,5,1))` works like `SUM(A1:A5)`.
fn for_each_arg_value(
    arg: &Expr,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(Option<CellAddress>, Value),
) {
    for_each_arg_value_indexed(arg, provider, &mut |addr, _pos, v| f(addr, v));
}

/// `COUNTBLANK` 的「算空」判据，作用在**已经发出来的**格子上（没发出来的空格
/// 走矩形差额，见 `"COUNTBLANK"` 那一臂）。
///
/// 空文本 `""` 也算空 —— 这是 Excel 的口径，也是本仓 TS 参考引擎的口径
/// （`evaluateSparseCountBlank`：`value.kind === 'blank' || (string && === '')`）。
/// 因此 `COUNTBLANK` **不是** `COUNTA` 的补集：`=""` 那一格 COUNTA 算它非空、
/// COUNTBLANK 算它空，同一格被两边都数进去。错误格两边都算「非空」。
fn value_counts_as_blank(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::Text(s) => s.is_empty(),
        _ => false,
    }
}

/// 同一条流，但回调拿到的是「这个格子是区域里的第几个」—— 1-based、行主序的
/// **绝对位置**，而不是「这是第几个被发出来的格子」。
///
/// 两者在稠密 provider 上重合，在稀疏 provider 上不重合：`for_each_range_cell`
/// 的契约是**只发非空格**，所以用累加计数器当位置的写法会让空格不占位。
/// `A1=1 / A2 空 / A3=3` 时 `MATCH(3,A1:A3,0)` 因此答 2，而 Excel（和本仓的
/// TS 参考引擎）答 3 —— Excel 数的是区域内的绝对位置，空格照样占一格。
///
/// 谁该用这个而不是 [`for_each_arg_value`]：**把序号当结果交出去**的函数
/// （`MATCH` / `XMATCH` 的返回值、`SERIESSUM` 的系数指数），以及需要知道
/// **空格在哪 / 有几个**的函数（`COUNTBLANK` 的基数、`TEXTJOIN` 的补洞）。
/// 只做聚合、计数、排序的那一大批不需要 —— 它们的答案与空格占不占位无关。
///
/// 返回值见 [`for_each_arg_value_indexed`]：区域实参的**矩形格数**。
fn for_each_arg_value_positioned(
    arg: &Expr,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(u64, Value),
) -> Option<u64> {
    for_each_arg_value_indexed(arg, provider, &mut |_addr, pos, v| f(pos, v))
}

/// [`for_each_arg_value`] 与 [`for_each_arg_value_positioned`] 共用的实现。
/// 实参**只解析一次**（`OFFSET` / `INDIRECT` / `INDEX` 这类动态区域的解析带
/// 求值副作用，解两遍既慢又可能不等价），两个外壳各取所需。
///
/// 返回**矩形格数**（`bounded_shape()` 的行 × 列），区域实参才有：它是「这个
/// 实参名义上覆盖多少格」，与「回调被调了几次」是两个数 —— 差额就是被稀疏
/// 遍历跳过的空格数。`COUNTBLANK` 靠这个差额闭式求解，不必物化空格。
/// 非区域实参（标量 / 数组字面量 / 求值出错）返回 `None`：它们的每个位置都
/// 发出来了，不存在洞，也就没有「矩形」这个概念。
fn for_each_arg_value_indexed(
    arg: &Expr,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(Option<CellAddress>, u64, Value),
) -> Option<u64> {
    match runtime_ref_from_expr(arg, provider) {
        Ok(r) => {
            let n = r.normalized();
            if let Some(arr) = &r.materialized {
                let (rows, cols) = arr.shape();
                for row in 0..rows {
                    for col in 0..cols {
                        let addr = CellAddress::new(n.start.row + row, n.start.col + col);
                        let pos = row as u64 * cols as u64 + col as u64 + 1;
                        f(
                            Some(addr),
                            pos,
                            arr.get(row, col).cloned().unwrap_or(Value::Null),
                        );
                    }
                }
                return Some(rows as u64 * cols as u64);
            }
            // 区域的形状。`bounded_shape` 已把整列 / 整行的 `u32::MAX` 哨兵夹到
            // Excel 网格上限，所以 `A:A` 得到 1048576×1、`1:1` 得到 1×16384。
            let shape = r.bounded_shape();
            let cols = shape.map_or(1u64, |(_, c)| c as u64);
            let mut emit = |addr: CellAddress, v: Value| {
                let dr = addr.row.saturating_sub(n.start.row) as u64;
                let dc = addr.col.saturating_sub(n.start.col) as u64;
                f(Some(addr), dr * cols + dc + 1, v);
            };
            match &r.sheet {
                Some(sheet) => provider.for_each_sheet_range_cell(sheet, r.range, &mut emit),
                None => stream_range(&r.range.start, &r.range.end, provider, &mut emit),
            }
            shape.map(|(rows, c)| rows as u64 * c as u64)
        }
        Err(ValueError::InvalidValue) => {
            let v = eval_expr_with_provider(arg, provider);
            if let Value::Array(arr) = v {
                for (i, elem) in arr.data.iter().enumerate() {
                    f(None, i as u64 + 1, elem.clone());
                }
            } else {
                f(None, 1, v);
            }
            None
        }
        Err(e) => {
            f(None, 1, Value::Error(e));
            None
        }
    }
}

/// A database range resolved from a D* function's first argument. The
/// header row is data row 0 in the original rectangle; `data_rows` is the
/// number of rows BELOW the header. Built from `arg_as_range`/`OFFSET`
/// shapes (the same set `resolve_range_arg` accepts) but kept separately
/// so callers can address "data row i, column j" without subtracting the
/// header offset each time.
struct DatabaseRange {
    sheet: Option<String>,
    start_row: u32,
    start_col: u32,
    cols: u32,
    data_rows: u32,
}

impl DatabaseRange {
    /// Fetch the header cell at the given 0-based column index. Returns
    /// `Value::Null` if `col` is out of range.
    fn header(&self, col: u32, provider: &dyn EvalProvider) -> Value {
        if col >= self.cols {
            return Value::Null;
        }
        let addr = CellAddress::new(self.start_row, self.start_col + col);
        match &self.sheet {
            Some(s) => provider.sheet_cell(s, addr),
            None => provider.cell(addr),
        }
    }

    /// Fetch a data cell. `row` is 0-based against the data area (so row
    /// 0 is the first row after the header), and `col` is the 0-based
    /// column index.
    fn data_cell(&self, row: u32, col: u32, provider: &dyn EvalProvider) -> Value {
        let addr = CellAddress::new(self.start_row + 1 + row, self.start_col + col);
        match &self.sheet {
            Some(s) => provider.sheet_cell(s, addr),
            None => provider.cell(addr),
        }
    }
}

/// Resolve a D* function's database argument into a `DatabaseRange`. The
/// argument must be a literal range or `OFFSET(...)` with at least 2 rows
/// (header + ≥ 1 data row). Otherwise `InvalidValue`.
fn resolve_database_range(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<DatabaseRange, ValueError> {
    let resolved = resolve_range_arg(arg, provider).ok_or(ValueError::InvalidValue)?;
    if resolved.rows < 2 {
        // A database needs a header row and at least one data row.
        return Err(ValueError::InvalidValue);
    }
    Ok(DatabaseRange {
        sheet: resolved.sheet,
        start_row: resolved.start_row,
        start_col: resolved.start_col,
        cols: resolved.cols,
        data_rows: resolved.rows - 1,
    })
}

/// Resolve a D* function's `field` argument to a 0-based column index
/// inside `database`. Accepts:
/// - A 1-based number (1 → column 0, etc).
/// - Text matching a header cell case-insensitively.
/// Anything else, or out-of-range, is `InvalidValue`. Header cells that
/// evaluate to `Value::Error(_)` propagate.
fn resolve_db_field(
    database: &DatabaseRange,
    field_arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<usize, ValueError> {
    let v = eval_expr_with_provider(field_arg, provider);
    if let Value::Error(e) = v {
        return Err(e);
    }
    // Numeric form first: 1-based column index. Booleans coerce per
    // `coerce_to_number` (TRUE=1, FALSE=0); FALSE → out of range.
    if let Value::Number(n) = v {
        if !n.is_finite() || n.trunc() != n || n < 1.0 || (n as u32) > database.cols {
            return Err(ValueError::InvalidValue);
        }
        return Ok((n as usize) - 1);
    }
    // Text form: case-insensitive header lookup.
    let needle = match v {
        Value::Text(s) => s,
        _ => return Err(ValueError::InvalidValue),
    };
    let needle_lc = needle.to_lowercase();
    for col in 0..database.cols {
        let header = database.header(col, provider);
        if let Value::Error(e) = header {
            return Err(e);
        }
        if coerce_to_text(&header).to_lowercase() == needle_lc {
            return Ok(col as usize);
        }
    }
    Err(ValueError::InvalidValue)
}

/// Walk every data row of `database`, evaluate `criteria`, and invoke
/// `callback(row_index)` for each matching row.
///
/// Criteria layout: row 0 is a header row whose cells name database
/// columns (case-insensitive). Rows 1..N are criterion rows. A data row
/// matches if it satisfies AT LEAST ONE criterion row; a criterion row
/// is satisfied if EVERY non-empty cell in it passes `matches_criterion`
/// against the corresponding database column. Empty (Null) criterion
/// cells contribute nothing (vacuously true), so a fully empty criterion
/// row matches every data row.
///
/// Returns `Err(e)` on the first `Value::Error(_)` encountered in either
/// database or criteria cells, or on a malformed criteria range (no
/// header row, or a header that doesn't match any database column).
fn iter_db_matches(
    database: &DatabaseRange,
    criteria_arg: &Expr,
    provider: &dyn EvalProvider,
    mut callback: impl FnMut(u32) -> Result<(), ValueError>,
) -> Result<(), ValueError> {
    let criteria = resolve_range_arg(criteria_arg, provider).ok_or(ValueError::InvalidValue)?;
    if criteria.rows < 2 {
        // No criterion rows — Excel treats this as "no rows match".
        return Ok(());
    }

    // Resolve criteria headers → database column index (lazily, once).
    // `header_cols[i]` is the 0-based database column for criteria column
    // `i`, or `None` if the criteria header is empty (skip column).
    let mut header_cols: Vec<Option<u32>> = Vec::with_capacity(criteria.cols as usize);
    for c in 0..criteria.cols {
        let header = fetch_range_cell(&criteria, 0, c, provider);
        if let Value::Error(e) = header {
            return Err(e);
        }
        if matches!(header, Value::Null) {
            header_cols.push(None);
            continue;
        }
        let header_text = coerce_to_text(&header).to_lowercase();
        let mut matched: Option<u32> = None;
        for db_c in 0..database.cols {
            let dh = database.header(db_c, provider);
            if let Value::Error(e) = dh {
                return Err(e);
            }
            if coerce_to_text(&dh).to_lowercase() == header_text {
                matched = Some(db_c);
                break;
            }
        }
        // Bad criteria header (non-empty header not present in database)
        // → InvalidValue. We choose strict-error semantics over silent
        // mismatch so authoring mistakes surface loudly.
        match matched {
            Some(idx) => header_cols.push(Some(idx)),
            None => return Err(ValueError::InvalidValue),
        }
    }

    // For each data row, OR across criterion rows.
    for dr in 0..database.data_rows {
        let mut any_row_matches = false;
        for cr in 1..criteria.rows {
            let mut all_match = true;
            for cc in 0..criteria.cols {
                let cv = fetch_range_cell(&criteria, cr, cc, provider);
                if let Value::Error(e) = cv {
                    return Err(e);
                }
                if matches!(cv, Value::Null) {
                    continue;
                }
                let db_col = match header_cols[cc as usize] {
                    Some(c) => c,
                    // Skipped column (criteria header was empty). The
                    // criterion value here is non-empty but has no
                    // anchor column → vacuously fail this criterion row.
                    None => {
                        all_match = false;
                        break;
                    }
                };
                let dv = database.data_cell(dr, db_col, provider);
                if let Value::Error(e) = dv {
                    return Err(e);
                }
                if !matches_criterion(&dv, &cv) {
                    all_match = false;
                    break;
                }
            }
            if all_match {
                any_row_matches = true;
                break;
            }
        }
        if any_row_matches {
            callback(dr)?;
        }
    }
    Ok(())
}

/// Common skeleton for D* numeric aggregates. Resolves the database and
/// field column, then folds over matching rows' `field` values through
/// `step`. `init` seeds the accumulator; `finalize` produces the result
/// (e.g. wrap in `Value::Number`, or surface `DivisionByZero` if no
/// values were collected).
///
/// `step` receives `(state, value)` and may inspect non-numeric values
/// (DCOUNTA cares about Null vs non-Null) — callers gate by type.
fn db_aggregate<S>(
    args: &[Expr],
    provider: &dyn EvalProvider,
    mut init: S,
    step: impl Fn(&mut S, &Value),
    finalize: impl FnOnce(S) -> Value,
) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let database = match resolve_database_range(&args[0], provider) {
        Ok(d) => d,
        Err(e) => return Value::Error(e),
    };
    let field_col = match resolve_db_field(&database, &args[1], provider) {
        Ok(c) => c,
        Err(e) => return Value::Error(e),
    };
    let walk = iter_db_matches(&database, &args[2], provider, |row| {
        let v = database.data_cell(row, field_col as u32, provider);
        if let Value::Error(e) = v {
            return Err(e);
        }
        step(&mut init, &v);
        Ok(())
    });
    if let Err(e) = walk {
        return Value::Error(e);
    }
    finalize(init)
}

fn eval_func(name: &str, args: &[Expr], provider: &dyn EvalProvider) -> Value {
    match name {
        // LET is the first arm so the LET frame is pushed/popped before
        // any other dispatch can resolve a bare `Expr::Name` against
        // the stack. L1 of the LAMBDA arc; LAMBDA / MAP / REDUCE come
        // later.
        //
        //   LET(name1, value1, name2, value2, ..., expression)
        //
        // Total arg count must be odd and ≥ 3 (at least one binding +
        // a body). Bindings are LEXICAL and SEQUENTIAL: each value can
        // see the bindings declared earlier in the same LET, and a
        // nested LET sees outer bindings through the frame chain.
        "LET" => {
            if args.len() < 3 || args.len() % 2 == 0 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let body = args.last().unwrap();
            let pairs = &args[..args.len() - 1];

            // Push a fresh frame, then bind sequentially. Each value
            // expression is evaluated WITH the current scope (so later
            // bindings can reference earlier ones), and an error from
            // any value propagates out — we still pop the frame via a
            // guard so the stack stays balanced.
            //
            // We don't reject names that shadow built-in function names
            // (e.g. `LET(SUM, 5, SUM)`). Excel rejects this with #NAME?
            // but the spec for this commit allows skipping that check;
            // a future tightening can compare against the dispatch
            // table here. A non-`Expr::Name` in a name slot is the only
            // structural rejection — caught below.
            LET_FRAMES.with(|frames| frames.borrow_mut().push(LetFrame::new()));

            let result = (|| {
                let mut i = 0;
                while i < pairs.len() {
                    let binding_name = match &pairs[i] {
                        Expr::Name(n) => n.clone(),
                        _ => return Value::Error(ValueError::InvalidName),
                    };
                    let value = eval_expr_with_provider(&pairs[i + 1], provider);
                    if let Value::Error(e) = &value {
                        return Value::Error(e.clone());
                    }
                    LET_FRAMES.with(|frames| {
                        frames
                            .borrow_mut()
                            .last_mut()
                            .expect("LET frame just pushed")
                            .bind(binding_name, value);
                    });
                    i += 2;
                }
                eval_expr_with_provider(body, provider)
            })();

            LET_FRAMES.with(|frames| {
                frames.borrow_mut().pop();
            });
            result
        }

        // LAMBDA(param1, param2, ..., body) — produce a first-class
        // lambda value. The last argument is the body expression; every
        // preceding argument must be a bare identifier (Expr::Name) and
        // becomes a parameter name. L2 of the LAMBDA arc; immediate
        // invocation `=LAMBDA(...)(args)` is handled by Expr::Call.
        //
        // Closure capture: the lambda snapshots the current LET frames
        // at literal-evaluation time. That snapshot moves into the
        // ExcelLambda struct and is later pushed as a fresh frame when
        // `apply_lambda` evaluates the body. This is what lets
        // `=LET(n, 7, LAMBDA(x, x*n)(3))` resolve `n` to 7 — even
        // though the LET frame is popped before the lambda's body
        // would otherwise run (in this immediate-call case it doesn't
        // matter, but the contract holds for stored lambdas too).
        //
        // Error contract: 0 args → WrongArgCount (need the body at
        // least). A non-`Name` in a param slot → InvalidName. The
        // 1-arg form `=LAMBDA(body)` is allowed (zero-param lambda),
        // applied via `=LAMBDA(body)()`.
        "LAMBDA" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let body = args.last().unwrap().clone();
            let mut params: Vec<String> = Vec::with_capacity(args.len() - 1);
            for a in &args[..args.len() - 1] {
                match a {
                    Expr::Name(n) => params.push(n.clone()),
                    _ => return Value::Error(ValueError::InvalidName),
                }
            }
            let captured = snapshot_let_frames();
            let lambda = ExcelLambda {
                params,
                body,
                captured,
            };
            Value::Lambda(Arc::new(lambda))
        }

        // ISOMITTED(arg) — Excel uses this in conjunction with LAMBDA's
        // OPTIONAL-parameter syntax (e.g. `LAMBDA(x, [y], IF(ISOMITTED(y),
        // x, x+y))`). We don't support optional parameters in this phase
        // (every LAMBDA parameter is required; arity is strict in
        // `apply_lambda`), so ISOMITTED has no meaningful work to do and
        // always returns FALSE. Documented gap — re-evaluate when
        // optional-param syntax lands.
        "ISOMITTED" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // Evaluate the arg so any error it contains propagates
            // (Excel parity). Otherwise: FALSE.
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            Value::Boolean(false)
        }

        "SUM" => {
            // Real streaming: O(1) accumulator, no Vec allocation. Errors
            // short-circuit through `err`.
            let mut total = 0.0_f64;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => total += n,
                        Value::Null => {}
                        Value::Boolean(true) => total += 1.0,
                        Value::Boolean(false) => {}
                        Value::Text(_) => {}
                        // Unreachable: for_each_arg_value flattens Array
                        // sub-expressions into per-element callbacks.
                        Value::Array(_) => {}
                        // A lambda landing in SUM is a type error (the user
                        // wrote `=SUM(LAMBDA(x, x))`-style nonsense). Match
                        // Excel: surface #VALUE!.
                        Value::Lambda(_) => err = Some(ValueError::WrongType),
                    }
                });
            }
            match err {
                Some(e) => Value::Error(e),
                // 累加器同样会溢出（`=SUM(A1:A2)` 上两个 1E308）。出口共用
                // `finite_or_overflow`，否则「运算符报 `#NUM!`、聚合吐 `inf`」
                // 又是同一个引擎里的两种答案。
                None => finite_or_overflow(total),
            }
        }

        "AVERAGE" => {
            let mut total = 0.0_f64;
            let mut count = 0u64;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            total += n;
                            count += 1;
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if count == 0 {
                Value::Error(ValueError::DivisionByZero)
            } else {
                Value::Number(total / count as f64)
            }
        }

        "COUNT" => {
            let mut count = 0u64;
            for arg in args {
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if matches!(v, Value::Number(_)) {
                        count += 1;
                    }
                });
            }
            Value::Number(count as f64)
        }

        "IF" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let cond = eval_expr_with_provider(&args[0], provider);
            let is_true = match cond {
                Value::Boolean(b) => b,
                Value::Number(n) => n != 0.0,
                Value::Error(e) => return Value::Error(e),
                _ => false,
            };
            if is_true {
                eval_expr_with_provider(&args[1], provider)
            } else if args.len() == 3 {
                eval_expr_with_provider(&args[2], provider)
            } else {
                Value::Boolean(false)
            }
        }

        "MIN" => {
            let mut min: Option<f64> = None;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            min = Some(min.map_or(n, |m: f64| m.min(n)));
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                return Value::Error(e);
            }
            // Empty set: Excel returns 0 if there are no numeric arguments
            // at all — but #NUM! in some versions. We prefer #VALUE! over a
            // misleading 0 (B.6). Callers wanting "0 default" should pass it.
            min.map_or(Value::Error(ValueError::InvalidValue), Value::Number)
        }

        "MAX" => {
            let mut max: Option<f64> = None;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            max = Some(max.map_or(n, |m: f64| m.max(n)));
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                return Value::Error(e);
            }
            max.map_or(Value::Number(0.0), Value::Number)
        }

        // === Logical ===
        "AND" => {
            let mut result = true;
            let mut saw_any = false;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {}
                        other => match coerce_to_bool(&other) {
                            Some(b) => {
                                saw_any = true;
                                result = result && b;
                            }
                            None => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_any {
                Value::Error(ValueError::WrongArgCount)
            } else {
                Value::Boolean(result)
            }
        }
        "OR" => {
            let mut result = false;
            let mut saw_any = false;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {}
                        other => match coerce_to_bool(&other) {
                            Some(b) => {
                                saw_any = true;
                                result = result || b;
                            }
                            None => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_any {
                Value::Error(ValueError::WrongArgCount)
            } else {
                Value::Boolean(result)
            }
        }
        "NOT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match coerce_to_bool(&v) {
                Some(b) => Value::Boolean(!b),
                None => match v {
                    Value::Error(e) => Value::Error(e),
                    _ => Value::Error(ValueError::WrongType),
                },
            }
        }

        // === Math ===
        "ABS" => unary_number(args, provider, |n| n.abs()),
        "SQRT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n < 0.0 => Value::Error(ValueError::Overflow),
                Some(n) => Value::Number(n.sqrt()),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "ROUND" => {
            // ROUND(value, digits)
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let n = eval_expr_with_provider(&args[0], provider);
            let d = eval_expr_with_provider(&args[1], provider);
            match (coerce_to_number(&n), coerce_to_number(&d)) {
                (Some(value), Some(digits)) => {
                    let factor = 10f64.powi(digits as i32);
                    Value::Number((value * factor).round() / factor)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "CEILING" => unary_number(args, provider, f64::ceil),
        "FLOOR" => unary_number(args, provider, f64::floor),
        "POWER" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let b = eval_expr_with_provider(&args[0], provider);
            let e = eval_expr_with_provider(&args[1], provider);
            match (coerce_to_number(&b), coerce_to_number(&e)) {
                (Some(base), Some(exp)) => {
                    let r = base.powf(exp);
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "MOD" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let a = eval_expr_with_provider(&args[0], provider);
            let b = eval_expr_with_provider(&args[1], provider);
            match (coerce_to_number(&a), coerce_to_number(&b)) {
                (Some(_), Some(0.0)) => Value::Error(ValueError::DivisionByZero),
                (Some(va), Some(vb)) => Value::Number(va.rem_euclid(vb)),
                _ => Value::Error(ValueError::WrongType),
            }
        }

        // === Text ===
        "CONCATENATE" => {
            let mut out = String::new();
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    if let Value::Error(e) = &v {
                        err = Some(e.clone());
                        return;
                    }
                    out.push_str(&coerce_to_text(&v));
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else {
                Value::Text(out)
            }
        }
        "LEN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            Value::Number(coerce_to_text(&v).chars().count() as f64)
        }
        "LEFT" => text_slice(args, provider, |s, n| s.chars().take(n).collect()),
        "RIGHT" => text_slice(args, provider, |s, n| {
            let len = s.chars().count();
            s.chars().skip(len.saturating_sub(n)).collect()
        }),
        "MID" => {
            // MID(text, start, length) — start is 1-based
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let s = coerce_to_text(&eval_expr_with_provider(&args[0], provider));
            let start_v = eval_expr_with_provider(&args[1], provider);
            let len_v = eval_expr_with_provider(&args[2], provider);
            match (coerce_to_number(&start_v), coerce_to_number(&len_v)) {
                (Some(start), Some(len)) if start >= 1.0 && len >= 0.0 => {
                    let skip = (start as usize).saturating_sub(1);
                    let take = len as usize;
                    Value::Text(s.chars().skip(skip).take(take).collect())
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "UPPER" => text_unary(args, provider, |s| s.to_uppercase()),
        "LOWER" => text_unary(args, provider, |s| s.to_lowercase()),
        "TRIM" => text_unary(args, provider, |s| s.trim().to_string()),
        "TEXT" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let n = eval_expr_with_provider(&args[0], provider);
            let fmt = coerce_to_text(&eval_expr_with_provider(&args[1], provider));
            let n = match coerce_to_number(&n) {
                Some(v) if v.is_finite() => v,
                Some(_) => return Value::Error(ValueError::Overflow),
                None => return Value::Error(ValueError::WrongType),
            };
            match format_with_text_pattern(n, &fmt) {
                Some(formatted) => Value::Text(formatted),
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        // === Conditional aggregates ===
        "COUNTIF" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // Eval the criterion once outside the streaming loop.
            let criterion = eval_expr_with_provider(&args[1], provider);
            // criteria 实参本身是错误 → 传播（对照：条件区里的错误**格**不短路）。
            if let Value::Error(e) = criterion {
                return Value::Error(e);
            }
            let mut count = 0u64;
            for_each_arg_value(&args[0], provider, &mut |_addr, v| {
                if matches_criterion(&v, &criterion) {
                    count += 1;
                }
            });
            Value::Number(count as f64)
        }
        "SUMIF" => {
            // SUMIF(range, criterion[, sum_range])
            //
            // Two-arg form: stream the single range; sum hits that coerce
            // to a number. O(1) memory.
            //
            // Three-arg form: stream `range`; on each hit, translate the
            // `addr` into the matching cell in `sum_range` by relative
            // offset and call `provider.cell` for the target. Still O(1)
            // memory (no Vec of either range) — at the cost of an extra
            // HashMap lookup per hit, which is cheap.
            if args.len() != 2 && args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let criterion = eval_expr_with_provider(&args[1], provider);
            // criteria 实参本身是错误 → 传播（对照：条件区里的错误**格**不短路）。
            if let Value::Error(e) = criterion {
                return Value::Error(e);
            }
            let mut total = 0.0_f64;
            if args.len() == 2 {
                for_each_arg_value(&args[0], provider, &mut |_addr, v| {
                    if matches_criterion(&v, &criterion) {
                        if let Some(n) = coerce_to_number(&v) {
                            total += n;
                        }
                    }
                });
            } else {
                // Three-arg with offset translation needs both args to be
                // ranges; otherwise fall back to the two-arg behavior
                // (Excel actually broadcasts a single sum_range cell, but
                // the legacy tests here matched index-equality only when
                // both were ranges).
                let range = match &args[0] {
                    Expr::Range { start, end, .. } => Some((*start, *end)),
                    _ => None,
                };
                let sum_range = match &args[2] {
                    Expr::Range { start, end, .. } => Some((*start, *end)),
                    _ => None,
                };
                match (range, sum_range) {
                    (Some((rs, re)), Some((ss, _se))) => {
                        let rs_n = CellRange::new(rs, re).normalize();
                        let ss_n = CellRange::new(ss, ss).normalize();
                        let dr = ss_n.start.row as i64 - rs_n.start.row as i64;
                        let dc = ss_n.start.col as i64 - rs_n.start.col as i64;
                        // 命中行的 sum_range 格子是**值档**，错误要传播（`SUM` 也
                        // 传播，SUMIFS / AVERAGEIF* / MAXIFS / MINIFS 也一样）。
                        // 之前这里靠 `coerce_to_number` 返回 `None` 把错误静默吞
                        // 掉，答案是个看着正常的数 —— 与 TS 参考引擎的 `SUMIF`
                        // 相反。流式回调不能提前返回，所以记下来循环后再交出去。
                        let mut sum_err: Option<ValueError> = None;
                        for_each_arg_value(&args[0], provider, &mut |addr, v| {
                            if sum_err.is_some() {
                                return;
                            }
                            let Some(addr) = addr else { return };
                            if matches_criterion(&v, &criterion) {
                                let r = addr.row as i64 + dr;
                                let c = addr.col as i64 + dc;
                                if r < 0 || c < 0 {
                                    return;
                                }
                                let target = provider.cell(CellAddress::new(r as u32, c as u32));
                                if let Value::Error(e) = target {
                                    sum_err = Some(e);
                                    return;
                                }
                                if let Some(n) = coerce_to_number(&target) {
                                    total += n;
                                }
                            }
                        });
                        if let Some(e) = sum_err {
                            return Value::Error(e);
                        }
                    }
                    _ => {
                        // Non-range args fall back to "broadcast same eval"
                        for_each_arg_value(&args[0], provider, &mut |_addr, v| {
                            if matches_criterion(&v, &criterion) {
                                if let Some(n) = coerce_to_number(&v) {
                                    total += n;
                                }
                            }
                        });
                    }
                }
            }
            Value::Number(total)
        }

        // === Multi-criteria aggregates (COUNTIFS/SUMIFS/AVERAGEIF/AVERAGEIFS/MAXIFS/MINIFS) ===
        //
        // Shape rules: all criteria ranges AND the value range (sum_range /
        // average_range / max_range / min_range) share the same (rows, cols)
        // shape. Shape mismatch → InvalidValue (Excel maps this to #VALUE!).
        //
        // Range arg accepted: literal `Range` / `SheetRange`, or `OFFSET(...)`.
        // Anything else → InvalidValue.
        //
        // Error propagation is per TIER, not per range:
        //
        //   - CRITERIA range — an error cell is just a cell that fails the
        //     criterion, and is skipped. This is what `matches_criterion`
        //     already does for the single-criterion `COUNTIF` / `SUMIF`
        //     above, and Excel applies one criteria semantics to both
        //     (`=COUNTIFS(rng,"<>#N/A",rng,"<>#VALUE!")` answers a COUNT on a
        //     range full of errors rather than handing an error back).
        //   - VALUE range (sum_range / average_range / max_range /
        //     min_range) — an error on a MATCHING row propagates, same as
        //     `SUM`. Unmatched rows are never read, so their errors cannot
        //     leak.
        //
        // For COUNTIFS, "match" is reported on any non-Null criteria cell
        // where the criterion passes — including Text and Boolean — matching
        // Excel's COUNTIFS (which counts on criteria match, not numeric-ness).
        // Sums/averages/min/max only accept `Value::Number(_)`.
        "AVERAGEIF" => {
            // AVERAGEIF(range, criterion[, average_range])
            if args.len() != 2 && args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let crit_range = match resolve_range_arg(&args[0], provider) {
                Some(r) => r,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let value_range = if args.len() == 3 {
                match resolve_range_arg(&args[2], provider) {
                    Some(r) => r,
                    None => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                crit_range.clone()
            };
            if crit_range.rows != value_range.rows || crit_range.cols != value_range.cols {
                return Value::Error(ValueError::InvalidValue);
            }
            let criterion = eval_expr_with_provider(&args[1], provider);
            // criteria 实参本身是错误 → 传播（对照：条件区里的错误**格**不短路）。
            if let Value::Error(e) = criterion {
                return Value::Error(e);
            }
            let mut sum = 0.0_f64;
            let mut count = 0u64;
            for dr in 0..crit_range.rows {
                for dc in 0..crit_range.cols {
                    // 条件区里的错误格 = 不满足条件（见本块开头的分档说明）。
                    let cv = fetch_range_cell(&crit_range, dr, dc, provider);
                    if matches_criterion(&cv, &criterion) {
                        let tv = fetch_range_cell(&value_range, dr, dc, provider);
                        if let Value::Error(e) = tv {
                            return Value::Error(e);
                        }
                        if let Value::Number(n) = tv {
                            sum += n;
                            count += 1;
                        }
                    }
                }
            }
            if count == 0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            Value::Number(sum / count as f64)
        }
        "COUNTIFS" => {
            // COUNTIFS(range1, criterion1, [range2, criterion2, ...])
            if args.is_empty() || args.len() % 2 != 0 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let pairs = match collect_criteria_pairs(args, provider) {
                Ok(p) => p,
                Err(e) => return Value::Error(e),
            };
            // pairs[0] is the shape-defining range.
            let (shape_range, _) = &pairs[0];
            let rows = shape_range.rows;
            let cols = shape_range.cols;
            let mut count = 0u64;
            for dr in 0..rows {
                for dc in 0..cols {
                    let mut all_match = true;
                    let mut has_value = false;
                    for (range, criterion) in &pairs {
                        // 条件区里的错误格 = 不满足条件，交给 `matches_criterion`
                        // 判掉即可，不短路（见本块开头的分档说明）。
                        let cv = fetch_range_cell(range, dr, dc, provider);
                        if !matches!(cv, Value::Null) {
                            has_value = true;
                        }
                        if !matches_criterion(&cv, criterion) {
                            all_match = false;
                            break;
                        }
                    }
                    if all_match && has_value {
                        count += 1;
                    }
                }
            }
            Value::Number(count as f64)
        }
        "SUMIFS" => {
            // SUMIFS(sum_range, range1, criterion1, [range2, criterion2, ...])
            if args.len() < 3 || args.len() % 2 == 0 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let sum_range = match resolve_range_arg(&args[0], provider) {
                Some(r) => r,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let pairs = match collect_criteria_pairs(&args[1..], provider) {
                Ok(p) => p,
                Err(e) => return Value::Error(e),
            };
            for (range, _) in &pairs {
                if range.rows != sum_range.rows || range.cols != sum_range.cols {
                    return Value::Error(ValueError::InvalidValue);
                }
            }
            let mut total = 0.0_f64;
            for dr in 0..sum_range.rows {
                for dc in 0..sum_range.cols {
                    let mut all_match = true;
                    for (range, criterion) in &pairs {
                        // 条件区里的错误格 = 不满足条件，交给 `matches_criterion`
                        // 判掉即可，不短路（见本块开头的分档说明）。
                        let cv = fetch_range_cell(range, dr, dc, provider);
                        if !matches_criterion(&cv, criterion) {
                            all_match = false;
                            break;
                        }
                    }
                    if all_match {
                        let tv = fetch_range_cell(&sum_range, dr, dc, provider);
                        if let Value::Error(e) = tv {
                            return Value::Error(e);
                        }
                        if let Value::Number(n) = tv {
                            total += n;
                        }
                    }
                }
            }
            Value::Number(total)
        }
        "AVERAGEIFS" => {
            // AVERAGEIFS(average_range, range1, criterion1, ...)
            if args.len() < 3 || args.len() % 2 == 0 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let avg_range = match resolve_range_arg(&args[0], provider) {
                Some(r) => r,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let pairs = match collect_criteria_pairs(&args[1..], provider) {
                Ok(p) => p,
                Err(e) => return Value::Error(e),
            };
            for (range, _) in &pairs {
                if range.rows != avg_range.rows || range.cols != avg_range.cols {
                    return Value::Error(ValueError::InvalidValue);
                }
            }
            let mut sum = 0.0_f64;
            let mut count = 0u64;
            for dr in 0..avg_range.rows {
                for dc in 0..avg_range.cols {
                    let mut all_match = true;
                    for (range, criterion) in &pairs {
                        // 条件区里的错误格 = 不满足条件，交给 `matches_criterion`
                        // 判掉即可，不短路（见本块开头的分档说明）。
                        let cv = fetch_range_cell(range, dr, dc, provider);
                        if !matches_criterion(&cv, criterion) {
                            all_match = false;
                            break;
                        }
                    }
                    if all_match {
                        let tv = fetch_range_cell(&avg_range, dr, dc, provider);
                        if let Value::Error(e) = tv {
                            return Value::Error(e);
                        }
                        if let Value::Number(n) = tv {
                            sum += n;
                            count += 1;
                        }
                    }
                }
            }
            if count == 0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            Value::Number(sum / count as f64)
        }
        "MAXIFS" => {
            // MAXIFS(max_range, range1, criterion1, ...)
            if args.len() < 3 || args.len() % 2 == 0 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let max_range = match resolve_range_arg(&args[0], provider) {
                Some(r) => r,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let pairs = match collect_criteria_pairs(&args[1..], provider) {
                Ok(p) => p,
                Err(e) => return Value::Error(e),
            };
            for (range, _) in &pairs {
                if range.rows != max_range.rows || range.cols != max_range.cols {
                    return Value::Error(ValueError::InvalidValue);
                }
            }
            let mut best: Option<f64> = None;
            for dr in 0..max_range.rows {
                for dc in 0..max_range.cols {
                    let mut all_match = true;
                    for (range, criterion) in &pairs {
                        // 条件区里的错误格 = 不满足条件，交给 `matches_criterion`
                        // 判掉即可，不短路（见本块开头的分档说明）。
                        let cv = fetch_range_cell(range, dr, dc, provider);
                        if !matches_criterion(&cv, criterion) {
                            all_match = false;
                            break;
                        }
                    }
                    if all_match {
                        let tv = fetch_range_cell(&max_range, dr, dc, provider);
                        if let Value::Error(e) = tv {
                            return Value::Error(e);
                        }
                        if let Value::Number(n) = tv {
                            best = Some(match best {
                                Some(b) => b.max(n),
                                None => n,
                            });
                        }
                    }
                }
            }
            Value::Number(best.unwrap_or(0.0))
        }
        "MINIFS" => {
            // MINIFS(min_range, range1, criterion1, ...)
            if args.len() < 3 || args.len() % 2 == 0 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let min_range = match resolve_range_arg(&args[0], provider) {
                Some(r) => r,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let pairs = match collect_criteria_pairs(&args[1..], provider) {
                Ok(p) => p,
                Err(e) => return Value::Error(e),
            };
            for (range, _) in &pairs {
                if range.rows != min_range.rows || range.cols != min_range.cols {
                    return Value::Error(ValueError::InvalidValue);
                }
            }
            let mut best: Option<f64> = None;
            for dr in 0..min_range.rows {
                for dc in 0..min_range.cols {
                    let mut all_match = true;
                    for (range, criterion) in &pairs {
                        // 条件区里的错误格 = 不满足条件，交给 `matches_criterion`
                        // 判掉即可，不短路（见本块开头的分档说明）。
                        let cv = fetch_range_cell(range, dr, dc, provider);
                        if !matches_criterion(&cv, criterion) {
                            all_match = false;
                            break;
                        }
                    }
                    if all_match {
                        let tv = fetch_range_cell(&min_range, dr, dc, provider);
                        if let Value::Error(e) = tv {
                            return Value::Error(e);
                        }
                        if let Value::Number(n) = tv {
                            best = Some(match best {
                                Some(b) => b.min(n),
                                None => n,
                            });
                        }
                    }
                }
            }
            Value::Number(best.unwrap_or(0.0))
        }

        // === Phase 5: lookup / stats / dates ===
        "VLOOKUP" => {
            // VLOOKUP(lookup_value, table_range, col_index, [range_lookup])
            // range_lookup: TRUE/omitted = approximate (range must be sorted
            // ascending in col 1; finds largest value ≤ needle), FALSE = exact.
            // Exact mode honors Excel wildcards (`?`, `*`, `~`) when the
            // needle is text; see `lookup_2d`.
            if args.len() < 3 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let needle = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = needle {
                return Value::Error(e);
            }
            let grid = match collect_range_2d_for_arg(&args[1], provider) {
                Some(g) => g,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let col_idx = match coerce_to_number(&eval_expr_with_provider(&args[2], provider)) {
                Some(n) if n >= 1.0 => n as usize,
                _ => return Value::Error(ValueError::WrongType),
            };
            let approximate = if args.len() == 4 {
                coerce_to_bool(&eval_expr_with_provider(&args[3], provider)).unwrap_or(true)
            } else {
                true
            };
            lookup_2d(
                &grid,
                &needle,
                col_idx,
                approximate,
                /* horizontal = */ false,
            )
        }

        "HLOOKUP" => {
            // HLOOKUP shares the `lookup_2d` engine with VLOOKUP — same
            // wildcard rules apply (only in exact-match mode).
            if args.len() < 3 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let needle = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = needle {
                return Value::Error(e);
            }
            let grid = match collect_range_2d_for_arg(&args[1], provider) {
                Some(g) => g,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let row_idx = match coerce_to_number(&eval_expr_with_provider(&args[2], provider)) {
                Some(n) if n >= 1.0 => n as usize,
                _ => return Value::Error(ValueError::WrongType),
            };
            let approximate = if args.len() == 4 {
                coerce_to_bool(&eval_expr_with_provider(&args[3], provider)).unwrap_or(true)
            } else {
                true
            };
            lookup_2d(
                &grid,
                &needle,
                row_idx,
                approximate,
                /* horizontal = */ true,
            )
        }

        "INDEX" => match runtime_ref_from_index(args, provider) {
            Ok(r) => runtime_ref_to_value(&r, provider),
            Err(e) => Value::Error(e),
        },

        "MATCH" => {
            // MATCH(value, range, [match_type])
            //
            // 返回的是命中格在区域内的**绝对位置**（1-based，行主序），由
            // `addr` 相对区域起点算出 —— 不是「第几个被发出来的格子」。
            // 稀疏 provider 不发空格，所以老写法的累加计数器会让空格不占位：
            // `A1=1 / A2 空 / A3=3` 时 `MATCH(3,A1:A3,0)` 答 2 而不是 Excel
            // 的 3。二维区域按行主序数：`A1:B3` 里 B2 是第 4 个、A3 是第 5 个。
            //
            // match_type semantics:
            //   0  → exact match. Text needles with `?`/`*`/`~` engage
            //        Excel wildcard semantics (case-insensitive). The
            //        cell value is coerced to text for the wildcard test,
            //        so `MATCH("4?", {42,3}, 0)` returns 1.
            //   1  → "largest value <= needle". Wildcards NOT honored —
            //        a pattern like "a*" is treated as a literal text key.
            //   -1 → "smallest value >= needle". Wildcards NOT honored.
            //
            // Note: this implementation predates `match_type` plumbing and
            // historically treated *all* invocations as exact-match. We
            // preserve that for type=1/-1 too (no behavior change there);
            // the only new behavior is wildcard expansion when type=0.
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let needle = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = needle {
                return Value::Error(e);
            }
            let match_type: i32 = if args.len() == 3 {
                match coerce_to_number(&eval_expr_with_provider(&args[2], provider)) {
                    Some(n) => n as i32,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                // Excel's true default is 1, but the legacy arm always did
                // exact match; keep that quirk so omitted-3rd-arg tests still
                // pass. Wildcards still engage because we treat default as 0.
                0
            };
            // Pre-check: is this a wildcard-style text needle in exact mode?
            let wildcard_pattern: Option<&str> = if match_type == 0 {
                if let Value::Text(p) = &needle {
                    if pattern_has_wildcard(p) {
                        Some(p.as_str())
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };
            let mut found: Option<u64> = None;
            for_each_arg_value_positioned(&args[1], provider, &mut |pos, v| {
                // 收口取「位置最小的命中」而不是「第一个发出来的命中」。生产
                // provider 的发射顺序是行主序（见 tests/range_materialization_
                // order.rs），两者等价；但位置比较是几何事实，不依赖发射顺序，
                // 而 `pos >= p` 这道守卫同时保留了老写法跳过后续比较的开销。
                if found.is_some_and(|p| pos >= p) {
                    return;
                }
                let hit = match wildcard_pattern {
                    Some(pat) => wildcard_match(pat, &coerce_to_text(&v)),
                    None => values_equal(&v, &needle),
                };
                if hit {
                    found = Some(pos);
                }
            });
            match found {
                Some(p) => Value::Number(p as f64),
                None => Value::Error(ValueError::NotAvailable),
            }
        }

        // Stats
        "MEDIAN" => {
            // Stateful: needs a sorted Vec. Stream through
            // for_each_arg_value so we never create atoms for empty
            // cells in `=MEDIAN(A:A)`-shaped ranges.
            let mut nums: Vec<f64> = Vec::new();
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Number(n) => nums.push(n),
                        Value::Error(e) => err = Some(e),
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                return Value::Error(e);
            }
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let n = nums.len();
            let med = if n % 2 == 1 {
                nums[n / 2]
            } else {
                (nums[n / 2 - 1] + nums[n / 2]) / 2.0
            };
            Value::Number(med)
        }

        "MODE" => {
            // Stateful: bucket-count requires a HashMap. Stream so we
            // skip empty cells; algorithm needs the full list anyway.
            let mut nums: Vec<i64> = Vec::new();
            for arg in args {
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if let Value::Number(n) = v {
                        // Multiply to preserve some decimals; mode for floats
                        // is rare and we want bit-stable hashing.
                        nums.push((n * 1e9).round() as i64);
                    }
                });
            }
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut counts: HashMap<i64, usize> = HashMap::new();
            for n in &nums {
                *counts.entry(*n).or_insert(0) += 1;
            }
            let max_count = counts.values().copied().max().unwrap_or(0);
            if max_count <= 1 {
                return Value::Error(ValueError::InvalidValue);
            }
            // 并列众数取**首次出现**的那个（Excel 口径；隔壁 `stat_mode_mult`
            // 用的也是这条扫描）。这里原本写的是 `counts.iter().max_by_key(..)`
            // —— 遍历的是 `HashMap`，顺序不确定，于是并列的打破是随机的：
            // `A1:A4 = 3,1,1,3` 同一进程内连跑几次，答案会在 3 和 1 之间乱跳
            // （`RandomState` 每 new 一个 HashMap 就换一次种子）。
            let best = nums
                .iter()
                .copied()
                .find(|n| counts[n] == max_count)
                .expect("max_count 取自 counts，必有一个 nums 元素达到它");
            Value::Number(best as f64 / 1e9)
        }

        "STDEV" => {
            // Stateful (two-pass: mean then variance). Vec still here but
            // it's sparse-driven via collect_numbers → for_each_arg_value.
            let nums = collect_numbers(args, provider);
            if nums.len() < 2 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let var =
                nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() as f64 - 1.0);
            Value::Number(var.sqrt())
        }

        "VAR" => {
            let nums = collect_numbers(args, provider);
            if nums.len() < 2 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let var =
                nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() as f64 - 1.0);
            Value::Number(var)
        }

        "LARGE" => {
            // LARGE(range, k) — kth largest, 1-based. Stateful: needs a
            // sorted Vec to pick by rank.
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut nums = collect_numbers(&args[..1], provider);
            let k = match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
                Some(n) if n >= 1.0 => n as usize,
                _ => return Value::Error(ValueError::WrongType),
            };
            if k > nums.len() {
                return Value::Error(ValueError::InvalidValue);
            }
            nums.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
            Value::Number(nums[k - 1])
        }

        "SMALL" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut nums = collect_numbers(&args[..1], provider);
            let k = match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
                Some(n) if n >= 1.0 => n as usize,
                _ => return Value::Error(ValueError::WrongType),
            };
            if k > nums.len() {
                return Value::Error(ValueError::InvalidValue);
            }
            nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            Value::Number(nums[k - 1])
        }

        // Dates: stored as f64 day numbers, epoch = 1970-01-01 → 0.
        "TODAY" => {
            use chrono::{Datelike, Local};
            let today = Local::now().date_naive();
            Value::Number(date_serial(today.year(), today.month(), today.day()))
        }
        "NOW" => {
            // Whole+fractional day count. Fractional part = time-of-day / 86400.
            use chrono::{Datelike, Local, Timelike};
            let now = Local::now();
            let date = now.date_naive();
            let day_serial = date_serial(date.year(), date.month(), date.day());
            let secs_in_day = (now.hour() * 3600 + now.minute() * 60 + now.second()) as f64;
            Value::Number(day_serial + secs_in_day / 86_400.0)
        }
        "DATE" => {
            // DATE(year, month, day) — naive day-count via days-from-epoch.
            // Doesn't handle leap rules of pre-1582 Julian; accurate enough
            // for the demo's range.
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let y = coerce_to_number(&eval_expr_with_provider(&args[0], provider));
            let m = coerce_to_number(&eval_expr_with_provider(&args[1], provider));
            let d = coerce_to_number(&eval_expr_with_provider(&args[2], provider));
            match (y, m, d) {
                (Some(y), Some(m), Some(d)) => {
                    Value::Number(date_serial(y as i32, m as u32, d as u32))
                }
                _ => Value::Error(ValueError::InvalidValue),
            }
        }
        "YEAR" => date_part(args, provider, |y, _, _| y as f64),
        "MONTH" => date_part(args, provider, |_, m, _| m as f64),
        "DAY" => date_part(args, provider, |_, _, d| d as f64),

        // === Dynamic range ===
        // OFFSET(ref, row_offset, col_offset[, height[, width]])
        //
        // When used directly (not as an argument to an aggregate), OFFSET
        // returns the *value* of the top-left cell of the computed range —
        // matching Excel's behaviour when the result is a 1×1 region.
        // When used as a range argument to SUM / COUNT / AVERAGE / VLOOKUP
        // / etc., `for_each_arg_value` and `collect_range_2d_for_arg` detect
        // the OFFSET call and iterate the full computed range instead.
        "OFFSET" => {
            if args.len() < 3 || args.len() > 5 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match eval_offset_as_range(args, provider) {
                Some(range) => provider.cell(range.start),
                None => Value::Error(ValueError::InvalidRef),
            }
        }

        // === B2: extended math ===
        // INT(n) truncates toward -∞ (i.e. floor), so INT(-2.5) = -3.
        "INT" => unary_number(args, provider, f64::floor),
        // TRUNC(n[, digits]) truncates toward zero. Default digits = 0.
        // Negative digits truncate to the left of the decimal point
        // (e.g. TRUNC(123.45, -1) = 120).
        "TRUNC" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let digits = if args.len() == 2 {
                let dv = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = dv {
                    return Value::Error(e);
                }
                match coerce_to_number(&dv) {
                    Some(d) => d.trunc() as i32,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0
            };
            match coerce_to_number(&nv) {
                Some(n) => {
                    let factor = 10f64.powi(digits);
                    let r = (n * factor).trunc() / factor;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "SIGN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let s = if n > 0.0 {
                        1.0
                    } else if n < 0.0 {
                        -1.0
                    } else {
                        0.0
                    };
                    Value::Number(s)
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "EXP" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let r = n.exp();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "LN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n > 0.0 => {
                    let r = n.ln();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "LOG" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let base = if args.len() == 2 {
                let bv = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = bv {
                    return Value::Error(e);
                }
                match coerce_to_number(&bv) {
                    Some(b) => b,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                10.0
            };
            match coerce_to_number(&nv) {
                Some(n) if n > 0.0 && base > 0.0 && base != 1.0 => {
                    let r = n.log(base);
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "LOG10" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n > 0.0 => {
                    let r = n.log10();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "PI" => {
            if !args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            Value::Number(std::f64::consts::PI)
        }
        "ROUNDUP" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let dv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = dv {
                return Value::Error(e);
            }
            match (coerce_to_number(&nv), coerce_to_number(&dv)) {
                (Some(n), Some(d)) => {
                    let factor = 10f64.powi(d.trunc() as i32);
                    let sign = if n < 0.0 { -1.0 } else { 1.0 };
                    let r = (n.abs() * factor).ceil() / factor * sign;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "ROUNDDOWN" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let dv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = dv {
                return Value::Error(e);
            }
            match (coerce_to_number(&nv), coerce_to_number(&dv)) {
                (Some(n), Some(d)) => {
                    let factor = 10f64.powi(d.trunc() as i32);
                    let sign = if n < 0.0 { -1.0 } else { 1.0 };
                    let r = (n.abs() * factor).floor() / factor * sign;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "MROUND" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let mv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = mv {
                return Value::Error(e);
            }
            match (coerce_to_number(&nv), coerce_to_number(&mv)) {
                (Some(_), Some(0.0)) => Value::Number(0.0),
                (Some(n), Some(m)) => {
                    // Excel: sign(n) must match sign(multiple) for both
                    // non-zero, otherwise #NUM!.
                    if n != 0.0 && ((n > 0.0) != (m > 0.0)) {
                        return Value::Error(ValueError::Overflow);
                    }
                    let r = (n / m).round() * m;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "PRODUCT" => {
            // Variadic: walk every arg via for_each_arg_value so range
            // args stream sparsely. Skip Null/Text/Boolean(false); treat
            // Boolean(true) as 1. Errors propagate. With zero numeric
            // contributors, return 0 to match Excel's "empty product → 0"
            // convention for PRODUCT specifically.
            let mut product = 1.0_f64;
            let mut saw_number = false;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            product *= n;
                            saw_number = true;
                        }
                        Value::Boolean(true) => {
                            product *= 1.0;
                            saw_number = true;
                        }
                        Value::Null | Value::Text(_) | Value::Boolean(false) => {}
                        // Unreachable: for_each_arg_value flattens Array.
                        Value::Array(_) => {}
                        // Lambda inside PRODUCT is a type error.
                        Value::Lambda(_) => err = Some(ValueError::WrongType),
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_number {
                Value::Number(0.0)
            } else {
                // 连乘比连加更容易顶破 f64 —— 同一条出口闸门。
                finite_or_overflow(product)
            }
        }
        "QUOTIENT" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let dv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = dv {
                return Value::Error(e);
            }
            match (coerce_to_number(&nv), coerce_to_number(&dv)) {
                (Some(_), Some(0.0)) => Value::Error(ValueError::DivisionByZero),
                (Some(num), Some(den)) => Value::Number((num / den).trunc()),
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "FACT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let trimmed = n.trunc();
                    if trimmed < 0.0 {
                        return Value::Error(ValueError::Overflow);
                    }
                    // 170! ≈ 7.26e306, 171! overflows f64.
                    if trimmed > 170.0 {
                        return Value::Error(ValueError::Overflow);
                    }
                    let k = trimmed as u64;
                    let mut acc = 1.0_f64;
                    for i in 2..=k {
                        acc *= i as f64;
                    }
                    if acc.is_finite() {
                        Value::Number(acc)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "COMBIN" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let kv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = kv {
                return Value::Error(e);
            }
            match (coerce_to_number(&nv), coerce_to_number(&kv)) {
                (Some(n_raw), Some(k_raw)) => {
                    let n = n_raw.trunc();
                    let k = k_raw.trunc();
                    if n < 0.0 || k < 0.0 || k > n {
                        return Value::Error(ValueError::Overflow);
                    }
                    // Symmetry: C(n,k) = C(n, n-k) — pick the smaller k
                    // to keep the loop short and the product bounded.
                    let n_i = n as u64;
                    let mut k_i = k as u64;
                    if k_i > n_i - k_i {
                        k_i = n_i - k_i;
                    }
                    let mut acc = 1.0_f64;
                    for i in 1..=k_i {
                        acc = acc * (n_i - i + 1) as f64 / i as f64;
                        if !acc.is_finite() {
                            return Value::Error(ValueError::Overflow);
                        }
                    }
                    Value::Number(acc.round())
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "GCD" => {
            // Variadic; require ≥ 1 numeric arg. Coerce to non-negative
            // integer; any negative or non-numeric → WrongType.
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut acc: Option<u64> = None;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {} // skip empties from ranges
                        other => match coerce_to_number(&other) {
                            Some(n) if n >= 0.0 && n.is_finite() => {
                                let x = n.trunc() as u64;
                                acc = Some(match acc {
                                    None => x,
                                    Some(a) => gcd_u64(a, x),
                                });
                            }
                            _ => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else {
                match acc {
                    Some(g) => Value::Number(g as f64),
                    None => Value::Error(ValueError::WrongArgCount),
                }
            }
        }
        "LCM" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut acc: Option<u64> = None;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {}
                        other => match coerce_to_number(&other) {
                            Some(n) if n >= 0.0 && n.is_finite() => {
                                let x = n.trunc() as u64;
                                acc = Some(match acc {
                                    None => x,
                                    Some(a) => {
                                        if a == 0 || x == 0 {
                                            0
                                        } else {
                                            // (a / gcd(a,x)) * x with checked mul.
                                            let g = gcd_u64(a, x);
                                            match (a / g).checked_mul(x) {
                                                Some(l) => l,
                                                None => {
                                                    err = Some(ValueError::Overflow);
                                                    return;
                                                }
                                            }
                                        }
                                    }
                                });
                            }
                            _ => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else {
                match acc {
                    Some(l) => Value::Number(l as f64),
                    None => Value::Error(ValueError::WrongArgCount),
                }
            }
        }
        "COUNTA" => {
            // Count of args that come back as anything other than Null.
            // Errors and booleans both count (Excel semantics).
            let mut count = 0u64;
            for arg in args {
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if !matches!(v, Value::Null) {
                        count += 1;
                    }
                });
            }
            Value::Number(count as f64)
        }
        "COUNTBLANK" => {
            // 恰好 1 个实参（Excel 的签名就是单区域；两个实参是 #VALUE!）。
            //
            // **闭式，不物化空格**：稀疏 provider 的 `for_each_range_cell` 只发
            // 非空格，所以「回调里数 Null」永远数不到真正的空格 —— `A:A` 会答 0。
            // 改成拿区域的**矩形格数**减掉**发出来的格子数**：差额就是稀疏遍历
            // 跳过的空格，一个都不用访问。`COUNTBLANK(A:A)` 于是是两次减法，
            // 而不是一百万次迭代。
            //
            // 发出来的格子里还要再挑出「算空」的那些：Excel 的 COUNTBLANK 把
            // **公式算出的空文本 `""` 也算空**（COUNTA 却把它算作非空 —— 两者
            // 不是互补关系）。错误格不算空。
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut emitted = 0u64;
            let mut blank_among_emitted = 0u64;
            let extent = for_each_arg_value_positioned(&args[0], provider, &mut |_pos, v| {
                emitted += 1;
                if value_counts_as_blank(&v) {
                    blank_among_emitted += 1;
                }
            });
            // 非区域实参（标量 / 数组字面量）没有洞，只数发出来的那些。
            let skipped = extent.unwrap_or(emitted).saturating_sub(emitted);
            Value::Number((skipped + blank_among_emitted) as f64)
        }

        // === B3: trig (radians) ===
        "SIN" => unary_number(args, provider, f64::sin),
        "COS" => unary_number(args, provider, f64::cos),
        "TAN" => unary_number(args, provider, f64::tan),
        "ASIN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if (-1.0..=1.0).contains(&n) => Value::Number(n.asin()),
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "ACOS" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if (-1.0..=1.0).contains(&n) => Value::Number(n.acos()),
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "ATAN" => unary_number(args, provider, f64::atan),
        "ATAN2" => {
            // Note: Excel order is ATAN2(x_num, y_num) — but our spec
            // calls for (y, x) matching libm/JS Math.atan2. Per the task
            // description we follow the (y, x) order.
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let yv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = yv {
                return Value::Error(e);
            }
            let xv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = xv {
                return Value::Error(e);
            }
            match (coerce_to_number(&yv), coerce_to_number(&xv)) {
                (Some(y), Some(x)) => {
                    let r = y.atan2(x);
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "RADIANS" => unary_number(args, provider, |d| d * std::f64::consts::PI / 180.0),
        "DEGREES" => unary_number(args, provider, |r| r * 180.0 / std::f64::consts::PI),

        // === Error / type guards (Batch B1) ===
        //
        // IFERROR catches every error. IFNA catches only the dedicated #N/A
        // variant.
        "IFERROR" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Error(_) => eval_expr_with_provider(&args[1], provider),
                other => other,
            }
        }
        "IFNA" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Error(ValueError::NotAvailable) => {
                    eval_expr_with_provider(&args[1], provider)
                }
                other => other,
            }
        }
        "IFS" => {
            // IFS(cond1, val1, cond2, val2, ...) — variadic; pairs only.
            if args.is_empty() || args.len() % 2 != 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut i = 0;
            while i < args.len() {
                let cond = eval_expr_with_provider(&args[i], provider);
                if let Value::Error(e) = cond {
                    return Value::Error(e);
                }
                let is_true = match cond {
                    Value::Boolean(b) => b,
                    Value::Number(n) => n != 0.0,
                    _ => false,
                };
                if is_true {
                    return eval_expr_with_provider(&args[i + 1], provider);
                }
                i += 2;
            }
            Value::Error(ValueError::InvalidValue)
        }
        "SWITCH" => {
            // SWITCH(expr, case1, val1, [case2, val2, ...], [default]).
            // Need at least expr + one (case, val) pair = 3 args.
            if args.len() < 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let expr_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = expr_v {
                return Value::Error(e);
            }
            // After the leading expr we walk (case, val) pairs. An odd
            // remainder after the leading arg is the default.
            let rest = &args[1..];
            let mut i = 0;
            while i + 1 < rest.len() {
                let case_v = eval_expr_with_provider(&rest[i], provider);
                if values_equal(&expr_v, &case_v) {
                    return eval_expr_with_provider(&rest[i + 1], provider);
                }
                i += 2;
            }
            // Trailing default?
            if i < rest.len() {
                return eval_expr_with_provider(&rest[i], provider);
            }
            Value::Error(ValueError::InvalidValue)
        }
        "XOR" => {
            // Variadic; result = (count of TRUE is odd). Errors propagate;
            // non-coercible values surface as WrongType.
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut true_count = 0u64;
            let mut saw_any = false;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {}
                        other => match coerce_to_bool(&other) {
                            Some(b) => {
                                saw_any = true;
                                if b {
                                    true_count += 1;
                                }
                            }
                            None => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_any {
                Value::Error(ValueError::WrongArgCount)
            } else {
                Value::Boolean(true_count % 2 == 1)
            }
        }

        // === IS* family — never propagate errors, they classify them. ===
        "ISNUMBER" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Number(_)))
        }
        "ISTEXT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Text(_)))
        }
        "ISBLANK" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Null))
        }
        "ISERROR" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Error(_)))
        }
        "ISERR" => {
            // Excel: ISERR = ISERROR and not #N/A.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Error(e) if !matches!(e, ValueError::NotAvailable)))
        }
        "ISNA" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Error(ValueError::NotAvailable)))
        }
        "ISLOGICAL" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Boolean(_)))
        }
        "ISNONTEXT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(!matches!(v, Value::Text(_)))
        }
        "ISEVEN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => Value::Boolean((n.trunc() as i64) % 2 == 0),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "ISODD" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => Value::Boolean((n.trunc() as i64) % 2 != 0),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "N" => {
            // Excel quirk: N("anything") = 0; bool → 1/0; null → 0; error
            // propagates.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Number(n) => Value::Number(n),
                Value::Boolean(true) => Value::Number(1.0),
                Value::Boolean(false) => Value::Number(0.0),
                Value::Null => Value::Number(0.0),
                Value::Text(_) => Value::Number(0.0),
                Value::Error(e) => Value::Error(e),
                // Dynamic-array: collapse to top-left then re-classify.
                // Phase 1 unreachable until a constructor produces Array.
                Value::Array(arr) => match arr.get(0, 0).cloned().unwrap_or(Value::Null) {
                    Value::Number(n) => Value::Number(n),
                    Value::Boolean(true) => Value::Number(1.0),
                    _ => Value::Number(0.0),
                },
                // N of a lambda is meaningless — return 0 (Excel would
                // surface #VALUE!; we keep the existing tolerant policy).
                Value::Lambda(_) => Value::Number(0.0),
            }
        }
        "TYPE" => {
            // 1=Number, 2=Text, 4=Boolean, 16=Error. Null coerces to 0
            // (Excel returns 1 for empty cells). Excel uses 64 for arrays.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            let code = match v {
                Value::Number(_) => 1.0,
                Value::Text(_) => 2.0,
                Value::Boolean(_) => 4.0,
                Value::Error(_) => 16.0,
                Value::Null => 1.0,
                Value::Array(_) => 64.0,
                // No Excel code for lambda; closest match is 128 (a value
                // category Excel reserves). Use 128 distinctly so callers
                // can detect lambda-typed values.
                Value::Lambda(_) => 128.0,
            };
            Value::Number(code)
        }

        // === Text expansion (Batch B4) ===
        // FIND(find_text, within_text[, start_num]) — case-sensitive, 1-based.
        // Char-based indexing (never byte offsets on &str).
        "FIND" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let find_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = find_v {
                return Value::Error(e);
            }
            let within_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = within_v {
                return Value::Error(e);
            }
            let start_num = if args.len() == 3 {
                let s = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = s {
                    return Value::Error(e);
                }
                match coerce_to_number(&s) {
                    Some(n) if n >= 1.0 => n as usize,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1
            };
            let find_text = coerce_to_text(&find_v);
            let within_text = coerce_to_text(&within_v);
            // Empty needle: Excel returns start_num itself.
            if find_text.is_empty() {
                if start_num > within_text.chars().count() + 1 {
                    return Value::Error(ValueError::InvalidValue);
                }
                return Value::Number(start_num as f64);
            }
            let needle_chars: Vec<char> = find_text.chars().collect();
            let haystack_chars: Vec<char> = within_text.chars().collect();
            if start_num > haystack_chars.len() {
                return Value::Error(ValueError::InvalidValue);
            }
            let start_idx = start_num - 1;
            // Walk char-by-char starting at start_idx.
            let mut i = start_idx;
            while i + needle_chars.len() <= haystack_chars.len() {
                if haystack_chars[i..i + needle_chars.len()] == needle_chars[..] {
                    return Value::Number((i + 1) as f64);
                }
                i += 1;
            }
            Value::Error(ValueError::InvalidValue)
        }

        // SEARCH(find_text, within_text[, start_num]) — case-insensitive, 1-based.
        // no wildcard support yet
        "SEARCH" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let find_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = find_v {
                return Value::Error(e);
            }
            let within_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = within_v {
                return Value::Error(e);
            }
            let start_num = if args.len() == 3 {
                let s = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = s {
                    return Value::Error(e);
                }
                match coerce_to_number(&s) {
                    Some(n) if n >= 1.0 => n as usize,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1
            };
            let find_text = coerce_to_text(&find_v).to_lowercase();
            let within_text = coerce_to_text(&within_v).to_lowercase();
            if find_text.is_empty() {
                if start_num > within_text.chars().count() + 1 {
                    return Value::Error(ValueError::InvalidValue);
                }
                return Value::Number(start_num as f64);
            }
            let needle_chars: Vec<char> = find_text.chars().collect();
            let haystack_chars: Vec<char> = within_text.chars().collect();
            if start_num > haystack_chars.len() {
                return Value::Error(ValueError::InvalidValue);
            }
            let start_idx = start_num - 1;
            let mut i = start_idx;
            while i + needle_chars.len() <= haystack_chars.len() {
                if haystack_chars[i..i + needle_chars.len()] == needle_chars[..] {
                    return Value::Number((i + 1) as f64);
                }
                i += 1;
            }
            Value::Error(ValueError::InvalidValue)
        }

        // SUBSTITUTE(text, old, new[, instance_num]).
        // Char-based to avoid byte-offset bugs on multi-byte strings.
        "SUBSTITUTE" => {
            if args.len() < 3 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let text_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = text_v {
                return Value::Error(e);
            }
            let old_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = old_v {
                return Value::Error(e);
            }
            let new_v = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = new_v {
                return Value::Error(e);
            }
            let instance: Option<usize> = if args.len() == 4 {
                let i = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = i {
                    return Value::Error(e);
                }
                match coerce_to_number(&i) {
                    Some(n) if n >= 1.0 => Some(n as usize),
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                None
            };
            let text = coerce_to_text(&text_v);
            let old = coerce_to_text(&old_v);
            let new_s = coerce_to_text(&new_v);
            if old.is_empty() {
                return Value::Text(text);
            }
            let text_chars: Vec<char> = text.chars().collect();
            let old_chars: Vec<char> = old.chars().collect();
            let mut out = String::new();
            let mut i = 0;
            let mut hit = 0usize;
            while i < text_chars.len() {
                if i + old_chars.len() <= text_chars.len()
                    && text_chars[i..i + old_chars.len()] == old_chars[..]
                {
                    hit += 1;
                    let replace_here = match instance {
                        Some(n) => hit == n,
                        None => true,
                    };
                    if replace_here {
                        out.push_str(&new_s);
                    } else {
                        for c in &old_chars {
                            out.push(*c);
                        }
                    }
                    i += old_chars.len();
                } else {
                    out.push(text_chars[i]);
                    i += 1;
                }
            }
            Value::Text(out)
        }

        // REPLACE(text, start_num, num_chars, new_text). 1-based char position.
        "REPLACE" => {
            if args.len() != 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let text_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = text_v {
                return Value::Error(e);
            }
            let start_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = start_v {
                return Value::Error(e);
            }
            let num_v = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = num_v {
                return Value::Error(e);
            }
            let new_v = eval_expr_with_provider(&args[3], provider);
            if let Value::Error(e) = new_v {
                return Value::Error(e);
            }
            let start = match coerce_to_number(&start_v) {
                Some(n) if n >= 1.0 => n as usize,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let num = match coerce_to_number(&num_v) {
                Some(n) if n >= 0.0 => n as usize,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let text = coerce_to_text(&text_v);
            let new_s = coerce_to_text(&new_v);
            let text_chars: Vec<char> = text.chars().collect();
            let len = text_chars.len();
            let start_idx = start - 1; // 1-based -> 0-based
                                       // start past end → append.
            let prefix_end = start_idx.min(len);
            let cut_end = (start_idx + num).min(len);
            let mut out = String::new();
            for c in &text_chars[..prefix_end] {
                out.push(*c);
            }
            out.push_str(&new_s);
            for c in &text_chars[cut_end..] {
                out.push(*c);
            }
            Value::Text(out)
        }

        // REPT(text, n) — char-count limit 32767 per Excel.
        "REPT" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let text_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = text_v {
                return Value::Error(e);
            }
            let n_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = n_v {
                return Value::Error(e);
            }
            let n_f = match coerce_to_number(&n_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            // trunc, reject negative
            let n_trunc = n_f.trunc();
            if n_trunc < 0.0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let n = n_trunc as usize;
            if n == 0 {
                return Value::Text(String::new());
            }
            let text = coerce_to_text(&text_v);
            let char_count = text.chars().count();
            // Char-count cap (Excel: 32767).
            let total = char_count.checked_mul(n);
            match total {
                Some(t) if t <= 32767 => {
                    let mut out = String::with_capacity(text.len() * n);
                    for _ in 0..n {
                        out.push_str(&text);
                    }
                    Value::Text(out)
                }
                _ => Value::Error(ValueError::InvalidValue),
            }
        }

        // EXACT(a, b) — case-sensitive text equality.
        "EXACT" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let a = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = a {
                return Value::Error(e);
            }
            let b = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = b {
                return Value::Error(e);
            }
            Value::Boolean(coerce_to_text(&a) == coerce_to_text(&b))
        }

        // VALUE(text) — coerce text to number.
        "VALUE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Error(e) => Value::Error(e),
                Value::Number(n) => Value::Number(n),
                Value::Boolean(true) => Value::Number(1.0),
                Value::Boolean(false) => Value::Number(0.0),
                Value::Null => Value::Number(0.0),
                Value::Text(s) => match s.trim().parse::<f64>() {
                    Ok(n) => Value::Number(n),
                    Err(_) => Value::Error(ValueError::InvalidValue),
                },
                // Dynamic-array: collapse to top-left. Phase 1 unreachable
                // — no constructor produces Array yet.
                Value::Array(arr) => match arr.get(0, 0).cloned().unwrap_or(Value::Null) {
                    Value::Number(n) => Value::Number(n),
                    Value::Boolean(true) => Value::Number(1.0),
                    Value::Boolean(false) | Value::Null => Value::Number(0.0),
                    Value::Text(s) => match s.trim().parse::<f64>() {
                        Ok(n) => Value::Number(n),
                        Err(_) => Value::Error(ValueError::InvalidValue),
                    },
                    Value::Error(e) => Value::Error(e),
                    Value::Array(_) => Value::Error(ValueError::WrongType),
                    Value::Lambda(_) => Value::Error(ValueError::WrongType),
                },
                // VALUE(lambda) — type error.
                Value::Lambda(_) => Value::Error(ValueError::WrongType),
            }
        }

        // T(v) — return Text if v is text, otherwise empty text.
        "T" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Error(e) => Value::Error(e),
                Value::Text(s) => Value::Text(s),
                _ => Value::Text(String::new()),
            }
        }

        // CHAR(n) — full Unicode 1..=1_114_111 (broader than Excel's 1..=255).
        "CHAR" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let n_f = match coerce_to_number(&v) {
                Some(n) => n.trunc(),
                None => return Value::Error(ValueError::WrongType),
            };
            if !(1.0..=1_114_111.0).contains(&n_f) {
                return Value::Error(ValueError::InvalidValue);
            }
            match char::from_u32(n_f as u32) {
                Some(c) => Value::Text(c.to_string()),
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        // CODE(text) — first char code point.
        "CODE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let s = coerce_to_text(&v);
            match s.chars().next() {
                Some(c) => Value::Number(c as u32 as f64),
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        // CLEAN(text) — strip ASCII control chars (0..=31).
        "CLEAN" => text_unary(args, provider, |s| {
            s.chars().filter(|c| (*c as u32) > 31).collect()
        }),

        // PROPER(text) — capitalize first alpha of each word.
        "PROPER" => text_unary(args, provider, |s| {
            let mut out = String::with_capacity(s.len());
            let mut start_of_word = true;
            for c in s.chars() {
                if c.is_alphabetic() {
                    if start_of_word {
                        for u in c.to_uppercase() {
                            out.push(u);
                        }
                    } else {
                        for u in c.to_lowercase() {
                            out.push(u);
                        }
                    }
                    start_of_word = false;
                } else {
                    out.push(c);
                    start_of_word = true;
                }
            }
            out
        }),

        // TEXTJOIN(delim, ignore_empty, ...). 见 `text_join_delimited`。
        "TEXTJOIN" => text_join_delimited(args, provider),

        // === Reference / lookup ===
        // ROW([ref]) — return the 1-based row number of `ref`. `ref` must be a
        // direct cell/range/sheet-ref/sheet-range expression (we do not
        // evaluate it; we read its anchor row).
        "ROW" => {
            if args.len() > 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            if args.is_empty() {
                return provider
                    .current_cell()
                    .map(|a| Value::Number((a.row + 1) as f64))
                    .unwrap_or(Value::Error(ValueError::InvalidRef));
            }
            match &args[0] {
                Expr::CellRef(addr, _) | Expr::SheetRef { addr, .. } => {
                    Value::Number((addr.row + 1) as f64)
                }
                Expr::Range { start, .. } | Expr::SheetRange { start, .. } => {
                    Value::Number((start.row + 1) as f64)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }

        // COLUMN([ref]) — symmetric to ROW; returns the 1-based column number.
        "COLUMN" => {
            if args.len() > 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            if args.is_empty() {
                return provider
                    .current_cell()
                    .map(|a| Value::Number((a.col + 1) as f64))
                    .unwrap_or(Value::Error(ValueError::InvalidRef));
            }
            match &args[0] {
                Expr::CellRef(addr, _) | Expr::SheetRef { addr, .. } => {
                    Value::Number((addr.col + 1) as f64)
                }
                Expr::Range { start, .. } | Expr::SheetRange { start, .. } => {
                    Value::Number((start.col + 1) as f64)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }

        // ROWS(range) — 1-based count of rows in the supplied range. A single
        // cell is treated as a 1×1 range (height 1).
        "ROWS" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match runtime_ref_from_expr(&args[0], provider) {
                Ok(r) => match r.bounded_shape() {
                    Some((rows, _)) => Value::Number(rows as f64),
                    None => Value::Error(ValueError::InvalidValue),
                },
                Err(ValueError::InvalidValue) => Value::Error(ValueError::WrongType),
                Err(e) => Value::Error(e),
            }
        }

        // COLUMNS(range) — symmetric to ROWS.
        "COLUMNS" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match runtime_ref_from_expr(&args[0], provider) {
                Ok(r) => match r.bounded_shape() {
                    Some((_, cols)) => Value::Number(cols as f64),
                    None => Value::Error(ValueError::InvalidValue),
                },
                Err(ValueError::InvalidValue) => Value::Error(ValueError::WrongType),
                Err(e) => Value::Error(e),
            }
        }

        // CHOOSE(index, val1, val2, ...) — pick the 1-based indexed argument.
        // `index` is evaluated, coerced to a number, and truncated. Only the
        // selected argument is then evaluated (deferred evaluation parity with
        // Excel's lazy CHOOSE semantics).
        "CHOOSE" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let iv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = iv {
                return Value::Error(e);
            }
            let idx_f = match coerce_to_number(&iv) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            // valid range is 1..=N, where N = args.len() - 1
            if idx_f < 1 || (idx_f as usize) > args.len() - 1 {
                return Value::Error(ValueError::InvalidValue);
            }
            eval_expr_with_provider(&args[idx_f as usize], provider)
        }

        // ADDRESS(row, col[, abs_num=1[, a1=TRUE[, sheet_name=""]]])
        // Build an A1- or R1C1-style address string. `row` / `col` are
        // 1-based; `abs_num` maps 1..=4 to all four absolute/relative
        // permutations.
        "ADDRESS" => {
            if args.len() < 2 || args.len() > 5 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let row_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = row_v {
                return Value::Error(e);
            }
            let col_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = col_v {
                return Value::Error(e);
            }
            let row = match coerce_to_number(&row_v) {
                Some(n) if n >= 1.0 && n.is_finite() => n.trunc() as i64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let col = match coerce_to_number(&col_v) {
                Some(n) if n >= 1.0 && n.is_finite() => n.trunc() as i64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let abs_num = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1
            };
            if !(1..=4).contains(&abs_num) {
                return Value::Error(ValueError::InvalidValue);
            }
            let a1 = if args.len() >= 4 {
                let v = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_bool(&v) {
                    Some(b) => b,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                true
            };
            let sheet_prefix = if args.len() == 5 {
                let v = eval_expr_with_provider(&args[4], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                let s = coerce_to_text(&v);
                if s.is_empty() {
                    String::new()
                } else if s.contains(' ') {
                    format!("'{}'!", s)
                } else {
                    format!("{}!", s)
                }
            } else {
                String::new()
            };

            let body = if a1 {
                // abs_num: 1=$A$1, 2=A$1, 3=$A1, 4=A1
                let (row_abs, col_abs) = match abs_num {
                    1 => (true, true),
                    2 => (true, false),
                    3 => (false, true),
                    4 => (false, false),
                    _ => unreachable!(),
                };
                let col_letters = col_index_to_letters_eval((col - 1) as u32);
                let col_part = if col_abs {
                    format!("${}", col_letters)
                } else {
                    col_letters
                };
                let row_part = if row_abs {
                    format!("${}", row)
                } else {
                    format!("{}", row)
                };
                format!("{}{}", col_part, row_part)
            } else {
                // R1C1: 1=R1C1, 2=R1C[1], 3=R[1]C1, 4=R[1]C[1]
                let (row_abs, col_abs) = match abs_num {
                    1 => (true, true),
                    2 => (true, false),
                    3 => (false, true),
                    4 => (false, false),
                    _ => unreachable!(),
                };
                let row_part = if row_abs {
                    format!("R{}", row)
                } else {
                    format!("R[{}]", row)
                };
                let col_part = if col_abs {
                    format!("C{}", col)
                } else {
                    format!("C[{}]", col)
                };
                format!("{}{}", row_part, col_part)
            };
            Value::Text(format!("{}{}", sheet_prefix, body))
        }

        // INDIRECT(ref_text[, a1=TRUE]) — parse a string into a reference and
        // return the referenced cell's value. A1-style only. Range text
        // resolves to the first (top-left) cell — parity with the OFFSET arm
        // pattern that returns `provider.cell(range.start)` for a
        // multi-cell anchor.
        "INDIRECT" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let ref_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = ref_v {
                return Value::Error(e);
            }
            let a1 = if args.len() == 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_bool(&v) {
                    Some(b) => b,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                true
            };
            if !a1 {
                // R1C1 form not yet supported by the parser path; surface
                // #REF! rather than silently picking the wrong cell.
                return Value::Error(ValueError::InvalidRef);
            }
            let text = coerce_to_text(&ref_v);
            match parse_indirect_ref(&text) {
                Some((sheet, start, _end)) => match sheet {
                    Some(s) => provider.sheet_cell(&s, start),
                    None => provider.cell(start),
                },
                None => Value::Error(ValueError::InvalidRef),
            }
        }

        // XLOOKUP(lookup, lookup_array, return_array[, if_not_found[,
        //         match_mode=0[, search_mode=1]]])
        //
        // match_mode:
        //   0  exact (default) — return first/last exact match
        //  -1  exact or next smaller — exact, else largest key <= needle
        //   1  exact or next larger — exact, else smallest key >= needle
        //   2  wildcard (text only) — needle is a wildcard pattern; walk
        //      lookup_array and return the first cell whose text rep matches.
        //
        // search_mode:
        //   1  forward, first-to-last (default)
        //  -1  reverse, last-to-first
        //   2  binary search, ascending-sorted lookup_array
        //  -2  binary search, descending-sorted lookup_array
        //
        // Combination notes:
        // - Wildcard (match_mode=2) requires a linear scan (wildcards have no
        //   ordering), so search_mode must be 1 or -1; ±2 with wildcard
        //   returns #VALUE!.
        // - Approximate (match_mode=±1) with binary (search_mode=±2) is
        //   supported and uses partition_point on the sorted array — O(log n).
        // - Binary search modes ASSUME the array is sorted as advertised; we
        //   do not verify, matching Excel's documented contract. (Caller's
        //   responsibility, per stdlib `binary_search` semantics.)
        "XLOOKUP" => {
            if args.len() < 3 || args.len() > 6 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let needle = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = needle {
                return Value::Error(e);
            }
            // Parse match_mode (default 0).
            let match_mode: i64 = if args.len() >= 5 {
                let mv = eval_expr_with_provider(&args[4], provider);
                if let Value::Error(e) = mv {
                    return Value::Error(e);
                }
                match coerce_to_number(&mv) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                0
            };
            if !matches!(match_mode, -1 | 0 | 1 | 2) {
                return Value::Error(ValueError::InvalidValue);
            }
            // Parse search_mode (default 1).
            let search_mode: i64 = if args.len() == 6 {
                let sv = eval_expr_with_provider(&args[5], provider);
                if let Value::Error(e) = sv {
                    return Value::Error(e);
                }
                match coerce_to_number(&sv) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1
            };
            if !matches!(search_mode, -2 | -1 | 1 | 2) {
                return Value::Error(ValueError::InvalidValue);
            }
            // Wildcard match cannot use binary search (no ordering of patterns).
            if match_mode == 2 && (search_mode == 2 || search_mode == -2) {
                return Value::Error(ValueError::InvalidValue);
            }
            // For wildcard mode, the needle MUST be text.
            if match_mode == 2 && !matches!(needle, Value::Text(_)) {
                return Value::Error(ValueError::WrongType);
            }
            // Both arrays must be ranges (lookup and return). Same linear
            // cell count required.
            let lookup_grid = match collect_range_2d_for_arg(&args[1], provider) {
                Some(g) => g,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let return_grid = match collect_range_2d_for_arg(&args[2], provider) {
                Some(g) => g,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let lookup_flat: Vec<Value> = lookup_grid
                .into_iter()
                .flat_map(|r| r.into_iter())
                .collect();
            let return_flat: Vec<Value> = return_grid
                .into_iter()
                .flat_map(|r| r.into_iter())
                .collect();
            if lookup_flat.len() != return_flat.len() || lookup_flat.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            // Propagate any error cell inside lookup_array (per existing
            // behavior).
            for k in lookup_flat.iter() {
                if let Value::Error(e) = k {
                    return Value::Error(e.clone());
                }
            }
            let n = lookup_flat.len();
            // Helper: produce the not-found fallback.
            let not_found = |this_args: &[Expr]| -> Value {
                if this_args.len() >= 4 {
                    eval_expr_with_provider(&this_args[3], provider)
                } else {
                    Value::Error(ValueError::NotAvailable)
                }
            };

            // Compute the index of the matching cell (if any) given the mode
            // combination.
            let found: Option<usize> = match (match_mode, search_mode) {
                // --- Exact match -----------------------------------------
                (0, 1) => lookup_flat.iter().position(|k| values_equal(k, &needle)),
                (0, -1) => lookup_flat.iter().rposition(|k| values_equal(k, &needle)),
                (0, 2) => {
                    // Binary search ascending for the first exact match.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(probe, &needle)) {
                        Ok(i) => Some(i),
                        Err(_) => None,
                    }
                }
                (0, -2) => {
                    // Binary search descending: reverse the comparator.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(&needle, probe)) {
                        Ok(i) => Some(i),
                        Err(_) => None,
                    }
                }
                // --- Approximate next-smaller (-1) -----------------------
                (-1, 1) | (-1, -1) => {
                    // Linear scan: prefer exact; otherwise pick the largest
                    // key still <= needle. Direction (forward / reverse)
                    // only affects which equal candidate wins, but values
                    // equal under `compare_lookup` are returned eagerly the
                    // first time exact is detected, so behavior is the
                    // same. We still respect direction for the "best ≤"
                    // tie-break: forward keeps the first qualifying index,
                    // reverse keeps the last.
                    let mut best: Option<(usize, &Value)> = None;
                    let iter: Box<dyn Iterator<Item = (usize, &Value)>> = if search_mode == 1 {
                        Box::new(lookup_flat.iter().enumerate())
                    } else {
                        Box::new(lookup_flat.iter().enumerate().rev())
                    };
                    let mut exact: Option<usize> = None;
                    for (i, k) in iter {
                        if values_equal(k, &needle) {
                            exact = Some(i);
                            break;
                        }
                        if compare_lookup(k, &needle).is_lt() {
                            match best {
                                None => best = Some((i, k)),
                                Some((_, prev)) => {
                                    if compare_lookup(k, prev).is_gt() {
                                        best = Some((i, k));
                                    }
                                }
                            }
                        }
                    }
                    exact.or(best.map(|(i, _)| i))
                }
                (-1, 2) => {
                    // Ascending binary search for exact-or-next-smaller.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(probe, &needle)) {
                        Ok(i) => Some(i),
                        Err(i) => {
                            // Insertion point: everything below i is < needle.
                            if i == 0 {
                                None
                            } else {
                                Some(i - 1)
                            }
                        }
                    }
                }
                (-1, -2) => {
                    // Descending binary search for exact-or-next-smaller.
                    // In a descending array, the first element <= needle is
                    // the insertion point.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(&needle, probe)) {
                        Ok(i) => Some(i),
                        Err(i) => {
                            if i >= n {
                                None
                            } else {
                                Some(i)
                            }
                        }
                    }
                }
                // --- Approximate next-larger (1) -------------------------
                (1, 1) | (1, -1) => {
                    let mut best: Option<(usize, &Value)> = None;
                    let iter: Box<dyn Iterator<Item = (usize, &Value)>> = if search_mode == 1 {
                        Box::new(lookup_flat.iter().enumerate())
                    } else {
                        Box::new(lookup_flat.iter().enumerate().rev())
                    };
                    let mut exact: Option<usize> = None;
                    for (i, k) in iter {
                        if values_equal(k, &needle) {
                            exact = Some(i);
                            break;
                        }
                        if compare_lookup(k, &needle).is_gt() {
                            match best {
                                None => best = Some((i, k)),
                                Some((_, prev)) => {
                                    if compare_lookup(k, prev).is_lt() {
                                        best = Some((i, k));
                                    }
                                }
                            }
                        }
                    }
                    exact.or(best.map(|(i, _)| i))
                }
                (1, 2) => {
                    // Ascending binary search for exact-or-next-larger.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(probe, &needle)) {
                        Ok(i) => Some(i),
                        Err(i) => {
                            // Insertion point: everything at i and above is
                            // >= needle. So index i is the next-larger.
                            if i >= n {
                                None
                            } else {
                                Some(i)
                            }
                        }
                    }
                }
                (1, -2) => {
                    // Descending binary search for exact-or-next-larger.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(&needle, probe)) {
                        Ok(i) => Some(i),
                        Err(i) => {
                            // In a descending array, the element just before
                            // the insertion point is the smallest one still
                            // >= needle.
                            if i == 0 {
                                None
                            } else {
                                Some(i - 1)
                            }
                        }
                    }
                }
                // --- Wildcard (text-only) --------------------------------
                (2, 1) => {
                    let pattern = coerce_to_text(&needle);
                    lookup_flat
                        .iter()
                        .position(|k| wildcard_match(&pattern, &coerce_to_text(k)))
                }
                (2, -1) => {
                    let pattern = coerce_to_text(&needle);
                    lookup_flat
                        .iter()
                        .rposition(|k| wildcard_match(&pattern, &coerce_to_text(k)))
                }
                // Wildcard + binary excluded above; any other mode pair was
                // already rejected. Catch-all defensively.
                _ => return Value::Error(ValueError::InvalidValue),
            };
            match found {
                Some(i) => return_flat[i].clone(),
                None => not_found(args),
            }
        }

        // HOUR(serial) — extract hour 0..23 from fractional-day serial.
        // Uses only the fractional part of the serial. For negative serials
        // we add 1 so the fraction is always in [0, 1).
        "HOUR" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let frac = n - n.floor();
                    Value::Number((frac * 24.0).floor())
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // MINUTE(serial) — extract minute 0..59.
        "MINUTE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let frac = n - n.floor();
                    Value::Number(((frac * 1440.0).floor() as i64 % 60) as f64)
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // SECOND(serial) — extract second 0..59. Round (not floor) to avoid
        // drift from binary-fraction representation of times.
        "SECOND" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let frac = n - n.floor();
                    Value::Number(((frac * 86400.0).round() as i64 % 60) as f64)
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // TIME(h, m, s) → fractional day. Excel allows wrap-around
        // (TIME(25,0,0) = 25/24); negative components → InvalidValue.
        "TIME" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let h = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = h {
                return Value::Error(e);
            }
            let m = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = m {
                return Value::Error(e);
            }
            let s = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = s {
                return Value::Error(e);
            }
            match (
                coerce_to_number(&h),
                coerce_to_number(&m),
                coerce_to_number(&s),
            ) {
                (Some(h), Some(m), Some(s)) => {
                    if h < 0.0 || m < 0.0 || s < 0.0 {
                        return Value::Error(ValueError::InvalidValue);
                    }
                    Value::Number((h * 3600.0 + m * 60.0 + s) / 86400.0)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // WEEKDAY(serial[, return_type]).
        //
        // Epoch note: this codebase uses 1970-01-01 = serial 0 (Unix-style),
        // not Excel's 1900 epoch. 1970-01-01 was a Thursday, so the
        // Sunday-indexed day-of-week is `((floor(serial)) + 4) mod 7`.
        "WEEKDAY" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let serial = match coerce_to_number(&v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let return_type = if args.len() == 2 {
                let rt = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = rt {
                    return Value::Error(e);
                }
                match coerce_to_number(&rt) {
                    Some(n) => n as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1
            };
            // Sunday=0..Saturday=6 in our intermediate.
            let dow = ((serial.floor() as i64) + 4).rem_euclid(7);
            let result = match return_type {
                1 => dow + 1,             // Sun=1..Sat=7
                2 => ((dow + 6) % 7) + 1, // Mon=1..Sun=7
                3 => (dow + 6) % 7,       // Mon=0..Sun=6
                _ => return Value::Error(ValueError::InvalidValue),
            };
            Value::Number(result as f64)
        }
        // WEEKNUM(serial[, return_type]).
        //
        // Simple "Excel default" semantics: week 1 starts Jan 1 of the
        // serial's year. Each new week begins on the configured start day
        // (Sun for return_type=1, Mon for return_type=2). Other return_type
        // values → InvalidValue (narrow support — ISO 8601 week number is
        // intentionally out of scope here).
        "WEEKNUM" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let serial = match coerce_to_number(&v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let return_type = if args.len() == 2 {
                let rt = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = rt {
                    return Value::Error(e);
                }
                match coerce_to_number(&rt) {
                    Some(n) => n as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1
            };
            // start_offset: weekday index that counts as "0" within the week.
            // return_type=1 → week starts Sunday (Sun=0); return_type=2 → Mon=0.
            let start_offset: i64 = match return_type {
                1 => 0, // Sunday
                2 => 1, // Monday
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let (y, _, _) = date_from_serial(serial);
            let jan1 = date_serial(y, 1, 1);
            // Sunday=0..Saturday=6 for jan1.
            let jan1_dow = ((jan1.floor() as i64) + 4).rem_euclid(7);
            // Day-of-year, 0-based.
            let doy = serial.floor() as i64 - jan1.floor() as i64;
            // Position within week 1 of jan1: how many days into the week
            // jan1 sits (e.g. if week starts Sun and jan1 is Tue, jan1 is
            // at offset 2 → week 1 has 5 remaining days, week 2 starts on
            // day 5).
            let jan1_in_week = (jan1_dow - start_offset).rem_euclid(7);
            let week = (doy + jan1_in_week) / 7 + 1;
            Value::Number(week as f64)
        }
        // EOMONTH(start, months) — last day of the month `months` after start.
        "EOMONTH" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let s = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = s {
                return Value::Error(e);
            }
            let m = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = m {
                return Value::Error(e);
            }
            match (coerce_to_number(&s), coerce_to_number(&m)) {
                (Some(start), Some(months)) => {
                    let (y, mo, _) = date_from_serial(start);
                    let (ty, tm) = shift_year_month(y, mo, months.trunc() as i64);
                    let dim = days_in_month(ty, tm);
                    Value::Number(date_serial(ty, tm, 1) + (dim as f64) - 1.0)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // EDATE(start, months) — same calendar day, `months` later.
        // If the target month has fewer days, clamp to month end.
        "EDATE" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let s = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = s {
                return Value::Error(e);
            }
            let m = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = m {
                return Value::Error(e);
            }
            match (coerce_to_number(&s), coerce_to_number(&m)) {
                (Some(start), Some(months)) => {
                    let (y, mo, d) = date_from_serial(start);
                    let (ty, tm) = shift_year_month(y, mo, months.trunc() as i64);
                    let dim = days_in_month(ty, tm);
                    let td = d.min(dim);
                    Value::Number(date_serial(ty, tm, td))
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // DAYS(end, start) → end - start as integer day count.
        "DAYS" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let e = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(er) = e {
                return Value::Error(er);
            }
            let s = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(er) = s {
                return Value::Error(er);
            }
            match (coerce_to_number(&e), coerce_to_number(&s)) {
                (Some(end), Some(start)) => Value::Number(end.floor() - start.floor()),
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // DATEDIF(start, end, unit). start > end is rejected as Overflow
        // (matches Excel's #NUM!). Unit is text and case-insensitive in
        // Excel; we accept upper-case to stay consistent with the parser's
        // string handling.
        "DATEDIF" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let s = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = s {
                return Value::Error(e);
            }
            let e = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(er) = e {
                return Value::Error(er);
            }
            let u = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(er) = u {
                return Value::Error(er);
            }
            let start = match coerce_to_number(&s) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let end = match coerce_to_number(&e) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            if start > end {
                return Value::Error(ValueError::Overflow);
            }
            let unit = coerce_to_text(&u).to_ascii_uppercase();
            let (y1, m1, d1) = date_from_serial(start);
            let (y2, m2, d2) = date_from_serial(end);
            match unit.as_str() {
                "D" => Value::Number(end.floor() - start.floor()),
                "Y" => {
                    let mut yrs = (y2 - y1) as i64;
                    if (m2, d2) < (m1, d1) {
                        yrs -= 1;
                    }
                    Value::Number(yrs as f64)
                }
                "M" => {
                    let mut months = (y2 - y1) as i64 * 12 + (m2 as i64 - m1 as i64);
                    if d2 < d1 {
                        months -= 1;
                    }
                    Value::Number(months as f64)
                }
                "YM" => {
                    // Months between, ignoring years.
                    let mut months = m2 as i64 - m1 as i64;
                    if d2 < d1 {
                        months -= 1;
                    }
                    if months < 0 {
                        months += 12;
                    }
                    Value::Number(months as f64)
                }
                "YD" => {
                    // Days between, ignoring years: align end's (m,d) to
                    // start's year (or year+1 if end's (m,d) precedes start's).
                    let anniv_year = if (m2, d2) >= (m1, d1) { y1 } else { y1 + 1 };
                    let anniv = date_serial(anniv_year, m2, d2.min(days_in_month(anniv_year, m2)));
                    Value::Number((anniv - start.floor()).abs())
                }
                "MD" => {
                    // Days between, ignoring months and years.
                    // If d2 >= d1, simply d2 - d1. Otherwise borrow days from
                    // the previous month relative to end.
                    if d2 >= d1 {
                        Value::Number((d2 - d1) as f64)
                    } else {
                        let (py, pm) = shift_year_month(y2, m2, -1);
                        let pm_days = days_in_month(py, pm);
                        Value::Number((pm_days + d2 - d1) as f64)
                    }
                }
                _ => Value::Error(ValueError::InvalidValue),
            }
        }
        // DATEVALUE(text) — ISO 8601 only: "YYYY-MM-DD" or "YYYY/MM/DD".
        "DATEVALUE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let s = match v {
                Value::Text(s) => s,
                Value::Null => return Value::Error(ValueError::WrongType),
                other => coerce_to_text(&other),
            };
            let parts: Vec<&str> = if s.contains('-') {
                s.split('-').collect()
            } else if s.contains('/') {
                s.split('/').collect()
            } else {
                return Value::Error(ValueError::InvalidValue);
            };
            if parts.len() != 3 {
                return Value::Error(ValueError::InvalidValue);
            }
            let y: i32 = match parts[0].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let m: u32 = match parts[1].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let d: u32 = match parts[2].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            if m == 0 || m > 12 || d == 0 || d > days_in_month(y, m) {
                return Value::Error(ValueError::InvalidValue);
            }
            Value::Number(date_serial(y, m, d))
        }
        // TIMEVALUE(text) — "HH:MM" or "HH:MM:SS".
        "TIMEVALUE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let s = match v {
                Value::Text(s) => s,
                Value::Null => return Value::Error(ValueError::WrongType),
                other => coerce_to_text(&other),
            };
            let parts: Vec<&str> = s.split(':').collect();
            if parts.len() < 2 || parts.len() > 3 {
                return Value::Error(ValueError::InvalidValue);
            }
            let h: f64 = match parts[0].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let m: f64 = match parts[1].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let sec: f64 = if parts.len() == 3 {
                match parts[2].parse() {
                    Ok(n) => n,
                    Err(_) => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                0.0
            };
            if h < 0.0 || m < 0.0 || sec < 0.0 {
                return Value::Error(ValueError::InvalidValue);
            }
            Value::Number((h * 3600.0 + m * 60.0 + sec) / 86400.0)
        }
        // YEARFRAC(start, end[, basis]) — fraction of a year between dates.
        //
        // Basis approximations:
        //   0 = US 30/360 (simple form, no end-of-month rule)
        //   1 = actual/actual (uses actual days / 365 — approximate)
        //   2 = actual/360
        //   3 = actual/365
        //   4 = European 30/360 (equivalent to 0 for our simple form)
        "YEARFRAC" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let a = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = a {
                return Value::Error(e);
            }
            let b = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = b {
                return Value::Error(e);
            }
            let basis = if args.len() == 3 {
                let bx = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = bx {
                    return Value::Error(e);
                }
                match coerce_to_number(&bx) {
                    Some(n) => n as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0
            };
            let (start, end) = match (coerce_to_number(&a), coerce_to_number(&b)) {
                (Some(s), Some(e)) => {
                    if s <= e {
                        (s, e)
                    } else {
                        (e, s)
                    }
                }
                _ => return Value::Error(ValueError::WrongType),
            };
            let result = match basis {
                0 | 4 => {
                    let (y1, m1, d1) = date_from_serial(start);
                    let (y2, m2, d2) = date_from_serial(end);
                    let num = (y2 - y1) as f64 * 360.0
                        + (m2 as f64 - m1 as f64) * 30.0
                        + (d2 as f64 - d1 as f64);
                    num / 360.0
                }
                1 => (end - start) / 365.0,
                2 => (end - start) / 360.0,
                3 => (end - start) / 365.0,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            Value::Number(result)
        }

        // === Statistical extensions ===
        //
        // AVERAGEA(...) — variadic. Like AVERAGE but Boolean(true) = 1,
        // Boolean(false) = 0, Text = 0 (all count toward the denominator).
        // Null is NOT counted (matches Excel's "empty cell" handling).
        // Errors propagate.
        "AVERAGEA" => {
            let mut total = 0.0_f64;
            let mut count = 0u64;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            total += n;
                            count += 1;
                        }
                        Value::Boolean(true) => {
                            total += 1.0;
                            count += 1;
                        }
                        Value::Boolean(false) => {
                            count += 1;
                        }
                        Value::Text(_) => {
                            // Text contributes 0 to total but counts in denominator.
                            count += 1;
                        }
                        Value::Null => {
                            // Null (empty cell) is not counted at all.
                        }
                        // Unreachable: for_each_arg_value flattens Array.
                        Value::Array(_) => {}
                        // Lambda inside AVERAGEA is a type error.
                        Value::Lambda(_) => err = Some(ValueError::WrongType),
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if count == 0 {
                Value::Error(ValueError::DivisionByZero)
            } else {
                Value::Number(total / count as f64)
            }
        }

        // RANK(value, range[, order]) — equivalent to Excel's RANK / RANK.EQ.
        // order = 0 (default) → descending (rank 1 = largest).
        // order ≠ 0 → ascending (rank 1 = smallest).
        // Ties all share the same (lowest) rank.
        // If `value` is not present in `range`, returns #VALUE! (Excel uses #N/A
        // which has no direct equivalent in ValueError).
        //
        // Dotted names (Excel 2010+): `RANK.EQ` aliases `RANK`/`RANKEQ`.
        "RANK" | "RANKEQ" | "RANK.EQ" => rank_eq(args, provider),

        // RANKAVG(value, range[, order]) — Excel's RANK.AVG. Tied values get the
        // average of the ranks they span (e.g. three values tied for rank 5 → all
        // get 6.0, because they would occupy ranks 5, 6, 7).
        "RANKAVG" | "RANK.AVG" => rank_avg(args, provider),

        // PERCENTILE(range, k) — linear-interpolated percentile.
        // k in [0, 1]; otherwise #VALUE!. Empty range → #VALUE!.
        // `PERCENTILE.INC` (Excel 2010+) is the same function.
        "PERCENTILE" | "PERCENTILE.INC" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let k_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = k_v {
                return Value::Error(e);
            }
            let k = match coerce_to_number(&k_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            percentile_impl(&args[..1], provider, k)
        }

        // PERCENTILE.EXC(range, k) — exclusive percentile. k strictly in (0, 1);
        // k=0 / k=1 → #VALUE!. The 1-based position is `k * (n + 1)`; if the
        // resulting position is < 1 or > n the result is #VALUE!. Otherwise
        // interpolates between the two surrounding sorted values.
        "PERCENTILE.EXC" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let k_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = k_v {
                return Value::Error(e);
            }
            let k = match coerce_to_number(&k_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            percentile_exc_impl(&args[..1], provider, k)
        }

        // QUARTILE(range, quart) — quart ∈ {0,1,2,3,4} → PERCENTILE(range, quart/4).
        // `QUARTILE.INC` is the same function under Excel 2010+ naming.
        "QUARTILE" | "QUARTILE.INC" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let q_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = q_v {
                return Value::Error(e);
            }
            let q = match coerce_to_number(&q_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            // quart must be in 0..=4 inclusive.
            if !q.is_finite() || q < 0.0 || q > 4.0 || q.trunc() != q {
                return Value::Error(ValueError::InvalidValue);
            }
            percentile_impl(&args[..1], provider, q / 4.0)
        }

        // QUARTILE.EXC(range, quart) — exclusive quartile. quart must be 1, 2,
        // or 3 (0 and 4 are NOT valid in exclusive mode). Equivalent to
        // PERCENTILE.EXC(range, quart/4).
        "QUARTILE.EXC" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let q_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = q_v {
                return Value::Error(e);
            }
            let q = match coerce_to_number(&q_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            // quart must be 1, 2, or 3 (integer).
            if !q.is_finite() || q.trunc() != q {
                return Value::Error(ValueError::InvalidValue);
            }
            let qi = q as i64;
            if !(1..=3).contains(&qi) {
                return Value::Error(ValueError::InvalidValue);
            }
            percentile_exc_impl(&args[..1], provider, qi as f64 / 4.0)
        }

        // STDEV.S / VAR.S — Excel 2010+ aliases for the sample-variance
        // STDEV / VAR (divide by n-1).
        "STDEV.S" => eval_func("STDEV", args, provider),
        "VAR.S" => eval_func("VAR", args, provider),

        // STDEV.P / VAR.P — population standard deviation / variance.
        // Divide by n (not n-1).
        "STDEV.P" => {
            let nums = collect_numbers(args, provider);
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() as f64);
            Value::Number(var.sqrt())
        }
        "VAR.P" => {
            let nums = collect_numbers(args, provider);
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() as f64);
            Value::Number(var)
        }

        // CORREL(arr1, arr2) — Pearson correlation. Both args must be ranges of
        // the same shape (same width × height). Pairs are collected only when
        // BOTH cells at the same offset are numeric. Need ≥ 2 pairs.
        // Shape mismatch → #VALUE!. Denominator 0 → #DIV/0!.
        //
        // Note: requires literal Range / SheetRange / OFFSET expressions (the
        // shape requirement is structural). Non-range args → #VALUE!.
        "CORREL" => correl_impl(args, provider),

        // COVAR / COVAR.P — population covariance. `sum((x-mx)*(y-my)) / n`.
        // Same pair-collection semantics as CORREL.
        "COVAR" | "COVAR.P" => covar_impl(args, provider, false),

        // COVAR.S — sample covariance. Divides by `n - 1` instead of `n`.
        "COVAR.S" => covar_impl(args, provider, true),

        // SLOPE(y_array, x_array) — linear regression slope. Order matters: y
        // first, then x (Excel convention).
        "SLOPE" => slope_intercept_impl(args, provider, false),

        // INTERCEPT(y_array, x_array) — ȳ - slope * x̄.
        "INTERCEPT" => slope_intercept_impl(args, provider, true),

        // === Financial / time-value-of-money ===
        //
        // All annuity formulas use the Excel sign convention: outflows are
        // negative, inflows positive. The core equation when `rate != 0`:
        //
        //   pv*(1+r)^n + pmt*(1+r*type)*((1+r)^n - 1)/r + fv = 0
        //
        // Specialised to `rate == 0` (linear): pv + pmt*n + fv = 0.
        // `type` is 0 (end-of-period, default) or 1 (beginning-of-period).
        "PMT" => fn_pmt(args, provider),
        "PV" => fn_pv(args, provider),
        "FV" => fn_fv(args, provider),
        "NPER" => fn_nper(args, provider),
        "NPV" => fn_npv(args, provider),
        "IRR" => fn_irr(args, provider),
        "RATE" => fn_rate(args, provider),
        "IPMT" => fn_ipmt(args, provider),
        "PPMT" => fn_ppmt(args, provider),

        // CELL(info_type[, reference]) — return metadata about `reference`.
        //
        // Supported info_type values (Excel matches case-insensitively):
        //   "address"  → $A$1-style absolute text
        //   "row"      → 1-based row number (Number)
        //   "col"/"column" → 1-based column number (Number)
        //   "contents" → the cell's value via provider.cell(addr)
        //   "type"     → "b" blank, "l" text, "v" otherwise
        //   "prefix"   → "'" for text, "" otherwise
        //   "width"    → column width in Excel character units (px→chars)
        //   "protect"  → 1.0 (approximation; per-cell unlock state isn't
        //                tracked at the eval layer)
        // Any other info_type returns #VALUE! (InvalidValue), matching Excel.
        //
        // When `reference` is omitted we fall back to `provider.current_cell()`.
        // The legacy single-sheet `AtomEvalProvider` returns None there, so
        // no-arg `CELL` on that path surfaces #REF! (InvalidRef). The
        // production `WorkbookEvalProvider` tracks the current cell and
        // resolves correctly — covered in tests/cell_function.rs.
        "CELL" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // info_type must be Text — non-text args (numbers, bools) hit
            // WrongType rather than coercing, so spreadsheets surface the
            // type mismatch loudly.
            let info_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = info_v {
                return Value::Error(e);
            }
            let info_type = match &info_v {
                Value::Text(s) => s.to_ascii_lowercase(),
                _ => return Value::Error(ValueError::WrongType),
            };

            // Resolve the target address. With an explicit second arg, only
            // direct cell/range references qualify; computed values (e.g.
            // CELL("address","not-a-ref")) yield #TYPE!. Multi-cell ranges
            // collapse to their top-left cell per Excel parity.
            let addr: CellAddress = if args.len() == 2 {
                match &args[1] {
                    Expr::CellRef(a, _) | Expr::SheetRef { addr: a, .. } => *a,
                    Expr::Range { start, .. } | Expr::SheetRange { start, .. } => *start,
                    _ => return Value::Error(ValueError::WrongType),
                }
            } else {
                match provider.current_cell() {
                    Some(a) => a,
                    // note: AtomEvalProvider doesn't carry current-cell, so
                    // the no-arg unit tests below land here. The production
                    // workbook path is covered by tests/cell_function.rs.
                    None => return Value::Error(ValueError::InvalidRef),
                }
            };
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }

            match info_type.as_str() {
                "address" => {
                    let col_letters = col_index_to_letters_eval(addr.col);
                    Value::Text(format!("${}${}", col_letters, addr.row + 1))
                }
                "row" => Value::Number((addr.row + 1) as f64),
                // Excel accepts both "col" and "column" for the column index.
                "col" | "column" => Value::Number((addr.col + 1) as f64),
                "contents" => provider.cell(addr),
                "type" => match provider.cell(addr) {
                    Value::Null => Value::Text("b".into()),
                    Value::Text(_) => Value::Text("l".into()),
                    // Excel collapses numbers, booleans, and errors to "v".
                    _ => Value::Text("v".into()),
                },
                "prefix" => match provider.cell(addr) {
                    // Excel returns the actual alignment-prefix character;
                    // we only know whether the cell is text, so we
                    // approximate: text → "'", everything else → "".
                    Value::Text(_) => Value::Text("'".into()),
                    _ => Value::Text(String::new()),
                },
                // Excel's CELL("width") reports the column width in CHARACTER
                // units (how many default-font digits fit), "rounded off to an
                // integer" per the Microsoft docs. We store widths in physical
                // pixels, so we invert the standard Excel px↔char metric:
                //
                //     chars = round((pixels − 5) / MDW)
                //
                // where MDW = 7 is Calibri-11's Maximum Digit Width and 5 px is
                // the cell's left+right padding baked into the stored box width.
                // Calibration: Excel's default 64 px → (64−5)/7 = 8.43 → 8;
                // e.g. 100 px → (100−5)/7 = 13.57 → 14. `round` (half away from
                // zero) matches the docs' "rounded off", not truncation; the
                // result is clamped at 0 so a sub-padding width can't go
                // negative. Columns with no explicit width report `None` here
                // and fall back to Excel's default of 8 characters.
                //
                // Modern Excel returns a 2-element spill array {width, is_default};
                // we return the scalar integer (legacy shape) to match this
                // engine's existing CELL return contract and stay backward
                // compatible. Cross-sheet refs collapse to the current sheet's
                // widths — same limitation the content-touching info_types
                // ("contents"/"type"/"prefix") already carry.
                "width" => {
                    let chars = match provider.col_width(addr.col) {
                        Some(px) => (((px as f64) - 5.0) / 7.0).round().max(0.0),
                        None => 8.0,
                    };
                    Value::Number(chars)
                }
                // note: per-cell locked/unlocked state lives outside the
                // formula engine — we report "locked" (1) for every cell.
                "protect" => Value::Number(1.0),
                _ => Value::Error(ValueError::InvalidValue),
            }
        }

        // === Database functions (D*) ===
        //
        // Shared signature: D*(database, field, criteria).
        //   - database: range with a header row (row 0) and N data rows.
        //   - field: column header (Text, case-insensitive) OR 1-based
        //     column index (Number).
        //   - criteria: range with a header row + 1+ criterion rows; rows
        //     OR-combine, non-empty cells within a row AND-combine.
        //
        // Boolean handling: matches Excel — D* aggregates only operate on
        // `Value::Number` data cells. Booleans / text / nulls are skipped
        // for DCOUNT/DSUM/DAVERAGE/DSTDEV*/DVAR*/DPRODUCT/DMAX/DMIN. DCOUNTA
        // counts ANY non-Null cell (numeric, text, boolean).
        //
        // Error propagation: any cell in `database` or `criteria` that
        // holds `Value::Error(_)` short-circuits to that error.
        //
        // Empty-match handling (per Excel parity):
        //   - DAVERAGE, DSTDEV/DSTDEVP, DVAR/DVARP → #DIV/0!
        //   - DSUM, DPRODUCT, DMAX, DMIN, DCOUNT, DCOUNTA → 0
        //   - DGET 0 matches → #VALUE!, > 1 matches → #NUM!
        "DSUM" => db_aggregate(
            args,
            provider,
            0.0_f64,
            |acc, v| {
                if let Value::Number(n) = v {
                    *acc += *n;
                }
            },
            Value::Number,
        ),
        "DAVERAGE" => db_aggregate(
            args,
            provider,
            (0.0_f64, 0u64),
            |acc, v| {
                if let Value::Number(n) = v {
                    acc.0 += *n;
                    acc.1 += 1;
                }
            },
            |(sum, count)| {
                if count == 0 {
                    Value::Error(ValueError::DivisionByZero)
                } else {
                    Value::Number(sum / count as f64)
                }
            },
        ),
        "DCOUNT" => db_aggregate(
            args,
            provider,
            0u64,
            |acc, v| {
                if matches!(v, Value::Number(_)) {
                    *acc += 1;
                }
            },
            |c| Value::Number(c as f64),
        ),
        "DCOUNTA" => db_aggregate(
            args,
            provider,
            0u64,
            |acc, v| {
                if !matches!(v, Value::Null) {
                    *acc += 1;
                }
            },
            |c| Value::Number(c as f64),
        ),
        "DMAX" => db_aggregate(
            args,
            provider,
            None::<f64>,
            |acc, v| {
                if let Value::Number(n) = v {
                    *acc = Some(acc.map_or(*n, |m| if *n > m { *n } else { m }));
                }
            },
            |opt| Value::Number(opt.unwrap_or(0.0)),
        ),
        "DMIN" => db_aggregate(
            args,
            provider,
            None::<f64>,
            |acc, v| {
                if let Value::Number(n) = v {
                    *acc = Some(acc.map_or(*n, |m| if *n < m { *n } else { m }));
                }
            },
            |opt| Value::Number(opt.unwrap_or(0.0)),
        ),
        "DPRODUCT" => db_aggregate(
            args,
            provider,
            None::<f64>,
            |acc, v| {
                if let Value::Number(n) = v {
                    *acc = Some(acc.map_or(*n, |p| p * *n));
                }
            },
            |opt| Value::Number(opt.unwrap_or(0.0)),
        ),
        "DGET" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let database = match resolve_database_range(&args[0], provider) {
                Ok(d) => d,
                Err(e) => return Value::Error(e),
            };
            let field_col = match resolve_db_field(&database, &args[1], provider) {
                Ok(c) => c,
                Err(e) => return Value::Error(e),
            };
            let mut found: Option<Value> = None;
            let mut too_many = false;
            let walk = iter_db_matches(&database, &args[2], provider, |row| {
                if too_many {
                    return Ok(());
                }
                let v = database.data_cell(row, field_col as u32, provider);
                if let Value::Error(e) = v {
                    return Err(e);
                }
                if found.is_some() {
                    too_many = true;
                } else {
                    found = Some(v);
                }
                Ok(())
            });
            if let Err(e) = walk {
                return Value::Error(e);
            }
            if too_many {
                return Value::Error(ValueError::Overflow);
            }
            found.unwrap_or(Value::Error(ValueError::InvalidValue))
        }
        "DSTDEV" | "DSTDEVP" | "DVAR" | "DVARP" => {
            // Two-pass; needs the full numeric Vec.
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let database = match resolve_database_range(&args[0], provider) {
                Ok(d) => d,
                Err(e) => return Value::Error(e),
            };
            let field_col = match resolve_db_field(&database, &args[1], provider) {
                Ok(c) => c,
                Err(e) => return Value::Error(e),
            };
            let mut nums: Vec<f64> = Vec::new();
            let walk = iter_db_matches(&database, &args[2], provider, |row| {
                let v = database.data_cell(row, field_col as u32, provider);
                if let Value::Error(e) = v {
                    return Err(e);
                }
                if let Value::Number(n) = v {
                    nums.push(n);
                }
                Ok(())
            });
            if let Err(e) = walk {
                return Value::Error(e);
            }
            // Sample (DSTDEV/DVAR) divides by n-1 and needs n >= 2.
            // Population (DSTDEVP/DVARP) divides by n and needs n >= 1.
            let is_sample = matches!(name, "DSTDEV" | "DVAR");
            let min_n = if is_sample { 2 } else { 1 };
            if nums.len() < min_n {
                return Value::Error(ValueError::DivisionByZero);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let denom = if is_sample {
                (nums.len() - 1) as f64
            } else {
                nums.len() as f64
            };
            let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / denom;
            let result = if name == "DSTDEV" || name == "DSTDEVP" {
                var.sqrt()
            } else {
                var
            };
            Value::Number(result)
        }

        // === Engineering / base conversion / bit ops ===
        //
        // Excel's base-conversion family uses a fixed-width signed
        // two's-complement encoding when the input is at the maximum
        // width: BIN at 10 bits, OCT at 30 bits (10 octal digits), HEX
        // at 40 bits (10 hex digits). Inputs shorter than the max are
        // treated as positive. See `parse_base_n_text` and
        // `format_base_n_signed` for the shared core; the per-function
        // arms are thin wrappers that pick base / max-chars and any
        // composition.
        "BIN2DEC" => eval_xxx2dec(args, provider, 2, 10, 1),
        "OCT2DEC" => eval_xxx2dec(args, provider, 8, 10, 3),
        "HEX2DEC" => eval_xxx2dec(args, provider, 16, 10, 4),
        "DEC2BIN" => eval_dec2xxx(args, provider, 2, 10, 1, false),
        "DEC2OCT" => eval_dec2xxx(args, provider, 8, 10, 3, false),
        "DEC2HEX" => eval_dec2xxx(args, provider, 16, 10, 4, true),
        // Cross-base wrappers: parse via XXX2DEC's base, format via the
        // target's DEC2XXX. We inline both halves rather than recursing
        // through `eval_func` so error propagation stays local.
        "BIN2HEX" => eval_cross_base(args, provider, (2, 10, 1), (16, 10, 4), true),
        "BIN2OCT" => eval_cross_base(args, provider, (2, 10, 1), (8, 10, 3), false),
        "HEX2BIN" => eval_cross_base(args, provider, (16, 10, 4), (2, 10, 1), false),
        "HEX2OCT" => eval_cross_base(args, provider, (16, 10, 4), (8, 10, 3), false),
        "OCT2BIN" => eval_cross_base(args, provider, (8, 10, 3), (2, 10, 1), false),
        "OCT2HEX" => eval_cross_base(args, provider, (8, 10, 3), (16, 10, 4), true),

        // Bitwise ops. Excel's documented domain is 0..=2^48-1; we
        // accept the slightly looser 0..=2^53-1 (the f64 safe-integer
        // range) so values that survive a round-trip through Value
        // stay representable. Fractional / negative / out-of-range
        // inputs surface #NUM!.
        "BITAND" => eval_bit_binop(args, provider, |a, b| a & b),
        "BITOR" => eval_bit_binop(args, provider, |a, b| a | b),
        "BITXOR" => eval_bit_binop(args, provider, |a, b| a ^ b),
        "BITLSHIFT" => eval_bit_shift(args, provider, false),
        "BITRSHIFT" => eval_bit_shift(args, provider, true),

        // DELTA(a[, b=0]) — 1 if a == b else 0. Excel uses #VALUE! for
        // non-numeric args; we use WrongType to match the rest of this
        // module.
        "DELTA" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let a = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = a {
                return Value::Error(e);
            }
            let b = if args.len() == 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                v
            } else {
                Value::Number(0.0)
            };
            let (an, bn) = match (as_engineering_number(&a), as_engineering_number(&b)) {
                (Some(x), Some(y)) => (x, y),
                _ => return Value::Error(ValueError::WrongType),
            };
            Value::Number(if an == bn { 1.0 } else { 0.0 })
        }

        // GESTEP(num[, step=0]) — 1 if num >= step else 0.
        "GESTEP" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let n = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = n {
                return Value::Error(e);
            }
            let s = if args.len() == 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                v
            } else {
                Value::Number(0.0)
            };
            let (nn, sn) = match (as_engineering_number(&n), as_engineering_number(&s)) {
                (Some(x), Some(y)) => (x, y),
                _ => return Value::Error(ValueError::WrongType),
            };
            Value::Number(if nn >= sn { 1.0 } else { 0.0 })
        }

        // === Hyperbolic ===
        // SINH / COSH / TANH / ASINH are total functions over the reals;
        // `unary_number` already collapses non-finite results to
        // `Overflow`, which matches Excel's `#NUM!` for the SINH/COSH
        // explosions at large |n|.
        "SINH" => unary_number(args, provider, f64::sinh),
        "COSH" => unary_number(args, provider, f64::cosh),
        "TANH" => unary_number(args, provider, f64::tanh),
        "ASINH" => unary_number(args, provider, f64::asinh),
        "ACOSH" => {
            // Domain: n >= 1. Out of domain → #NUM!.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n >= 1.0 => {
                    let r = n.acosh();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "ATANH" => {
            // Domain: |n| < 1. n == ±1 produces ±∞, also Overflow.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n > -1.0 && n < 1.0 => {
                    let r = n.atanh();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }

        // === Reciprocal trig (radians input) ===
        // CSC/SEC/COT each have isolated poles where the underlying
        // sin/cos/tan hits 0. Excel reports `#DIV/0!` at those poles.
        "CSC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let s = n.sin();
                    if s == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / s;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "SEC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let c = n.cos();
                    if c == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / c;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "COT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let t = n.tan();
                    if t == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / t;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }

        // === Reciprocal hyperbolic ===
        // CSCH undefined only at 0; SECH is finite & non-zero
        // everywhere; COTH undefined only at 0 (tanh(0) == 0).
        "CSCH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let s = n.sinh();
                    if s == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / s;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "SECH" => unary_number(args, provider, |n| 1.0 / n.cosh()),
        "COTH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let t = n.tanh();
                    if t == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / t;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }

        // === Inverse reciprocal trig ===
        // ACSC(n) = asin(1/n); n == 0 is #DIV/0!, |n| < 1 is #NUM!.
        // ACSC returns a value in [-PI/2, PI/2] \ {0} — sign follows n
        // (same convention as Excel).
        "ACSC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    if n == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    if n.abs() < 1.0 {
                        return Value::Error(ValueError::Overflow);
                    }
                    let r = (1.0 / n).asin();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // ASEC(n) = acos(1/n); same domain (|n| >= 1, n != 0).
        // Returns a value in [0, PI].
        "ASEC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    if n == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    if n.abs() < 1.0 {
                        return Value::Error(ValueError::Overflow);
                    }
                    let r = (1.0 / n).acos();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // ACOT(n) = PI/2 - atan(n); returns a value in (0, PI), matching
        // Excel (which differs from the C/Rust `atan2(1, n)` convention
        // only for n == 0, where Excel chooses +PI/2 rather than the
        // signed-zero branch). Defined for all real n.
        "ACOT" => unary_number(args, provider, |n| std::f64::consts::FRAC_PI_2 - n.atan()),

        // === Math extras ===
        //
        // Pair-of-arrays sums. Same shape contract as CORREL / COVAR
        // (see `collect_paired_numbers`). Pairs are kept only when BOTH
        // cells are `Value::Number`; everything else (Null, Text,
        // Boolean) is skipped, matching Excel's "non-numeric → 0
        // contribution" behaviour for these aggregates.
        "SUMX2MY2" => sum_pair_impl(args, provider, |x, y| x * x - y * y),
        "SUMX2PY2" => sum_pair_impl(args, provider, |x, y| x * x + y * y),
        "SUMXMY2" => sum_pair_impl(args, provider, |x, y| (x - y) * (x - y)),

        // SUMSQ — variadic `Σ x²`. Walks each arg via `for_each_arg_value`
        // so a `SUMSQ(A:A)` stays sparse. Only numeric values contribute;
        // booleans and text are skipped, errors propagate.
        "SUMSQ" => {
            let mut total = 0.0_f64;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => total += n * n,
                        _ => {}
                    }
                });
            }
            match err {
                Some(e) => Value::Error(e),
                None => Value::Number(total),
            }
        }

        // SQRTPI(n) — `sqrt(n * PI)`. Excel returns #NUM! for negatives.
        "SQRTPI" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n < 0.0 => Value::Error(ValueError::Overflow),
                Some(n) => Value::Number((n * std::f64::consts::PI).sqrt()),
                None => Value::Error(ValueError::WrongType),
            }
        }

        // SUMPRODUCT(array1[, array2, ...]) — multiply element-wise across N
        // arrays of identical shape, then sum. N == 1 collapses to "SUM over
        // numerics" of the single array. Shape mismatch → #VALUE!.
        // Non-numeric cells contribute 0 (Excel parity).
        "SUMPRODUCT" => sumproduct_impl(args, provider),

        // FLOOR.MATH / CEILING.MATH — precise rounding family. 1-3 args.
        // `significance` defaults to 1; `mode` defaults to 0 ("toward
        // -inf" for FLOOR.MATH, "toward +inf" for CEILING.MATH). When
        // mode != 0, negatives round toward zero (FLOOR.MATH) / away
        // from zero (CEILING.MATH) instead. These diverge from
        // FLOOR.PRECISE / CEILING.PRECISE specifically on negatives.
        "FLOOR.MATH" => floor_ceiling_math(args, provider, true),
        "CEILING.MATH" => floor_ceiling_math(args, provider, false),

        // FLOOR.PRECISE / CEILING.PRECISE — always round toward -inf /
        // +inf regardless of sign. 1 or 2 args; `significance` defaults
        // to 1. Negative significance is accepted but treated as `|sig|`
        // per Excel parity.
        "FLOOR.PRECISE" => floor_ceiling_precise(args, provider, true),
        "CEILING.PRECISE" => floor_ceiling_precise(args, provider, false),

        // ROMAN / ARABIC — round-trip between integers and Roman numerals.
        // ROMAN supports Excel's classic and simplified forms 0..4.
        "ROMAN" => fn_roman(args, provider),
        "ARABIC" => fn_arabic(args, provider),

        // DECIMAL / BASE — round-trip between text in base N (2..=36)
        // and integers. Letters A..Z are 10..35, case-insensitive.
        "DECIMAL" => fn_decimal(args, provider),
        "BASE" => fn_base(args, provider),

        // MDETERM(range) — determinant of a SQUARE matrix range.
        // Implemented via Doolittle LU decomposition with partial
        // pivoting; numerically stable up to ~50×50, tested through
        // 10×10. Non-square → #VALUE!. Non-numeric cell → #TYPE!.
        //
        // note: MMULT/MINVERSE deferred until Value::Array lands — they
        // require a matrix output type, which the current single-Value
        // eval pipeline cannot express.
        "MDETERM" => fn_mdeterm(args, provider),

        // NETWORKDAYS(start, end[, holidays]) — count working days
        // (Mon..Fri, excluding `holidays`) between `start` and `end`
        // inclusive on both ends. If `start > end`, the result is
        // negated (matches Excel).
        //
        // Epoch note: serials here are 1970-01-01 = 0 (see
        // TODO(excel-1900-epoch) on `date_serial`). 1970-01-01 was a
        // Thursday, so the Sunday-indexed day-of-week formula is
        // `((serial.floor() as i64) + 4).rem_euclid(7)`.
        //
        // Holidays are filtered to whole-day integers (non-numeric
        // cells are silently skipped — Excel raises #VALUE! on text
        // holidays, but we stay lenient because mixed-type holiday
        // columns are common when data is sparse). Errors inside the
        // holiday range *do* propagate via WrongType to mirror the
        // strict path of NETWORKDAYS.INTL.
        "NETWORKDAYS" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (start, end) = match networkdays_endpoints(&args[0], &args[1], provider) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            let holidays = match collect_holidays(args.get(2), provider) {
                Ok(h) => h,
                Err(e) => return Value::Error(e),
            };
            // Default weekend mask: Sat+Sun (mask indexed Mon=0..Sun=6).
            let weekend = [false, false, false, false, false, true, true];
            Value::Number(count_workdays(start, end, &weekend, &holidays) as f64)
        }

        // NETWORKDAYS.INTL(start, end[, weekend[, holidays]]) — like
        // NETWORKDAYS but with a configurable weekend. `weekend` is
        // either an integer code (1..7 for two-day weekends, 11..17
        // for single-day weekends) or a 7-character mask of '0'/'1'
        // with char[0] = Monday. An all-'1' mask (no working days)
        // returns InvalidValue, mirroring Excel's #VALUE!.
        "NETWORKDAYS.INTL" => {
            if args.len() < 2 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (start, end) = match networkdays_endpoints(&args[0], &args[1], provider) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            let weekend = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match parse_weekend_arg(&v) {
                    Ok(w) => w,
                    Err(e) => return Value::Error(e),
                }
            } else {
                [false, false, false, false, false, true, true]
            };
            let holidays = match collect_holidays(args.get(3), provider) {
                Ok(h) => h,
                Err(e) => return Value::Error(e),
            };
            Value::Number(count_workdays(start, end, &weekend, &holidays) as f64)
        }

        // WORKDAY(start, days[, holidays]) — advance `days` working
        // days (Mon..Fri, skipping holidays) from `start`, returning
        // the resulting serial as a Number. `days` may be negative.
        // If `days == 0`, returns `start.floor()` regardless of
        // whether `start` itself is a weekend/holiday.
        "WORKDAY" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let start = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = start {
                return Value::Error(e);
            }
            let days = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = days {
                return Value::Error(e);
            }
            let start_n = match coerce_to_number(&start) {
                Some(n) => n.floor() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let days_n = match coerce_to_number(&days) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let holidays = match collect_holidays(args.get(2), provider) {
                Ok(h) => h,
                Err(e) => return Value::Error(e),
            };
            let weekend = [false, false, false, false, false, true, true];
            Value::Number(advance_workdays(start_n, days_n, &weekend, &holidays) as f64)
        }

        // WORKDAY.INTL(start, days[, weekend[, holidays]]) — like
        // WORKDAY but with a configurable weekend (same parsing as
        // NETWORKDAYS.INTL: numeric code or 7-char '0'/'1' mask).
        "WORKDAY.INTL" => {
            if args.len() < 2 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let start = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = start {
                return Value::Error(e);
            }
            let days = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = days {
                return Value::Error(e);
            }
            let start_n = match coerce_to_number(&start) {
                Some(n) => n.floor() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let days_n = match coerce_to_number(&days) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let weekend = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match parse_weekend_arg(&v) {
                    Ok(w) => w,
                    Err(e) => return Value::Error(e),
                }
            } else {
                [false, false, false, false, false, true, true]
            };
            let holidays = match collect_holidays(args.get(3), provider) {
                Ok(h) => h,
                Err(e) => return Value::Error(e),
            };
            Value::Number(advance_workdays(start_n, days_n, &weekend, &holidays) as f64)
        }

        // ISOWEEKNUM(serial) — ISO 8601 week number (1..53). Weeks
        // start Monday; week 1 of an ISO year is the week containing
        // Jan 4 (equivalently, the week containing the year's first
        // Thursday). Dates near year boundaries can therefore belong
        // to the previous or next ISO year; we resolve that by
        // recomputing against year-1 (when the date falls before
        // week 1 starts) or year+1 (when the date falls past the
        // computed year's last week).
        "ISOWEEKNUM" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let serial = match coerce_to_number(&v) {
                Some(n) => n.floor() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            Value::Number(iso_week_number(serial) as f64)
        }

        // === Dynamic-array (spill) functions ===
        // Each returns `Value::Array(Arc::new(ArrayData::new(...)))`; the
        // Sheet layer detects Array results and registers a spill range.

        // SEQUENCE(rows[, cols[, start[, step]]]) — Build a numeric grid of
        // the given shape with values `start + (i*cols + j) * step`.
        // note: hard-capped at 1_048_576 total elements (matches Excel's
        // worksheet row count); larger requests surface #VALUE! rather
        // than attempt the allocation.
        "SEQUENCE" => {
            if args.is_empty() || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // rows
            let rows_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = rows_v {
                return Value::Error(e);
            }
            let rows = match coerce_to_number(&rows_v) {
                Some(n) if n >= 1.0 => n.trunc() as u64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            // cols
            let cols = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) if n >= 1.0 => n.trunc() as u64,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1u64
            };
            // start
            let start = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1.0
            };
            // step
            let step = if args.len() == 4 {
                let v = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1.0
            };
            // Cap total elements to keep allocations bounded.
            let total = rows.checked_mul(cols).unwrap_or(u64::MAX);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
            let rows = rows as u32;
            let cols = cols as u32;
            let mut data: Vec<Value> = Vec::with_capacity(total as usize);
            for i in 0..rows {
                for j in 0..cols {
                    let idx = (i as u64) * (cols as u64) + (j as u64);
                    data.push(Value::Number(start + (idx as f64) * step));
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, cols, data)))
        }

        // UNIQUE(array[, by_col[, exactly_once]]) — Deduplicate rows (or
        // columns, when `by_col`). When `exactly_once`, drop anything that
        // appears more than once. Empty result (all dropped) → #VALUE!.
        "UNIQUE" => {
            if args.is_empty() || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let by_col = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            let exactly_once = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            // Pull each unit (row or column) into a Vec<Value> for compare.
            let unit = |i: u32| -> Vec<Value> {
                if by_col {
                    (0..rows)
                        .map(|r| data[(r as usize) * (cols as usize) + (i as usize)].clone())
                        .collect()
                } else {
                    (0..cols)
                        .map(|c| data[(i as usize) * (cols as usize) + (c as usize)].clone())
                        .collect()
                }
            };
            let units = if by_col { cols } else { rows };
            // First pass: count duplicates (for `exactly_once`).
            // Element-wise equality on Vec<Value> uses `values_equal`.
            let vec_eq = |a: &Vec<Value>, b: &Vec<Value>| -> bool {
                a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| values_equal(x, y))
            };
            // Build (unique_unit, count) list, preserving first-seen order.
            let mut buckets: Vec<(Vec<Value>, u32)> = Vec::new();
            for i in 0..units {
                let u = unit(i);
                if let Some(slot) = buckets.iter_mut().find(|(b, _)| vec_eq(b, &u)) {
                    slot.1 += 1;
                } else {
                    buckets.push((u, 1));
                }
            }
            // Filter per `exactly_once`.
            let keep: Vec<&Vec<Value>> = buckets
                .iter()
                .filter(|(_, c)| if exactly_once { *c == 1 } else { true })
                .map(|(u, _)| u)
                .collect();
            if keep.is_empty() {
                return Value::Error(ValueError::Calc);
            }
            // Re-assemble.
            if by_col {
                // Output shape: rows × keep.len()
                let out_cols = keep.len() as u32;
                let mut out: Vec<Value> = Vec::with_capacity((rows as usize) * keep.len());
                for r in 0..rows {
                    for u in &keep {
                        out.push(u[r as usize].clone());
                    }
                }
                Value::Array(Arc::new(ArrayData::new(rows, out_cols, out)))
            } else {
                let out_rows = keep.len() as u32;
                let mut out: Vec<Value> = Vec::with_capacity(keep.len() * (cols as usize));
                for u in &keep {
                    out.extend(u.iter().cloned());
                }
                Value::Array(Arc::new(ArrayData::new(out_rows, cols, out)))
            }
        }

        // SORT(array[, sort_index[, sort_order[, by_col]]]) — Sort rows by
        // column `sort_index` (default 1) ascending (1) or descending (-1).
        // When `by_col=TRUE`, sort columns by row `sort_index` instead.
        "SORT" => {
            if args.is_empty() || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let sort_index = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) if n >= 1.0 => n.trunc() as u32,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1u32
            };
            let sort_order = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) if n == 1.0 => 1i32,
                    Some(n) if n == -1.0 => -1i32,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1i32
            };
            let by_col = if args.len() == 4 {
                let v = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            // Range check on sort_index.
            if by_col {
                if sort_index > rows {
                    return Value::Error(ValueError::InvalidValue);
                }
            } else if sort_index > cols {
                return Value::Error(ValueError::InvalidValue);
            }
            // Build indices and sort by the key. Stable sort via Vec::sort_by.
            if by_col {
                // Sort columns by row (sort_index - 1).
                let key_row = (sort_index - 1) as usize;
                let mut order: Vec<u32> = (0..cols).collect();
                // Propagate any errors found in the key row.
                for &c in order.iter() {
                    let v = &data[key_row * (cols as usize) + (c as usize)];
                    if let Value::Error(e) = v {
                        return Value::Error(e.clone());
                    }
                }
                order.sort_by(|&a, &b| {
                    let va = &data[key_row * (cols as usize) + (a as usize)];
                    let vb = &data[key_row * (cols as usize) + (b as usize)];
                    let c = compare_lookup(va, vb);
                    if sort_order == -1 {
                        c.reverse()
                    } else {
                        c
                    }
                });
                let mut out: Vec<Value> = Vec::with_capacity(data.len());
                for r in 0..rows {
                    for &c in &order {
                        out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                    }
                }
                Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
            } else {
                // Sort rows by column (sort_index - 1).
                let key_col = (sort_index - 1) as usize;
                let mut order: Vec<u32> = (0..rows).collect();
                for &r in order.iter() {
                    let v = &data[(r as usize) * (cols as usize) + key_col];
                    if let Value::Error(e) = v {
                        return Value::Error(e.clone());
                    }
                }
                order.sort_by(|&a, &b| {
                    let va = &data[(a as usize) * (cols as usize) + key_col];
                    let vb = &data[(b as usize) * (cols as usize) + key_col];
                    let c = compare_lookup(va, vb);
                    if sort_order == -1 {
                        c.reverse()
                    } else {
                        c
                    }
                });
                let mut out: Vec<Value> = Vec::with_capacity(data.len());
                for &r in &order {
                    for c in 0..cols {
                        out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                    }
                }
                Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
            }
        }

        // FILTER(array, include[, if_empty]) — Keep rows where include's
        // matching element is truthy (column-vector include with rows ==
        // array.rows) OR keep columns (row-vector include with cols ==
        // array.cols). Empty result → if_empty (1x1 array) or #VALUE!.
        "FILTER" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (irows, icols, idata) = match arg_to_2d(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            // include must be either column-vector (irows == rows && icols == 1)
            // OR row-vector (icols == cols && irows == 1).
            let filter_rows: bool;
            if irows == rows && icols == 1 {
                filter_rows = true;
            } else if icols == cols && irows == 1 {
                filter_rows = false;
            } else {
                return Value::Error(ValueError::InvalidValue);
            }
            // Decode include into bool, propagating errors / type mismatches.
            let mut mask: Vec<bool> = Vec::with_capacity(idata.len());
            for v in &idata {
                if let Value::Error(e) = v {
                    return Value::Error(e.clone());
                }
                // Treat Null as FALSE so a sparse include vector silently
                // drops the matching rows/cols (matches Excel behavior).
                if matches!(v, Value::Null) {
                    mask.push(false);
                    continue;
                }
                match coerce_to_bool(v) {
                    Some(b) => mask.push(b),
                    None => return Value::Error(ValueError::WrongType),
                }
            }
            let kept: Vec<usize> = mask
                .iter()
                .enumerate()
                .filter_map(|(i, &b)| if b { Some(i) } else { None })
                .collect();
            if kept.is_empty() {
                if args.len() == 3 {
                    let v = eval_expr_with_provider(&args[2], provider);
                    // Wrap whatever it is in a 1×1 array. Errors flow through
                    // as the array element (Excel parity: =FILTER(...,error)
                    // surfaces the error inside the spill).
                    return Value::Array(Arc::new(ArrayData::new(1, 1, vec![v])));
                }
                return Value::Error(ValueError::Calc);
            }
            if filter_rows {
                let out_rows = kept.len() as u32;
                let mut out: Vec<Value> = Vec::with_capacity(kept.len() * (cols as usize));
                for &r in &kept {
                    let base = r * (cols as usize);
                    out.extend(data[base..base + (cols as usize)].iter().cloned());
                }
                Value::Array(Arc::new(ArrayData::new(out_rows, cols, out)))
            } else {
                let out_cols = kept.len() as u32;
                let mut out: Vec<Value> = Vec::with_capacity((rows as usize) * kept.len());
                for r in 0..rows {
                    for &c in &kept {
                        out.push(data[(r as usize) * (cols as usize) + c].clone());
                    }
                }
                Value::Array(Arc::new(ArrayData::new(rows, out_cols, out)))
            }
        }

        // ── Array higher-order functions (L3 of the LAMBDA arc) ──────
        //
        // All of these take a lambda value as one of their arguments
        // (always the LAST one — Excel's calling convention) and apply
        // it pointwise / by row / by column / accumulator-style to
        // produce a derived array. Lambdas reach them either inline
        // (`=MAP(SEQUENCE(5), LAMBDA(x, x*2))`) or via a LET binding
        // (`=LET(sq, LAMBDA(x, x*x), MAP(A1:A5, sq))`).
        //
        // Common patterns:
        //   - Lambda arg evaluated first; non-lambda → WrongType.
        //   - Arity matched at call time; mismatch → WrongArgCount.
        //   - Per-element scalar errors stay in result arrays; nested array
        //     callback results are rejected as #CALC!.

        // MAP(array1, ..., arrayN, lambda)
        //
        // Lambda must accept exactly N arguments (one per input array).
        // All input arrays must share the same shape — mismatch → WrongType.
        // The result has the same shape as the inputs; each cell is
        // `lambda(array1[i,j], ..., arrayN[i,j])`.
        "MAP" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // Last arg is the lambda. Evaluate it first so a non-lambda
            // surfaces a clean error before doing any array work.
            let lambda_v = eval_expr_with_provider(&args[args.len() - 1], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            let n_arrays = args.len() - 1;
            // Gather every input array as a 2D buffer + shape.
            let mut grids: Vec<(u32, u32, Vec<Value>)> = Vec::with_capacity(n_arrays);
            for arg in &args[..n_arrays] {
                let (r, c, d) = match arg_to_2d(arg, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                grids.push((r, c, d));
            }
            // All inputs must share the same shape.
            let (rows, cols, _) = grids[0];
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            for (r, c, _) in &grids[1..] {
                if *r != rows || *c != cols {
                    return Value::Error(ValueError::WrongType);
                }
            }
            // Arity check on the lambda. apply_lambda would catch this
            // per-cell, but we'd waste work — fail eagerly with a clear
            // signal that the lambda doesn't fit the call shape.
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != n_arrays {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            // Cap matches SEQUENCE — keep allocations bounded.
            let total = (rows as u64) * (cols as u64);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut out: Vec<Value> = Vec::with_capacity(total as usize);
            for i in 0..rows {
                for j in 0..cols {
                    let idx = (i as usize) * (cols as usize) + (j as usize);
                    let cell_args: Vec<Value> =
                        grids.iter().map(|(_, _, d)| d[idx].clone()).collect();
                    let v = match apply_lambda_for_array_cell(&lambda_v, cell_args, provider) {
                        Ok(v) => v,
                        Err(e) => return Value::Error(e),
                    };
                    out.push(v);
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
        }

        // REDUCE(initial, array, lambda)
        //
        // Lambda takes 2 args: (accumulator, value). Walks the array in
        // row-major order, accumulator = lambda(accumulator, value).
        // Returns the final accumulator — SCALAR result (NOT an Array).
        // The L3 spec is explicit: REDUCE returns a scalar; use SCAN if
        // you want the trail of intermediate accumulators.
        "REDUCE" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let initial = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = initial {
                return Value::Error(e);
            }
            let (rows, cols, data) = match arg_to_2d(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let lambda_v = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != 2 {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            let mut acc = initial;
            for i in 0..rows {
                for j in 0..cols {
                    let idx = (i as usize) * (cols as usize) + (j as usize);
                    let v = data[idx].clone();
                    acc = apply_lambda(&lambda_v, vec![acc, v], provider);
                    if let Value::Error(e) = &acc {
                        return Value::Error(e.clone());
                    }
                }
            }
            acc
        }

        // SCAN(initial, array, lambda)
        //
        // Same accumulator pattern as REDUCE, but emits an Array of the
        // INTERMEDIATE accumulator values (same shape as the input
        // array). `out[i,j] = lambda(acc, array[i,j])` where `acc` is
        // updated in place row-major. SCAN is the spillable counterpart
        // of REDUCE.
        "SCAN" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let initial = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = initial {
                return Value::Error(e);
            }
            let (rows, cols, data) = match arg_to_2d(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let lambda_v = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != 2 {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let total = (rows as u64) * (cols as u64);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut out: Vec<Value> = Vec::with_capacity(total as usize);
            let mut acc = initial;
            for i in 0..rows {
                for j in 0..cols {
                    let idx = (i as usize) * (cols as usize) + (j as usize);
                    let v = data[idx].clone();
                    acc = match apply_lambda_for_array_cell(&lambda_v, vec![acc, v], provider) {
                        Ok(v) => v,
                        Err(e) => return Value::Error(e),
                    };
                    out.push(acc.clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
        }

        // BYROW(array, lambda) and BYCOL(array, lambda)
        //
        // Lambda takes a SINGLE argument — a row (1×cols Array) for
        // BYROW or a column (rows×1 Array) for BYCOL. Result shape is
        // N×1 (BYROW: one accumulator per row) or 1×N (BYCOL: one per
        // column). The "row" / "column" passed to the lambda is itself
        // a `Value::Array`, NOT a flat list — this is what lets
        // `BYROW(input, LAMBDA(r, SUM(r)))` work (SUM unwraps the Array
        // through `for_each_arg_value`).
        "BYROW" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let lambda_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != 1 {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut out: Vec<Value> = Vec::with_capacity(rows as usize);
            for i in 0..rows {
                let base = (i as usize) * (cols as usize);
                let row_data: Vec<Value> =
                    data[base..base + (cols as usize)].iter().cloned().collect();
                let row_arr = Value::Array(Arc::new(ArrayData::new(1, cols, row_data)));
                let v = match apply_lambda_for_array_cell(&lambda_v, vec![row_arr], provider) {
                    Ok(v) => v,
                    Err(e) => return Value::Error(e),
                };
                out.push(v);
            }
            Value::Array(Arc::new(ArrayData::new(rows, 1, out)))
        }

        "BYCOL" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let lambda_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != 1 {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut out: Vec<Value> = Vec::with_capacity(cols as usize);
            for j in 0..cols {
                let mut col_data: Vec<Value> = Vec::with_capacity(rows as usize);
                for i in 0..rows {
                    let idx = (i as usize) * (cols as usize) + (j as usize);
                    col_data.push(data[idx].clone());
                }
                let col_arr = Value::Array(Arc::new(ArrayData::new(rows, 1, col_data)));
                let v = match apply_lambda_for_array_cell(&lambda_v, vec![col_arr], provider) {
                    Ok(v) => v,
                    Err(e) => return Value::Error(e),
                };
                out.push(v);
            }
            Value::Array(Arc::new(ArrayData::new(1, cols, out)))
        }

        // MAKEARRAY(rows, cols, lambda)
        //
        // Lambda takes 2 args: (row_index, col_index), both 1-based
        // (Excel parity). Returns a rows×cols Array where each cell is
        // `lambda(i, j)`. Same 1M-element cap as SEQUENCE — keeps
        // allocations bounded.
        "MAKEARRAY" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let rows_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = rows_v {
                return Value::Error(e);
            }
            let cols_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = cols_v {
                return Value::Error(e);
            }
            let rows = match coerce_to_number(&rows_v) {
                Some(n) if n >= 1.0 => n.trunc() as u64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let cols = match coerce_to_number(&cols_v) {
                Some(n) if n >= 1.0 => n.trunc() as u64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let total = rows.checked_mul(cols).unwrap_or(u64::MAX);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
            let lambda_v = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != 2 {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            let rows_u = rows as u32;
            let cols_u = cols as u32;
            let mut out: Vec<Value> = Vec::with_capacity(total as usize);
            for i in 1..=rows_u {
                for j in 1..=cols_u {
                    let v = match apply_lambda_for_array_cell(
                        &lambda_v,
                        vec![Value::Number(i as f64), Value::Number(j as f64)],
                        provider,
                    ) {
                        Ok(v) => v,
                        Err(e) => return Value::Error(e),
                    };
                    out.push(v);
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows_u, cols_u, out)))
        }

        "SORTBY" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // Validate the trailing arg pattern. After `array`, args come in
            // (by_array, [sort_order]) pairs; the order arg is optional, so we
            // accept any number of trailing args as long as they parse cleanly.
            // We walk the args list and pull (by_array, order) groups.
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            // Each key: (Vec<Value> with `rows` entries, order: i32)
            let mut keys: Vec<(Vec<Value>, i32)> = Vec::new();
            let mut idx = 1;
            while idx < args.len() {
                let (krows, kcols, kdata) = match arg_to_2d(&args[idx], provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                // by_array must have rows == array.rows. Accept either a column
                // vector (kcols == 1) or take the first column otherwise — but
                // strict Excel parity requires a single column shape, so reject
                // anything else.
                if krows != rows || kcols != 1 {
                    return Value::Error(ValueError::InvalidValue);
                }
                // Propagate any errors found in this key array.
                for v in &kdata {
                    if let Value::Error(e) = v {
                        return Value::Error(e.clone());
                    }
                }
                // Optional sort_order following the by_array.
                let order = if idx + 1 < args.len() {
                    // Peek the next arg. If it evaluates to a number 1 or -1,
                    // treat it as the order. We cannot disambiguate "by_array
                    // shaped like a 1-element array passed as a key" from
                    // "scalar 1 used as sort_order"; Excel resolves this by
                    // strictly requiring a scalar where a sort_order is
                    // expected. We follow the SORT precedent: any arg that
                    // coerces to a scalar 1 / -1 is taken as the order.
                    // Evaluate without consuming: if it's a range/array, treat
                    // as the next key.
                    let is_range =
                        matches!(&args[idx + 1], Expr::Range { .. } | Expr::SheetRange { .. });
                    if is_range {
                        // Definitely another key; no explicit order.
                        1i32
                    } else {
                        let v = eval_expr_with_provider(&args[idx + 1], provider);
                        if let Value::Error(e) = v {
                            return Value::Error(e);
                        }
                        match coerce_to_number(&v) {
                            Some(n) if n == 1.0 => {
                                idx += 1;
                                1i32
                            }
                            Some(n) if n == -1.0 => {
                                idx += 1;
                                -1i32
                            }
                            _ => return Value::Error(ValueError::InvalidValue),
                        }
                    }
                } else {
                    1i32
                };
                keys.push((kdata, order));
                idx += 1;
            }
            if keys.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            // Build the permutation. Stable sort_by lets us cleanly express
            // multi-key precedence: compare key[0]; if equal, compare key[1];
            // etc. Stability covers any final ties.
            let mut order: Vec<u32> = (0..rows).collect();
            order.sort_by(|&a, &b| {
                for (kdata, sort_order) in &keys {
                    let va = &kdata[a as usize];
                    let vb = &kdata[b as usize];
                    let mut c = compare_lookup(va, vb);
                    if *sort_order == -1 {
                        c = c.reverse();
                    }
                    if c != std::cmp::Ordering::Equal {
                        return c;
                    }
                }
                std::cmp::Ordering::Equal
            });
            // Re-assemble `data` in the new row order.
            let mut out: Vec<Value> = Vec::with_capacity(data.len());
            for &r in &order {
                for c in 0..cols {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
        }
        "RANDARRAY" => {
            if args.len() > 5 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let rows = if !args.is_empty() {
                let v = eval_expr_with_provider(&args[0], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) if n >= 1.0 => n.trunc() as u64,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1u64
            };
            let cols = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) if n >= 1.0 => n.trunc() as u64,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1u64
            };
            let min_v = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0.0
            };
            let max_v = if args.len() >= 4 {
                let v = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1.0
            };
            let whole = if args.len() == 5 {
                let v = eval_expr_with_provider(&args[4], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            if min_v > max_v {
                return Value::Error(ValueError::InvalidValue);
            }
            if whole && (min_v.fract() != 0.0 || max_v.fract() != 0.0) {
                return Value::Error(ValueError::InvalidValue);
            }
            let total = rows.checked_mul(cols).unwrap_or(u64::MAX);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
            // Seed from system clock + a tiny mix so two rapid calls don't
            // collide. We don't have access to a `rand` crate; xorshift64
            // is plenty for spreadsheet RNG.
            let seed = {
                use std::time::{SystemTime, UNIX_EPOCH};
                let nanos = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_nanos() as u64)
                    .unwrap_or(0x9E37_79B9_7F4A_7C15);
                // XOR in the requested shape so back-to-back calls of the
                // same shape still vary.
                nanos ^ ((rows as u64) << 32) ^ (cols as u64)
            };
            let mut state: u64 = if seed == 0 {
                0x9E37_79B9_7F4A_7C15
            } else {
                seed
            };
            let next_u64 = |s: &mut u64| -> u64 {
                // xorshift64
                let mut x = *s;
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                *s = x;
                x
            };
            let rows_u = rows as u32;
            let cols_u = cols as u32;
            let mut data: Vec<Value> = Vec::with_capacity(total as usize);
            if whole {
                let min_i = min_v as i64;
                let max_i = max_v as i64;
                // Inclusive range size.
                let span = (max_i - min_i) as u64 + 1;
                for _ in 0..total {
                    let r = next_u64(&mut state) % span;
                    data.push(Value::Number((min_i as f64) + (r as f64)));
                }
            } else {
                let span = max_v - min_v;
                for _ in 0..total {
                    // Mantissa-style uniform [0,1).
                    let r = (next_u64(&mut state) >> 11) as f64 * (1.0f64 / ((1u64 << 53) as f64));
                    data.push(Value::Number(min_v + r * span));
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows_u, cols_u, data)))
        }
        "TAKE" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let rows_arg_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = rows_arg_v {
                return Value::Error(e);
            }
            let rows_arg = match coerce_to_number(&rows_arg_v) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            if rows_arg == 0 {
                return Value::Error(ValueError::Calc);
            }
            let cols_arg = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                let n = match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                };
                if n == 0 {
                    return Value::Error(ValueError::Calc);
                }
                Some(n)
            } else {
                None
            };
            // Compute row slice [r_start, r_end).
            let (r_start, r_end) = if rows_arg > 0 {
                let take = (rows_arg as u32).min(rows);
                (0u32, take)
            } else {
                let want = ((-rows_arg) as u32).min(rows);
                (rows - want, rows)
            };
            // Compute col slice [c_start, c_end).
            let (c_start, c_end) = match cols_arg {
                None => (0u32, cols),
                Some(n) if n > 0 => (0u32, (n as u32).min(cols)),
                Some(n) => {
                    let want = ((-n) as u32).min(cols);
                    (cols - want, cols)
                }
            };
            let out_rows = r_end - r_start;
            let out_cols = c_end - c_start;
            let cap = match checked_array_len(out_rows as u64, out_cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for r in r_start..r_end {
                for c in c_start..c_end {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, out_cols, out)))
        }
        "DROP" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let rows_arg_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = rows_arg_v {
                return Value::Error(e);
            }
            let rows_arg = match coerce_to_number(&rows_arg_v) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let cols_arg = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => Some(n.trunc() as i64),
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                None
            };
            // Row slice [r_start, r_end).
            let (r_start, r_end) = if rows_arg >= 0 {
                let drop = (rows_arg as u32).min(rows);
                (drop, rows)
            } else {
                let drop = ((-rows_arg) as u32).min(rows);
                (0u32, rows - drop)
            };
            // Col slice [c_start, c_end).
            let (c_start, c_end) = match cols_arg {
                None => (0u32, cols),
                Some(n) if n >= 0 => ((n as u32).min(cols), cols),
                Some(n) => {
                    let drop = ((-n) as u32).min(cols);
                    (0u32, cols - drop)
                }
            };
            if r_end <= r_start || c_end <= c_start {
                return Value::Error(ValueError::Calc);
            }
            let out_rows = r_end - r_start;
            let out_cols = c_end - c_start;
            let cap = match checked_array_len(out_rows as u64, out_cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for r in r_start..r_end {
                for c in c_start..c_end {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, out_cols, out)))
        }
        "VSTACK" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut blocks: Vec<(u32, u32, Vec<Value>)> = Vec::with_capacity(args.len());
            for a in args {
                let (r, c, d) = match arg_to_2d(a, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                if r == 0 || c == 0 {
                    return Value::Error(ValueError::InvalidValue);
                }
                blocks.push((r, c, d));
            }
            let out_cols = blocks.iter().map(|(_, c, _)| *c).max().unwrap_or(0);
            let out_rows_u64 = blocks
                .iter()
                .try_fold(0u64, |acc, (r, _, _)| acc.checked_add(*r as u64))
                .unwrap_or(u64::MAX);
            let cap = match checked_array_len(out_rows_u64, out_cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let out_rows = match u32::try_from(out_rows_u64) {
                Ok(v) => v,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for (br, bc, bd) in &blocks {
                for r in 0..*br {
                    for c in 0..out_cols {
                        if c < *bc {
                            out.push(bd[(r as usize) * (*bc as usize) + (c as usize)].clone());
                        } else {
                            out.push(Value::Error(ValueError::NotAvailable));
                        }
                    }
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, out_cols, out)))
        }
        "HSTACK" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut blocks: Vec<(u32, u32, Vec<Value>)> = Vec::with_capacity(args.len());
            for a in args {
                let (r, c, d) = match arg_to_2d(a, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                if r == 0 || c == 0 {
                    return Value::Error(ValueError::InvalidValue);
                }
                blocks.push((r, c, d));
            }
            let out_rows = blocks.iter().map(|(r, _, _)| *r).max().unwrap_or(0);
            let out_cols_u64 = blocks
                .iter()
                .try_fold(0u64, |acc, (_, c, _)| acc.checked_add(*c as u64))
                .unwrap_or(u64::MAX);
            let cap = match checked_array_len(out_rows as u64, out_cols_u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let out_cols = match u32::try_from(out_cols_u64) {
                Ok(v) => v,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for r in 0..out_rows {
                for (br, bc, bd) in &blocks {
                    for c in 0..*bc {
                        if r < *br {
                            out.push(bd[(r as usize) * (*bc as usize) + (c as usize)].clone());
                        } else {
                            out.push(Value::Error(ValueError::NotAvailable));
                        }
                    }
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, out_cols, out)))
        }
        "CHOOSEROWS" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut picks: Vec<u32> = Vec::with_capacity(args.len() - 1);
            for a in &args[1..] {
                let v = eval_expr_with_provider(a, provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                let n = match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                };
                let resolved: i64 = if n > 0 {
                    n - 1
                } else if n < 0 {
                    (rows as i64) + n
                } else {
                    return Value::Error(ValueError::InvalidValue);
                };
                if resolved < 0 || resolved >= rows as i64 {
                    return Value::Error(ValueError::InvalidValue);
                }
                picks.push(resolved as u32);
            }
            let out_rows = picks.len() as u32;
            // 格数闸门：pick 可以重复，输出行数不受输入行数约束
            // （`=CHOOSEROWS(A1:XFD1,1,1,…)` 每多一个实参就多复制一整行）。
            let cap = match checked_array_len(out_rows as u64, cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for &r in &picks {
                for c in 0..cols {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, cols, out)))
        }
        "CHOOSECOLS" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut picks: Vec<u32> = Vec::with_capacity(args.len() - 1);
            for a in &args[1..] {
                let v = eval_expr_with_provider(a, provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                let n = match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                };
                let resolved: i64 = if n > 0 {
                    n - 1
                } else if n < 0 {
                    (cols as i64) + n
                } else {
                    return Value::Error(ValueError::InvalidValue);
                };
                if resolved < 0 || resolved >= cols as i64 {
                    return Value::Error(ValueError::InvalidValue);
                }
                picks.push(resolved as u32);
            }
            let out_cols = picks.len() as u32;
            // 同 CHOOSEROWS：输出列数由实参个数决定，不受输入列数约束。
            let cap = match checked_array_len(rows as u64, out_cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for r in 0..rows {
                for &c in &picks {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, out_cols, out)))
        }
        "TOROW" => {
            if args.is_empty() || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let ignore = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0i64
            };
            if !(0..=3).contains(&ignore) {
                return Value::Error(ValueError::InvalidValue);
            }
            let by_col = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            let skip_blanks = ignore == 1 || ignore == 3;
            let skip_errors = ignore == 2 || ignore == 3;
            let mut out: Vec<Value> = Vec::with_capacity(data.len());
            let push = |v: &Value, out: &mut Vec<Value>| {
                let drop = (skip_blanks && matches!(v, Value::Null))
                    || (skip_errors && matches!(v, Value::Error(_)));
                if !drop {
                    out.push(v.clone());
                }
            };
            if by_col {
                for c in 0..cols {
                    for r in 0..rows {
                        push(
                            &data[(r as usize) * (cols as usize) + (c as usize)],
                            &mut out,
                        );
                    }
                }
            } else {
                for r in 0..rows {
                    for c in 0..cols {
                        push(
                            &data[(r as usize) * (cols as usize) + (c as usize)],
                            &mut out,
                        );
                    }
                }
            }
            if out.is_empty() {
                return Value::Error(ValueError::Calc);
            }
            let out_cols = match u32::try_from(out.len()) {
                Ok(v) => v,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            Value::Array(Arc::new(ArrayData::new(1, out_cols, out)))
        }
        "TOCOL" => {
            if args.is_empty() || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let ignore = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0i64
            };
            if !(0..=3).contains(&ignore) {
                return Value::Error(ValueError::InvalidValue);
            }
            let by_col = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            let skip_blanks = ignore == 1 || ignore == 3;
            let skip_errors = ignore == 2 || ignore == 3;
            let mut out: Vec<Value> = Vec::with_capacity(data.len());
            let push = |v: &Value, out: &mut Vec<Value>| {
                let drop = (skip_blanks && matches!(v, Value::Null))
                    || (skip_errors && matches!(v, Value::Error(_)));
                if !drop {
                    out.push(v.clone());
                }
            };
            if by_col {
                for c in 0..cols {
                    for r in 0..rows {
                        push(
                            &data[(r as usize) * (cols as usize) + (c as usize)],
                            &mut out,
                        );
                    }
                }
            } else {
                for r in 0..rows {
                    for c in 0..cols {
                        push(
                            &data[(r as usize) * (cols as usize) + (c as usize)],
                            &mut out,
                        );
                    }
                }
            }
            if out.is_empty() {
                return Value::Error(ValueError::Calc);
            }
            let out_rows = match u32::try_from(out.len()) {
                Ok(v) => v,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            Value::Array(Arc::new(ArrayData::new(out_rows, 1, out)))
        }
        // TOROW / TOCOL 的反方向：把一维向量折回二维。方向依据与全部错误
        // 口径写在 `eval_wrap.rs` 的模块注释里（这一对极容易搞反）。
        "WRAPROWS" => eval_wrap::fn_wraprows(args, provider),
        "WRAPCOLS" => eval_wrap::fn_wrapcols(args, provider),
        "NORM.DIST" => stat_norm_dist(args, provider),
        "NORM.INV" => stat_norm_inv(args, provider),
        "NORM.S.DIST" => stat_norm_s_dist(args, provider),
        "NORM.S.INV" => stat_norm_s_inv(args, provider),
        "T.DIST" => stat_t_dist(args, provider),
        "T.DIST.RT" => stat_t_dist_rt(args, provider),
        "T.DIST.2T" => stat_t_dist_2t(args, provider),
        "T.INV" => stat_t_inv(args, provider),
        "T.INV.2T" => stat_t_inv_2t(args, provider),
        "F.DIST" => stat_f_dist(args, provider),
        "F.DIST.RT" => stat_f_dist_rt(args, provider),
        "F.INV" => stat_f_inv(args, provider),
        "F.INV.RT" => stat_f_inv_rt(args, provider),
        "CHISQ.DIST" => stat_chisq_dist(args, provider),
        "CHISQ.DIST.RT" => stat_chisq_dist_rt(args, provider),
        "CHISQ.INV" => stat_chisq_inv(args, provider),
        "CHISQ.INV.RT" => stat_chisq_inv_rt(args, provider),
        "EXPON.DIST" => stat_expon_dist(args, provider),
        "WEIBULL.DIST" => stat_weibull_dist(args, provider),
        "BETA.DIST" => stat_beta_dist(args, provider),
        "BETA.INV" => stat_beta_inv(args, provider),
        "GAMMA.DIST" => stat_gamma_dist(args, provider),
        "GAMMA.INV" => stat_gamma_inv(args, provider),
        "BINOM.DIST" => stat_binom_dist(args, provider),
        "BINOM.INV" => stat_binom_inv(args, provider),
        "POISSON.DIST" => stat_poisson_dist(args, provider),
        "HYPGEOM.DIST" => stat_hypgeom_dist(args, provider),
        "NEGBINOM.DIST" => stat_negbinom_dist(args, provider),
        "GAMMA" => stat_gamma_func(args, provider),
        "GAMMALN" => stat_gammaln(args, provider),
        "ERF" => stat_erf(args, provider),
        "ERFC" => stat_erfc(args, provider),
        "KURT" => stat_kurt(args, provider),
        "SKEW" => stat_skew(args, provider),
        "AVEDEV" => stat_avedev(args, provider),
        "DEVSQ" => stat_devsq(args, provider),
        "GEOMEAN" => stat_geomean(args, provider),
        "HARMEAN" => stat_harmean(args, provider),
        "TRIMMEAN" => stat_trimmean(args, provider),
        "STANDARDIZE" => stat_standardize(args, provider),
        "FISHER" => stat_fisher(args, provider),
        "FISHERINV" => stat_fisherinv(args, provider),
        // Fallthrough: not a built-in. Before surfacing #NAME?, consult the
        // workbook's defined-name registry — a stored `Value::Lambda` makes
        // `=SQUARE(5)` work after `define_name("SQUARE", "=LAMBDA(x, x*x)")`.
        // Non-lambda named values aren't callable as a function (Excel parity:
        // `=answer()` when `answer` is 42 is a #VALUE!, not 42).
        "SLN" => fn_sln(args, provider),
        "SYD" => fn_syd(args, provider),
        "DB" => fn_db(args, provider),
        "DDB" => fn_ddb(args, provider),
        "VDB" => fn_vdb(args, provider),
        "CUMIPMT" => fn_cumipmt(args, provider),
        "CUMPRINC" => fn_cumprinc(args, provider),
        "EFFECT" => fn_effect(args, provider),
        "NOMINAL" => fn_nominal(args, provider),
        "ISPMT" => fn_ispmt(args, provider),
        "ACCRINT" => fn_accrint(args, provider),
        "ACCRINTM" => fn_accrintm(args, provider),
        "DISC" => fn_disc(args, provider),
        "INTRATE" => fn_intrate(args, provider),
        "RECEIVED" => fn_received(args, provider),
        "TBILLEQ" => fn_tbilleq(args, provider),
        "TBILLPRICE" => fn_tbillprice(args, provider),
        "TBILLYIELD" => fn_tbillyield(args, provider),
        "XIRR" => fn_xirr(args, provider),
        "XNPV" => fn_xnpv(args, provider),
        "MIRR" => fn_mirr(args, provider),
        "PRICE" => fn_price(args, provider),
        "YIELD" => fn_yield(args, provider),
        "DURATION" => fn_duration(args, provider),
        "MDURATION" => fn_mduration(args, provider),
        "PRICEDISC" => fn_pricedisc(args, provider),
        "YIELDDISC" => fn_yielddisc(args, provider),
        "PRICEMAT" => fn_pricemat(args, provider),
        "YIELDMAT" => fn_yieldmat(args, provider),
        "DOLLARDE" => fn_dollarde(args, provider),
        "DOLLARFR" => fn_dollarfr(args, provider),
        "COUPDAYBS" => fn_coupdaybs(args, provider),
        "COUPDAYS" => fn_coupdays(args, provider),
        "COUPNUM" => fn_coupnum(args, provider),
        "AMORDEGRC" => fn_amordegrc(args, provider),
        "AMORLINC" => fn_amorlinc(args, provider),
        "UNICHAR" => fn_unichar(args, provider),
        "UNICODE" => fn_unicode(args, provider),
        "NUMBERVALUE" => fn_numbervalue(args, provider),
        "ARRAYTOTEXT" => fn_arraytotext(args, provider),
        "VALUETOTEXT" => fn_valuetotext(args, provider),
        // Gated on `regex-formulas`. With the feature off these three names
        // are absent from the dispatch table, so they take the `_` arm into
        // `eval_named_call` and end at `#NAME?` — no special-casing needed.
        #[cfg(feature = "regex-formulas")]
        "REGEXTEST" => eval_regex::fn_regextest(args, provider),
        #[cfg(feature = "regex-formulas")]
        "REGEXEXTRACT" => eval_regex::fn_regexextract(args, provider),
        #[cfg(feature = "regex-formulas")]
        "REGEXREPLACE" => eval_regex::fn_regexreplace(args, provider),
        "ISFORMULA" => fn_isformula(args, provider),
        "SHEET" => fn_sheet(args, provider),
        "SHEETS" => fn_sheets(args, provider),
        "INFO" => fn_info(args, provider),
        "COMPLEX" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let real = match coerce_to_number(&eval_expr_with_provider(&args[0], provider)) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let imag = match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let suffix = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match v {
                    Value::Text(s) if s == "i" => 'i',
                    Value::Text(s) if s == "j" => 'j',
                    // Excel surfaces #VALUE! for any other suffix.
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                'i'
            };
            if !real.is_finite() || !imag.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(real, imag, suffix))
        }
        "IMABS" => complex_unary_number(args, provider, |a, b| (a * a + b * b).sqrt()),
        "IMAGINARY" => complex_unary_number(args, provider, |_a, b| b),
        "IMREAL" => complex_unary_number(args, provider, |a, _b| a),
        "IMARGUMENT" => {
            // Excel: IMARGUMENT(0) is #DIV/0! (no well-defined
            // argument at the origin). atan2(0, 0) returns 0 in Rust,
            // which would silently mask that case — guard explicitly.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, _s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if a == 0.0 && b == 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            Value::Number(b.atan2(a))
        }
        "IMCONJUGATE" => complex_unary_text(args, provider, |a, b, s| (a, -b, s)),
        "IMSUM" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (mut sum_r, mut sum_i, suffix) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            for arg in &args[1..] {
                let (r, i, _s) = match eval_complex_arg(arg, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                sum_r += r;
                sum_i += i;
            }
            if !sum_r.is_finite() || !sum_i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(sum_r, sum_i, suffix))
        }
        "IMSUB" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, suffix) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (c, d, _s) = match eval_complex_arg(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let r = a - c;
            let i = b - d;
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, suffix))
        }
        "IMPRODUCT" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (mut pr, mut pi, suffix) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            for arg in &args[1..] {
                let (r, i, _s) = match eval_complex_arg(arg, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                let (nr, ni) = complex_mul(pr, pi, r, i);
                pr = nr;
                pi = ni;
            }
            if !pr.is_finite() || !pi.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(pr, pi, suffix))
        }
        "IMDIV" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, suffix) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (c, d, _s) = match eval_complex_arg(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (r, i) = match complex_div(a, b, c, d) {
                Some(z) => z,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, suffix))
        }
        "IMEXP" => complex_unary_text(args, provider, |a, b, s| {
            let mag = a.exp();
            (mag * b.cos(), mag * b.sin(), s)
        }),
        "IMLN" => {
            // ln(z) = ln|z| + i*arg(z). Domain: z != 0.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if a == 0.0 && b == 0.0 {
                return Value::Error(ValueError::Overflow);
            }
            let r = (a * a + b * b).sqrt().ln();
            let i = b.atan2(a);
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMLOG10" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if a == 0.0 && b == 0.0 {
                return Value::Error(ValueError::Overflow);
            }
            let denom = 10.0_f64.ln();
            let r = (a * a + b * b).sqrt().ln() / denom;
            let i = b.atan2(a) / denom;
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMLOG2" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if a == 0.0 && b == 0.0 {
                return Value::Error(ValueError::Overflow);
            }
            let denom = 2.0_f64.ln();
            let r = (a * a + b * b).sqrt().ln() / denom;
            let i = b.atan2(a) / denom;
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMSQRT" => complex_unary_text(args, provider, |a, b, s| {
            // sqrt(z) = sqrt(r) * (cos(arg/2) + sin(arg/2)i), principal value.
            let r = (a * a + b * b).sqrt();
            let arg_half = b.atan2(a) / 2.0;
            let mag = r.sqrt();
            (mag * arg_half.cos(), mag * arg_half.sin(), s)
        }),
        "IMPOWER" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let n = match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
                Some(x) => x,
                None => return Value::Error(ValueError::WrongType),
            };
            // De Moivre. Origin handling: 0^0 mirrors POWER (Excel
            // returns 1), 0^positive == 0, 0^negative is #NUM!.
            if a == 0.0 && b == 0.0 {
                if n == 0.0 {
                    return Value::Text(format_complex(1.0, 0.0, s));
                }
                if n < 0.0 {
                    return Value::Error(ValueError::Overflow);
                }
                return Value::Text(format_complex(0.0, 0.0, s));
            }
            let r = (a * a + b * b).sqrt();
            let arg = b.atan2(a);
            let mag = r.powf(n);
            let theta = arg * n;
            let real = mag * theta.cos();
            let imag = mag * theta.sin();
            if !real.is_finite() || !imag.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(real, imag, s))
        }
        "IMCOS" => complex_unary_text(args, provider, |a, b, s| {
            (a.cos() * b.cosh(), -a.sin() * b.sinh(), s)
        }),
        "IMCOSH" => complex_unary_text(args, provider, |a, b, s| {
            (a.cosh() * b.cos(), a.sinh() * b.sin(), s)
        }),
        "IMSIN" => complex_unary_text(args, provider, |a, b, s| {
            (a.sin() * b.cosh(), a.cos() * b.sinh(), s)
        }),
        "IMSINH" => complex_unary_text(args, provider, |a, b, s| {
            (a.sinh() * b.cos(), a.cosh() * b.sin(), s)
        }),
        "IMTAN" => {
            // tan = sin/cos. Singularities at z = (k + 1/2)π for real
            // z; cos hits zero exactly there. Surface #NUM! per Excel
            // when the denominator is zero (we use Overflow which maps
            // to #NUM!).
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (sin_r, sin_i) = (a.sin() * b.cosh(), a.cos() * b.sinh());
            let (cos_r, cos_i) = (a.cos() * b.cosh(), -a.sin() * b.sinh());
            let (r, i) = match complex_div(sin_r, sin_i, cos_r, cos_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMSEC" => {
            // sec = 1/cos.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (cos_r, cos_i) = (a.cos() * b.cosh(), -a.sin() * b.sinh());
            let (r, i) = match complex_div(1.0, 0.0, cos_r, cos_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMCSC" => {
            // csc = 1/sin.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (sin_r, sin_i) = (a.sin() * b.cosh(), a.cos() * b.sinh());
            let (r, i) = match complex_div(1.0, 0.0, sin_r, sin_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMCOT" => {
            // cot = cos/sin.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (cos_r, cos_i) = (a.cos() * b.cosh(), -a.sin() * b.sinh());
            let (sin_r, sin_i) = (a.sin() * b.cosh(), a.cos() * b.sinh());
            let (r, i) = match complex_div(cos_r, cos_i, sin_r, sin_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        // AREAS(reference) — count the number of disjoint areas in a
        // reference. Excel parity:
        //   • A bare cell ref or range counts as 1 area.
        //   • A multi-area `(A1:B2, D5:E6)` counts each part separately.
        //   • Cross-sheet refs / ranges count as 1.
        //   • Anything else (literals, arithmetic, function calls that
        //     return scalars) → #VALUE!.
        //
        // The argument is inspected as an AST (not evaluated) because the
        // multi-area syntax doesn't produce a scalar value — see
        // `Expr::MultiArea`'s eval arm. `=AREAS(1+2)` is a parse-tree
        // BinOp, not a ref, so it surfaces #VALUE! per Excel.
        "AREAS" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match &args[0] {
                Expr::MultiArea(parts) => Value::Number(parts.len() as f64),
                Expr::CellRef(..)
                | Expr::Range { .. }
                | Expr::SheetRef { .. }
                | Expr::SheetRange { .. } => Value::Number(1.0),
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // Asian text-conversion functions. ASC narrows full-width forms to
        // half-width (decomposing voiced/semi-voiced kana into base + mark);
        // JIS / DBCS widen the inverse direction and re-compose dakuten /
        // handakuten sequences. See `asc_convert` / `jis_convert` for the
        // exact mapping tables and the Excel JIS yen-sign quirk
        // (U+FFE5 ￥ decomposes to U+005C backslash, not U+00A5).
        "ASC" => text_unary(args, provider, |s| asc_convert(s)),
        // DBCS is the Excel-2013-era alias for JIS — both widen half-width
        // forms to full-width. We route DBCS through `jis_convert` so the
        // implementations stay in lockstep.
        "JIS" | "DBCS" => text_unary(args, provider, |s| jis_convert(s)),
        // PHONETIC returns ruby/furigana annotation that Excel attaches to
        // cells via an out-of-band sidecar. We don't store ruby metadata, so
        // match the no-annotation fallback and return the source text.
        "PHONETIC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match eval_text_arg(&args[0], provider) {
                Ok(text) => Value::Text(text),
                Err(e) => Value::Error(e),
            }
        }
        // HYPERLINK(link_location, [friendly_name]) — 1 or 2 args.
        // The formula's RESULT is the `friendly_name` (or `link_location` if
        // absent), coerced to text. Excel's UI separately renders the result
        // as a clickable link to `link_location`; that rendering is HOST
        // INTEGRATION (the JS / WASM consumer can detect a HYPERLINK by
        // inspecting the formula text — e.g. `formula.starts_with("=HYPERLINK(")`
        // — and decorate the displayed value accordingly). The Rust core only
        // returns the text label.
        //
        // Error propagation: if either argument evaluates to an Error, the
        // error short-circuits (left-to-right). Empty `link_location` text
        // and no `friendly_name` returns "" (matches Excel parity — Excel
        // shows an empty cell when both are blank).
        //
        // future: WEBSERVICE / FILTERXML are not implemented (require HTTP +
        // XML parsing, out of scope for this batch).
        "HYPERLINK" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let link_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = link_v {
                return Value::Error(e);
            }
            let link_text = coerce_to_text(&link_v);
            if args.len() == 2 {
                let friendly_v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = friendly_v {
                    return Value::Error(e);
                }
                Value::Text(coerce_to_text(&friendly_v))
            } else {
                Value::Text(link_text)
            }
        }
        // IMAGE(source, [alt_text], [sizing=0], [height], [width]) — 1..=5 args.
        //
        //   source  : URL or local file path. Coerced to text. Empty → #VALUE!.
        //   alt_text: optional accessibility text. Coerced to text if present.
        //   sizing  : 0 = original size (default), 1 = stretch to fit cell,
        //             2 = fit within cell preserving aspect, 3 = custom h+w
        //             (uses args 4 and 5). Anything else → #VALUE!.
        //   height  : only valid when sizing == 3, must be > 0.
        //   width   : only valid when sizing == 3, must be > 0.
        //
        // Excel surfaces a special "image value" cell type that isn't text.
        // We don't model that variant — instead the formula evaluates to a
        // structured `Value::Text` payload the host UI can detect by prefix:
        //
        //   `<IMAGE: {source}>`                                 (basic case)
        //   `<IMAGE: {source} alt="{alt}">`                     (with alt text)
        //   `<IMAGE: {source} alt="{alt}" sizing={n}>`          (non-default sizing)
        //   `<IMAGE: {source} alt="..." sizing=3 height={h} width={w}>` (custom)
        //
        // This is HOST INTEGRATION: the JS side spots the `<IMAGE: ` prefix
        // and renders an actual `<img>` element instead of the literal text.
        // We picked the structured-text route (vs returning the raw URL and
        // making the host walk the formula AST) so the same detection logic
        // works for cells that copy/paste the formula result as a value.
        "IMAGE" => {
            if args.is_empty() || args.len() > 5 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let source_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = source_v {
                return Value::Error(e);
            }
            let source = coerce_to_text(&source_v);
            if source.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let alt = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                // Null (omitted-ish) → no alt text; otherwise coerce.
                if matches!(v, Value::Null) {
                    None
                } else {
                    Some(coerce_to_text(&v))
                }
            } else {
                None
            };
            let sizing = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                if matches!(v, Value::Null) {
                    0
                } else {
                    match coerce_to_number(&v) {
                        Some(n) if (n - n.trunc()).abs() < 1e-9 => {
                            let i = n.trunc() as i64;
                            if !(0..=3).contains(&i) {
                                return Value::Error(ValueError::InvalidValue);
                            }
                            i as u8
                        }
                        _ => return Value::Error(ValueError::InvalidValue),
                    }
                }
            } else {
                0
            };
            let (height, width) = if sizing == 3 {
                if args.len() != 5 {
                    return Value::Error(ValueError::InvalidValue);
                }
                let hv = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = hv {
                    return Value::Error(e);
                }
                let wv = eval_expr_with_provider(&args[4], provider);
                if let Value::Error(e) = wv {
                    return Value::Error(e);
                }
                let h = match coerce_to_number(&hv) {
                    Some(n) if n > 0.0 && n.is_finite() => n,
                    _ => return Value::Error(ValueError::InvalidValue),
                };
                let w = match coerce_to_number(&wv) {
                    Some(n) if n > 0.0 && n.is_finite() => n,
                    _ => return Value::Error(ValueError::InvalidValue),
                };
                (Some(h), Some(w))
            } else {
                // For sizing 0/1/2, height/width must NOT be supplied (Excel
                // ignores them silently, but we surface #VALUE! to keep the
                // contract explicit). If they happen to be present we still
                // accept Null-y omissions: only flag when args 4/5 are real.
                if args.len() >= 4 {
                    let hv = eval_expr_with_provider(&args[3], provider);
                    if let Value::Error(e) = hv {
                        return Value::Error(e);
                    }
                    if !matches!(hv, Value::Null) {
                        return Value::Error(ValueError::InvalidValue);
                    }
                }
                if args.len() == 5 {
                    let wv = eval_expr_with_provider(&args[4], provider);
                    if let Value::Error(e) = wv {
                        return Value::Error(e);
                    }
                    if !matches!(wv, Value::Null) {
                        return Value::Error(ValueError::InvalidValue);
                    }
                }
                (None, None)
            };
            Value::Text(format_image_payload(
                &source,
                alt.as_deref(),
                sizing,
                height,
                width,
            ))
        }
        // === Bessel family ===
        // BESSELJ / BESSELY / BESSELI / BESSELK all follow the same shape:
        // two numeric args (x, n), n must be a non-negative integer (Excel
        // truncates n toward zero before validating). The actual math lives
        // in `bessel_j_n` / `bessel_y_n` / `bessel_i_n` / `bessel_k_n` below.
        "BESSELJ" => eval_bessel(args, provider, bessel_j_n),
        "BESSELY" => eval_bessel(args, provider, bessel_y_n),
        "BESSELI" => eval_bessel(args, provider, bessel_i_n),
        "BESSELK" => eval_bessel(args, provider, bessel_k_n),

        // CONVERT(number, from_unit, to_unit) — unit conversion. Looks up
        // each unit in the static table built by `convert_unit_factor`;
        // mismatched categories surface `#N/A` (we use `InvalidValue` per
        // the project's error mapping). Temperature is special-cased
        // because its conversions are affine, not linear.
        "CONVERT" => eval_convert(args, provider),

        // === R batch: odd-coupon bond pricing + coupon-date utilities + misc finance ===
        // Yield solvers (ODDFYIELD) use Newton-Raphson seeded at the coupon
        // rate (same approach as YIELD). ODDLYIELD has a closed-form
        // solution and so does not iterate.
        "ODDFPRICE" => fn_oddfprice(args, provider),
        "ODDFYIELD" => fn_oddfyield(args, provider),
        "ODDLPRICE" => fn_oddlprice(args, provider),
        "ODDLYIELD" => fn_oddlyield(args, provider),
        "COUPNCD" => fn_coupncd(args, provider),
        "COUPPCD" => fn_couppcd(args, provider),
        "COUPDAYSNC" => fn_coupdaysnc(args, provider),
        "PDURATION" => fn_pduration(args, provider),
        "RRI" => fn_rri(args, provider),
        "FVSCHEDULE" => fn_fvschedule(args, provider),

        // === R batch: CJK byte-aware text functions ===
        // Each treats CJK / full-width characters as 2 "bytes" wide and
        // ASCII / half-width as 1 (Excel Shift-JIS / DBCS parity).
        // `dbcs_byte_width` is the shared decision.
        "LENB" => fn_lenb(args, provider),
        "LEFTB" => fn_leftb(args, provider),
        "RIGHTB" => fn_rightb(args, provider),
        "MIDB" => fn_midb(args, provider),
        "FINDB" => fn_findb(args, provider),
        "SEARCHB" => fn_searchb(args, provider),
        "REPLACEB" => fn_replaceb(args, provider),
        // === Legacy statistical aliases (Excel pre-2010 names) ===
        //
        // Most route directly to the canonical Excel-365 implementations.
        // A few need wrappers because the legacy form has a different
        // signature (LOGNORMDIST is cumulative-only, NORMSDIST has no
        // cumulative arg, TDIST takes a tails switch instead of cumulative,
        // HYPGEOMDIST / NEGBINOMDIST have no cumulative arg, etc.). The
        // four statistical hypothesis tests (CHISQ.TEST / F.TEST / T.TEST /
        // Z.TEST) and their legacy aliases (CHITEST / FTEST / TTEST /
        // ZTEST) are implemented from scratch — there was no canonical
        // arm yet. LOGNORM.DIST / LOGNORM.INV are also brand-new
        // bodies; the legacy LOGNORMDIST / LOGINV wrap them.
        "BETADIST" => stat_legacy_betadist(args, provider),
        "BETAINV" => stat_beta_inv(args, provider),
        "BINOMDIST" => stat_binom_dist(args, provider),
        "CHIDIST" => stat_chisq_dist_rt(args, provider),
        "CHIINV" => stat_chisq_inv_rt(args, provider),
        "CHISQ.TEST" | "CHITEST" => stat_chisq_test(args, provider),
        "CONFIDENCE" | "CONFIDENCE.NORM" => stat_confidence_norm(args, provider),
        "COVARIANCE.P" => covar_impl(args, provider, false),
        "COVARIANCE.S" => covar_impl(args, provider, true),
        "CRITBINOM" => stat_binom_inv(args, provider),
        "EXPONDIST" => stat_expon_dist(args, provider),
        "FDIST" => stat_f_dist_rt(args, provider),
        "FINV" => stat_f_inv_rt(args, provider),
        "F.TEST" | "FTEST" => stat_f_test(args, provider),
        "GAMMADIST" => stat_gamma_dist(args, provider),
        "GAMMAINV" => stat_gamma_inv(args, provider),
        "HYPGEOMDIST" => stat_legacy_hypgeomdist(args, provider),
        "LOGNORM.DIST" => stat_lognorm_dist(args, provider),
        "LOGNORM.INV" | "LOGINV" => stat_lognorm_inv(args, provider),
        "LOGNORMDIST" => stat_legacy_lognormdist(args, provider),
        "NEGBINOMDIST" => stat_legacy_negbinomdist(args, provider),
        "NORMDIST" => stat_norm_dist(args, provider),
        "NORMINV" => stat_norm_inv(args, provider),
        "NORMSDIST" => stat_legacy_normsdist(args, provider),
        "NORMSINV" => stat_norm_s_inv(args, provider),
        "POISSON" => stat_poisson_dist(args, provider),
        "TDIST" => stat_legacy_tdist(args, provider),
        "TINV" => stat_t_inv_2t(args, provider),
        "T.TEST" | "TTEST" => stat_t_test(args, provider),
        "WEIBULL" => stat_weibull_dist(args, provider),
        "Z.TEST" | "ZTEST" => stat_z_test(args, provider),
        // Regression + matrix algebra (P batch).
        //
        // LINEST / LOGEST / TREND / GROWTH all share the same least-squares
        // core (`linreg_core`): solve `(X^T X) β = X^T y` via Gauss-Jordan
        // on the augmented normal-equation matrix. LOGEST/GROWTH log-
        // transform `y` first (and `exp` at the end). Multi-x is supported
        // by feeding multiple columns of `known_x`. FORECAST is a scalar
        // shortcut that uses single-variable LINEST internally.
        //
        // MMULT / MINVERSE / MUNIT / TRANSPOSE are array-producing matrix
        // helpers. MINVERSE uses Gauss-Jordan with partial pivoting
        // (pivot magnitude < 1e-12 → #NUM!). MMULT rejects mismatched
        // inner dimensions with #VALUE! and propagates errors.
        "LINEST" => fn_linest(args, provider, /*log_y=*/ false),
        "LOGEST" => fn_linest(args, provider, /*log_y=*/ true),
        "TREND" => fn_trend_growth(args, provider, /*log_y=*/ false),
        "GROWTH" => fn_trend_growth(args, provider, /*log_y=*/ true),
        "FORECAST" | "FORECAST.LINEAR" => fn_forecast(args, provider),
        "STEYX" => fn_steyx(args, provider),
        "RSQ" => fn_rsq(args, provider),
        // PEARSON is identical to CORREL — route through the same impl.
        "PEARSON" => correl_impl(args, provider),
        "MMULT" => fn_mmult(args, provider),
        "MINVERSE" => fn_minverse(args, provider),
        "MUNIT" => fn_munit(args, provider),
        "TRANSPOSE" => fn_transpose(args, provider),
        // === Q batch: random / ranking / percentile / mode / A-variants / stats ===

        // RAND() — uniform [0, 1). Volatile: every evaluation draws fresh
        // from the OS-seeded thread RNG, so two `RAND()` calls in the same
        // formula return different values (Excel parity).
        "RAND" => stat_rand(args),
        // RANDBETWEEN(low, high) — uniform integer in [low, high] inclusive.
        // low > high → #NUM!. Both args truncate toward zero before validation.
        "RANDBETWEEN" => stat_randbetween(args, provider),

        // PERCENTRANK / PERCENTRANK.INC(array, x[, significance=3]) —
        // inclusive rank-in-array as decimal fraction. Truncated to
        // `significance` digits.
        "PERCENTRANK" | "PERCENTRANK.INC" => stat_percentrank_inc(args, provider),
        // PERCENTRANK.EXC(array, x[, significance=3]) — exclusive variant
        // using rank/(N+1).
        "PERCENTRANK.EXC" => stat_percentrank_exc(args, provider),

        // MODE.SNGL — Excel 2010+ rename of MODE. Routes through the same
        // arm (returns the most-frequent number; ties broken by smallest).
        "MODE.SNGL" => eval_func("MODE", args, provider),
        // MODE.MULT — array form returning every value tied for the mode.
        // Returns a column array (n×1). SPILL.
        "MODE.MULT" => stat_mode_mult(args, provider),

        // MAXA / MINA — like MAX / MIN but TEXT contributes 0, TRUE 1,
        // FALSE 0 (logicals are NOT skipped). Empty cells are still skipped.
        "MAXA" => stat_max_min_a(args, provider, /*want_max=*/ true),
        "MINA" => stat_max_min_a(args, provider, /*want_max=*/ false),

        // STDEVA / STDEVPA / VARA / VARPA — A-variants of the sample/pop
        // standard-deviation and variance. Text counts as 0, TRUE/FALSE as
        // 1/0; empty cells are skipped.
        "STDEVA" => stat_var_a(args, provider, /*sample=*/ true, /*sqrt=*/ true),
        "STDEVPA" => stat_var_a(args, provider, /*sample=*/ false, /*sqrt=*/ true),
        "VARA" => stat_var_a(args, provider, /*sample=*/ true, /*sqrt=*/ false),
        "VARPA" => stat_var_a(args, provider, /*sample=*/ false, /*sqrt=*/ false),

        // SKEW.P — population skewness. The existing `SKEW` is the sample
        // form; `SKEW.P` divides moment-3 by n (not the bias-correction
        // factor) and uses the population standard deviation.
        "SKEW.P" => stat_skew_p(args, provider),

        // FREQUENCY(data_array, bins_array) — distribution count.
        // Returns an array of length `bins.len() + 1`, one bucket per bin
        // plus a final "greater than the largest bin" bucket. SPILL.
        "FREQUENCY" => stat_frequency(args, provider),

        // PROB(x_range, prob_range, lower[, upper]) — sum of probabilities
        // for x values in [lower, upper]. Validates prob_range sums to ≈ 1
        // and every prob ∈ (0, 1].
        "PROB" => stat_prob(args, provider),

        // GAUSS(x) — NORM.S.DIST(x, TRUE) - 0.5 (probability between 0 and x
        // in the standard normal distribution).
        "GAUSS" => stat_gauss(args, provider),
        // PHI(x) — standard normal probability density.
        "PHI" => stat_phi(args, provider),

        // S batch arms: math/aggregation/formatting/complex/dynamic-array.
        "SUBTOTAL" => fn_subtotal(args, provider),
        "AGGREGATE" => fn_aggregate(args, provider),
        "ODD" => fn_odd(args, provider),
        "EVEN" => fn_even(args, provider),
        "FACTDOUBLE" => fn_factdouble(args, provider),
        "COMBINA" => fn_combina(args, provider),
        "MULTINOMIAL" => fn_multinomial(args, provider),
        "SERIESSUM" => fn_seriessum(args, provider),
        "ISO.CEILING" => floor_ceiling_precise(args, provider, false),
        "ERROR.TYPE" => fn_error_type(args, provider),
        "DOLLAR" => fn_dollar(args, provider),
        "FIXED" => fn_fixed(args, provider),
        "IMSECH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (cosh_r, cosh_i) = (a.cosh() * b.cos(), a.sinh() * b.sin());
            let (r, i) = match complex_div(1.0, 0.0, cosh_r, cosh_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMCSCH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (sinh_r, sinh_i) = (a.sinh() * b.cos(), a.cosh() * b.sin());
            let (r, i) = match complex_div(1.0, 0.0, sinh_r, sinh_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "EXPAND" => fn_expand(args, provider),
        "XMATCH" => fn_xmatch(args, provider),

        // === T-batch cleanup arms (Q1 2026) ===
        //
        // ACOTH(n) — inverse hyperbolic cotangent. `0.5 * ln((n+1)/(n-1))`.
        // Domain: |n| > 1 strictly. At |n| = 1 the argument of `ln` is 0
        // or infinity, both → #NUM!.
        "ACOTH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n.abs() > 1.0 => {
                    let r = 0.5 * ((n + 1.0) / (n - 1.0)).ln();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }

        // TRUE() / FALSE() — zero-arg constructors. The parser already
        // emits bare `TRUE` / `FALSE` as `Expr::Bool`, but the
        // function-call form `=TRUE()` routes through here. Any
        // arguments → #VALUE! (Excel surfaces #N/A — we follow our
        // existing convention of WrongArgCount for arity mismatch).
        "TRUE" => {
            if !args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            Value::Boolean(true)
        }
        "FALSE" => {
            if !args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            Value::Boolean(false)
        }

        // NA() — zero-arg. Returns the #N/A sentinel.
        // Useful as a placeholder while sketching a sheet.
        "NA" => {
            if !args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            Value::Error(ValueError::NotAvailable)
        }

        // ISREF(value) — TRUE iff the argument expression is a
        // reference. Inspects the AST directly (mirrors AREAS): a bare
        // `CellRef`, `Range`, `SheetRef`, `SheetRange`, or `MultiArea`
        // counts. Named references are NOT followed — Excel does
        // follow them, but our named registry stores values rather
        // than references, so a named "x = A1" stores `10`, not the
        // ref to A1. Refining that requires storing the source Expr
        // for each name; we deliberately defer.
        "ISREF" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let is_ref = matches!(
                &args[0],
                Expr::CellRef(..)
                    | Expr::Range { .. }
                    | Expr::SheetRef { .. }
                    | Expr::SheetRange { .. }
                    | Expr::MultiArea(_)
            );
            Value::Boolean(is_ref)
        }

        // STDEVP / VARP — legacy aliases for STDEV.P / VAR.P (Excel
        // 2003 names). Population variance / stdev (divide by n).
        "STDEVP" => eval_func("STDEV.P", args, provider),
        "VARP" => eval_func("VAR.P", args, provider),

        // CONFIDENCE.T(alpha, stdev, size) — Student-t confidence
        // interval half-width: `T.INV.2T(alpha, size - 1) * stdev / sqrt(size)`.
        "CONFIDENCE.T" => stat_confidence_t(args, provider),

        // BINOM.DIST.RANGE(trials, prob, lower[, upper]) — sum of
        // binomial PMF over `k ∈ [lower, upper]`. Single-arg form
        // (no upper) returns just PMF(lower).
        "BINOM.DIST.RANGE" => stat_binom_dist_range(args, provider),

        // PERMUT(n, k) — number of permutations: `n! / (n-k)!`.
        // PERMUTATIONA(n, k) — permutations with repetition: `n^k`.
        "PERMUT" => stat_permut(args, provider),
        "PERMUTATIONA" => stat_permutationa(args, provider),

        // DAYS360(start, end[, method=FALSE]) — 30/360 day count.
        // method=FALSE → US (NASD) form (basis 0); method=TRUE →
        // European form (basis 4). Always returns an integer.
        "DAYS360" => date_days360(args, provider),

        // *.PRECISE — Excel 2010 aliases of the existing functions.
        // The "precise" suffix exists because the legacy ERF / ERFC
        // had an awkward two-arg form; the modern *.PRECISE name
        // disambiguates. We compute identically either way.
        "ERF.PRECISE" => eval_func("ERF", args, provider),
        "ERFC.PRECISE" => eval_func("ERFC", args, provider),
        "GAMMALN.PRECISE" => eval_func("GAMMALN", args, provider),

        // CONCAT(text1, text2, …) — Excel-365 alias of CONCATENATE
        // that accepts ranges/arrays. Our CONCATENATE already
        // flattens ranges via `for_each_arg_value`, so they share an
        // implementation.
        "CONCAT" => eval_func("CONCATENATE", args, provider),

        // TRANSLATE(text, find, replace) — map each codepoint found in
        // `find` to the codepoint at the same index in `replace`. A `find`
        // codepoint with no replacement is deleted; duplicate `find`
        // codepoints keep the first mapping.
        "TRANSLATE" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let text = match eval_text_arg(&args[0], provider) {
                Ok(text) => text,
                Err(e) => return Value::Error(e),
            };
            let find = match eval_text_arg(&args[1], provider) {
                Ok(text) => text,
                Err(e) => return Value::Error(e),
            };
            let replace = match eval_text_arg(&args[2], provider) {
                Ok(text) => text,
                Err(e) => return Value::Error(e),
            };

            let replace_chars: Vec<char> = replace.chars().collect();
            let mut map: HashMap<char, Option<char>> = HashMap::new();
            for (idx, ch) in find.chars().enumerate() {
                map.entry(ch)
                    .or_insert_with(|| replace_chars.get(idx).copied());
            }

            let mut out = String::new();
            for ch in text.chars() {
                match map.get(&ch) {
                    Some(Some(mapped)) => out.push(*mapped),
                    Some(None) => {}
                    None => out.push(ch),
                }
            }
            Value::Text(out)
        }

        // ===== ARMS REGISTRY: ADD NEW MATCH ARMS BEFORE THIS LINE =====
        // Sentinel for parallel-agent merges — every new built-in dispatch arm
        // (e.g. `"PRICE" => eval_price(args, provider)`) goes BEFORE this
        // marker so concurrent worktrees don't fight over the `_ =>` line.
        // TEXTSPLIT(text, col_delim[, row_delim[, ignore_empty[, match_mode[, pad_with]]]])
        //
        // Splits `text` on `col_delim` (and `row_delim` if given) into a
        // 2D array. `col_delim` may be a single string OR an array of
        // strings — every occurrence of any element splits.
        //
        // - `ignore_empty` (default FALSE) skips empty fragments.
        // - `match_mode`: 0 case-sensitive (default), 1 case-insensitive.
        // - `pad_with` fills jagged-row slots; default is the #N/A-style
        //   `ValueError::InvalidValue`.
        //
        // Empty `text` → 1×1 array containing "" (Excel parity).
        "TEXTSPLIT" => fn_textsplit(args, provider),

        // TEXTBEFORE / TEXTAFTER — slice `text` around the Nth occurrence
        // of `delimiter`. See `fn_text_before_after` for the shared
        // search engine. `instance_num` < 0 counts from the right.
        "TEXTBEFORE" => fn_text_before_after(args, provider, /* before = */ true),
        "TEXTAFTER" => fn_text_before_after(args, provider, /* before = */ false),

        // LOOKUP(needle, lookup_vector[, result_vector])
        //
        // Vector form: linear "exact-or-next-smaller" walk like VLOOKUP
        // approximate (the input is supposed to be ascending; we don't
        // verify). Two-arg form with a 2D second argument flips into the
        // "array form" — pick the longer dimension as the lookup vector
        // and the opposite end of the other dimension as the result.
        "LOOKUP" => fn_lookup(args, provider),

        // FORMULATEXT(ref) — literal source text of the formula at the
        // referenced cell. Non-formula cell → #N/A; non-ref argument →
        // #VALUE!. Reads through `EvalProvider::cell_formula_text`.
        "FORMULATEXT" => fn_formulatext(args, provider),

        // ENCODEURL(text) — percent-encode `text` per RFC 3986 unreserved
        // class `[A-Za-z0-9-_.~]`. Everything else encodes as `%XX`
        // (uppercase hex) of each UTF-8 byte.
        "ENCODEURL" => fn_encodeurl(args, provider),

        _ => eval_named_call(name, args, provider),
    }
}

/// Resolve a function call `name(args)` against the workbook's defined
/// names when no built-in matched. Only a defined name whose value is a
/// `Value::Lambda` is treated as callable — scalar or range-typed
/// defined names fall through to the host's custom-formula registry
/// (and ultimately `#NAME?` if both miss).
///
/// **Precedence** (post Wave 8 review fix):
///   1. Built-ins (matched in `eval_func` before this fn is reached).
///   2. **Defined-name LAMBDA** — `define_name("SQUARE", "=LAMBDA(x,
///      x*x)")` makes `=SQUARE(5)` resolve through the registry.
///   3. **Host custom formula** — `provider.call_custom(...)`.
///   4. `#NAME?` — no resolution found.
///
/// Earlier shape: ANY defined name (including scalar values and range
/// refs) consumed the name and either applied or returned `#VALUE!`.
/// That meant a host that registered `MYFUNC` AND a defined name
/// `MYFUNC = 42` (or `MYFUNC = $A$1:$B$10`) would see the call resolve
/// to `#VALUE!` instead of falling through to the custom registry. The
/// new shape consults LAMBDA-only at this site; non-LAMBDA defined
/// names remain reachable via bare `Expr::Name` (`=MYFUNC` returns 42
/// or the range) but no longer block the custom-registry fallthrough
/// for `=MYFUNC(...)`.
///
/// Wraps `apply_lambda` in the named-call recursion guard so a runaway
/// recursive definition (`bad` = `LAMBDA(n, bad(n))`) hits `#NUM!` at
/// `MAX_NAMED_CALL_DEPTH` rather than panicking the thread.
///
/// Host custom formulas STILL CANNOT shadow built-ins or a LAMBDA
/// defined name. The reserved-name check in
/// `Workbook::define_name_value` blocks LAMBDA names from colliding
/// with built-ins, and the LAMBDA-only check here preserves the
/// LAMBDA-over-custom precedence.
fn eval_named_call(name: &str, args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if let Some(value) = provider.lookup_named(name) {
        match &value {
            Value::Lambda(_) => {
                let mut arg_values: Vec<Value> = Vec::with_capacity(args.len());
                for a in args {
                    let v = eval_expr_with_provider(a, provider);
                    if let Value::Error(e) = &v {
                        return Value::Error(e.clone());
                    }
                    arg_values.push(v);
                }
                // `apply_lambda` itself owns the recursion guard (see its
                // body) so a recursive defined lambda (`fact` =
                // `LAMBDA(n, IF(n<=1, 1, n*fact(n-1)))`) hits #NUM! at
                // MAX_NAMED_CALL_DEPTH instead of overflowing the stack.
                return apply_lambda(&value, arg_values, provider);
            }
            Value::Error(e) => return Value::Error(e.clone()),
            _ => {
                // Non-LAMBDA defined name (`answer = 42`, `MYRANGE =
                // $A$1:$B$10`, etc.). Fall through to the custom-formula
                // registry below so a host's `MYFUNC` registration is
                // not shadowed by an unrelated defined-name entry that
                // happens to share the label.
            }
        }
    }

    // No defined LAMBDA with this label. Try the host's custom-formula
    // registry as a last resort before surfacing #NAME?. Args are eagerly
    // evaluated (custom formulas take Values, not Exprs — no lazy
    // semantics) with two range-arg conveniences:
    //   - A bare `Expr::Range` / `Expr::SheetRange` arg is materialised
    //     to a `Value::Array` via the same path SUM/COUNT use, so the
    //     callback receives a 2-D table rather than `#VALUE!`.
    //   - Any other arg evaluates normally; `Value::Array` results pass
    //     through untouched.
    // Errors short-circuit just like LAMBDA application above, so a
    // custom `MYFUNC(SUM(BAD), 1)` returns the inner error rather than
    // handing the JS callback a `#VALUE!` it would have to handle.
    let mut arg_values: Vec<Value> = Vec::with_capacity(args.len());
    for a in args {
        let v = eval_arg_for_custom(a, provider);
        if let Value::Error(e) = &v {
            return Value::Error(e.clone());
        }
        arg_values.push(v);
    }
    provider
        .call_custom(name, &arg_values)
        .unwrap_or(Value::Error(ValueError::InvalidName))
}

/// Argument-evaluator for the custom-formula dispatch arm. Differs from
/// the default `eval_expr_with_provider` in exactly one way: a bare
/// range expression (`A1:A10`, `Sheet2!B1:B10`, `OFFSET(...)`) is
/// materialised to a `Value::Array` so the JS callback receives the
/// rectangle as a 2-D row-major table. Everything else evaluates to its
/// scalar `Value` (including embedded `Value::Array` results from
/// dynamic-array built-ins like `SEQUENCE`).
///
/// This mirrors what SUM/COUNT/MIN/etc. do at their arg-evaluation
/// sites — they stream the range via `for_each_arg_value`. Custom
/// formulas can't stream (the JS boundary is scalar-in / scalar-out),
/// so we materialise instead. The wire format is documented in
/// `CUSTOM_FORMULAS.md` § "Marshaling".
fn eval_arg_for_custom(arg: &Expr, provider: &dyn EvalProvider) -> Value {
    // Range-shaped argument: materialise to `Value::Array` via the
    // shared `arg_to_2d` helper that SUMIF / VLOOKUP / etc. use. The
    // result becomes a `Value::Array` so the WASM marshaling layer
    // round-trips it as a 2-D JS array.
    let is_range_like = matches!(arg, Expr::Range { .. } | Expr::SheetRange { .. })
        || matches!(arg, Expr::FuncCall { name, .. } if name == "OFFSET");
    if is_range_like {
        match arg_to_2d(arg, provider) {
            Ok((0, 0, _)) => {
                // Empty range (over-bound sentinel or zero-cell
                // collection). Surface `#REF!` so the callback isn't
                // handed a 0×0 array it can't reason about.
                return Value::Error(ValueError::InvalidRef);
            }
            Ok((rows, cols, data)) => {
                return Value::Array(Arc::new(ArrayData::new(rows, cols, data)));
            }
            Err(e) => return Value::Error(e),
        }
    }
    eval_expr_with_provider(arg, provider)
}

/// Streams every arg's numeric values into a local Vec. The Vec is an
/// algorithmic requirement of the callers (MEDIAN sorts, MODE counts,
/// STDEV/VAR need two passes, LARGE/SMALL select by rank) — but going
/// through `for_each_arg_value` means the underlying provider can stay
/// sparse, so we never allocate Null entries for empty cells in
/// `SUM(A:A)`-shaped ranges.
/// Convert 0-based column index back to Excel letters: 0→"A", 25→"Z", 26→"AA".
/// Mirror of `cell::col_index_to_letters`, inlined here so the eval module is
/// self-contained for `ADDRESS`.
fn col_index_to_letters_eval(mut col: u32) -> String {
    let mut result = String::new();
    loop {
        result.push((b'A' + (col % 26) as u8) as char);
        if col < 26 {
            break;
        }
        col = col / 26 - 1;
    }
    result.chars().rev().collect()
}

/// Parse the textual reference accepted by `INDIRECT`. Returns the optional
/// sheet name and the resolved start/end addresses (start == end for a
/// single-cell ref). Supports:
///
/// - `A1`, `$A$1`, `$A1`, `A$1` (absolute/relative markers are stripped).
/// - `A1:B3` ranges of two such refs.
/// - Optional `Sheet!` or `Sheet!A1:B3` sheet prefix; sheet name must match
///   `[A-Za-z_][A-Za-z0-9_]*` (no quoting / spaces in this batch).
fn parse_indirect_ref(text: &str) -> Option<(Option<String>, CellAddress, CellAddress)> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    let (sheet, body) = match text.find('!') {
        Some(i) => {
            let s = &text[..i];
            let rest = &text[i + 1..];
            if s.is_empty() {
                return None;
            }
            let valid = s.chars().enumerate().all(|(i, c)| {
                if i == 0 {
                    c.is_ascii_alphabetic() || c == '_'
                } else {
                    c.is_ascii_alphanumeric() || c == '_'
                }
            });
            if !valid {
                return None;
            }
            (Some(s.to_string()), rest)
        }
        None => (None, text),
    };
    let (start, end) = parse_indirect_body(body)?;
    Some((sheet, start, end))
}

fn parse_indirect_body(body: &str) -> Option<(CellAddress, CellAddress)> {
    let (start_str, end_str) = match body.find(':') {
        Some(i) => (&body[..i], Some(&body[i + 1..])),
        None => (body, None),
    };
    if let Some(end_str) = end_str {
        let start_part = strip_abs_markers(start_str);
        let end_part = strip_abs_markers(end_str);
        if !start_part.is_empty()
            && !end_part.is_empty()
            && start_part.chars().all(|c| c.is_ascii_alphabetic())
            && end_part.chars().all(|c| c.is_ascii_alphabetic())
        {
            let start_col = CellAddress::parse(&format!("{}1", start_part))?.col;
            let end_col = CellAddress::parse(&format!("{}1", end_part))?.col;
            return Some((
                CellAddress::new(0, start_col),
                CellAddress::new(u32::MAX, end_col),
            ));
        }
        if !start_part.is_empty()
            && !end_part.is_empty()
            && start_part.chars().all(|c| c.is_ascii_digit())
            && end_part.chars().all(|c| c.is_ascii_digit())
        {
            let start_row: u32 = start_part.parse().ok()?;
            let end_row: u32 = end_part.parse().ok()?;
            if start_row == 0 || end_row == 0 {
                return None;
            }
            return Some((
                CellAddress::new(start_row - 1, 0),
                CellAddress::new(end_row - 1, u32::MAX),
            ));
        }
        return Some((
            parse_indirect_addr(start_str)?,
            parse_indirect_addr(end_str)?,
        ));
    }
    let start = parse_indirect_addr(start_str)?;
    Some((start, start))
}

/// Parse a single A1-style cell ref, tolerating the `$` absolute markers
/// (which are dropped — INDIRECT itself doesn't surface absoluteness).
fn parse_indirect_addr(s: &str) -> Option<CellAddress> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    // Strip leading $ (column absolute) and any $ before the row digits.
    let stripped = strip_abs_markers(s);
    CellAddress::parse(&stripped)
}

fn strip_abs_markers(s: &str) -> String {
    s.trim().chars().filter(|c| *c != '$').collect()
}

/// Gregorian leap-year rule. Mirrors the local helper inside `date_serial`
/// / `date_from_serial`, exposed at module scope so the date arithmetic
/// helpers below can share it.
fn is_leap_year(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// Number of days in month `m` of year `y`. Month is 1-based (1..=12).
fn days_in_month(y: i32, m: u32) -> u32 {
    const DOM: [u32; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if m == 0 || m > 12 {
        return 0;
    }
    let mut d = DOM[(m - 1) as usize];
    if m == 2 && is_leap_year(y) {
        d += 1;
    }
    d
}

/// Shift `(year, month)` by `delta` months, handling negative deltas and
/// month overflow. Returns `(new_year, new_month)` with `new_month` in 1..=12.
fn shift_year_month(year: i32, month: u32, delta: i64) -> (i32, u32) {
    // Convert to 0-based total months from year 0.
    let total: i64 = year as i64 * 12 + (month as i64 - 1) + delta;
    let new_year = total.div_euclid(12) as i32;
    let new_month = (total.rem_euclid(12) + 1) as u32;
    (new_year, new_month)
}

/// Shared implementation for RANK / RANKEQ. `args[0]` is the value, `args[1]`
/// is the range, `args[2]` (optional, default 0) is the sort order.
fn rank_eq(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let value = match coerce_to_number(&v) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let order_desc = if args.len() == 3 {
        let ov = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = ov {
            return Value::Error(e);
        }
        match coerce_to_number(&ov) {
            Some(n) => n == 0.0,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        true
    };
    let nums = collect_numbers(&args[1..2], provider);
    if !nums.iter().any(|x| *x == value) {
        return Value::Error(ValueError::InvalidValue);
    }
    let rank = if order_desc {
        1 + nums.iter().filter(|x| **x > value).count()
    } else {
        1 + nums.iter().filter(|x| **x < value).count()
    };
    Value::Number(rank as f64)
}

/// Shared implementation for RANKAVG (Excel's RANK.AVG). Tied values get the
/// average of the ranks they would occupy (e.g. 3 tied at base rank 5 → 6.0).
fn rank_avg(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let value = match coerce_to_number(&v) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let order_desc = if args.len() == 3 {
        let ov = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = ov {
            return Value::Error(e);
        }
        match coerce_to_number(&ov) {
            Some(n) => n == 0.0,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        true
    };
    let nums = collect_numbers(&args[1..2], provider);
    let ties = nums.iter().filter(|x| **x == value).count();
    if ties == 0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let base = if order_desc {
        1 + nums.iter().filter(|x| **x > value).count()
    } else {
        1 + nums.iter().filter(|x| **x < value).count()
    };
    // Average of base, base+1, ..., base+ties-1.
    let sum: f64 = (0..ties).map(|i| (base + i) as f64).sum();
    Value::Number(sum / ties as f64)
}

/// Shared linear-interpolated percentile. Used by PERCENTILE and QUARTILE.
fn percentile_impl(range_args: &[Expr], provider: &dyn EvalProvider, k: f64) -> Value {
    if !k.is_finite() || k < 0.0 || k > 1.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut nums = collect_numbers(range_args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = nums.len();
    let pos = k * (n as f64 - 1.0);
    let lo = pos.floor() as usize;
    let hi = pos.ceil() as usize;
    if lo == hi {
        Value::Number(nums[lo])
    } else {
        let frac = pos - lo as f64;
        Value::Number(nums[lo] + (nums[hi] - nums[lo]) * frac)
    }
}

/// Exclusive percentile (Excel 2010+ `PERCENTILE.EXC` / `QUARTILE.EXC`).
///
/// `k` must be strictly in `(0, 1)`. The 1-based rank is `k * (n + 1)`; if
/// that falls below 1 or above `n` the result is #VALUE!. Otherwise the
/// surrounding pair is linearly interpolated, same as `percentile_impl`.
fn percentile_exc_impl(range_args: &[Expr], provider: &dyn EvalProvider, k: f64) -> Value {
    if !k.is_finite() || k <= 0.0 || k >= 1.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut nums = collect_numbers(range_args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = nums.len();
    // 1-based position. Excel: pos = k * (n + 1).
    let pos = k * (n as f64 + 1.0);
    if pos < 1.0 || pos > n as f64 {
        return Value::Error(ValueError::InvalidValue);
    }
    // Convert to 0-based interpolation bounds.
    let zero_based = pos - 1.0;
    let lo = zero_based.floor() as usize;
    let hi = zero_based.ceil() as usize;
    if lo == hi {
        Value::Number(nums[lo])
    } else {
        let frac = zero_based - lo as f64;
        Value::Number(nums[lo] + (nums[hi] - nums[lo]) * frac)
    }
}

/// Walk two range arguments in parallel and collect (x, y) pairs where BOTH
/// cells are numeric. Returns:
///   - Ok(Vec<(x, y)>) on success
///   - Err(ValueError) on shape mismatch (#VALUE!), non-range args (#VALUE!),
///     or propagated cell errors.
///
/// Both arguments must be the same shape (rows × cols). For 1×N vs N×1
/// orientations the shape must still match exactly — Excel allows mixed
/// orientations there, but we keep it strict (consistent with our 2D grid
/// model) and document the limitation.
fn collect_paired_numbers(
    a: &Expr,
    b: &Expr,
    provider: &dyn EvalProvider,
) -> Result<Vec<(f64, f64)>, ValueError> {
    let grid_a = match collect_range_2d_for_arg(a, provider) {
        Some(g) => g,
        None => return Err(ValueError::InvalidValue),
    };
    let grid_b = match collect_range_2d_for_arg(b, provider) {
        Some(g) => g,
        None => return Err(ValueError::InvalidValue),
    };
    let rows_a = grid_a.len();
    let cols_a = grid_a.first().map(|r| r.len()).unwrap_or(0);
    let rows_b = grid_b.len();
    let cols_b = grid_b.first().map(|r| r.len()).unwrap_or(0);
    if rows_a != rows_b || cols_a != cols_b {
        return Err(ValueError::InvalidValue);
    }
    let mut pairs: Vec<(f64, f64)> = Vec::new();
    for r in 0..rows_a {
        for c in 0..cols_a {
            let va = &grid_a[r][c];
            let vb = &grid_b[r][c];
            if let Value::Error(e) = va {
                return Err(e.clone());
            }
            if let Value::Error(e) = vb {
                return Err(e.clone());
            }
            if let (Value::Number(x), Value::Number(y)) = (va, vb) {
                pairs.push((*x, *y));
            }
        }
    }
    Ok(pairs)
}

/// CORREL(arr1, arr2). See dispatcher comment for semantics.
fn correl_impl(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.len() < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let mut sxy = 0.0_f64;
    let mut sxx = 0.0_f64;
    let mut syy = 0.0_f64;
    for (x, y) in &pairs {
        let dx = *x - mx;
        let dy = *y - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
    }
    let denom = (sxx * syy).sqrt();
    if denom == 0.0 || !denom.is_finite() {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number(sxy / denom)
}

/// Covariance (population or sample). `sum((x-mx) * (y-my)) / divisor`,
/// where divisor is `n` for population (`COVAR` / `COVAR.P`) and `n - 1`
/// for sample (`COVAR.S`). Shares range-pair and shape rules with CORREL.
fn covar_impl(args: &[Expr], provider: &dyn EvalProvider, sample: bool) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.is_empty() {
        return Value::Error(ValueError::DivisionByZero);
    }
    if sample && pairs.len() < 2 {
        // Sample covariance is undefined for a single pair (n - 1 == 0).
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let sxy: f64 = pairs.iter().map(|(x, y)| (*x - mx) * (*y - my)).sum();
    let divisor = if sample { n - 1.0 } else { n };
    Value::Number(sxy / divisor)
}

/// Shared SLOPE / INTERCEPT body. Args are (y_array, x_array).
/// `as_intercept = true` returns ȳ - slope * x̄; otherwise returns slope.
fn slope_intercept_impl(args: &[Expr], provider: &dyn EvalProvider, as_intercept: bool) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    // args[0] is y, args[1] is x. We feed (x, y) into collect_paired_numbers
    // so existing pair semantics line up with the math below.
    let pairs = match collect_paired_numbers(&args[1], &args[0], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.len() < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let mut sxy = 0.0_f64;
    let mut sxx = 0.0_f64;
    for (x, y) in &pairs {
        let dx = *x - mx;
        let dy = *y - my;
        sxy += dx * dy;
        sxx += dx * dx;
    }
    if sxx == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let slope = sxy / sxx;
    if as_intercept {
        Value::Number(my - slope * mx)
    } else {
        Value::Number(slope)
    }
}

// === Financial helpers ===

/// Compounding factor `((1+r)^n - 1) / r`, with the rate=0 limit `n`.
/// Used by every annuity formula.
fn annuity_compound(rate: f64, n: f64) -> f64 {
    if rate == 0.0 {
        n
    } else {
        ((1.0 + rate).powf(n) - 1.0) / rate
    }
}

/// Coerce one positional argument to a finite number, propagating errors.
/// Returns `Ok(n)` for a successful coercion, `Err(ValueError)` otherwise.
fn fin_coerce(arg: &Expr, provider: &dyn EvalProvider) -> Result<f64, ValueError> {
    let v = eval_expr_with_provider(arg, provider);
    if let Value::Error(e) = v {
        return Err(e);
    }
    coerce_to_number(&v).ok_or(ValueError::WrongType)
}

/// Coerce a `type` flag (0 or 1) from an optional positional argument.
/// Excel rounds `type` toward zero and accepts 0 or 1; we treat anything
/// else as #VALUE!. Defaults to `0` when the arg is absent.
fn fin_coerce_type(
    args: &[Expr],
    idx: usize,
    provider: &dyn EvalProvider,
) -> Result<f64, ValueError> {
    if args.len() <= idx {
        return Ok(0.0);
    }
    let n = fin_coerce(&args[idx], provider)?;
    let t = n.trunc();
    if t != 0.0 && t != 1.0 {
        return Err(ValueError::InvalidValue);
    }
    Ok(t)
}

/// Closed-form PMT solving `pv*(1+r)^n + pmt*(1+r*type)*comp + fv = 0`
/// for `pmt`, where `comp = annuity_compound(rate, n)`. Result is the
/// `pmt` Excel would return (positive `pv` → negative `pmt`).
fn pmt_closed_form(rate: f64, n: f64, pv: f64, fv: f64, type_: f64) -> Option<f64> {
    if rate == 0.0 {
        if n == 0.0 {
            return None;
        }
        return Some(-(pv + fv) / n);
    }
    let factor = (1.0 + rate).powf(n);
    let denom = annuity_compound(rate, n) * (1.0 + rate * type_);
    if denom == 0.0 {
        return None;
    }
    Some(-(pv * factor + fv) / denom)
}

fn fn_pmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = if args.len() >= 4 {
        match fin_coerce(&args[3], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    match pmt_closed_form(rate, nper, pv, fv, type_) {
        Some(r) if r.is_finite() => Value::Number(r),
        _ => Value::Error(ValueError::Overflow),
    }
}

fn fn_pv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pmt = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = if args.len() >= 4 {
        match fin_coerce(&args[3], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // Solve `pv*(1+r)^n + pmt*(1+r*type)*comp + fv = 0` for pv.
    let factor = if rate == 0.0 {
        1.0
    } else {
        (1.0 + rate).powf(nper)
    };
    let comp = annuity_compound(rate, nper);
    if rate == 0.0 {
        let r = -(pmt * nper + fv);
        if r.is_finite() {
            Value::Number(r)
        } else {
            Value::Error(ValueError::Overflow)
        }
    } else {
        if factor == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
        let r = -(pmt * (1.0 + rate * type_) * comp + fv) / factor;
        if r.is_finite() {
            Value::Number(r)
        } else {
            Value::Error(ValueError::Overflow)
        }
    }
}

fn fn_fv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pmt = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = if args.len() >= 4 {
        match fin_coerce(&args[3], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // Solve `pv*(1+r)^n + pmt*(1+r*type)*comp + fv = 0` for fv.
    let factor = if rate == 0.0 {
        1.0
    } else {
        (1.0 + rate).powf(nper)
    };
    let comp = annuity_compound(rate, nper);
    let r = if rate == 0.0 {
        -(pv + pmt * nper)
    } else {
        -(pv * factor + pmt * (1.0 + rate * type_) * comp)
    };
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_nper(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pmt = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = if args.len() >= 4 {
        match fin_coerce(&args[3], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate == 0.0 {
        if pmt == 0.0 {
            return Value::Error(ValueError::DivisionByZero);
        }
        let n = -(pv + fv) / pmt;
        if n.is_finite() {
            return Value::Number(n);
        }
        return Value::Error(ValueError::Overflow);
    }
    // Closed-form: pmt' = pmt*(1+r*type)
    // (1+r)^n = (pmt' - r*fv) / (pmt' + r*pv)
    let pmt_eff = pmt * (1.0 + rate * type_);
    let num = pmt_eff - rate * fv;
    let den = pmt_eff + rate * pv;
    if den == 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let ratio = num / den;
    if !ratio.is_finite() || ratio <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let base = 1.0 + rate;
    if base <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let n = ratio.ln() / base.ln();
    if n.is_finite() {
        Value::Number(n)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_npv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate == -1.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // Walk every following arg, accumulating discount-factor * value.
    // For range cells we skip non-numeric values (Excel parity for NPV
    // ranges, which legitimately contain blanks or labels). Non-numeric
    // *scalar* args would surface as #VALUE! in real Excel; we apply the
    // same range-skip behavior uniformly for simplicity — documented at
    // the function's match arm.
    let mut total = 0.0_f64;
    let mut i: u32 = 1;
    let mut err: Option<ValueError> = None;
    for arg in &args[1..] {
        if err.is_some() {
            break;
        }
        for_each_arg_value(arg, provider, &mut |_addr, v| {
            if err.is_some() {
                return;
            }
            match v {
                Value::Error(e) => {
                    err = Some(e);
                }
                Value::Number(n) => {
                    let denom = (1.0 + rate).powi(i as i32);
                    if denom == 0.0 || !denom.is_finite() {
                        err = Some(ValueError::Overflow);
                        return;
                    }
                    total += n / denom;
                    i += 1;
                }
                _ => {
                    // Range blanks / labels are skipped (Excel parity).
                    // For scalar args this matches typical behavior of
                    // ignoring booleans/text in financial aggregates.
                }
            }
        });
    }
    if let Some(e) = err {
        return Value::Error(e);
    }
    if !total.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(total)
}

/// Collect cash flows from an IRR argument. The argument must be a range
/// (single-cell or multi-cell). Returns the values in row-major order;
/// non-numeric cells produce `Err(InvalidValue)` so the caller bails with
/// `#VALUE!`. Empty range → `Err(InvalidValue)`.
fn collect_irr_values(arg: &Expr, provider: &dyn EvalProvider) -> Result<Vec<f64>, ValueError> {
    let grid = match collect_range_2d_for_arg(arg, provider) {
        Some(g) => g,
        None => return Err(ValueError::WrongType),
    };
    let mut out: Vec<f64> = Vec::new();
    for row in &grid {
        for cell in row {
            match cell {
                Value::Number(n) => out.push(*n),
                Value::Error(e) => return Err(e.clone()),
                Value::Null => {} // skip blanks
                _ => return Err(ValueError::InvalidValue),
            }
        }
    }
    if out.is_empty() {
        return Err(ValueError::InvalidValue);
    }
    Ok(out)
}

const IRR_TOL: f64 = 1e-7;
const IRR_MAX_ITER: usize = 100;

/// IRR — Newton-Raphson on f(r) = Σ value_i / (1+r)^i for i = 0..n-1.
fn fn_irr(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let values = match collect_irr_values(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // Require at least one positive AND one negative cash flow.
    let has_pos = values.iter().any(|v| *v > 0.0);
    let has_neg = values.iter().any(|v| *v < 0.0);
    if !(has_pos && has_neg) {
        return Value::Error(ValueError::InvalidValue);
    }
    let guess = if args.len() == 2 {
        match fin_coerce(&args[1], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.1
    };
    let mut r = guess;
    for _ in 0..IRR_MAX_ITER {
        // f(r) and f'(r) in a single pass.
        let mut f = 0.0_f64;
        let mut fp = 0.0_f64;
        let base = 1.0 + r;
        if base == 0.0 || !base.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        for (i, v) in values.iter().enumerate() {
            let denom = base.powi(i as i32);
            if denom == 0.0 || !denom.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            f += v / denom;
            if i > 0 {
                fp += -(i as f64) * v / (denom * base);
            }
        }
        if !f.is_finite() || !fp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if f.abs() < IRR_TOL {
            return Value::Number(r);
        }
        if fp == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
        let next = r - f / fp;
        if !next.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if (next - r).abs() < IRR_TOL {
            return Value::Number(next);
        }
        r = next;
    }
    Value::Error(ValueError::Overflow)
}

const RATE_TOL: f64 = 1e-7;
const RATE_MAX_ITER: usize = 100;

/// Evaluate the annuity equation `g(r) = pv*(1+r)^n + pmt*(1+r*type)*((1+r)^n - 1)/r + fv`
/// and its derivative wrt `r`.
fn rate_residual(rate: f64, n: f64, pmt: f64, pv: f64, fv: f64, type_: f64) -> (f64, f64) {
    if rate == 0.0 {
        // g(0) = pv + pmt*n + fv ; g'(0) handled via series expansion:
        // d/dr [(1+r)^n] |0 = n
        // d/dr [(1+r*type)*((1+r)^n - 1)/r] |0 = n*(n-1)/2 + type*n
        let g = pv + pmt * n + fv;
        let gp = pv * n + pmt * (n * (n - 1.0) / 2.0 + type_ * n);
        return (g, gp);
    }
    let one_plus_r = 1.0 + rate;
    let power = one_plus_r.powf(n);
    let comp = (power - 1.0) / rate;
    let g = pv * power + pmt * (1.0 + rate * type_) * comp + fv;
    // d/dr [(1+r)^n] = n*(1+r)^(n-1)
    let dpower = n * one_plus_r.powf(n - 1.0);
    // d/dr [comp] = d/dr [((1+r)^n - 1)/r] = (n*(1+r)^(n-1) * r - ((1+r)^n - 1)) / r^2
    let dcomp = (dpower * rate - (power - 1.0)) / (rate * rate);
    // d/dr [pmt*(1+r*type)*comp] = pmt*(type*comp + (1+r*type)*dcomp)
    let gp = pv * dpower + pmt * (type_ * comp + (1.0 + rate * type_) * dcomp);
    (g, gp)
}

fn fn_rate(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nper = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pmt = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = if args.len() >= 4 {
        match fin_coerce(&args[3], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let guess = if args.len() == 6 {
        match fin_coerce(&args[5], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.1
    };
    if nper <= 0.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut r = guess;
    for _ in 0..RATE_MAX_ITER {
        let (g, gp) = rate_residual(r, nper, pmt, pv, fv, type_);
        if !g.is_finite() || !gp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if g.abs() < RATE_TOL {
            return Value::Number(r);
        }
        if gp == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
        let next = r - g / gp;
        if !next.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if (next - r).abs() < RATE_TOL {
            return Value::Number(next);
        }
        r = next;
    }
    Value::Error(ValueError::Overflow)
}

fn fn_ipmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let per = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = if args.len() >= 5 {
        match fin_coerce(&args[4], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if per < 1.0 || per > nper {
        return Value::Error(ValueError::InvalidValue);
    }
    let pmt = match pmt_closed_form(rate, nper, pv, fv, type_) {
        Some(v) => v,
        None => return Value::Error(ValueError::Overflow),
    };
    // For type=1 and per=1: interest is paid up-front, so ipmt = 0.
    if type_ == 1.0 && per == 1.0 {
        return Value::Number(0.0);
    }
    // For type=1 we shift the effective period: balance at the start of
    // period `per` (after `per-1` payments have been applied) uses
    // (per-2) compounding because the period-1 payment happened at t=0.
    let k = if type_ == 1.0 { per - 2.0 } else { per - 1.0 };
    if rate == 0.0 {
        // Linear: every payment is purely principal; interest is 0 for
        // any period when rate=0.
        return Value::Number(0.0);
    }
    let pow_k = (1.0 + rate).powf(k);
    let balance = pv * pow_k + pmt * annuity_compound(rate, k);
    let ipmt = -balance * rate;
    if ipmt.is_finite() {
        Value::Number(ipmt)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_ppmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    // Reuse IPMT and PMT. We need the same args order for PMT
    // (rate, nper, pv, fv, type) but IPMT takes (rate, per, nper, pv, fv, type).
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // We don't directly use `per` here but the IPMT path will validate it.
    let _per = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = if args.len() >= 5 {
        match fin_coerce(&args[4], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pmt = match pmt_closed_form(rate, nper, pv, fv, type_) {
        Some(v) => v,
        None => return Value::Error(ValueError::Overflow),
    };
    let ipmt = match fn_ipmt(args, provider) {
        Value::Number(n) => n,
        other => return other,
    };
    let ppmt = pmt - ipmt;
    if ppmt.is_finite() {
        Value::Number(ppmt)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

/// Parse a fixed-width base-n textual numeral with Excel's
/// two's-complement convention.
///
/// `base`: 2, 8, or 16.
/// `max_chars`: maximum number of digits the spec allows (10 for all
///   three of Excel's BIN/OCT/HEX inputs).
/// `bits_per_digit`: 1 / 3 / 4 for BIN / OCT / HEX. The signed
///   bit-width is `max_chars * bits_per_digit`.
///
/// If `text.len() == max_chars` and the high bit (`bits-1`) is set,
/// the result is sign-extended (i.e. `value - 2^bits`). Otherwise the
/// numeric value is taken as-is.
///
/// Empty input, over-long input, or any non-digit / out-of-base char
/// surfaces `InvalidValue`.
pub(crate) fn parse_base_n_text(
    text: &str,
    base: u32,
    max_chars: usize,
    bits_per_digit: u32,
) -> Result<f64, ValueError> {
    if text.is_empty() || text.len() > max_chars {
        return Err(ValueError::InvalidValue);
    }
    let mut value: u64 = 0;
    for ch in text.chars() {
        let d = match ch.to_digit(base) {
            Some(d) => d as u64,
            None => return Err(ValueError::InvalidValue),
        };
        value = value * base as u64 + d;
    }
    let bits = (max_chars as u32) * bits_per_digit;
    // Sign-extend only when the input occupies the full width; shorter
    // strings are positive by definition (matching Excel: BIN2DEC("1")
    // is 1, not -1).
    if text.len() == max_chars {
        let sign_bit = 1u64 << (bits - 1);
        if value & sign_bit != 0 {
            let two_pow_n = 1u64 << bits;
            // value - 2^bits as a signed quantity.
            let signed = value as i64 - two_pow_n as i64;
            return Ok(signed as f64);
        }
    }
    Ok(value as f64)
}

/// Format a number into Excel's fixed-width signed two's-complement
/// textual base-n representation.
///
/// Positive (or zero) values: emit the minimum-width base-n digits,
/// optionally left-padded with `'0'` to `places`. `places` must satisfy
/// `1 <= places <= max_chars` and `places >= min_chars`; otherwise
/// `InvalidValue`.
///
/// Negative values: emit exactly `max_chars` digits (the two's-comp
/// representation); `places` is ignored, matching Excel.
///
/// Out-of-range numbers surface `Overflow` (Excel's `#NUM!`). The
/// argument is truncated toward zero before range-checking.
pub(crate) fn format_base_n_signed(
    value: f64,
    base: u32,
    max_chars: usize,
    bits_per_digit: u32,
    places: Option<usize>,
    upper_hex: bool,
) -> Result<String, ValueError> {
    if !value.is_finite() {
        return Err(ValueError::Overflow);
    }
    // Excel truncates toward zero before applying the range check.
    let trunc = value.trunc();
    let bits = (max_chars as u32) * bits_per_digit;
    let max_pos: i64 = (1i64 << (bits - 1)) - 1;
    let min_neg: i64 = -(1i64 << (bits - 1));
    // Guard against trunc that doesn't fit in i64 before casting.
    if trunc > max_pos as f64 || trunc < min_neg as f64 {
        return Err(ValueError::Overflow);
    }
    let v = trunc as i64;

    let digit_char = |d: u32| -> char {
        let c = char::from_digit(d, base).unwrap_or('0');
        if upper_hex {
            c.to_ascii_uppercase()
        } else {
            c
        }
    };

    if v < 0 {
        // Two's-complement: encode (v + 2^bits) as an unsigned value
        // and emit exactly `max_chars` digits, padded with leading
        // zeros if the high digits are zero (rare since the sign bit
        // is set by definition for in-range negatives).
        let two_pow_n: u64 = 1u64 << bits;
        let unsigned = (v as i64 + two_pow_n as i64) as u64;
        let mut out = String::with_capacity(max_chars);
        let mut buf = unsigned;
        for _ in 0..max_chars {
            let d = (buf % base as u64) as u32;
            out.push(digit_char(d));
            buf /= base as u64;
        }
        Ok(out.chars().rev().collect())
    } else {
        // Build the minimum-width unsigned representation.
        let mut buf = v as u64;
        let min_chars: String = if buf == 0 {
            "0".to_string()
        } else {
            let mut s = String::new();
            while buf > 0 {
                let d = (buf % base as u64) as u32;
                s.push(digit_char(d));
                buf /= base as u64;
            }
            s.chars().rev().collect()
        };
        match places {
            None => Ok(min_chars),
            Some(p) => {
                if p < 1 || p > max_chars {
                    return Err(ValueError::InvalidValue);
                }
                if p < min_chars.len() {
                    return Err(ValueError::InvalidValue);
                }
                let pad = p - min_chars.len();
                let mut out = String::with_capacity(p);
                for _ in 0..pad {
                    out.push('0');
                }
                out.push_str(&min_chars);
                Ok(out)
            }
        }
    }
}

/// Shared body for BIN2DEC / OCT2DEC / HEX2DEC: coerce the single arg
/// to text, hand off to `parse_base_n_text`, surface errors verbatim.
fn eval_xxx2dec(
    args: &[Expr],
    provider: &dyn EvalProvider,
    base: u32,
    max_chars: usize,
    bits_per_digit: u32,
) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    // Per Excel: a Boolean / Null isn't a valid binary numeral, even
    // though coerce_to_text would happily emit "TRUE"/"FALSE"/"".
    // Reject those up-front so they don't slip through as InvalidValue
    // from the parser's "non-digit" path (less informative).
    match v {
        Value::Boolean(_) | Value::Null => return Value::Error(ValueError::WrongType),
        _ => {}
    }
    let text = coerce_to_text(&v);
    match parse_base_n_text(&text, base, max_chars, bits_per_digit) {
        Ok(n) => Value::Number(n),
        Err(e) => Value::Error(e),
    }
}

/// Optional-places extractor shared by DEC2XXX and the cross-base
/// wrappers. Returns `Ok(None)` when the arg is absent; `Ok(Some(n))`
/// for a valid 1..=max_chars place count; errors mirror Excel:
///   - non-numeric → WrongType
///   - non-integer / out of 1..=max_chars → InvalidValue
///   - propagated cell error → that error
fn engineering_places(
    arg: Option<&Expr>,
    provider: &dyn EvalProvider,
    max_chars: usize,
) -> Result<Option<usize>, ValueError> {
    let Some(expr) = arg else {
        return Ok(None);
    };
    let v = eval_expr_with_provider(expr, provider);
    if let Value::Error(e) = v {
        return Err(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) => n,
        None => return Err(ValueError::WrongType),
    };
    if !n.is_finite() || n.trunc() != n {
        return Err(ValueError::InvalidValue);
    }
    let p = n as i64;
    if p < 1 || p as usize > max_chars {
        return Err(ValueError::InvalidValue);
    }
    Ok(Some(p as usize))
}

/// Shared body for DEC2BIN / DEC2OCT / DEC2HEX.
fn eval_dec2xxx(
    args: &[Expr],
    provider: &dyn EvalProvider,
    base: u32,
    max_chars: usize,
    bits_per_digit: u32,
    upper_hex: bool,
) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let places = match engineering_places(args.get(1), provider, max_chars) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    match format_base_n_signed(n, base, max_chars, bits_per_digit, places, upper_hex) {
        Ok(s) => Value::Text(s),
        Err(e) => Value::Error(e),
    }
}

/// Shared body for cross-base wrappers (BIN2HEX, OCT2BIN, ...).
/// `from` = (base, max_chars, bits_per_digit) for the source.
/// `to` = same triple for the destination. `upper_hex` selects the
/// uppercase digit set on the output.
fn eval_cross_base(
    args: &[Expr],
    provider: &dyn EvalProvider,
    from: (u32, usize, u32),
    to: (u32, usize, u32),
    upper_hex: bool,
) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    match v {
        Value::Boolean(_) | Value::Null => return Value::Error(ValueError::WrongType),
        _ => {}
    }
    let text = coerce_to_text(&v);
    let dec = match parse_base_n_text(&text, from.0, from.1, from.2) {
        Ok(n) => n,
        Err(e) => return Value::Error(e),
    };
    let places = match engineering_places(args.get(1), provider, to.1) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    match format_base_n_signed(dec, to.0, to.1, to.2, places, upper_hex) {
        Ok(s) => Value::Text(s),
        Err(e) => Value::Error(e),
    }
}

/// Coerce a Value into a number for engineering-function consumption.
/// Tighter than `coerce_to_number`: text and errors are rejected (the
/// caller has already short-circuited on errors). Booleans coerce to
/// 0/1 to match Excel's DELTA(TRUE, 1) = 1 behaviour.
fn as_engineering_number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => Some(*n),
        Value::Boolean(true) => Some(1.0),
        Value::Boolean(false) => Some(0.0),
        Value::Null => Some(0.0),
        _ => None,
    }
}

/// Bit-op f64 → u64 domain check. Excel documents BITAND/OR/XOR as
/// accepting 0..=2^48-1; we accept the f64-safe 0..=2^53-1 range so
/// large values produced by other formulas stay representable.
const BIT_OP_MAX: f64 = 9_007_199_254_740_991.0; // 2^53 - 1

fn coerce_bit_operand(v: &Value) -> Result<u64, ValueError> {
    let n = match coerce_to_number(v) {
        Some(n) => n,
        None => return Err(ValueError::WrongType),
    };
    if !n.is_finite() || n.trunc() != n {
        return Err(ValueError::Overflow);
    }
    if n < 0.0 || n > BIT_OP_MAX {
        return Err(ValueError::Overflow);
    }
    Ok(n as u64)
}

/// Shared body for BITAND / BITOR / BITXOR.
fn eval_bit_binop(
    args: &[Expr],
    provider: &dyn EvalProvider,
    f: impl Fn(u64, u64) -> u64,
) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let a = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = a {
        return Value::Error(e);
    }
    let b = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = b {
        return Value::Error(e);
    }
    let av = match coerce_bit_operand(&a) {
        Ok(n) => n,
        Err(e) => return Value::Error(e),
    };
    let bv = match coerce_bit_operand(&b) {
        Ok(n) => n,
        Err(e) => return Value::Error(e),
    };
    Value::Number(f(av, bv) as f64)
}

/// Shared body for BITLSHIFT / BITRSHIFT. `reverse` flips the sign
/// convention: BITLSHIFT(a, -3) == BITRSHIFT(a, 3) and vice versa.
fn eval_bit_shift(args: &[Expr], provider: &dyn EvalProvider, reverse: bool) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let a = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = a {
        return Value::Error(e);
    }
    let n = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = n {
        return Value::Error(e);
    }
    let av = match coerce_bit_operand(&a) {
        Ok(n) => n,
        Err(e) => return Value::Error(e),
    };
    let nv = match coerce_to_number(&n) {
        Some(x) => x,
        None => return Value::Error(ValueError::WrongType),
    };
    if !nv.is_finite() || nv.trunc() != nv {
        return Value::Error(ValueError::Overflow);
    }
    let shift = nv as i64;
    // Excel's documented shift domain is |n| <= 53.
    if shift.abs() > 53 {
        return Value::Error(ValueError::Overflow);
    }
    // Normalize to "shift left by `effective`": positive → left,
    // negative → right.
    let effective = if reverse { -shift } else { shift };
    let result = if effective == 0 {
        av
    } else if effective > 0 {
        // Left shift: result must still fit in the safe-integer range.
        let r = (av as u128)
            .checked_shl(effective as u32)
            .unwrap_or(u128::MAX);
        if r > BIT_OP_MAX as u128 {
            return Value::Error(ValueError::Overflow);
        }
        r as u64
    } else {
        let amount = (-effective) as u32;
        if amount >= 64 {
            0
        } else {
            av >> amount
        }
    };
    Value::Number(result as f64)
}

// === Math extras helpers ===

/// Shared body for SUMX2MY2 / SUMX2PY2 / SUMXMY2. Collects (x,y) pairs
/// via `collect_paired_numbers` (which enforces same-shape and skips
/// non-numeric cells per offset), then folds with `f`.
fn sum_pair_impl(args: &[Expr], provider: &dyn EvalProvider, f: impl Fn(f64, f64) -> f64) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    let total: f64 = pairs.iter().map(|(x, y)| f(*x, *y)).sum();
    Value::Number(total)
}

/// SUMPRODUCT body. Accepts 1+ range-shaped args; all must share shape.
/// Single-array case reduces to "SUM over numerics". Non-numeric cells
/// contribute 0 to that position's product.
fn sumproduct_impl(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() {
        return Value::Error(ValueError::WrongArgCount);
    }
    // Materialise each arg as a 2D grid. Scalar/non-range args are
    // wrapped as a 1×1 grid so a SUMPRODUCT(A1:A3, 2) still has a
    // shape — but we reject mismatched shapes between range args.
    let mut grids: Vec<Vec<Vec<Value>>> = Vec::with_capacity(args.len());
    for a in args {
        match collect_range_2d_for_arg(a, provider) {
            Some(g) => grids.push(g),
            None => return Value::Error(ValueError::InvalidValue),
        }
    }
    // Shape check.
    let rows = grids[0].len();
    let cols = grids[0].first().map(|r| r.len()).unwrap_or(0);
    for g in &grids[1..] {
        if g.len() != rows || g.first().map(|r| r.len()).unwrap_or(0) != cols {
            return Value::Error(ValueError::InvalidValue);
        }
    }
    let mut total = 0.0_f64;
    for r in 0..rows {
        for c in 0..cols {
            let mut prod = 1.0_f64;
            for g in &grids {
                match &g[r][c] {
                    Value::Error(e) => return Value::Error(e.clone()),
                    Value::Number(n) => prod *= *n,
                    // Non-numeric (Null, Text, Boolean) contributes 0
                    // to the cell — for the single-array case this
                    // matches "SUM over numerics" exactly.
                    _ => {
                        prod = 0.0;
                        break;
                    }
                }
            }
            total += prod;
        }
    }
    Value::Number(total)
}

/// FLOOR.MATH / CEILING.MATH shared body.
///
/// `is_floor` selects FLOOR.MATH (`true`) vs CEILING.MATH (`false`).
///
/// Default mode (=0) rounds toward -inf (FLOOR.MATH) or +inf
/// (CEILING.MATH) regardless of sign. With mode != 0, negative
/// numbers reverse direction: FLOOR.MATH rounds toward zero (i.e.
/// ceil after sign flip) and CEILING.MATH rounds away from zero.
/// Significance == 0 collapses to 0 (Excel parity).
fn floor_ceiling_math(args: &[Expr], provider: &dyn EvalProvider, is_floor: bool) -> Value {
    if args.is_empty() || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&nv) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let sig = if args.len() >= 2 {
        let sv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = sv {
            return Value::Error(e);
        }
        match coerce_to_number(&sv) {
            Some(s) => s,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        1.0
    };
    let mode = if args.len() == 3 {
        let mv = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = mv {
            return Value::Error(e);
        }
        match coerce_to_number(&mv) {
            Some(m) => m,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        0.0
    };
    if sig == 0.0 {
        return Value::Number(0.0);
    }
    // FLOOR.MATH / CEILING.MATH treat significance sign as irrelevant —
    // we always divide by |sig|. The direction is controlled by
    // is_floor + mode + sign(n).
    let s = sig.abs();
    let r = if is_floor {
        if n < 0.0 && mode != 0.0 {
            // Round toward zero for negatives.
            (n / s).ceil() * s
        } else {
            (n / s).floor() * s
        }
    } else {
        // CEILING.MATH
        if n < 0.0 && mode != 0.0 {
            // Round away from zero for negatives.
            (n / s).floor() * s
        } else {
            (n / s).ceil() * s
        }
    };
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

/// FLOOR.PRECISE / CEILING.PRECISE shared body. Always toward -inf
/// (FLOOR.PRECISE) or +inf (CEILING.PRECISE). 1 or 2 args.
fn floor_ceiling_precise(args: &[Expr], provider: &dyn EvalProvider, is_floor: bool) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&nv) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let sig = if args.len() == 2 {
        let sv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = sv {
            return Value::Error(e);
        }
        match coerce_to_number(&sv) {
            Some(s) => s,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        1.0
    };
    if sig == 0.0 {
        return Value::Number(0.0);
    }
    let s = sig.abs();
    let r = if is_floor {
        (n / s).floor() * s
    } else {
        (n / s).ceil() * s
    };
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

const ROMAN_FORM_0: &[(i64, &str)] = &[
    (1000, "M"),
    (900, "CM"),
    (500, "D"),
    (400, "CD"),
    (100, "C"),
    (90, "XC"),
    (50, "L"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
const ROMAN_FORM_1: &[(i64, &str)] = &[
    (1000, "M"),
    (950, "LM"),
    (900, "CM"),
    (500, "D"),
    (450, "LD"),
    (400, "CD"),
    (100, "C"),
    (95, "VC"),
    (90, "XC"),
    (50, "L"),
    (45, "VL"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
const ROMAN_FORM_2: &[(i64, &str)] = &[
    (1000, "M"),
    (990, "XM"),
    (950, "LM"),
    (900, "CM"),
    (500, "D"),
    (490, "XD"),
    (450, "LD"),
    (400, "CD"),
    (100, "C"),
    (99, "IC"),
    (95, "VC"),
    (90, "XC"),
    (50, "L"),
    (49, "IL"),
    (45, "VL"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
const ROMAN_FORM_3: &[(i64, &str)] = &[
    (1000, "M"),
    (995, "VM"),
    (990, "XM"),
    (950, "LM"),
    (900, "CM"),
    (500, "D"),
    (495, "VD"),
    (490, "XD"),
    (450, "LD"),
    (400, "CD"),
    (100, "C"),
    (99, "IC"),
    (95, "VC"),
    (90, "XC"),
    (50, "L"),
    (49, "IL"),
    (45, "VL"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
const ROMAN_FORM_4: &[(i64, &str)] = &[
    (1000, "M"),
    (999, "IM"),
    (995, "VM"),
    (990, "XM"),
    (950, "LM"),
    (900, "CM"),
    (500, "D"),
    (499, "ID"),
    (495, "VD"),
    (490, "XD"),
    (450, "LD"),
    (400, "CD"),
    (100, "C"),
    (99, "IC"),
    (95, "VC"),
    (90, "XC"),
    (50, "L"),
    (49, "IL"),
    (45, "VL"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
const ROMAN_FORMS: [&[(i64, &str)]; 5] = [
    ROMAN_FORM_0,
    ROMAN_FORM_1,
    ROMAN_FORM_2,
    ROMAN_FORM_3,
    ROMAN_FORM_4,
];

/// ROMAN(num[, form]) — convert integer 1..=3999 into a Roman numeral.
/// `form` defaults to 0 (classic). Forms 1..4 progressively simplify
/// subtractive notation; TRUE aliases classic and FALSE aliases form 4.
fn fn_roman(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n_raw = match coerce_to_number(&nv) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    // Truncate toward zero, then range-check.
    let n = n_raw.trunc() as i64;
    if !(1..=3999).contains(&n) {
        return Value::Error(ValueError::InvalidValue);
    }
    if args.len() == 2 {
        let fv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = fv {
            return Value::Error(e);
        }
        let form = match fv {
            Value::Boolean(true) => 0,
            Value::Boolean(false) => 4,
            other => match coerce_to_number(&other) {
                Some(f) => f.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            },
        };
        if !(0..=4).contains(&form) {
            return Value::Error(ValueError::InvalidValue);
        }
        return roman_with_form(n, form as usize);
    }
    roman_with_form(n, 0)
}

fn roman_with_form(n: i64, form: usize) -> Value {
    let mut rem = n;
    let mut out = String::new();
    for (v, sym) in ROMAN_FORMS[form].iter() {
        while rem >= *v {
            out.push_str(sym);
            rem -= *v;
        }
    }
    Value::Text(out)
}

/// ARABIC(roman_text) — parse a Roman numeral (case-insensitive).
/// Empty string → 0. Whitespace is trimmed. Negative prefix `-` is
/// rejected (Excel actually accepts a leading minus, but we keep the
/// surface narrow until we need it). Invalid syntax → #VALUE!.
fn fn_arabic(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let raw = match &v {
        Value::Text(s) => s.clone(),
        Value::Null => String::new(),
        // Numbers/booleans → reject.
        _ => return Value::Error(ValueError::WrongType),
    };
    let s = raw.trim().to_ascii_uppercase();
    if s.is_empty() {
        return Value::Number(0.0);
    }
    let mut total: i64 = 0;
    let mut prev: i64 = 0;
    for ch in s.chars().rev() {
        let v = match ch {
            'I' => 1,
            'V' => 5,
            'X' => 10,
            'L' => 50,
            'C' => 100,
            'D' => 500,
            'M' => 1000,
            _ => return Value::Error(ValueError::InvalidValue),
        };
        if v < prev {
            total -= v;
        } else {
            total += v;
        }
        prev = v;
    }
    Value::Number(total as f64)
}

/// DECIMAL(text, base) — parse `text` as an integer in `base` (2..=36).
fn fn_decimal(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let tv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = tv {
        return Value::Error(e);
    }
    let bv = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = bv {
        return Value::Error(e);
    }
    let base_f = match coerce_to_number(&bv) {
        Some(b) => b,
        None => return Value::Error(ValueError::WrongType),
    };
    if !base_f.is_finite() || base_f.trunc() != base_f {
        return Value::Error(ValueError::InvalidValue);
    }
    let base = base_f as i64;
    if !(2..=36).contains(&base) {
        return Value::Error(ValueError::InvalidValue);
    }
    // Accept Text only — numeric inputs would be lossy without us
    // formatting them first; Excel itself coerces Number → string, but
    // we keep the surface strict.
    let text = match &tv {
        Value::Text(s) => s.trim().to_ascii_uppercase(),
        Value::Number(n) => {
            if !n.is_finite() || n.trunc() != *n {
                return Value::Error(ValueError::InvalidValue);
            }
            // Render as plain decimal string; parse below in `base`
            // still applies, matching Excel's coercion path.
            format!("{}", *n as i64)
        }
        _ => return Value::Error(ValueError::WrongType),
    };
    if text.is_empty() {
        return Value::Number(0.0);
    }
    let mut acc: i64 = 0;
    for ch in text.chars() {
        let digit = match ch {
            '0'..='9' => ch as i64 - '0' as i64,
            'A'..='Z' => ch as i64 - 'A' as i64 + 10,
            _ => return Value::Error(ValueError::InvalidValue),
        };
        if digit >= base {
            return Value::Error(ValueError::InvalidValue);
        }
        acc = match acc.checked_mul(base).and_then(|a| a.checked_add(digit)) {
            Some(v) => v,
            None => return Value::Error(ValueError::Overflow),
        };
    }
    Value::Number(acc as f64)
}

/// BASE(num, base[, min_length]) — render a non-negative integer in
/// `base` (2..=36), zero-padded to `min_length` if requested.
fn fn_base(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if !(2..=3).contains(&args.len()) {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n_raw = match coerce_to_number(&nv) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    if !n_raw.is_finite() || n_raw < 0.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let n = n_raw.trunc() as i64;
    let bv = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = bv {
        return Value::Error(e);
    }
    let base_f = match coerce_to_number(&bv) {
        Some(b) => b,
        None => return Value::Error(ValueError::WrongType),
    };
    if !base_f.is_finite() || base_f.trunc() != base_f {
        return Value::Error(ValueError::InvalidValue);
    }
    let base = base_f as i64;
    if !(2..=36).contains(&base) {
        return Value::Error(ValueError::InvalidValue);
    }
    let min_len: usize = if args.len() == 3 {
        let mv = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = mv {
            return Value::Error(e);
        }
        match coerce_to_number(&mv) {
            Some(m) if m.is_finite() && m >= 0.0 => m.trunc() as usize,
            Some(_) => return Value::Error(ValueError::InvalidValue),
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        0
    };
    let s = if n == 0 {
        "0".to_string()
    } else {
        let mut digits: Vec<char> = Vec::new();
        let mut rem = n;
        while rem > 0 {
            let d = (rem % base) as u32;
            let ch = if d < 10 {
                (b'0' + d as u8) as char
            } else {
                (b'A' + (d - 10) as u8) as char
            };
            digits.push(ch);
            rem /= base;
        }
        digits.iter().rev().collect::<String>()
    };
    if s.len() >= min_len {
        Value::Text(s)
    } else {
        let pad = min_len - s.len();
        Value::Text(format!("{}{}", "0".repeat(pad), s))
    }
}

/// MDETERM(range) — determinant via Doolittle LU decomposition with
/// partial pivoting. Numerically stable up to ~50×50; we cap inputs at
/// 100×100 to keep eval time bounded.
fn fn_mdeterm(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let grid = match collect_range_2d_for_arg(&args[0], provider) {
        Some(g) => g,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let n = grid.len();
    if n == 0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let cols = grid[0].len();
    if cols != n {
        return Value::Error(ValueError::InvalidValue);
    }
    if n > 100 {
        return Value::Error(ValueError::Overflow);
    }
    // Materialise as f64 matrix; propagate errors and reject non-numeric.
    let mut m: Vec<Vec<f64>> = vec![vec![0.0; n]; n];
    for r in 0..n {
        if grid[r].len() != n {
            return Value::Error(ValueError::InvalidValue);
        }
        for c in 0..n {
            match &grid[r][c] {
                Value::Error(e) => return Value::Error(e.clone()),
                Value::Number(x) => m[r][c] = *x,
                Value::Null => m[r][c] = 0.0,
                Value::Boolean(b) => m[r][c] = if *b { 1.0 } else { 0.0 },
                Value::Text(_) => return Value::Error(ValueError::WrongType),
                // Dynamic-array: collapse to top-left scalar then retry.
                // Phase 1 unreachable — no constructor produces Array yet.
                Value::Array(arr) => match arr.get(0, 0) {
                    Some(Value::Number(x)) => m[r][c] = *x,
                    Some(Value::Null) | None => m[r][c] = 0.0,
                    Some(Value::Boolean(b)) => m[r][c] = if *b { 1.0 } else { 0.0 },
                    Some(Value::Error(e)) => return Value::Error(e.clone()),
                    Some(_) => return Value::Error(ValueError::WrongType),
                },
                // Determinant of a matrix containing a lambda — type error.
                Value::Lambda(_) => return Value::Error(ValueError::WrongType),
            }
        }
    }
    // LU with partial pivoting; det = product(diag(U)) * (-1)^swaps.
    let mut det = 1.0_f64;
    for i in 0..n {
        // Find pivot in column i.
        let mut piv_row = i;
        let mut piv_val = m[i][i].abs();
        for r in (i + 1)..n {
            let v = m[r][i].abs();
            if v > piv_val {
                piv_val = v;
                piv_row = r;
            }
        }
        if piv_val == 0.0 {
            return Value::Number(0.0);
        }
        if piv_row != i {
            m.swap(i, piv_row);
            det = -det;
        }
        det *= m[i][i];
        // Eliminate column i below row i.
        for r in (i + 1)..n {
            let factor = m[r][i] / m[i][i];
            for c in i..n {
                m[r][c] -= factor * m[i][c];
            }
        }
    }
    if det.is_finite() {
        Value::Number(det)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

/// 1970-epoch-aware Monday-indexed day-of-week (Mon=0..Sun=6). Used
/// by the working-day helpers below — kept Mon-indexed because the
/// NETWORKDAYS.INTL mask string is documented in Excel as Mon..Sun.
fn dow_monday_indexed(serial: i64) -> usize {
    // Sunday=0..Saturday=6 (since 1970-01-01 was Thursday → +4).
    let dow_sun = (serial + 4).rem_euclid(7);
    // Shift to Mon=0..Sun=6.
    ((dow_sun + 6) % 7) as usize
}

/// Resolve two `(start, end)` serial endpoints for NETWORKDAYS /
/// NETWORKDAYS.INTL, propagating cell-evaluation errors and surfacing
/// type errors when coercion fails.
fn networkdays_endpoints(
    start_arg: &Expr,
    end_arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<(i64, i64), ValueError> {
    let s = eval_expr_with_provider(start_arg, provider);
    if let Value::Error(e) = s {
        return Err(e);
    }
    let e = eval_expr_with_provider(end_arg, provider);
    if let Value::Error(er) = e {
        return Err(er);
    }
    let start = coerce_to_number(&s).ok_or(ValueError::WrongType)?.floor() as i64;
    let end = coerce_to_number(&e).ok_or(ValueError::WrongType)?.floor() as i64;
    Ok((start, end))
}

/// Parse a NETWORKDAYS.INTL / WORKDAY.INTL `weekend` argument. Returns
/// a Mon..Sun mask where `true` marks weekend days.
///
/// Accepted forms (matching Excel):
///   - Number 1..7   → two-day weekend block starting on a given day
///   - Number 11..17 → single-day weekend
///   - Text mask     → 7 chars of '0'/'1', char[0] = Monday
///
/// An all-`1` mask (no working days at all) is rejected as
/// InvalidValue, matching Excel's #VALUE! on the same input.
fn parse_weekend_arg(v: &Value) -> Result<[bool; 7], ValueError> {
    if let Value::Text(s) = v {
        // Text mask path. 7 characters of '0'/'1', Mon..Sun.
        let bytes = s.as_bytes();
        if bytes.len() != 7 {
            return Err(ValueError::InvalidValue);
        }
        let mut mask = [false; 7];
        let mut all_weekend = true;
        for (i, c) in bytes.iter().enumerate() {
            match c {
                b'0' => {
                    all_weekend = false;
                }
                b'1' => {
                    mask[i] = true;
                }
                _ => return Err(ValueError::InvalidValue),
            }
        }
        if all_weekend {
            // All days marked weekend → no working days at all.
            return Err(ValueError::InvalidValue);
        }
        return Ok(mask);
    }
    let code = coerce_to_number(v).ok_or(ValueError::WrongType)?;
    if code.fract() != 0.0 {
        return Err(ValueError::InvalidValue);
    }
    let code = code as i64;
    // Excel two-day codes: 1 = Sat+Sun, 2 = Sun+Mon, ..., 7 = Fri+Sat.
    // Mask indices are Mon=0..Sun=6.
    let two_day_pairs: [[usize; 2]; 7] = [
        [5, 6], // 1: Sat+Sun
        [6, 0], // 2: Sun+Mon
        [0, 1], // 3: Mon+Tue
        [1, 2], // 4: Tue+Wed
        [2, 3], // 5: Wed+Thu
        [3, 4], // 6: Thu+Fri
        [4, 5], // 7: Fri+Sat
    ];
    if (1..=7).contains(&code) {
        let pair = two_day_pairs[(code - 1) as usize];
        let mut mask = [false; 7];
        mask[pair[0]] = true;
        mask[pair[1]] = true;
        return Ok(mask);
    }
    // Single-day codes 11..17: 11 = Sun, 12 = Mon, ..., 17 = Sat.
    if (11..=17).contains(&code) {
        // 11 → Sun (mask idx 6), 12 → Mon (mask idx 0), ..., 17 → Sat (mask idx 5).
        let day = ((code - 12).rem_euclid(7)) as usize; // 12→0..17→5, 11→6
        let mut mask = [false; 7];
        mask[day] = true;
        return Ok(mask);
    }
    Err(ValueError::InvalidValue)
}

/// Walk an optional holidays argument via `for_each_arg_value`,
/// collecting whole-day integer serials. Numeric cells are floored;
/// Null / Text / Boolean cells are silently skipped (mixed-type
/// holiday columns happen in practice). Errors *do* propagate — a
/// `#DIV/0!` lurking in the holidays range short-circuits the whole
/// function, matching Excel.
fn collect_holidays(
    arg: Option<&Expr>,
    provider: &dyn EvalProvider,
) -> Result<HashSet<i64>, ValueError> {
    let mut set = HashSet::new();
    let arg = match arg {
        Some(a) => a,
        None => return Ok(set),
    };
    let mut err: Option<ValueError> = None;
    for_each_arg_value(arg, provider, &mut |_addr, v| {
        if err.is_some() {
            return;
        }
        match v {
            Value::Error(e) => err = Some(e),
            Value::Number(n) => {
                set.insert(n.floor() as i64);
            }
            // Text / Boolean / Null inside a holidays range → lenient
            // skip. Excel raises #VALUE! on text holidays; we match
            // the more forgiving Google Sheets behaviour here so
            // sparse data doesn't blow up the formula.
            _ => {}
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    Ok(set)
}

/// Count whole-day workdays from `start` to `end` inclusive on both
/// ends. A workday is a serial whose Mon-indexed day-of-week is not
/// flagged in `weekend` AND whose serial is not in `holidays`. If
/// `start > end` the count is negated (Excel parity).
fn count_workdays(start: i64, end: i64, weekend: &[bool; 7], holidays: &HashSet<i64>) -> i64 {
    if start == end {
        return if weekend[dow_monday_indexed(start)] || holidays.contains(&start) {
            0
        } else {
            1
        };
    }
    let (a, b, sign) = if start <= end {
        (start, end, 1)
    } else {
        (end, start, -1)
    };
    let mut count: i64 = 0;
    let mut d = a;
    while d <= b {
        if !weekend[dow_monday_indexed(d)] && !holidays.contains(&d) {
            count += 1;
        }
        d += 1;
    }
    sign * count
}

/// Advance `days` working days from `start`. `days == 0` returns
/// `start` verbatim (Excel does *not* snap to the nearest workday).
/// Positive `days` steps forward, negative steps backward; in both
/// directions the step skips weekend days and any serial in
/// `holidays`.
fn advance_workdays(start: i64, days: i64, weekend: &[bool; 7], holidays: &HashSet<i64>) -> i64 {
    if days == 0 {
        return start;
    }
    let step: i64 = if days > 0 { 1 } else { -1 };
    let mut remaining = days.abs();
    let mut cur = start;
    while remaining > 0 {
        cur += step;
        if !weekend[dow_monday_indexed(cur)] && !holidays.contains(&cur) {
            remaining -= 1;
        }
    }
    cur
}

/// ISO 8601 week number (1..53). Weeks start Monday; week 1 of the
/// ISO year is the week containing Jan 4 (equivalently, the first
/// week with ≥4 days of the new year). Dates within the first few
/// days of January may belong to the *previous* ISO year (when the
/// date sits before that year's week 1 starts); dates within the
/// last few days of December may belong to the *next* ISO year (when
/// the date sits past the computed year's last week boundary).
fn iso_week_number(serial: i64) -> i64 {
    // Helper: week-1 Monday for a given Gregorian year.
    fn week1_start(year: i32) -> i64 {
        let jan4 = date_serial(year, 1, 4) as i64;
        // Convert jan4's day-of-week to Mon=0..Sun=6.
        let dow_iso = dow_monday_indexed(jan4) as i64;
        jan4 - dow_iso
    }
    let (year, _, _) = date_from_serial(serial as f64);
    let start = week1_start(year);
    if serial < start {
        // Date is in the last ISO week of the previous Gregorian year.
        let prev_start = week1_start(year - 1);
        return (serial - prev_start) / 7 + 1;
    }
    // Could still be in week 1 of the next ISO year — check.
    let next_start = week1_start(year + 1);
    if serial >= next_start {
        return (serial - next_start) / 7 + 1;
    }
    (serial - start) / 7 + 1
}

fn stat_num(arg: &Expr, provider: &dyn EvalProvider) -> Result<f64, Value> {
    let v = eval_expr_with_provider(arg, provider);
    if let Value::Error(e) = v {
        return Err(Value::Error(e));
    }
    match coerce_to_number(&v) {
        Some(n) => Ok(n),
        None => Err(Value::Error(ValueError::WrongType)),
    }
}

fn stat_bool(arg: &Expr, provider: &dyn EvalProvider) -> Result<bool, Value> {
    let v = eval_expr_with_provider(arg, provider);
    if let Value::Error(e) = v {
        return Err(Value::Error(e));
    }
    match coerce_to_bool(&v) {
        Some(b) => Ok(b),
        None => Err(Value::Error(ValueError::WrongType)),
    }
}

fn stat_finite(n: f64) -> Value {
    if n.is_finite() {
        Value::Number(n)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn stat_norm_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Normal};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let mean = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let sd = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(sd > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Normal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

fn stat_norm_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let mean = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let sd = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p < 1.0) || !(sd > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Normal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

fn stat_norm_s_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Normal};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let z = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[1], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(if cumulative { dist.cdf(z) } else { dist.pdf(z) })
}

fn stat_norm_s_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p < 1.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(dist.inverse_cdf(p))
}

fn stat_t_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, StudentsT};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[2], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

fn stat_t_dist_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    // Excel: T.DIST.RT requires x >= 0 (returns #NUM! for negative).
    if !(df > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(1.0 - dist.cdf(x))
}

fn stat_t_dist_2t(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(df > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(2.0 * (1.0 - dist.cdf(x)))
}

fn stat_t_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p < 1.0) || !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

fn stat_t_inv_2t(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    // p ∈ (0, 1]. p=0 invalid (would yield infinity).
    if !(p > 0.0 && p <= 1.0) || !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Two-tail: find x s.t. P(|T| > x) = p  →  P(T > x) = p/2  →  x = invCDF(1 - p/2).
    stat_finite(dist.inverse_cdf(1.0 - p / 2.0))
}

fn stat_f_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, FisherSnedecor};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d1 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d2 = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(d1 > 0.0) || !(d2 > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match FisherSnedecor::new(d1, d2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

fn stat_f_dist_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, FisherSnedecor};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d1 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d2 = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(d1 > 0.0) || !(d2 > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match FisherSnedecor::new(d1, d2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(1.0 - dist.cdf(x))
}

fn stat_f_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, FisherSnedecor};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d1 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d2 = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p >= 0.0 && p < 1.0) || !(d1 > 0.0) || !(d2 > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match FisherSnedecor::new(d1, d2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

fn stat_f_inv_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, FisherSnedecor};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d1 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d2 = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p <= 1.0) || !(d1 > 0.0) || !(d2 > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match FisherSnedecor::new(d1, d2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(1.0 - p))
}

fn stat_chisq_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, Continuous, ContinuousCDF};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[2], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(df > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

fn stat_chisq_dist_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, ContinuousCDF};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(df > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(1.0 - dist.cdf(x))
}

fn stat_chisq_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, ContinuousCDF};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p >= 0.0 && p < 1.0) || !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

fn stat_chisq_inv_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, ContinuousCDF};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p <= 1.0) || !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(1.0 - p))
}

fn stat_expon_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Exp};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let lambda = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[2], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(lambda > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Exp::new(lambda) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

fn stat_weibull_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Weibull};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let alpha = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let beta = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(alpha > 0.0) || !(beta > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    // Excel: WEIBULL.DIST(x, shape=alpha, scale=beta). statrs::Weibull::new
    // takes (shape, scale) in that order — same convention.
    let dist = match Weibull::new(alpha, beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

fn stat_beta_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Beta, Continuous, ContinuousCDF};
    if !(4..=6).contains(&args.len()) {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let alpha = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let beta = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    let a = if args.len() >= 5 {
        match stat_num(&args[4], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        0.0
    };
    let b = if args.len() == 6 {
        match stat_num(&args[5], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        1.0
    };
    if !(alpha > 0.0) || !(beta > 0.0) || !(b > a) {
        return Value::Error(ValueError::Overflow);
    }
    if x < a || x > b {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Beta::new(alpha, beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Map x ∈ [a,b] → u ∈ [0,1].
    let u = (x - a) / (b - a);
    if cumulative {
        stat_finite(dist.cdf(u))
    } else {
        // PDF transforms by chain rule: f_X(x) = f_U(u) / (b - a).
        stat_finite(dist.pdf(u) / (b - a))
    }
}

fn stat_beta_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Beta, ContinuousCDF};
    if !(3..=5).contains(&args.len()) {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let alpha = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let beta = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let a = if args.len() >= 4 {
        match stat_num(&args[3], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        0.0
    };
    let b = if args.len() == 5 {
        match stat_num(&args[4], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        1.0
    };
    if !(p >= 0.0 && p <= 1.0) || !(alpha > 0.0) || !(beta > 0.0) || !(b > a) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Beta::new(alpha, beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let u = dist.inverse_cdf(p);
    stat_finite(a + u * (b - a))
}

fn stat_gamma_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Gamma};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let alpha = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let beta = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(alpha > 0.0) || !(beta > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Gamma::new(alpha, 1.0 / beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

fn stat_gamma_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Gamma};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let alpha = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let beta = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p >= 0.0 && p < 1.0) || !(alpha > 0.0) || !(beta > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Gamma::new(alpha, 1.0 / beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

fn stat_binom_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Binomial, Discrete, DiscreteCDF};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let num_s = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let trials = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let p = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(p >= 0.0 && p <= 1.0) || trials < 0.0 || num_s < 0.0 || num_s > trials {
        return Value::Error(ValueError::Overflow);
    }
    if num_s.trunc() != num_s || trials.trunc() != trials {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Binomial::new(p, trials as u64) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let k = num_s as u64;
    stat_finite(if cumulative { dist.cdf(k) } else { dist.pmf(k) })
}

fn stat_binom_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Binomial, DiscreteCDF};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let trials = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let p = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let alpha = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p < 1.0)
        || !(alpha > 0.0 && alpha < 1.0)
        || trials < 0.0
        || trials.trunc() != trials
    {
        return Value::Error(ValueError::Overflow);
    }
    let n = trials as u64;
    let dist = match Binomial::new(p, n) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Smallest k s.t. CDF(k) >= alpha. Linear scan is fine for typical n;
    // for very large n statrs's inverse_cdf would do bisection but its
    // default returns u64 and we want exact integer semantics here.
    for k in 0..=n {
        if dist.cdf(k) >= alpha {
            return Value::Number(k as f64);
        }
    }
    // Fallback (shouldn't happen since cdf(n)=1 ≥ alpha): return n.
    Value::Number(n as f64)
}

fn stat_poisson_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Discrete, DiscreteCDF, Poisson};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let mean = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[2], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(mean > 0.0) || x < 0.0 || x.trunc() != x {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Poisson::new(mean) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let k = x as u64;
    stat_finite(if cumulative { dist.cdf(k) } else { dist.pmf(k) })
}

fn stat_hypgeom_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Discrete, DiscreteCDF, Hypergeometric};
    if args.len() != 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let sample_s = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let num_sample = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let pop_s = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let num_pop = match stat_num(&args[3], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[4], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    for v in [sample_s, num_sample, pop_s, num_pop] {
        if v < 0.0 || v.trunc() != v {
            return Value::Error(ValueError::Overflow);
        }
    }
    if pop_s > num_pop || num_sample > num_pop || sample_s > num_sample || sample_s > pop_s {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Hypergeometric::new(num_pop as u64, pop_s as u64, num_sample as u64) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let k = sample_s as u64;
    stat_finite(if cumulative { dist.cdf(k) } else { dist.pmf(k) })
}

fn stat_negbinom_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    // Excel NEGBINOM.DIST(num_f, num_s, prob_s, cumulative): number of
    // failures before num_s successes. statrs::NegativeBinomial::new(r, p)
    // takes r = number of successes, p = success prob, and parameterises X
    // as the number of failures, matching Excel.
    use statrs::distribution::{Discrete, DiscreteCDF, NegativeBinomial};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let num_f = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let num_s = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let p = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(p > 0.0 && p <= 1.0)
        || num_f < 0.0
        || num_s < 1.0
        || num_f.trunc() != num_f
        || num_s.trunc() != num_s
    {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match NegativeBinomial::new(num_s, p) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let k = num_f as u64;
    stat_finite(if cumulative { dist.cdf(k) } else { dist.pmf(k) })
}

fn stat_gamma_func(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::function::gamma::gamma;
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    // Gamma function: undefined for 0 and negative integers (poles).
    if x == 0.0 || (x < 0.0 && x.trunc() == x) {
        return Value::Error(ValueError::Overflow);
    }
    stat_finite(gamma(x))
}

fn stat_gammaln(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::function::gamma::ln_gamma;
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if x <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    stat_finite(ln_gamma(x))
}

fn stat_erf(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::function::erf::erf;
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let lower = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if args.len() == 1 {
        stat_finite(erf(lower))
    } else {
        let upper = match stat_num(&args[1], provider) {
            Ok(n) => n,
            Err(e) => return e,
        };
        // Two-arg form: erf(upper) - erf(lower).
        stat_finite(erf(upper) - erf(lower))
    }
}

fn stat_erfc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::function::erf::erfc;
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    stat_finite(erfc(x))
}

fn stat_kurt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    let n = nums.len() as f64;
    if nums.len() < 4 {
        return Value::Error(ValueError::Overflow);
    }
    let mean = nums.iter().sum::<f64>() / n;
    let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let s = var.sqrt();
    if s == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let sum4 = nums.iter().map(|x| ((x - mean) / s).powi(4)).sum::<f64>();
    let k = (n * (n + 1.0)) / ((n - 1.0) * (n - 2.0) * (n - 3.0)) * sum4
        - 3.0 * (n - 1.0).powi(2) / ((n - 2.0) * (n - 3.0));
    stat_finite(k)
}

fn stat_skew(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    let n = nums.len() as f64;
    if nums.len() < 3 {
        return Value::Error(ValueError::Overflow);
    }
    let mean = nums.iter().sum::<f64>() / n;
    let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let s = var.sqrt();
    if s == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let sum3 = nums.iter().map(|x| ((x - mean) / s).powi(3)).sum::<f64>();
    let sk = n / ((n - 1.0) * (n - 2.0)) * sum3;
    stat_finite(sk)
}

fn stat_avedev(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = nums.len() as f64;
    let mean = nums.iter().sum::<f64>() / n;
    let sum_abs: f64 = nums.iter().map(|x| (x - mean).abs()).sum();
    stat_finite(sum_abs / n)
}

fn stat_devsq(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    if nums.is_empty() {
        return Value::Number(0.0);
    }
    let n = nums.len() as f64;
    let mean = nums.iter().sum::<f64>() / n;
    stat_finite(nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>())
}

fn stat_geomean(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::Overflow);
    }
    // All values must be strictly positive; else #NUM!.
    for &v in &nums {
        if v <= 0.0 {
            return Value::Error(ValueError::Overflow);
        }
    }
    // Use log-mean to avoid overflow on large products.
    let n = nums.len() as f64;
    let log_mean = nums.iter().map(|x| x.ln()).sum::<f64>() / n;
    stat_finite(log_mean.exp())
}

fn stat_harmean(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::Overflow);
    }
    for &v in &nums {
        if v <= 0.0 {
            return Value::Error(ValueError::Overflow);
        }
    }
    let n = nums.len() as f64;
    let inv_sum: f64 = nums.iter().map(|x| 1.0 / x).sum();
    stat_finite(n / inv_sum)
}

fn stat_trimmean(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let percent = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(percent >= 0.0 && percent < 1.0) {
        return Value::Error(ValueError::Overflow);
    }
    let mut nums = collect_numbers(&args[..1], provider);
    let n = nums.len();
    if n == 0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // Excel rule: total number to trim = floor(n * percent), then round
    // *down* to the nearest even integer so the same count is trimmed from
    // each end. e.g. n=20, percent=0.2 → floor(4)=4, even → trim 2 from
    // each end. n=10, percent=0.2 → floor(2)=2, even → trim 1 from each
    // end. n=10, percent=0.15 → floor(1.5)=1, made even → 0 → trim none.
    let trim_total = (n as f64 * percent).floor() as usize;
    let trim_each = trim_total / 2; // integer divide drops the odd bit -> "round down to even"
    if 2 * trim_each >= n {
        return Value::Error(ValueError::Overflow);
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let kept = &nums[trim_each..n - trim_each];
    let mean = kept.iter().sum::<f64>() / kept.len() as f64;
    stat_finite(mean)
}

fn stat_standardize(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let mean = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let sd = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if sd <= 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    stat_finite((x - mean) / sd)
}

fn stat_fisher(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if x <= -1.0 || x >= 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    stat_finite(0.5 * ((1.0 + x) / (1.0 - x)).ln())
}

fn stat_fisherinv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let y = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let e2y = (2.0 * y).exp();
    stat_finite((e2y - 1.0) / (e2y + 1.0))
}

fn yearfrac_basis(start: f64, end: f64, basis: i64) -> Result<f64, ValueError> {
    let (lo, hi) = if start <= end {
        (start, end)
    } else {
        (end, start)
    };
    match basis {
        0 | 4 => {
            let (y1, m1, d1) = date_from_serial(lo);
            let (y2, m2, d2) = date_from_serial(hi);
            let num =
                (y2 - y1) as f64 * 360.0 + (m2 as f64 - m1 as f64) * 30.0 + (d2 as f64 - d1 as f64);
            Ok(num / 360.0)
        }
        1 => Ok((hi - lo) / 365.0),
        2 => Ok((hi - lo) / 360.0),
        3 => Ok((hi - lo) / 365.0),
        _ => Err(ValueError::InvalidValue),
    }
}

fn fin_basis(args: &[Expr], idx: usize, provider: &dyn EvalProvider) -> Result<i64, ValueError> {
    if args.len() <= idx {
        return Ok(0);
    }
    let b = fin_coerce(&args[idx], provider)?;
    let n = b.trunc() as i64;
    if !(0..=4).contains(&n) {
        return Err(ValueError::InvalidValue);
    }
    Ok(n)
}

fn day_diff(start: f64, end: f64) -> f64 {
    end.floor() - start.floor()
}

fn fn_sln(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let life = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if life <= 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number((cost - salvage) / life)
}

fn fn_syd(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let life = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let per = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if life <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if per < 1.0 || per > life {
        return Value::Error(ValueError::Overflow);
    }
    let result = (cost - salvage) * (life - per + 1.0) * 2.0 / (life * (life + 1.0));
    Value::Number(result)
}

fn fn_db(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let life = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let period = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let month = if args.len() == 5 {
        match fin_coerce(&args[4], provider) {
            Ok(v) => v.trunc(),
            Err(e) => return Value::Error(e),
        }
    } else {
        12.0
    };
    if life <= 0.0 || period < 1.0 || month < 1.0 || month > 12.0 {
        return Value::Error(ValueError::Overflow);
    }
    if cost == 0.0 {
        return Value::Number(0.0);
    }
    if salvage < 0.0 || cost < 0.0 || (cost > 0.0 && salvage > cost) {
        return Value::Error(ValueError::Overflow);
    }
    // Excel rounds the rate to 3 decimals.
    let raw_rate = if salvage == 0.0 {
        1.0
    } else {
        1.0 - (salvage / cost).powf(1.0 / life)
    };
    let rate = (raw_rate * 1000.0).round() / 1000.0;
    // The "extra" period beyond `life` is allowed when month < 12; reject
    // anything past `life + 1`.
    let life_i = life.trunc() as i64;
    let per_i = period.trunc() as i64;
    if per_i > life_i + 1 {
        return Value::Error(ValueError::Overflow);
    }
    // Simulate period-by-period. We do a tight closed-form loop because
    // each period's depreciation depends only on running total.
    let mut total: f64 = 0.0;
    let mut last_dep: f64 = 0.0;
    let last_period = per_i.min(life_i + 1);
    for k in 1..=last_period {
        let dep = if k == 1 {
            cost * rate * month / 12.0
        } else if (k as f64) == life + 1.0 {
            (cost - total) * rate * (12.0 - month) / 12.0
        } else {
            (cost - total) * rate
        };
        last_dep = dep;
        total += dep;
    }
    if !last_dep.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(last_dep)
}

fn fn_ddb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let life = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let period = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let factor = if args.len() == 5 {
        match fin_coerce(&args[4], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        2.0
    };
    if cost < 0.0 || salvage < 0.0 || life <= 0.0 || period < 1.0 || factor <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if period > life + 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dep = ddb_period(cost, salvage, life, period, factor);
    if dep.is_finite() {
        Value::Number(dep)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn ddb_period(cost: f64, salvage: f64, life: f64, period: f64, factor: f64) -> f64 {
    let rate = factor / life;
    let mut prior: f64 = 0.0;
    let p_int = period.floor() as i64;
    for _ in 1..p_int {
        let d = ((cost - prior) * rate).min(cost - salvage - prior).max(0.0);
        prior += d;
    }
    ((cost - prior) * rate).min(cost - salvage - prior).max(0.0)
}

fn fn_vdb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 7 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let life = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let start = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let end = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let factor = if args.len() >= 6 {
        match fin_coerce(&args[5], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        2.0
    };
    let no_switch = if args.len() == 7 {
        match fin_coerce(&args[6], provider) {
            Ok(v) => v != 0.0,
            Err(e) => return Value::Error(e),
        }
    } else {
        false
    };
    if cost < 0.0 || salvage < 0.0 || life <= 0.0 || factor <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if start < 0.0 || end < start || end > life {
        return Value::Error(ValueError::Overflow);
    }
    // Walk full periods 1..=life. For each period, accumulate the
    // DDB amount (no-switch) or the larger of DDB-vs-SL-on-remaining-life
    // (switch). Then take the slice of total dep between `start` and `end`.
    //
    // VDB allows fractional start/end; we approximate by integrating
    // whole periods and pro-rating the fractional ends. This is the same
    // approach used by every open-source spreadsheet engine we've seen.
    let rate = factor / life;
    let life_i = life.ceil() as i64;
    let mut prior: f64 = 0.0;
    let mut per_dep: Vec<f64> = Vec::with_capacity(life_i as usize);
    let mut switched = false;
    for k in 1..=life_i {
        let ddb_d = ((cost - prior) * rate).min(cost - salvage - prior).max(0.0);
        let dep = if no_switch {
            ddb_d
        } else {
            // Straight-line over remaining life. `(life - (k-1))` is the
            // number of full periods left at the START of period k.
            let remaining_periods = life - (k as f64 - 1.0);
            let sl_d = if remaining_periods > 0.0 {
                ((cost - salvage - prior) / remaining_periods).max(0.0)
            } else {
                0.0
            };
            if switched || sl_d > ddb_d {
                switched = true;
                sl_d
            } else {
                ddb_d
            }
        };
        per_dep.push(dep);
        prior += dep;
    }
    // Sum dep[start..end] with fractional pro-rating at the boundaries.
    let mut total = 0.0_f64;
    let s_floor = start.floor() as i64;
    let e_ceil = end.ceil() as i64;
    for k in (s_floor + 1).max(1)..=e_ceil.min(life_i) {
        let idx = (k - 1) as usize;
        let p_start = (k - 1) as f64;
        let p_end = k as f64;
        let s = start.max(p_start);
        let e = end.min(p_end);
        if e > s {
            total += per_dep[idx] * (e - s) / (p_end - p_start);
        }
    }
    if total.is_finite() {
        Value::Number(total)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

/// Trivial EvalProvider used inside CUMIPMT/CUMPRINC's IPMT/PPMT recursion
/// where all args are already literals (no cell lookups needed).
struct CumNoopProvider;
impl EvalProvider for CumNoopProvider {
    fn cell(&self, _addr: CellAddress) -> Value {
        Value::Null
    }
    fn sheet_cell(&self, _sheet: &str, _addr: CellAddress) -> Value {
        Value::Null
    }
}

const XIRR_TOL: f64 = 1e-7;
const XIRR_MAX_ITER: usize = 100;

fn cumulative_pmt<F>(args: &[Expr], provider: &dyn EvalProvider, per_call: F) -> Value
where
    F: Fn(f64, f64, f64, f64, f64) -> Value,
{
    if args.len() != 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let start = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let end = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let type_ = match fin_coerce_type(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate <= 0.0 || nper <= 0.0 || pv <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let s = start.trunc() as i64;
    let e = end.trunc() as i64;
    let n = nper.trunc() as i64;
    if s < 1 || e < s || e > n {
        return Value::Error(ValueError::Overflow);
    }
    let mut total = 0.0_f64;
    for k in s..=e {
        match per_call(rate, k as f64, nper, pv, type_) {
            Value::Number(v) => total += v,
            other => return other,
        }
    }
    if total.is_finite() {
        Value::Number(total)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_cumipmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    cumulative_pmt(args, provider, |rate, per, nper, pv, type_| {
        // Build the args IPMT expects: (rate, per, nper, pv, fv=0, type).
        let synth = [
            Expr::Number(rate),
            Expr::Number(per),
            Expr::Number(nper),
            Expr::Number(pv),
            Expr::Number(0.0),
            Expr::Number(type_),
        ];
        fn_ipmt(&synth, &CumNoopProvider)
    })
}

fn fn_cumprinc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    cumulative_pmt(args, provider, |rate, per, nper, pv, type_| {
        let synth = [
            Expr::Number(rate),
            Expr::Number(per),
            Expr::Number(nper),
            Expr::Number(pv),
            Expr::Number(0.0),
            Expr::Number(type_),
        ];
        fn_ppmt(&synth, &CumNoopProvider)
    })
}

fn fn_effect(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nominal = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let npery = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let n = npery.trunc();
    if nominal <= 0.0 || n < 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let r = (1.0 + nominal / n).powf(n) - 1.0;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_nominal(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let effect = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let npery = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let n = npery.trunc();
    if effect <= 0.0 || n < 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let r = ((1.0 + effect).powf(1.0 / n) - 1.0) * n;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_ispmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let per = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if nper == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // Excel sign convention: a positive `pv` (loan we receive) implies
    // negative interest (outflow), and ISPMT pays straight-line interest.
    Value::Number(-pv * rate * (1.0 - per / nper))
}

fn fn_accrint(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 8 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let issue = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // first_interest is consumed for parity with Excel's signature but
    // doesn't affect the simplified computation.
    let _first_interest = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let settlement = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let par = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[5], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // calc_method (arg 7) is accepted for parity but doesn't change our
    // simplified result (Excel only varies behavior when settlement
    // crosses multiple periods backward).
    if args.len() == 8 {
        if let Err(e) = fin_coerce(&args[7], provider) {
            return Value::Error(e);
        }
    }
    if rate <= 0.0 || par <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if settlement <= issue {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(issue, settlement, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    Value::Number(par * rate * yf)
}

fn fn_accrintm(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let issue = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let settlement = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let par = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate <= 0.0 || par <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if settlement <= issue {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(issue, settlement, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    Value::Number(par * rate * yf)
}

fn fn_disc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if pr <= 0.0 || redemption <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if yf == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let r = (redemption - pr) / redemption / yf;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_intrate(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let investment = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if investment <= 0.0 || redemption <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if yf == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let r = (redemption - investment) / investment / yf;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_received(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let investment = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let discount = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if investment <= 0.0 || discount <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let denom = 1.0 - discount * yf;
    if denom <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let r = investment / denom;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_tbilleq(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let discount = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if discount <= 0.0 || maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let diff = day_diff(settlement, maturity);
    if diff > 365.0 {
        return Value::Error(ValueError::Overflow);
    }
    let denom = 360.0 - discount * diff;
    if denom <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(365.0 * discount / denom)
}

fn fn_tbillprice(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let discount = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if discount <= 0.0 || maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let diff = day_diff(settlement, maturity);
    if diff > 365.0 {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(100.0 * (1.0 - discount * diff / 360.0))
}

fn fn_tbillyield(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if pr <= 0.0 || maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let diff = day_diff(settlement, maturity);
    if diff <= 0.0 || diff > 365.0 {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number((100.0 - pr) / pr * 360.0 / diff)
}

fn collect_xirr_pairs(
    values: &Expr,
    dates: &Expr,
    provider: &dyn EvalProvider,
) -> Result<Vec<(f64, f64)>, ValueError> {
    let mut vs: Vec<f64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for_each_arg_value(values, provider, &mut |_addr, v| {
        if err.is_some() {
            return;
        }
        match v {
            Value::Number(n) => vs.push(n),
            Value::Error(e) => err = Some(e),
            Value::Null => {}
            _ => err = Some(ValueError::InvalidValue),
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    let mut ds: Vec<f64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for_each_arg_value(dates, provider, &mut |_addr, v| {
        if err.is_some() {
            return;
        }
        match v {
            Value::Number(n) => ds.push(n.floor()),
            Value::Error(e) => err = Some(e),
            Value::Null => {}
            _ => err = Some(ValueError::InvalidValue),
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    if vs.len() != ds.len() || vs.len() < 2 {
        return Err(ValueError::InvalidValue);
    }
    let paired: Vec<(f64, f64)> = ds.into_iter().zip(vs.into_iter()).collect();
    let d0 = paired[0].0;
    if paired.iter().any(|(d, _)| *d < d0) {
        return Err(ValueError::Overflow);
    }
    Ok(paired)
}

fn fn_xirr(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_xirr_pairs(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    // Require at least one positive AND one negative cash flow.
    let has_pos = pairs.iter().any(|(_, v)| *v > 0.0);
    let has_neg = pairs.iter().any(|(_, v)| *v < 0.0);
    if !(has_pos && has_neg) {
        return Value::Error(ValueError::InvalidValue);
    }
    let guess = if args.len() == 3 {
        match fin_coerce(&args[2], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.1
    };
    if guess <= -1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let d0 = pairs[0].0;
    let mut r = guess;
    for _ in 0..XIRR_MAX_ITER {
        let base = 1.0 + r;
        if base <= 0.0 || !base.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        let mut f = 0.0_f64;
        let mut fp = 0.0_f64;
        for (d, v) in &pairs {
            let t = (*d - d0) / 365.0;
            let denom = base.powf(t);
            if denom == 0.0 || !denom.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            f += v / denom;
            // df/dr [v * (1+r)^(-t)] = -t * v * (1+r)^(-t-1)
            fp += -t * v / (denom * base);
        }
        if !f.is_finite() || !fp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if f.abs() < XIRR_TOL {
            return Value::Number(r);
        }
        if fp == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
        let next = r - f / fp;
        if !next.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if (next - r).abs() < XIRR_TOL {
            return Value::Number(next);
        }
        r = next;
    }
    Value::Error(ValueError::Overflow)
}

fn fn_xnpv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate <= -1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let pairs = match collect_xirr_pairs(&args[1], &args[2], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    let d0 = pairs[0].0;
    let mut total = 0.0_f64;
    let base = 1.0 + rate;
    if base <= 0.0 || !base.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    for (d, v) in &pairs {
        let t = (*d - d0) / 365.0;
        let denom = base.powf(t);
        if denom == 0.0 || !denom.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        total += v / denom;
    }
    if total.is_finite() {
        Value::Number(total)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_mirr(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let values = match collect_irr_values(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let finance_rate = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let reinvest_rate = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let has_pos = values.iter().any(|v| *v > 0.0);
    let has_neg = values.iter().any(|v| *v < 0.0);
    if !(has_pos && has_neg) {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = values.len() as i32;
    if n < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    if finance_rate <= -1.0 || reinvest_rate <= -1.0 {
        return Value::Error(ValueError::Overflow);
    }
    // PV of negatives at finance_rate (period i counts as i, starting at 0).
    let mut pv_neg = 0.0_f64;
    for (i, v) in values.iter().enumerate() {
        if *v < 0.0 {
            let denom = (1.0 + finance_rate).powi(i as i32);
            if denom == 0.0 || !denom.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            pv_neg += v / denom;
        }
    }
    // FV of positives at reinvest_rate at the end (period i grows for n-1-i periods).
    let mut fv_pos = 0.0_f64;
    for (i, v) in values.iter().enumerate() {
        if *v > 0.0 {
            let pow = (1.0 + reinvest_rate).powi((n - 1 - i as i32) as i32);
            if !pow.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            fv_pos += v * pow;
        }
    }
    if pv_neg == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let ratio = -fv_pos / pv_neg;
    if ratio <= 0.0 || !ratio.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    let r = ratio.powf(1.0 / (n as f64 - 1.0)) - 1.0;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

// ----- Bond-depth helpers ------------------------------------------------
//
// Coupon-period arithmetic is intentionally simplified: we treat the
// previous-coupon date as `maturity - N*period_days` (largest N keeping
// the result >= settlement). `period_days` is 360/freq for basis 0/2/4,
// 365/freq for basis 3, and `actual` (computed via DATE math subtracting
// months) for basis 1. This is faithful enough for happy-path bond
// scenarios but does not match Excel's exact actual/actual handling for
// odd first/last coupon periods.

/// Coupon-period length in days for a given frequency + basis.
/// Returns the canonical Excel "E" denominator used in PRICE/YIELD.
fn coup_period_days(frequency: i64, basis: i64) -> f64 {
    match basis {
        0 | 2 | 4 => 360.0 / frequency as f64,
        3 => 365.0 / frequency as f64,
        // basis 1 (actual/actual): we approximate with the average year
        // length; callers that need the actual period split use
        // prev/next_coupon_date together with day_diff.
        1 => 365.25 / frequency as f64,
        _ => f64::NAN,
    }
}

/// Previous coupon date strictly <= settlement, derived by walking back
/// from maturity in whole coupon periods. We use a date-arithmetic walk
/// (subtract `12 / frequency` months) rather than serial subtraction so
/// month-end semantics line up with Excel's coupon-date conventions.
fn prev_coupon_date(settlement: f64, maturity: f64, frequency: i64) -> f64 {
    let months_per_period = 12 / frequency as i32;
    let (my, mm, md) = date_from_serial(maturity);
    let mut k = 0i32;
    loop {
        let total_months = (my * 12 + (mm as i32 - 1)) - k * months_per_period;
        let ny = total_months.div_euclid(12);
        let nm = (total_months.rem_euclid(12) + 1) as u32;
        // Day-of-month clamp to last day of target month.
        let dom = days_in_month(ny, nm);
        let nd = md.min(dom);
        let serial = date_serial(ny, nm, nd);
        if serial <= settlement {
            return serial;
        }
        k += 1;
        if k > 4_000 {
            // Safety net: ~1000 years on quarterly bonds; bail out so we
            // never spin forever on a malformed input.
            return serial;
        }
    }
}

/// Next coupon date strictly > settlement. Same walk as prev but stops
/// one period earlier.
fn next_coupon_date(settlement: f64, maturity: f64, frequency: i64) -> f64 {
    let prev = prev_coupon_date(settlement, maturity, frequency);
    let months_per_period = 12 / frequency as i32;
    let (py, pm, pd) = date_from_serial(prev);
    let total_months = py * 12 + (pm as i32 - 1) + months_per_period;
    let ny = total_months.div_euclid(12);
    let nm = (total_months.rem_euclid(12) + 1) as u32;
    let dom = days_in_month(ny, nm);
    let nd = pd.min(dom);
    date_serial(ny, nm, nd)
}

/// Number of coupons from settlement to maturity (rounded up to whole
/// coupons). Used by COUPNUM and PRICE's `N`.
fn coup_num(settlement: f64, maturity: f64, frequency: i64) -> f64 {
    let months_per_period = 12 / frequency as i32;
    let (sy, sm, _sd) = date_from_serial(settlement);
    let (my, mm, _md) = date_from_serial(maturity);
    let months_between = (my * 12 + mm as i32 - 1) - (sy * 12 + sm as i32 - 1);
    let raw = months_between as f64 / months_per_period as f64;
    // Settlement strictly before any coupon contributes a fractional
    // period — round up to a whole coupon count.
    raw.ceil().max(1.0)
}

/// Coupon-period split (A, DSC, E) at `settlement` in days. Returned
/// triple is `(A = days from prev coupon to settlement, DSC = days from
/// settlement to next coupon, E = days in coupon period)`. We pin DSC + A = E
/// so that at exact coupon boundaries DSC/E = 1.0 and A/E = 0.0 (the
/// invariant that drives PRICE_at_par_yield = par).
fn coup_period_split(
    settlement: f64,
    maturity: f64,
    frequency: i64,
    basis: i64,
) -> (f64, f64, f64) {
    let pcd = prev_coupon_date(settlement, maturity, frequency);
    let ncd = next_coupon_date(settlement, maturity, frequency);
    // For basis 1 and 3 we use the real day diff; for 0/2/4 we use the
    // canonical 30/360 period length so A + DSC = E exactly.
    let e_real = day_diff(pcd, ncd).max(1.0);
    let e_canonical = coup_period_days(frequency, basis);
    let (a_real, dsc_real) = (
        day_diff(pcd, settlement).max(0.0),
        day_diff(settlement, ncd).max(0.0),
    );
    match basis {
        0 | 2 | 4 => {
            // Map the real fractional position onto the canonical period
            // length. A/E and DSC/E thus depend only on where settlement
            // falls within the period, not the basis-specific year length.
            let frac = if e_real > 0.0 { a_real / e_real } else { 0.0 };
            let a = e_canonical * frac;
            (a, e_canonical - a, e_canonical)
        }
        _ => (a_real, dsc_real, e_real),
    }
}

/// Clean-price ("PRICE") computation pulled out so YIELD's Newton solver
/// can re-use it without re-parsing arguments.
fn price_from_yield(
    settlement: f64,
    maturity: f64,
    rate: f64,
    yld: f64,
    redemption: f64,
    frequency: i64,
    basis: i64,
) -> Result<f64, ValueError> {
    let (a, dsc, e) = coup_period_split(settlement, maturity, frequency, basis);
    if !e.is_finite() || e <= 0.0 {
        return Err(ValueError::InvalidValue);
    }
    // N = coupons remaining from settlement to maturity (inclusive of the
    // last one). The largest k such that pcd + k*period <= maturity.
    let n = coup_num(settlement, maturity, frequency);
    let f = frequency as f64;
    let dsc_e = (dsc / e).max(0.0);
    let coupon = 100.0 * rate / f;
    let one_plus = 1.0 + yld / f;
    if one_plus <= 0.0 {
        return Err(ValueError::Overflow);
    }
    // Redemption discount: redemption / (1+y/f)^(N-1+DSC/E).
    let redemp = redemption / one_plus.powf(n - 1.0 + dsc_e);
    let mut coupons_pv = 0.0_f64;
    let n_int = n as i64;
    for k in 1..=n_int {
        let exp = (k as f64) - 1.0 + dsc_e;
        coupons_pv += coupon / one_plus.powf(exp);
    }
    let accrued = coupon * a / e;
    let price = redemp + coupons_pv - accrued;
    if !price.is_finite() {
        return Err(ValueError::Overflow);
    }
    Ok(price)
}

fn fn_price(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 7 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[5], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0 || yld < 0.0 || redemption <= 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    match price_from_yield(
        settlement, maturity, rate, yld, redemption, frequency, basis,
    ) {
        Ok(p) => Value::Number(p),
        Err(e) => Value::Error(e),
    }
}

fn fn_yield(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 7 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[5], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0 || pr <= 0.0 || redemption <= 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    // Newton-Raphson on PRICE(yield) - pr.
    let mut y = rate.max(0.05);
    for _ in 0..100 {
        let p = match price_from_yield(settlement, maturity, rate, y, redemption, frequency, basis)
        {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        };
        let dy = 1e-6_f64;
        let p2 = match price_from_yield(
            settlement,
            maturity,
            rate,
            y + dy,
            redemption,
            frequency,
            basis,
        ) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        };
        let f = p - pr;
        if f.abs() < 1e-7 {
            return Value::Number(y);
        }
        let fp = (p2 - p) / dy;
        if fp == 0.0 || !fp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        let next = y - f / fp;
        if !next.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if (next - y).abs() < 1e-9 {
            return Value::Number(next);
        }
        y = next;
    }
    Value::Error(ValueError::Overflow)
}

/// Macaulay duration shared between DURATION (returns it directly) and
/// MDURATION (divides it by `1 + yld/freq`).
fn macaulay_duration(
    settlement: f64,
    maturity: f64,
    coupon: f64,
    yld: f64,
    frequency: i64,
    basis: i64,
) -> Result<f64, ValueError> {
    let (_a, dsc, e) = coup_period_split(settlement, maturity, frequency, basis);
    if !e.is_finite() || e <= 0.0 {
        return Err(ValueError::InvalidValue);
    }
    let dsc_e = dsc / e;
    let n = coup_num(settlement, maturity, frequency);
    let f = frequency as f64;
    let cpn = 100.0 * coupon / f;
    let redemption = 100.0;
    let one_plus = 1.0 + yld / f;
    if one_plus <= 0.0 {
        return Err(ValueError::Overflow);
    }
    let mut weighted = 0.0_f64;
    let mut pv_total = 0.0_f64;
    let n_int = n as i64;
    for k in 1..=n_int {
        let t_periods = (k as f64) - 1.0 + dsc_e;
        let t_years = t_periods / f;
        let pv = cpn / one_plus.powf(t_periods);
        weighted += t_years * pv;
        pv_total += pv;
    }
    let t_redemp_periods = (n_int as f64) - 1.0 + dsc_e;
    let t_redemp_years = t_redemp_periods / f;
    let pv_redemp = redemption / one_plus.powf(t_redemp_periods);
    weighted += t_redemp_years * pv_redemp;
    pv_total += pv_redemp;
    if pv_total == 0.0 || !pv_total.is_finite() {
        return Err(ValueError::DivisionByZero);
    }
    Ok(weighted / pv_total)
}

fn fn_duration(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let coupon = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[4], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if coupon < 0.0 || yld < 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    match macaulay_duration(settlement, maturity, coupon, yld, frequency, basis) {
        Ok(d) => Value::Number(d),
        Err(e) => Value::Error(e),
    }
}

fn fn_mduration(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let coupon = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[4], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if coupon < 0.0 || yld < 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    let d = match macaulay_duration(settlement, maturity, coupon, yld, frequency, basis) {
        Ok(d) => d,
        Err(e) => return Value::Error(e),
    };
    let denom = 1.0 + yld / frequency as f64;
    if denom == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number(d / denom)
}

fn fn_pricedisc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let discount = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if discount <= 0.0 || redemption <= 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    Value::Number(redemption * (1.0 - discount * yf))
}

fn fn_yielddisc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if pr <= 0.0 || redemption <= 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if yf == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number((redemption - pr) / pr / yf)
}

fn fn_pricemat(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let issue = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate < 0.0 || yld < 0.0 || settlement >= maturity || issue >= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let dim = match yearfrac_basis(issue, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let a = match yearfrac_basis(issue, settlement, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let dsm = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let denom = 1.0 + dsm * yld;
    if denom == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let numer = 100.0 + dim * rate * 100.0;
    let price = numer / denom - a * rate * 100.0;
    if price.is_finite() {
        Value::Number(price)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_yieldmat(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let issue = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate < 0.0 || pr <= 0.0 || settlement >= maturity || issue >= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let dim = match yearfrac_basis(issue, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let a = match yearfrac_basis(issue, settlement, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let dsm = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if dsm == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // YIELDMAT closed form: y = ((1 + DIM*rate) / (pr/100 + A*rate) - 1) / DSM.
    let denom_inner = pr / 100.0 + a * rate;
    if denom_inner == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let y = ((1.0 + dim * rate) / denom_inner - 1.0) / dsm;
    if y.is_finite() {
        Value::Number(y)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_dollarde(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let frac_dollar = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fraction = match fin_coerce(&args[1], provider) {
        Ok(v) => v.trunc(),
        Err(e) => return Value::Error(e),
    };
    if fraction < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if fraction < 1.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let sign = if frac_dollar < 0.0 { -1.0 } else { 1.0 };
    let abs_dollar = frac_dollar.abs();
    let int_part = abs_dollar.trunc();
    let frac_part = abs_dollar - int_part;
    let scale = 10.0_f64.powf((fraction).log10().ceil());
    let decimal = int_part + frac_part * scale / fraction;
    let result = sign * decimal;
    if result.is_finite() {
        Value::Number(result)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_dollarfr(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let dec_dollar = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fraction = match fin_coerce(&args[1], provider) {
        Ok(v) => v.trunc(),
        Err(e) => return Value::Error(e),
    };
    if fraction < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if fraction < 1.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let sign = if dec_dollar < 0.0 { -1.0 } else { 1.0 };
    let abs_dollar = dec_dollar.abs();
    let int_part = abs_dollar.trunc();
    let dec_part = abs_dollar - int_part;
    let scale = 10.0_f64.powf((fraction).log10().ceil());
    let frac_part = dec_part * fraction / scale;
    let result = sign * (int_part + frac_part);
    if result.is_finite() {
        Value::Number(result)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_coupdaybs(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[2], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    // basis is validated for range parity with Excel but doesn't change
    // the simple settlement - prev_coupon day count we surface.
    let _basis = match fin_basis(args, 3, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    let pcd = prev_coupon_date(settlement, maturity, frequency);
    Value::Number(day_diff(pcd, settlement).max(0.0))
}

fn fn_coupdays(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[2], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 3, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    // For basis 1 (actual/actual) we return the real day count between
    // prev and next coupon dates. For other bases we return the canonical
    // 360/freq or 365/freq number that yearfrac_basis uses.
    let days = if basis == 1 {
        let pcd = prev_coupon_date(settlement, maturity, frequency);
        let ncd = next_coupon_date(settlement, maturity, frequency);
        day_diff(pcd, ncd)
    } else {
        coup_period_days(frequency, basis)
    };
    Value::Number(days)
}

fn fn_coupnum(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[2], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let _basis = match fin_basis(args, 3, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(coup_num(settlement, maturity, frequency))
}

/// AMORDEGRC coefficient table per the French tax-accounting
/// convention. `life = 1/rate` (in years).
///
/// Excel boundaries (verified against the public Microsoft docs at
/// https://support.microsoft.com/en-us/office/amordegrc-function-a14d0ca1-64a4-42eb-9b3d-b0dededf9e51 ):
///   life in (3, 4]    → 1.5
///   life in (4, 6]    → 2.0
///   life in (6, +inf) → 2.5
///   life <= 3         → 1.0  (no degressive adjustment)
///
/// Boundary handling — `life == 4` is treated as 1.5 (the (3,4] bucket),
/// `life == 6` as 2.0 (the (4,6] bucket). These are half-open intervals
/// closed on the right; this matches Excel's observed behavior at exact
/// boundary values (e.g. rate=0.25 → life=4 → coef=1.5; rate=1/6 →
/// life=6 → coef=2.0). For rates that don't hit a clean boundary (e.g.
/// 0.15 → life≈6.67 → coef=2.5), the `>` test on the upper bound suffices.
fn amordegrc_coefficient(life: f64) -> f64 {
    if life > 6.0 {
        2.5
    } else if life > 4.0 {
        2.0
    } else if life > 3.0 {
        1.5
    } else {
        1.0
    }
}

/// AMORDEGRC — French degressive depreciation with rounding per period.
///
/// Signature: AMORDEGRC(cost, date_purchased, first_period, salvage,
/// period, rate, [basis]). Returns the depreciation amount FOR the given
/// `period` (period 0 = first/initial period spanning purchased→first_period).
///
/// Algorithm (Excel-faithful, per Microsoft docs):
///  1. Domain checks:
///       - cost <= 0        → #NUM!
///       - salvage < 0      → #NUM!
///       - salvage >= cost  → #NUM! (no depreciation possible)
///       - period < 0       → #NUM!
///       - rate <= 0 or >=1 → #NUM!
///       - purchased > first_period → #NUM! (we use Overflow per project convention)
///       - basis not in 0..=4 → #VALUE! (delegated to `fin_basis`)
///  2. life = 1 / rate (theoretical full-asset lifetime in years).
///  3. coef = `amordegrc_coefficient(life)`; ddb_rate = rate * coef.
///  4. first_frac = yearfrac(purchased, first_period, basis).
///  5. Period 0 depreciation = round(cost * ddb_rate * first_frac), capped
///     to [0, cost-salvage]. EVERY period (not just the first) rounds to an
///     integer — Excel's documented behavior.
///  6. For each subsequent period p in 1..=period:
///       ddb_dep = round(book * ddb_rate)
///       remaining_periods = max(1, ceil(life) - p)
///       sl_dep = round((book - salvage) / remaining_periods)
///       dep = max(ddb_dep, sl_dep) when the straight-line "per remaining
///         whole period" candidate exceeds DDB (switch-to-SL trigger).
///       Cap dep to [0, book - salvage].
///       book -= dep.
///  7. Last-period (period == ceil(life)) close-out: per Microsoft docs the
///     final period's depreciation is `(book - salvage) * 1.5` capped at
///     `book - salvage` — i.e. effectively `book - salvage` (closes the
///     book exactly to salvage). Implemented explicitly so the cap is
///     visible in source.
///  8. period > ceil(life) → 0 (asset fully depreciated).
fn fn_amordegrc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 7 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let purchased = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let first_period = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let period = match fin_coerce(&args[4], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // basis validated to 0..=4 by `fin_basis`; out-of-range → #VALUE!.
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // Domain validation (all map to #NUM! per project convention).
    if cost <= 0.0
        || salvage < 0.0
        || salvage >= cost
        || period < 0
        || rate <= 0.0
        || rate >= 1.0
        || purchased > first_period
    {
        return Value::Error(ValueError::Overflow);
    }
    let life = 1.0 / rate;
    let coef = amordegrc_coefficient(life);
    let ddb_rate = rate * coef;
    // Last full period beyond which depreciation drops to 0. With life
    // fractional (e.g. 6.67), the asset is depreciated through ceil(life)
    // = 7 periods. With life integer (e.g. 10), through period 10.
    let last_period: i64 = life.ceil() as i64;

    // Period > life: asset is fully depreciated.
    if period > last_period {
        return Value::Number(0.0);
    }

    let first_frac = match yearfrac_basis(purchased, first_period, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let max_total = cost - salvage;

    // Period 0 (the partial initial period).
    let first_dep = (cost * ddb_rate * first_frac).round();
    let first_dep = first_dep.max(0.0).min(max_total);
    if period == 0 {
        return if first_dep.is_finite() {
            Value::Number(first_dep)
        } else {
            Value::Error(ValueError::Overflow)
        };
    }

    let mut book = cost - first_dep;
    let mut last_dep = first_dep;

    for p in 1..=period {
        // End-of-life close-out: per Excel, the final period's
        // depreciation is (book - salvage) * 1.5 capped at (book - salvage).
        // Net effect: drain remaining book to salvage exactly.
        if p == last_period {
            let remaining = (book - salvage).max(0.0);
            // 1.5x with cap = remaining → effectively closes book to salvage.
            last_dep = (remaining * 1.5).min(remaining).max(0.0);
            break;
        }
        // DDB candidate, rounded per period (every period, not just first).
        let ddb_dep = (book * ddb_rate).round();
        // Switch-to-straight-line trigger: when remaining (book-salvage)
        // spread over remaining WHOLE periods exceeds the DDB candidate,
        // we depreciate the straight-line amount instead.
        let remaining_periods = (last_period - p).max(1);
        let sl_dep = ((book - salvage) / remaining_periods as f64).round();
        let mut dep = if sl_dep > ddb_dep { sl_dep } else { ddb_dep };
        // Cap so book never crosses salvage.
        dep = dep.max(0.0).min((book - salvage).max(0.0));
        last_dep = dep;
        book -= dep;
        if book <= salvage {
            // Reached salvage early; further periods (still up to the
            // requested `period`) yield 0.
            if p < period {
                last_dep = 0.0;
            }
            break;
        }
    }

    if last_dep.is_finite() {
        Value::Number(last_dep)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_amorlinc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 7 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let purchased = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let first_period = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let period = match fin_coerce(&args[4], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if cost <= 0.0 || rate <= 0.0 || period < 0 || salvage < 0.0 || salvage >= cost {
        return Value::Error(ValueError::Overflow);
    }
    let first_frac = match yearfrac_basis(purchased, first_period, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let annual = cost * rate;
    let first_dep = (cost * rate * first_frac).round();
    if period == 0 {
        return Value::Number(first_dep.max(0.0).min(cost - salvage));
    }
    // Each subsequent full period depreciates `cost * rate` until book
    // reaches salvage; last period adjusts to land exactly at salvage.
    let mut book = cost - first_dep;
    let mut last_dep = first_dep;
    for _ in 1..=period {
        if book <= salvage {
            last_dep = 0.0;
            break;
        }
        let dep = annual.min(book - salvage).max(0.0);
        last_dep = dep;
        book -= dep;
    }
    if last_dep.is_finite() {
        Value::Number(last_dep)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_unichar(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n_f = match coerce_to_number(&v) {
        Some(n) => n.trunc(),
        None => return Value::Error(ValueError::WrongType),
    };
    if !(1.0..=1_114_111.0).contains(&n_f) {
        return Value::Error(ValueError::InvalidValue);
    }
    let cp = n_f as u32;
    // Reject surrogate halves explicitly — char::from_u32 also returns None
    // here, but spelling it out keeps the intent loud.
    if (0xD800..=0xDFFF).contains(&cp) {
        return Value::Error(ValueError::InvalidValue);
    }
    match char::from_u32(cp) {
        Some(c) => Value::Text(c.to_string()),
        None => Value::Error(ValueError::InvalidValue),
    }
}

fn fn_unicode(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let s = coerce_to_text(&v);
    match s.chars().next() {
        Some(c) => Value::Number(c as u32 as f64),
        None => Value::Error(ValueError::InvalidValue),
    }
}

fn fn_numbervalue(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = text_v {
        return Value::Error(e);
    }
    // Optional separator args. Take the first character; empty strings
    // fall back to the defaults (Excel parity).
    let decimal_sep = if args.len() >= 2 {
        let dv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = dv {
            return Value::Error(e);
        }
        coerce_to_text(&dv).chars().next().unwrap_or('.')
    } else {
        '.'
    };
    let group_sep = if args.len() == 3 {
        let gv = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = gv {
            return Value::Error(e);
        }
        coerce_to_text(&gv).chars().next().unwrap_or(',')
    } else {
        ','
    };
    if decimal_sep == group_sep {
        return Value::Error(ValueError::InvalidValue);
    }
    let raw = coerce_to_text(&text_v);
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        // Excel treats NUMBERVALUE("") as 0. Keep parity.
        return Value::Number(0.0);
    }
    // Strip group separators, then swap decimal → '.'.
    let mut buf = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch == group_sep {
            continue;
        }
        if ch.is_whitespace() {
            continue;
        }
        if ch == decimal_sep {
            buf.push('.');
        } else {
            buf.push(ch);
        }
    }
    // Excel also allows a trailing `%` to scale by 0.01 (repeated `%` stacks).
    let mut pct: i32 = 0;
    while buf.ends_with('%') {
        buf.pop();
        pct += 1;
    }
    match buf.parse::<f64>() {
        Ok(n) => {
            let scale = 100f64.powi(pct);
            if scale == 0.0 {
                Value::Number(n)
            } else {
                Value::Number(n / scale)
            }
        }
        Err(_) => Value::Error(ValueError::InvalidValue),
    }
}

fn quote_strict_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        if c == '"' {
            out.push('"');
            out.push('"');
        } else {
            out.push(c);
        }
    }
    out.push('"');
    out
}

fn render_value_to_text(v: &Value, strict: bool) -> String {
    match v {
        Value::Text(s) => {
            if strict {
                quote_strict_text(s)
            } else {
                s.clone()
            }
        }
        Value::Null => String::new(),
        _ => coerce_to_text(v),
    }
}

fn fn_valuetotext(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let strict = if args.len() == 2 {
        let fv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = fv {
            return Value::Error(e);
        }
        match coerce_to_number(&fv) {
            Some(n) => n.trunc() == 1.0,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        false
    };
    // Array unwrap: a Value::Array reaching here (e.g. from a nested
    // formula that spilled) should serialise the entire array, not just
    // the top-left scalar. ARRAYTOTEXT is the canonical entrypoint for
    // that; reuse it.
    if let Value::Array(arr) = &v {
        return render_array_to_text(arr, strict);
    }
    Value::Text(render_value_to_text(&v, strict))
}

fn fn_arraytotext(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let strict = if args.len() == 2 {
        let fv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = fv {
            return Value::Error(e);
        }
        match coerce_to_number(&fv) {
            Some(n) => n.trunc() == 1.0,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        false
    };

    // Range / SheetRange / OFFSET / array-producing scalar: walk through
    // `for_each_arg_value` and capture (row, col) so we can serialise in
    // row-major order with `;` row separators. For a Value::Array we get
    // a flat stream; we reconstruct shape from the underlying array.
    //
    // Strategy: detect the input shape via two passes.
    //   - Literal range / sheet range: peek at the AST to recover the
    //     rectangle dimensions.
    //   - Anything else (including OFFSET dynamic ranges and Value::Array
    //     scalars): evaluate once and dispatch on the result.
    //
    // This keeps the implementation small while still emitting the
    // correct row/col grid.
    match &args[0] {
        Expr::Range { start, end, .. } => {
            let range = CellRange::new(*start, *end).normalize();
            let rows = range.end.row - range.start.row + 1;
            let cols = range.end.col - range.start.col + 1;
            let mut grid: Vec<Vec<String>> =
                vec![vec![String::new(); cols as usize]; rows as usize];
            let mut err: Option<ValueError> = None;
            for_each_arg_value(&args[0], provider, &mut |addr, v| {
                if err.is_some() {
                    return;
                }
                if let Value::Error(e) = &v {
                    err = Some(e.clone());
                    return;
                }
                if let Some(a) = addr {
                    let r = (a.row - range.start.row) as usize;
                    let c = (a.col - range.start.col) as usize;
                    grid[r][c] = render_value_to_text(&v, strict);
                }
            });
            if let Some(e) = err {
                return Value::Error(e);
            }
            Value::Text(format_grid(&grid, strict))
        }
        Expr::SheetRange { start, end, .. } => {
            let range = CellRange::new(*start, *end).normalize();
            let rows = range.end.row - range.start.row + 1;
            let cols = range.end.col - range.start.col + 1;
            let mut grid: Vec<Vec<String>> =
                vec![vec![String::new(); cols as usize]; rows as usize];
            let mut err: Option<ValueError> = None;
            for_each_arg_value(&args[0], provider, &mut |addr, v| {
                if err.is_some() {
                    return;
                }
                if let Value::Error(e) = &v {
                    err = Some(e.clone());
                    return;
                }
                if let Some(a) = addr {
                    let r = (a.row - range.start.row) as usize;
                    let c = (a.col - range.start.col) as usize;
                    grid[r][c] = render_value_to_text(&v, strict);
                }
            });
            if let Some(e) = err {
                return Value::Error(e);
            }
            Value::Text(format_grid(&grid, strict))
        }
        _ => {
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            if let Value::Array(arr) = &v {
                return render_array_to_text(arr, strict);
            }
            // Scalar fallback: a single value emits its text directly
            // (concise) or quoted-text-then-braced (strict). Excel's
            // strict mode wraps even a single scalar in `{...}`; we match.
            let body = render_value_to_text(&v, strict);
            if strict {
                Value::Text(format!("{{{}}}", body))
            } else {
                Value::Text(body)
            }
        }
    }
}

fn format_grid(grid: &[Vec<String>], strict: bool) -> String {
    let inner = grid
        .iter()
        .map(|row| row.join(","))
        .collect::<Vec<_>>()
        .join(";");
    if strict {
        format!("{{{}}}", inner)
    } else {
        inner
    }
}

fn render_array_to_text(arr: &Arc<ArrayData>, strict: bool) -> Value {
    let rows = arr.rows as usize;
    let cols = arr.cols as usize;
    let mut grid: Vec<Vec<String>> = vec![vec![String::new(); cols]; rows];
    for r in 0..rows {
        for c in 0..cols {
            let idx = r * cols + c;
            let v = arr.data.get(idx).cloned().unwrap_or(Value::Null);
            grid[r][c] = render_value_to_text(&v, strict);
        }
    }
    Value::Text(format_grid(&grid, strict))
}

fn fn_isformula(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    match &args[0] {
        Expr::CellRef(addr, _) => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            Value::Boolean(provider.cell_has_formula(*addr))
        }
        Expr::Range { start, end, .. } => {
            let r = CellRange::new(*start, *end).normalize();
            Value::Boolean(provider.cell_has_formula(r.start))
        }
        Expr::SheetRef { sheet, addr, .. } => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            if provider.sheet_index_of(sheet).is_none() {
                return Value::Error(ValueError::InvalidRef);
            }
            Value::Boolean(provider.sheet_cell_has_formula(sheet, *addr))
        }
        Expr::SheetRange {
            sheet, start, end, ..
        } => {
            if provider.sheet_index_of(sheet).is_none() {
                return Value::Error(ValueError::InvalidRef);
            }
            let r = CellRange::new(*start, *end).normalize();
            Value::Boolean(provider.sheet_cell_has_formula(sheet, r.start))
        }
        _ => Value::Error(ValueError::InvalidValue),
    }
}

fn fn_sheet(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() > 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    if args.is_empty() {
        match provider.current_sheet_index() {
            Some(idx) => Value::Number((idx + 1) as f64),
            None => Value::Error(ValueError::InvalidRef),
        }
    } else {
        match &args[0] {
            // Same-sheet ref → current sheet (Excel parity).
            Expr::CellRef(..) | Expr::Range { .. } => match provider.current_sheet_index() {
                Some(idx) => Value::Number((idx + 1) as f64),
                None => Value::Error(ValueError::InvalidRef),
            },
            Expr::SheetRef { sheet, .. } | Expr::SheetRange { sheet, .. } => {
                match provider.sheet_index_of(sheet) {
                    Some(idx) => Value::Number((idx + 1) as f64),
                    None => Value::Error(ValueError::InvalidRef),
                }
            }
            _ => Value::Error(ValueError::InvalidValue),
        }
    }
}

fn fn_sheets(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() > 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    if args.is_empty() {
        Value::Number(provider.sheet_count() as f64)
    } else {
        match &args[0] {
            Expr::CellRef(..)
            | Expr::Range { .. }
            | Expr::SheetRef { .. }
            | Expr::SheetRange { .. } => Value::Number(1.0),
            _ => Value::Error(ValueError::InvalidValue),
        }
    }
}

fn fn_info(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let key = coerce_to_text(&v).to_ascii_lowercase();
    match key.as_str() {
        "directory" => Value::Text(String::new()),
        "numfile" => Value::Number(1.0),
        "osversion" => Value::Text(String::new()),
        "recalc" => Value::Text("Automatic".into()),
        "release" => Value::Text(format!("einfach-{}", env!("CARGO_PKG_VERSION"))),
        "system" => {
            let os = if cfg!(target_os = "macos") {
                "mac"
            } else if cfg!(target_os = "windows") {
                "pc"
            } else {
                "other"
            };
            Value::Text(os.into())
        }
        _ => Value::Error(ValueError::InvalidValue),
    }
}

fn parse_complex(text: &str) -> Result<(f64, f64, char), ValueError> {
    let s = text.trim();
    if s.is_empty() {
        return Err(ValueError::InvalidValue);
    }
    // Detect and strip suffix.
    let (body, suffix, has_suffix) = match s.chars().last() {
        Some(c) if c == 'i' || c == 'j' => (&s[..s.len() - 1], c, true),
        _ => (s, 'i', false),
    };
    if !has_suffix {
        // Pure real number — must parse cleanly.
        let n: f64 = body.parse().map_err(|_| ValueError::InvalidValue)?;
        return Ok((n, 0.0, 'i'));
    }
    // body now holds the part preceding the suffix. Find a split sign
    // (`+` or `-`) that separates real and imaginary parts, skipping
    // any sign that is part of a scientific-notation exponent (i.e.
    // immediately preceded by `e` or `E`) and any leading sign at
    // position 0 (which is the real part's sign, not a separator).
    let bytes = body.as_bytes();
    let mut split: Option<usize> = None;
    for (i, &b) in bytes.iter().enumerate() {
        if i == 0 {
            continue;
        }
        if b != b'+' && b != b'-' {
            continue;
        }
        let prev = bytes[i - 1];
        if prev == b'e' || prev == b'E' {
            continue;
        }
        split = Some(i);
        // Don't break — we want the LAST eligible split so that any
        // earlier sign that is part of the real part's own scientific
        // exponent is correctly skipped past. Example: `"1e+3+4i"`
        // — the loop visits the `+` at index 2 (skipped, follows `e`)
        // then the `+` at index 4 (kept).
    }
    match split {
        Some(idx) => {
            let real_str = &body[..idx];
            let imag_str = &body[idx..];
            if real_str.is_empty() {
                return Err(ValueError::InvalidValue);
            }
            let real: f64 = real_str.parse().map_err(|_| ValueError::InvalidValue)?;
            // imag_str starts with `+` or `-` and may be just that sign
            // (meaning ±1) or `±<coef>`.
            let imag = if imag_str == "+" || imag_str == "" {
                1.0
            } else if imag_str == "-" {
                -1.0
            } else {
                imag_str.parse().map_err(|_| ValueError::InvalidValue)?
            };
            Ok((real, imag, suffix))
        }
        None => {
            // No split — body is the imaginary coefficient (may be
            // empty for bare `"i"`, or just `"+"` / `"-"` for `"+i"`
            // / `"-i"`).
            let imag = if body.is_empty() || body == "+" {
                1.0
            } else if body == "-" {
                -1.0
            } else {
                body.parse().map_err(|_| ValueError::InvalidValue)?
            };
            Ok((0.0, imag, suffix))
        }
    }
}

fn format_complex(real: f64, imag: f64, suffix: char) -> String {
    if imag == 0.0 {
        return format_finite_for_complex(real);
    }
    if real == 0.0 {
        // Pure imaginary: drop coefficient when ±1.
        if imag == 1.0 {
            return format!("{}", suffix);
        }
        if imag == -1.0 {
            return format!("-{}", suffix);
        }
        return format!("{}{}", format_finite_for_complex(imag), suffix);
    }
    // Both parts non-zero. Sign of `imag` lives in the connector.
    if imag > 0.0 {
        let imag_part = if imag == 1.0 {
            String::new()
        } else {
            format_finite_for_complex(imag)
        };
        format!(
            "{}+{}{}",
            format_finite_for_complex(real),
            imag_part,
            suffix
        )
    } else {
        // imag < 0 — emit `-` connector and the absolute value coef.
        let abs_imag = -imag;
        let imag_part = if abs_imag == 1.0 {
            String::new()
        } else {
            format_finite_for_complex(abs_imag)
        };
        format!(
            "{}-{}{}",
            format_finite_for_complex(real),
            imag_part,
            suffix
        )
    }
}

fn format_finite_for_complex(n: f64) -> String {
    if n == n.trunc() && n.abs() < 1e16 {
        // Integral value — print as an integer to match Excel's
        // `COMPLEX(3, 4) == "3+4i"` (not "3.0+4.0i").
        format!("{}", n as i64)
    } else {
        // {:e?} would force scientific notation; we want the shortest
        // representation that round-trips. Rust's default Display for
        // f64 already trims trailing zeros and uses scientific notation
        // only for very large/small magnitudes — close enough to {:g}
        // for our parity needs.
        format!("{}", n)
    }
}

fn coerce_to_complex(v: &Value) -> Result<(f64, f64, char), ValueError> {
    match v {
        Value::Error(e) => Err(e.clone()),
        Value::Text(s) => parse_complex(s),
        Value::Number(n) => Ok((*n, 0.0, 'i')),
        Value::Boolean(true) => Ok((1.0, 0.0, 'i')),
        Value::Boolean(false) => Ok((0.0, 0.0, 'i')),
        Value::Null => Ok((0.0, 0.0, 'i')),
        // Arrays/Lambdas have no scalar complex interpretation.
        _ => Err(ValueError::WrongType),
    }
}

fn eval_complex_arg(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<(f64, f64, char), ValueError> {
    let v = eval_expr_with_provider(arg, provider);
    coerce_to_complex(&v)
}

fn complex_unary_text(
    args: &[Expr],
    provider: &dyn EvalProvider,
    f: impl Fn(f64, f64, char) -> (f64, f64, char),
) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (a, b, s) = match eval_complex_arg(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    let (r, i, sfx) = f(a, b, s);
    if !r.is_finite() || !i.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    Value::Text(format_complex(r, i, sfx))
}

fn complex_unary_number(
    args: &[Expr],
    provider: &dyn EvalProvider,
    f: impl Fn(f64, f64) -> f64,
) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (a, b, _s) = match eval_complex_arg(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    let r = f(a, b);
    if !r.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(r)
}

fn complex_mul(a: f64, b: f64, c: f64, d: f64) -> (f64, f64) {
    (a * c - b * d, a * d + b * c)
}

fn complex_div(a: f64, b: f64, c: f64, d: f64) -> Option<(f64, f64)> {
    let denom = c * c + d * d;
    if denom == 0.0 {
        return None;
    }
    Some(((a * c + b * d) / denom, (b * c - a * d) / denom))
}

/// `ASC` — narrow full-width characters to half-width.
///
/// Mapping rules, in priority order:
///   1. Full-width ASCII (U+FF01..U+FF5E) → ASCII (U+0021..U+007E) via
///      `c - 0xFEE0`.
///   2. Full-width (ideographic) space U+3000 → ASCII space U+0020.
///   3. Full-width katakana → half-width katakana (table lookup).
///      Voiced (e.g. ガ U+30AC) decomposes to `ｶﾞ` (base + U+FF9E),
///      semi-voiced (e.g. パ U+30D1) decomposes to `ﾊﾟ` (base + U+FF9F).
///   4. Full-width yen sign U+FFE5 → U+005C (REVERSE SOLIDUS, i.e.
///      backslash). This is the Excel JIS quirk: Excel's ASC follows the
///      JIS / Shift-JIS code page where 0x5C round-trips as the yen
///      glyph, so widening the yen back to half-width yields a backslash
///      rather than U+00A5. Documented in the Excel function reference
///      and matched by every other engine we cross-checked.
///   5. Everything else passes through unchanged.
fn asc_convert(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        let code = c as u32;
        // 1. Full-width ASCII.
        if (0xFF01..=0xFF5E).contains(&code) {
            out.push(char::from_u32(code - 0xFEE0).unwrap_or(c));
            continue;
        }
        // 2. Ideographic space.
        if code == 0x3000 {
            out.push(' ');
            continue;
        }
        // 4. Excel's yen-sign quirk: U+FFE5 narrows to backslash.
        if code == 0xFFE5 {
            out.push('\\');
            continue;
        }
        // 3. Full-width katakana — table lookup, with voicing
        // decomposition for dakuten / handakuten pairs.
        if let Some((base, mark)) = fullwidth_kana_to_halfwidth(c) {
            out.push(base);
            if let Some(m) = mark {
                out.push(m);
            }
            continue;
        }
        // 5. Pass-through.
        out.push(c);
    }
    out
}

/// `JIS` / `DBCS` — widen half-width characters to full-width.
///
/// Mirror image of `asc_convert`:
///   1. ASCII (U+0021..U+007E) → full-width (U+FF01..U+FF5E) via `c + 0xFEE0`.
///   2. ASCII space U+0020 → ideographic space U+3000.
///   3. Half-width katakana U+FF61..U+FF9F → full-width katakana, composing
///      base + ﾞ (U+FF9E) into voiced kana and base + ﾟ (U+FF9F) into
///      semi-voiced kana when a valid pair appears.
///   4. Everything else passes through (notably backslash U+005C — see
///      the asymmetry note on `asc_convert`'s yen-sign quirk; we do NOT
///      widen U+005C back to U+FFE5 because the cycle would not be
///      stable for arbitrary text).
fn jis_convert(s: &str) -> String {
    // Collect chars into a vec so we can look ahead by one for voicing
    // composition (we may need to consume two source chars to emit one).
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let code = c as u32;
        // 1. ASCII printable → full-width.
        if (0x21..=0x7E).contains(&code) {
            out.push(char::from_u32(code + 0xFEE0).unwrap_or(c));
            i += 1;
            continue;
        }
        // 2. ASCII space → ideographic space.
        if code == 0x20 {
            out.push('\u{3000}');
            i += 1;
            continue;
        }
        // 3. Half-width katakana, with optional voicing/semi-voicing
        // composition using the next char.
        if (0xFF61..=0xFF9F).contains(&code) {
            let next = chars.get(i + 1).copied();
            let (wide, consumed) = halfwidth_kana_to_fullwidth(c, next);
            out.push(wide);
            i += consumed;
            continue;
        }
        // 4. Pass-through.
        out.push(c);
        i += 1;
    }
    out
}

/// Decompose a single full-width katakana / punctuation char back into
/// its half-width form. Returns `Some((base, mark))` where `mark` is
/// `Some(ﾞ)` / `Some(ﾟ)` for voiced / semi-voiced characters, or `None`
/// for plain bases. Returns `None` when `c` is not a full-width kana.
///
/// The table below covers all 63 half-width katakana code points
/// (U+FF61..U+FF9F) plus the voiced (20) and semi-voiced (5) full-width
/// glyphs that need to decompose to `base + mark`. Special case: ヴ
/// (U+30F4) decomposes to `ｳﾞ` per Excel JIS round-tripping.
fn fullwidth_kana_to_halfwidth(c: char) -> Option<(char, Option<char>)> {
    // Voiced full-width → half-width base + ﾞ.
    let voiced = match c {
        'ガ' => Some('\u{FF76}'), // カ→ｶ
        'ギ' => Some('\u{FF77}'),
        'グ' => Some('\u{FF78}'),
        'ゲ' => Some('\u{FF79}'),
        'ゴ' => Some('\u{FF7A}'),
        'ザ' => Some('\u{FF7B}'),
        'ジ' => Some('\u{FF7C}'),
        'ズ' => Some('\u{FF7D}'),
        'ゼ' => Some('\u{FF7E}'),
        'ゾ' => Some('\u{FF7F}'),
        'ダ' => Some('\u{FF80}'),
        'ヂ' => Some('\u{FF81}'),
        'ヅ' => Some('\u{FF82}'),
        'デ' => Some('\u{FF83}'),
        'ド' => Some('\u{FF84}'),
        'バ' => Some('\u{FF8A}'),
        'ビ' => Some('\u{FF8B}'),
        'ブ' => Some('\u{FF8C}'),
        'ベ' => Some('\u{FF8D}'),
        'ボ' => Some('\u{FF8E}'),
        'ヴ' => Some('\u{FF73}'), // ウ→ｳ + ﾞ
        _ => None,
    };
    if let Some(base) = voiced {
        return Some((base, Some('\u{FF9E}')));
    }
    // Semi-voiced full-width → half-width base + ﾟ.
    let semi_voiced = match c {
        'パ' => Some('\u{FF8A}'),
        'ピ' => Some('\u{FF8B}'),
        'プ' => Some('\u{FF8C}'),
        'ペ' => Some('\u{FF8D}'),
        'ポ' => Some('\u{FF8E}'),
        _ => None,
    };
    if let Some(base) = semi_voiced {
        return Some((base, Some('\u{FF9F}')));
    }
    // Plain full-width kana / punctuation → half-width.
    let base = match c {
        '。' => '\u{FF61}',
        '「' => '\u{FF62}',
        '」' => '\u{FF63}',
        '、' => '\u{FF64}',
        '・' => '\u{FF65}',
        'ヲ' => '\u{FF66}',
        'ァ' => '\u{FF67}',
        'ィ' => '\u{FF68}',
        'ゥ' => '\u{FF69}',
        'ェ' => '\u{FF6A}',
        'ォ' => '\u{FF6B}',
        'ャ' => '\u{FF6C}',
        'ュ' => '\u{FF6D}',
        'ョ' => '\u{FF6E}',
        'ッ' => '\u{FF6F}',
        'ー' => '\u{FF70}',
        'ア' => '\u{FF71}',
        'イ' => '\u{FF72}',
        'ウ' => '\u{FF73}',
        'エ' => '\u{FF74}',
        'オ' => '\u{FF75}',
        'カ' => '\u{FF76}',
        'キ' => '\u{FF77}',
        'ク' => '\u{FF78}',
        'ケ' => '\u{FF79}',
        'コ' => '\u{FF7A}',
        'サ' => '\u{FF7B}',
        'シ' => '\u{FF7C}',
        'ス' => '\u{FF7D}',
        'セ' => '\u{FF7E}',
        'ソ' => '\u{FF7F}',
        'タ' => '\u{FF80}',
        'チ' => '\u{FF81}',
        'ツ' => '\u{FF82}',
        'テ' => '\u{FF83}',
        'ト' => '\u{FF84}',
        'ナ' => '\u{FF85}',
        'ニ' => '\u{FF86}',
        'ヌ' => '\u{FF87}',
        'ネ' => '\u{FF88}',
        'ノ' => '\u{FF89}',
        'ハ' => '\u{FF8A}',
        'ヒ' => '\u{FF8B}',
        'フ' => '\u{FF8C}',
        'ヘ' => '\u{FF8D}',
        'ホ' => '\u{FF8E}',
        'マ' => '\u{FF8F}',
        'ミ' => '\u{FF90}',
        'ム' => '\u{FF91}',
        'メ' => '\u{FF92}',
        'モ' => '\u{FF93}',
        'ヤ' => '\u{FF94}',
        'ユ' => '\u{FF95}',
        'ヨ' => '\u{FF96}',
        'ラ' => '\u{FF97}',
        'リ' => '\u{FF98}',
        'ル' => '\u{FF99}',
        'レ' => '\u{FF9A}',
        'ロ' => '\u{FF9B}',
        'ワ' => '\u{FF9C}',
        'ン' => '\u{FF9D}',
        '゛' => '\u{FF9E}',
        '゜' => '\u{FF9F}',
        _ => return None,
    };
    Some((base, None))
}

/// Widen a single half-width katakana / punctuation char to full-width,
/// optionally composing with the following ﾞ (U+FF9E) or ﾟ (U+FF9F)
/// into a voiced / semi-voiced kana. Returns `(full_width, consumed)`
/// where `consumed` is 2 when the mark was absorbed, else 1.
///
/// Pre-condition: caller has verified `c` is in U+FF61..U+FF9F.
fn halfwidth_kana_to_fullwidth(c: char, next: Option<char>) -> (char, usize) {
    // Voicing composition: base + ﾞ → voiced kana.
    if next == Some('\u{FF9E}') {
        let voiced = match c {
            '\u{FF73}' => Some('ヴ'), // ウ + ﾞ → ヴ
            '\u{FF76}' => Some('ガ'),
            '\u{FF77}' => Some('ギ'),
            '\u{FF78}' => Some('グ'),
            '\u{FF79}' => Some('ゲ'),
            '\u{FF7A}' => Some('ゴ'),
            '\u{FF7B}' => Some('ザ'),
            '\u{FF7C}' => Some('ジ'),
            '\u{FF7D}' => Some('ズ'),
            '\u{FF7E}' => Some('ゼ'),
            '\u{FF7F}' => Some('ゾ'),
            '\u{FF80}' => Some('ダ'),
            '\u{FF81}' => Some('ヂ'),
            '\u{FF82}' => Some('ヅ'),
            '\u{FF83}' => Some('デ'),
            '\u{FF84}' => Some('ド'),
            '\u{FF8A}' => Some('バ'),
            '\u{FF8B}' => Some('ビ'),
            '\u{FF8C}' => Some('ブ'),
            '\u{FF8D}' => Some('ベ'),
            '\u{FF8E}' => Some('ボ'),
            _ => None,
        };
        if let Some(v) = voiced {
            return (v, 2);
        }
    }
    // Semi-voicing composition: base + ﾟ → semi-voiced kana.
    if next == Some('\u{FF9F}') {
        let semi = match c {
            '\u{FF8A}' => Some('パ'),
            '\u{FF8B}' => Some('ピ'),
            '\u{FF8C}' => Some('プ'),
            '\u{FF8D}' => Some('ペ'),
            '\u{FF8E}' => Some('ポ'),
            _ => None,
        };
        if let Some(v) = semi {
            return (v, 2);
        }
    }
    // Plain widening (no composition).
    let full = match c {
        '\u{FF61}' => '。',
        '\u{FF62}' => '「',
        '\u{FF63}' => '」',
        '\u{FF64}' => '、',
        '\u{FF65}' => '・',
        '\u{FF66}' => 'ヲ',
        '\u{FF67}' => 'ァ',
        '\u{FF68}' => 'ィ',
        '\u{FF69}' => 'ゥ',
        '\u{FF6A}' => 'ェ',
        '\u{FF6B}' => 'ォ',
        '\u{FF6C}' => 'ャ',
        '\u{FF6D}' => 'ュ',
        '\u{FF6E}' => 'ョ',
        '\u{FF6F}' => 'ッ',
        '\u{FF70}' => 'ー',
        '\u{FF71}' => 'ア',
        '\u{FF72}' => 'イ',
        '\u{FF73}' => 'ウ',
        '\u{FF74}' => 'エ',
        '\u{FF75}' => 'オ',
        '\u{FF76}' => 'カ',
        '\u{FF77}' => 'キ',
        '\u{FF78}' => 'ク',
        '\u{FF79}' => 'ケ',
        '\u{FF7A}' => 'コ',
        '\u{FF7B}' => 'サ',
        '\u{FF7C}' => 'シ',
        '\u{FF7D}' => 'ス',
        '\u{FF7E}' => 'セ',
        '\u{FF7F}' => 'ソ',
        '\u{FF80}' => 'タ',
        '\u{FF81}' => 'チ',
        '\u{FF82}' => 'ツ',
        '\u{FF83}' => 'テ',
        '\u{FF84}' => 'ト',
        '\u{FF85}' => 'ナ',
        '\u{FF86}' => 'ニ',
        '\u{FF87}' => 'ヌ',
        '\u{FF88}' => 'ネ',
        '\u{FF89}' => 'ノ',
        '\u{FF8A}' => 'ハ',
        '\u{FF8B}' => 'ヒ',
        '\u{FF8C}' => 'フ',
        '\u{FF8D}' => 'ヘ',
        '\u{FF8E}' => 'ホ',
        '\u{FF8F}' => 'マ',
        '\u{FF90}' => 'ミ',
        '\u{FF91}' => 'ム',
        '\u{FF92}' => 'メ',
        '\u{FF93}' => 'モ',
        '\u{FF94}' => 'ヤ',
        '\u{FF95}' => 'ユ',
        '\u{FF96}' => 'ヨ',
        '\u{FF97}' => 'ラ',
        '\u{FF98}' => 'リ',
        '\u{FF99}' => 'ル',
        '\u{FF9A}' => 'レ',
        '\u{FF9B}' => 'ロ',
        '\u{FF9C}' => 'ワ',
        '\u{FF9D}' => 'ン',
        '\u{FF9E}' => '゛',
        '\u{FF9F}' => '゜',
        // Caller guarantees U+FF61..U+FF9F; anything else falls through
        // unchanged (defence in depth — shouldn't happen).
        _ => c,
    };
    (full, 1)
}

/// Build the structured-text payload returned by `IMAGE(...)`. The host UI
/// detects images by the `<IMAGE: ` prefix and parses out the source / alt
/// text / sizing / dimensions. Format mirrors what the match arm comments
/// in the `IMAGE` dispatch describe. Embedded `"` characters in `alt` are
/// escaped (`\"`) so a downstream parser can recover the original text.
fn format_image_payload(
    source: &str,
    alt: Option<&str>,
    sizing: u8,
    height: Option<f64>,
    width: Option<f64>,
) -> String {
    let mut out = String::with_capacity(16 + source.len());
    out.push_str("<IMAGE: ");
    out.push_str(source);
    if let Some(a) = alt {
        out.push_str(" alt=\"");
        for ch in a.chars() {
            match ch {
                '\\' => out.push_str("\\\\"),
                '"' => out.push_str("\\\""),
                _ => out.push(ch),
            }
        }
        out.push('"');
    }
    if sizing != 0 {
        out.push_str(" sizing=");
        out.push_str(&sizing.to_string());
    }
    if let (Some(h), Some(w)) = (height, width) {
        // Trim trailing-zero noise the same way `coerce_to_text` does for
        // integer-valued doubles, so `120` round-trips as `120` not `120.0`.
        out.push_str(" height=");
        out.push_str(&format_image_number(h));
        out.push_str(" width=");
        out.push_str(&format_image_number(w));
    }
    out.push('>');
    out
}

fn format_image_number(n: f64) -> String {
    if n == n.floor() && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        format!("{}", n)
    }
}

// === Bessel + CONVERT helpers ===
//
// Bessel functions are implemented from scratch — statrs 0.16 ships
// gamma/beta/erf but not Bessel, and libm has no Bessel either. The
// approximations below combine Abramowitz & Stegun rational forms for
// the low-order kernels (J0/J1, Y0/Y1, I0/I1, K0/K1) with the
// standard three-term recurrence to reach arbitrary integer order n.
//
// Recurrence stability — important:
//   J_{n+1}(x) =  (2n/x) J_n(x) - J_{n-1}(x)   — forward is unstable
//                 for n > x; use Miller's downward recurrence instead.
//   Y_{n+1}(x) =  (2n/x) Y_n(x) - Y_{n-1}(x)   — forward is stable
//                 (|Y_n| grows in n).
//   I_{n+1}(x) = -(2n/x) I_n(x) + I_{n-1}(x)   — forward is unstable
//                 for n > x; Miller-downward keeps it tame.
//   K_{n+1}(x) =  (2n/x) K_n(x) + K_{n-1}(x)   — forward is stable
//                 (|K_n| grows in n).
//
// Tolerance budget: we aim for ~1e-6 absolute / relative on Excel-typical
// arguments (|x| ≤ 50, n ≤ 20). That matches `TOL = 1e-6` used by the
// statrs-based stat tests elsewhere in this file.

/// Shared entry-point for the four BESSEL* arms. Validates arg count,
/// reads `x` and truncates `n` to integer (Excel's behaviour: `n` is
/// "truncated to integer if it's not an integer"). Negative `n`, NaN
/// args, or a kernel that returns a non-finite value all collapse to
/// `#NUM!`.
fn eval_bessel(
    args: &[Expr],
    provider: &dyn EvalProvider,
    kernel: fn(f64, i64) -> Option<f64>,
) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let n_raw = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !x.is_finite() || !n_raw.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    let n = n_raw.trunc() as i64;
    if n < 0 {
        return Value::Error(ValueError::Overflow);
    }
    match kernel(x, n) {
        Some(r) if r.is_finite() => Value::Number(r),
        _ => Value::Error(ValueError::Overflow),
    }
}

/// BESSELJ — Bessel function of the first kind, integer order n ≥ 0.
///
/// For small |x| or n ≤ |x|, forward recurrence from J0/J1 (kernels
/// below) is fine. For n > |x| forward recurrence loses precision, so
/// we use Miller's downward recurrence: start from a high index with
/// J_M = 1, J_{M+1} = 0, recur downward, then renormalise using the
/// identity J_0(x) + 2*Σ_{k≥1} J_{2k}(x) = 1 ... but a cheaper option
/// is to renormalise against the exact J_0(x) we already compute. We
/// pick the latter.
fn bessel_j_n(x: f64, n: i64) -> Option<f64> {
    let ax = x.abs();
    if n == 0 {
        return Some(bessel_j0(x));
    }
    if n == 1 {
        return Some(bessel_j1(x));
    }
    if ax == 0.0 {
        // J_n(0) = 0 for n >= 1.
        return Some(0.0);
    }
    // Sign convention: J_n(-x) = (-1)^n J_n(x). Compute with |x|, fix sign.
    let sign_flip = if x < 0.0 && n % 2 != 0 { -1.0 } else { 1.0 };

    let n_us = n as usize;
    // Forward recurrence is stable when n <= ax. Else Miller downward.
    if (n as f64) <= ax {
        let mut jm1 = bessel_j0(ax);
        let mut j = bessel_j1(ax);
        let mut k = 1i64;
        while k < n {
            let jp1 = (2.0 * (k as f64) / ax) * j - jm1;
            jm1 = j;
            j = jp1;
            k += 1;
        }
        return Some(sign_flip * j);
    }
    // Miller downward recurrence. Start index needs to be well above
    // n; the classic choice is n + sqrt(40*n). The recurrence we walk
    // is J_{k-1}(x) = (2k/x) J_k(x) - J_{k+1}(x), with the scratch
    // initial values J_{M+1} = 0, J_M = 1 (unnormalised). After the
    // loop, `j_high` holds the unnormalised J_0(x); we rescale every
    // unnormalised quantity by J_0_true / j_high to recover the true
    // values, including the J_n captured along the way.
    let m_start = (n_us + ((40.0 * n_us as f64).sqrt() as usize)).max(2 * n_us + 8);
    let mut j_higher: f64 = 0.0; // unnormalised J_{k+1}
    let mut j_high: f64 = 1.0; // unnormalised J_k (starts at k = m_start)
    let mut value_at_n: f64 = 0.0;
    // Iterate k = m_start, m_start - 1, ..., 1 and compute J_{k-1}.
    for k in (1..=m_start).rev() {
        let j_lower = (2.0 * (k as f64) / ax) * j_high - j_higher;
        j_higher = j_high;
        j_high = j_lower;
        // After the shift, j_high == J_{k-1}.
        if (k as i64) - 1 == n {
            value_at_n = j_high;
        }
        // Rescale to keep magnitudes manageable.
        if j_high.abs() > 1e10 {
            j_high *= 1e-10;
            j_higher *= 1e-10;
            value_at_n *= 1e-10;
        }
    }
    // After the loop, j_high ≈ unnormalised J_0(x). Renormalise.
    let j0_true = bessel_j0(ax);
    if j_high == 0.0 {
        return Some(0.0);
    }
    Some(sign_flip * value_at_n * (j0_true / j_high))
}

/// BESSELY — Bessel function of the second kind, integer order n ≥ 0.
/// Singular at x = 0 for all n, and undefined for x < 0 (Excel
/// returns `#NUM!`).
fn bessel_y_n(x: f64, n: i64) -> Option<f64> {
    if x <= 0.0 {
        return None; // singular / undefined
    }
    if n == 0 {
        return Some(bessel_y0(x));
    }
    if n == 1 {
        return Some(bessel_y1(x));
    }
    // Forward recurrence is stable for Y_n.
    let mut ym1 = bessel_y0(x);
    let mut y = bessel_y1(x);
    let mut k = 1i64;
    while k < n {
        let yp1 = (2.0 * (k as f64) / x) * y - ym1;
        ym1 = y;
        y = yp1;
        k += 1;
    }
    Some(y)
}

/// BESSELI — Modified Bessel function of the first kind, integer
/// order n ≥ 0.
fn bessel_i_n(x: f64, n: i64) -> Option<f64> {
    let ax = x.abs();
    if n == 0 {
        return Some(bessel_i0(ax));
    }
    if n == 1 {
        // Sign convention: I_n(-x) = (-1)^n I_n(x). For n=1, odd → flip.
        let s = if x < 0.0 { -1.0 } else { 1.0 };
        return Some(s * bessel_i1(ax));
    }
    if ax == 0.0 {
        return Some(0.0);
    }
    let sign_flip = if x < 0.0 && n % 2 != 0 { -1.0 } else { 1.0 };
    let n_us = n as usize;

    // Miller-downward for stability. Recurrence:
    //   I_{k-1}(x) = (2k/x) I_k(x) + I_{k+1}(x)
    // (NOTE: plus, not minus, because I is the *modified* Bessel.)
    // Start from a high index M with I_M = 1, I_{M+1} = 0, recur down,
    // then renormalise via the true I_0(x).
    let m_start = (n_us + ((40.0 * n_us as f64).sqrt() as usize)).max(2 * n_us + 8);
    let mut i_higher: f64 = 0.0; // unnormalised I_{k+1}
    let mut i_high: f64 = 1.0; // unnormalised I_k (starts at k = m_start)
    let mut value_at_n: f64 = 0.0;
    for k in (1..=m_start).rev() {
        let i_lower = (2.0 * (k as f64) / ax) * i_high + i_higher;
        i_higher = i_high;
        i_high = i_lower;
        // After the shift, i_high == I_{k-1}.
        if (k as i64) - 1 == n {
            value_at_n = i_high;
        }
        if i_high.abs() > 1e10 {
            i_high *= 1e-10;
            i_higher *= 1e-10;
            value_at_n *= 1e-10;
        }
    }
    let i0_true = bessel_i0(ax);
    if i_high == 0.0 {
        return Some(0.0);
    }
    Some(sign_flip * value_at_n * (i0_true / i_high))
}

/// BESSELK — Modified Bessel function of the second kind, integer
/// order n ≥ 0. Singular at x = 0 and undefined for x < 0.
fn bessel_k_n(x: f64, n: i64) -> Option<f64> {
    if x <= 0.0 {
        return None;
    }
    if n == 0 {
        return Some(bessel_k0(x));
    }
    if n == 1 {
        return Some(bessel_k1(x));
    }
    // Forward recurrence is stable for K_n (K_n grows in n).
    let mut km1 = bessel_k0(x);
    let mut k = bessel_k1(x);
    let mut j = 1i64;
    while j < n {
        let kp1 = (2.0 * (j as f64) / x) * k + km1;
        km1 = k;
        k = kp1;
        j += 1;
    }
    Some(k)
}

/// J_0(x). Rational approximation from Abramowitz & Stegun 9.4.1 / 9.4.3.
/// Accurate to ~1e-7 over the reals.
fn bessel_j0(x: f64) -> f64 {
    let ax = x.abs();
    if ax < 8.0 {
        let y = x * x;
        let p = 57568490574.0
            + y * (-13362590354.0
                + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))));
        let q = 57568490411.0
            + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
        p / q
    } else {
        let z = 8.0 / ax;
        let y = z * z;
        let p1 = 1.0
            + y * (-0.1098628627e-2
                + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
        let q1 = -0.1562499995e-1
            + y * (0.1430488765e-3
                + y * (-0.6911147651e-5 + y * (0.7621095161e-6 + y * -0.934935152e-7)));
        let xx = ax - std::f64::consts::FRAC_PI_4;
        (2.0 / (std::f64::consts::PI * ax)).sqrt() * (xx.cos() * p1 - z * xx.sin() * q1)
    }
}

/// J_1(x). A&S 9.4.4 / 9.4.6.
fn bessel_j1(x: f64) -> f64 {
    let ax = x.abs();
    let result = if ax < 8.0 {
        let y = x * x;
        let p = x
            * (72362614232.0
                + y * (-7895059235.0
                    + y * (242396853.1
                        + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))));
        let q = 144725228442.0
            + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
        p / q
    } else {
        let z = 8.0 / ax;
        let y = z * z;
        let p1 = 1.0
            + y * (0.183105e-2
                + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
        let q1 = 0.04687499995
            + y * (-0.2002690873e-3
                + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
        let xx = ax - 3.0 * std::f64::consts::FRAC_PI_4;
        let s = (2.0 / (std::f64::consts::PI * ax)).sqrt() * (xx.cos() * p1 - z * xx.sin() * q1);
        if x < 0.0 {
            -s
        } else {
            s
        }
    };
    result
}

/// Y_0(x). A&S 9.4.2 / 9.4.3. Caller must pass x > 0.
fn bessel_y0(x: f64) -> f64 {
    if x < 8.0 {
        let y = x * x;
        let p = -2957821389.0
            + y * (7062834065.0
                + y * (-512359803.6 + y * (10879881.29 + y * (-86327.92757 + y * 228.4622733))));
        let q = 40076544269.0
            + y * (745249964.8 + y * (7189466.438 + y * (47447.26470 + y * (226.1030244 + y))));
        p / q + 0.636619772 * bessel_j0(x) * x.ln()
    } else {
        let z = 8.0 / x;
        let y = z * z;
        let p1 = 1.0
            + y * (-0.1098628627e-2
                + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
        let q1 = -0.1562499995e-1
            + y * (0.1430488765e-3
                + y * (-0.6911147651e-5 + y * (0.7621095161e-6 + y * -0.934935152e-7)));
        let xx = x - std::f64::consts::FRAC_PI_4;
        (2.0 / (std::f64::consts::PI * x)).sqrt() * (xx.sin() * p1 + z * xx.cos() * q1)
    }
}

/// Y_1(x). A&S 9.4.5 / 9.4.6. Caller must pass x > 0.
fn bessel_y1(x: f64) -> f64 {
    if x < 8.0 {
        let y = x * x;
        let p = x
            * (-4.900604943e13
                + y * (1.275274390e13
                    + y * (-5.153438139e11
                        + y * (7.349264551e9 + y * (-4.237922726e7 + y * 8.511937935e4)))));
        let q = 2.499580570e14
            + y * (4.244419664e12
                + y * (3.733650367e10
                    + y * (2.245904002e8 + y * (1.020426050e6 + y * (3.549632885e3 + y)))));
        p / q + 0.636619772 * (bessel_j1(x) * x.ln() - 1.0 / x)
    } else {
        let z = 8.0 / x;
        let y = z * z;
        let p1 = 1.0
            + y * (0.183105e-2
                + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
        let q1 = 0.04687499995
            + y * (-0.2002690873e-3
                + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
        let xx = x - 3.0 * std::f64::consts::FRAC_PI_4;
        (2.0 / (std::f64::consts::PI * x)).sqrt() * (xx.sin() * p1 + z * xx.cos() * q1)
    }
}

/// I_0(x). A&S 9.8.1 / 9.8.2.
fn bessel_i0(x: f64) -> f64 {
    let ax = x.abs();
    if ax < 3.75 {
        let y = (x / 3.75).powi(2);
        1.0 + y
            * (3.5156229
                + y * (3.0899424
                    + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813)))))
    } else {
        let y = 3.75 / ax;
        (ax.exp() / ax.sqrt())
            * (0.39894228
                + y * (0.01328592
                    + y * (0.00225319
                        + y * (-0.00157565
                            + y * (0.00916281
                                + y * (-0.02057706
                                    + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))))
    }
}

/// I_1(x). A&S 9.8.3 / 9.8.4.
fn bessel_i1(x: f64) -> f64 {
    let ax = x.abs();
    let result = if ax < 3.75 {
        let y = (x / 3.75).powi(2);
        ax * (0.5
            + y * (0.87890594
                + y * (0.51498869
                    + y * (0.15084934 + y * (0.02658733 + y * (0.00301532 + y * 0.00032411))))))
    } else {
        let y = 3.75 / ax;
        let p = 0.39894228
            + y * (-0.03988024
                + y * (-0.00362018
                    + y * (0.00163801
                        + y * (-0.01031555
                            + y * (0.02282967
                                + y * (-0.02895312 + y * (0.01787654 + y * -0.00420059)))))));
        (ax.exp() / ax.sqrt()) * p
    };
    if x < 0.0 {
        -result
    } else {
        result
    }
}

/// K_0(x). A&S 9.8.5 / 9.8.6. Caller must pass x > 0.
fn bessel_k0(x: f64) -> f64 {
    if x <= 2.0 {
        let y = x * x / 4.0;
        -((x / 2.0).ln() * bessel_i0(x))
            + (-0.57721566
                + y * (0.42278420
                    + y * (0.23069756
                        + y * (0.03488590 + y * (0.00262698 + y * (0.00010750 + y * 0.00000740))))))
    } else {
        let y = 2.0 / x;
        ((-x).exp() / x.sqrt())
            * (1.25331414
                + y * (-0.07832358
                    + y * (0.02189568
                        + y * (-0.01062446
                            + y * (0.00587872 + y * (-0.00251540 + y * 0.00053208))))))
    }
}

/// K_1(x). A&S 9.8.7 / 9.8.8. Caller must pass x > 0.
fn bessel_k1(x: f64) -> f64 {
    if x <= 2.0 {
        let y = x * x / 4.0;
        ((x / 2.0).ln() * bessel_i1(x))
            + (1.0 / x)
                * (1.0
                    + y * (0.15443144
                        + y * (-0.67278579
                            + y * (-0.18156897
                                + y * (-0.01919402 + y * (-0.00110404 + y * -0.00004686))))))
    } else {
        let y = 2.0 / x;
        ((-x).exp() / x.sqrt())
            * (1.25331414
                + y * (0.23498619
                    + y * (-0.03655620
                        + y * (0.01504268
                            + y * (-0.00780353 + y * (0.00325614 + y * -0.00068245))))))
    }
}

/// Unit categories used by CONVERT. Two units must share a category
/// (or both be temperature) to convert; otherwise CONVERT returns
/// `#N/A` (modelled as `InvalidValue` per the project's error map).
#[derive(Clone, Copy, PartialEq, Eq)]
enum ConvertCategory {
    Length,
    Mass,
    Time,
    Pressure,
    Energy,
    Power,
    Temperature,
}

/// Lookup a unit symbol used by CONVERT. Returns the (category,
/// factor) pair, where `factor` is "how many base units does one of
/// these equal" (base unit per category: meter, kilogram, second,
/// pascal, joule, watt). Temperature units are flagged via
/// `ConvertCategory::Temperature`; their conversions are affine, not
/// linear, so the factor field is meaningless and the special-cased
/// `convert_temperature` is used instead.
///
/// Future expansion: Excel's CONVERT supports hundreds of unit
/// symbols and a metric-prefix expansion grammar (k, M, G, m, u, n,
/// etc.) that can be stacked on any "metric-prefixable" base. We ship
/// a representative subset here and only the bare symbols. Metric
/// prefixing for arbitrary bases is not supported in this revision —
/// only the explicit table entries below.
fn convert_unit_factor(unit: &str) -> Option<(ConvertCategory, f64)> {
    // NOTE: Excel CONVERT is *case-sensitive* for most units (`g` is
    // gram, `G` is the giga prefix). We follow that — match exactly.
    use ConvertCategory::*;
    Some(match unit {
        // Length (base = meter)
        "m" => (Length, 1.0),
        "km" => (Length, 1_000.0),
        "cm" => (Length, 0.01),
        "mm" => (Length, 0.001),
        "in" => (Length, 0.0254),
        "ft" => (Length, 0.3048),
        "yd" => (Length, 0.9144),
        "mi" => (Length, 1609.344),
        "Nmi" | "nmi" => (Length, 1852.0),

        // Mass / Weight (base = kilogram)
        "kg" => (Mass, 1.0),
        "g" => (Mass, 0.001),
        "mg" => (Mass, 1e-6),
        "lbm" => (Mass, 0.45359237),
        "ozm" => (Mass, 0.028349523125),
        "ton" => (Mass, 907.18474), // US short ton

        // Time (base = second)
        "sec" | "s" => (Time, 1.0),
        "mn" | "min" => (Time, 60.0),
        "hr" => (Time, 3600.0),
        "day" | "d" => (Time, 86_400.0),
        "yr" => (Time, 31_557_600.0), // Excel's Julian year (365.25 days)

        // Pressure (base = pascal)
        "Pa" => (Pressure, 1.0),
        "atm" => (Pressure, 101_325.0),
        "mmHg" => (Pressure, 133.322387415),
        "psi" => (Pressure, 6_894.757293168),

        // Energy (base = joule)
        "J" => (Energy, 1.0),
        "cal" => (Energy, 4.184),
        "kWh" | "wh" => (Energy, 3_600_000.0),
        "BTU" | "btu" => (Energy, 1_055.05585262),
        "eV" | "ev" => (Energy, 1.602176634e-19),

        // Power (base = watt)
        "W" | "w" => (Power, 1.0),
        "HP" | "h" => (Power, 745.69987158227022),
        "PS" => (Power, 735.49875),

        // Temperature is special (affine, not linear). The factor here
        // is unused; the `convert_temperature` path handles the
        // arithmetic explicitly. We still need distinct entries so the
        // lookup succeeds.
        "C" | "cel" => (Temperature, 0.0),
        "F" | "fah" => (Temperature, 1.0),
        "K" | "kel" => (Temperature, 2.0),

        _ => return None,
    })
}

/// Affine temperature conversion. The "factor" field carried in the
/// table is overloaded as a tag (0=C, 1=F, 2=K) so we can dispatch
/// here without re-parsing the unit string.
fn convert_temperature(value: f64, from_tag: f64, to_tag: f64) -> f64 {
    // Go via Celsius as the pivot.
    let c = match from_tag as i32 {
        0 => value,                      // C
        1 => (value - 32.0) * 5.0 / 9.0, // F -> C
        2 => value - 273.15,             // K -> C
        _ => f64::NAN,
    };
    match to_tag as i32 {
        0 => c,                    // C
        1 => c * 9.0 / 5.0 + 32.0, // C -> F
        2 => c + 273.15,           // C -> K
        _ => f64::NAN,
    }
}

fn eval_convert(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let value = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !value.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    let from_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = from_v {
        return Value::Error(e);
    }
    let to_v = eval_expr_with_provider(&args[2], provider);
    if let Value::Error(e) = to_v {
        return Value::Error(e);
    }
    let from_unit = coerce_to_text(&from_v);
    let to_unit = coerce_to_text(&to_v);

    let (from_cat, from_factor) = match convert_unit_factor(&from_unit) {
        Some(t) => t,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let (to_cat, to_factor) = match convert_unit_factor(&to_unit) {
        Some(t) => t,
        None => return Value::Error(ValueError::InvalidValue),
    };
    if from_cat != to_cat {
        return Value::Error(ValueError::InvalidValue);
    }
    let result = if from_cat == ConvertCategory::Temperature {
        convert_temperature(value, from_factor, to_factor)
    } else {
        // Linear: value (in `from`) -> base unit -> target unit.
        value * from_factor / to_factor
    };
    stat_finite(result)
}

// ---------------------------------------------------------------------------
// R-batch helpers: odd-coupon bond pricing + coupon-date utilities + misc
// finance. Uses existing `date_from_serial`, `date_serial`, `days_in_month`,
// `prev_coupon_date`, `next_coupon_date`, `coup_num`, `coup_period_split`,
// `coup_period_days`, `yearfrac_basis`, `fin_basis`, `fin_coerce`, and
// `day_diff` from the rest of the eval module.
// ---------------------------------------------------------------------------

/// Walk forward from a quasi-coupon date by `k` whole coupon periods.
fn add_coupon_periods(quasi_date: f64, frequency: i64, k: i32) -> f64 {
    let months_per_period = (12 / frequency) as i32;
    let (qy, qm, qd) = date_from_serial(quasi_date);
    let total_months = qy * 12 + (qm as i32 - 1) + k * months_per_period;
    let ny = total_months.div_euclid(12);
    let nm = (total_months.rem_euclid(12) + 1) as u32;
    let dom = days_in_month(ny, nm);
    let nd = qd.min(dom);
    date_serial(ny, nm, nd)
}

/// Count quasi-coupon dates strictly after `start` and ≤ `end`.
fn nc_quasi_dates_between(start: f64, end: f64, frequency: i64) -> i32 {
    if end <= start {
        return 0;
    }
    let months_per_period = (12 / frequency) as i32;
    let (ey, em, ed) = date_from_serial(end);
    let mut k: i32 = 0;
    loop {
        let total_months = ey * 12 + (em as i32 - 1) - k * months_per_period;
        let ny = total_months.div_euclid(12);
        let nm = (total_months.rem_euclid(12) + 1) as u32;
        let dom = days_in_month(ny, nm);
        let nd = ed.min(dom);
        let serial = date_serial(ny, nm, nd);
        if serial <= start {
            return k;
        }
        k += 1;
        if k > 4_000 {
            return k;
        }
    }
}

/// ODDFPRICE — price per $100 face with an odd first coupon period.
/// Short odd (issue inside the prev-quasi → first_coupon period): first
/// coupon payment = coupon * DFC (period-fraction issue→first_coupon).
/// Long odd: walk back from first_coupon in whole quasi-periods to the
/// period containing issue; first coupon payment scales by the sum of
/// full intermediate periods plus the partial issue-period fraction.
/// Discounts the first coupon at exponent DSC (settlement→first_coupon
/// in periods), standard coupons at DSC + (k-1) for k ∈ 2..=N, and
/// redemption at DSC + (N-1).
fn oddfprice_from_yield(
    settlement: f64,
    maturity: f64,
    issue: f64,
    first_coupon: f64,
    rate: f64,
    yld: f64,
    redemption: f64,
    frequency: i64,
    basis: i64,
) -> Result<f64, ValueError> {
    let f = frequency as f64;
    let one_plus = 1.0 + yld / f;
    if one_plus <= 0.0 {
        return Err(ValueError::Overflow);
    }
    let coupon = 100.0 * rate / f;
    let n_regular = nc_quasi_dates_between(first_coupon, maturity, frequency);
    let n_total = n_regular + 1;
    let dsc = yearfrac_basis(settlement, first_coupon, basis)? * f;

    let prev_quasi = add_coupon_periods(first_coupon, frequency, -1);
    let (first_cpn, accrued) = if prev_quasi <= issue {
        // Short odd first period.
        let dfc = yearfrac_basis(issue, first_coupon, basis)? * f;
        let a = yearfrac_basis(issue, settlement, basis)? * f;
        (coupon * dfc, coupon * a)
    } else {
        // Long odd first period.
        let nq = nc_quasi_dates_between(issue, first_coupon, frequency).max(1);
        let mut quasi_dates: Vec<f64> = Vec::with_capacity((nq + 1) as usize);
        for i in 0..=nq {
            quasi_dates.push(add_coupon_periods(first_coupon, frequency, -i));
        }
        let q_issue_lo = quasi_dates[nq as usize];
        let q_issue_hi = quasi_dates[(nq - 1) as usize];
        let nl_issue = (q_issue_hi - q_issue_lo).max(1.0);
        let dci_frac = ((q_issue_hi - issue).max(0.0)) / nl_issue;
        let first_period_cpn_frac = dci_frac + (nq as f64 - 1.0);
        let accrued_periods = if settlement <= q_issue_hi {
            ((settlement - issue).max(0.0)) / nl_issue
        } else {
            let mut frac = dci_frac;
            let mut found = false;
            for i in 1..nq {
                let q_lo = quasi_dates[(nq - i) as usize];
                let q_hi = quasi_dates[(nq - i - 1) as usize];
                if settlement >= q_lo && settlement <= q_hi {
                    let nl = (q_hi - q_lo).max(1.0);
                    frac += ((settlement - q_lo).max(0.0)) / nl;
                    found = true;
                    break;
                } else {
                    frac += 1.0;
                }
            }
            if !found {
                frac = first_period_cpn_frac;
            }
            frac
        };
        (coupon * first_period_cpn_frac, coupon * accrued_periods)
    };

    let mut pv = first_cpn / one_plus.powf(dsc);
    for k in 2..=n_total {
        let exp = dsc + (k as f64 - 1.0);
        pv += coupon / one_plus.powf(exp);
    }
    let redemp = redemption / one_plus.powf(dsc + (n_total as f64 - 1.0));
    let price = pv + redemp - accrued;
    if !price.is_finite() {
        return Err(ValueError::Overflow);
    }
    Ok(price)
}

fn fn_oddfprice(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 8 || args.len() > 9 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let issue = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let first_coupon = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[6], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[7], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 8, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0
        || yld < 0.0
        || redemption <= 0.0
        || issue >= settlement
        || settlement >= first_coupon
        || first_coupon >= maturity
    {
        return Value::Error(ValueError::Overflow);
    }
    match oddfprice_from_yield(
        settlement,
        maturity,
        issue,
        first_coupon,
        rate,
        yld,
        redemption,
        frequency,
        basis,
    ) {
        Ok(p) => Value::Number(p),
        Err(e) => Value::Error(e),
    }
}

fn fn_oddfyield(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 8 || args.len() > 9 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let issue = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let first_coupon = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[6], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[7], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 8, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0
        || pr <= 0.0
        || redemption <= 0.0
        || issue >= settlement
        || settlement >= first_coupon
        || first_coupon >= maturity
    {
        return Value::Error(ValueError::Overflow);
    }
    let mut y = rate.max(0.05);
    for _ in 0..100 {
        let p = match oddfprice_from_yield(
            settlement,
            maturity,
            issue,
            first_coupon,
            rate,
            y,
            redemption,
            frequency,
            basis,
        ) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        };
        let dy = 1e-6_f64;
        let p2 = match oddfprice_from_yield(
            settlement,
            maturity,
            issue,
            first_coupon,
            rate,
            y + dy,
            redemption,
            frequency,
            basis,
        ) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        };
        let diff = p - pr;
        if diff.abs() < 1e-7 {
            return Value::Number(y);
        }
        let fp = (p2 - p) / dy;
        if fp == 0.0 || !fp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        let next = y - diff / fp;
        if !next.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if (next - y).abs() < 1e-9 {
            return Value::Number(next);
        }
        y = next;
    }
    Value::Error(ValueError::Overflow)
}

/// ODDLPRICE — price per $100 face with an odd last coupon period.
/// PCD = latest quasi-coupon date ≤ settlement (walking forward from
/// last_interest). A_p = period-fraction PCD→settlement. DSM = period-
/// fraction settlement→maturity. coupon = 100*rate/F.
/// P = (DSM*coupon + R) / (1 + DSM*yld/F) - A_p*coupon.
fn oddlprice_from_yield(
    settlement: f64,
    maturity: f64,
    last_interest: f64,
    rate: f64,
    yld: f64,
    redemption: f64,
    frequency: i64,
    basis: i64,
) -> Result<f64, ValueError> {
    let f = frequency as f64;
    let mut prev_q = last_interest;
    let mut k = 1i32;
    loop {
        let next_q = add_coupon_periods(last_interest, frequency, k);
        if next_q > settlement {
            break;
        }
        prev_q = next_q;
        k += 1;
        if k > 4_000 {
            return Err(ValueError::Overflow);
        }
    }
    let a_periods = yearfrac_basis(prev_q, settlement, basis)? * f;
    let dsm_periods = yearfrac_basis(settlement, maturity, basis)? * f;
    let coupon = 100.0 * rate / f;
    let factor = 1.0 + dsm_periods * yld / f;
    if factor == 0.0 || !factor.is_finite() {
        return Err(ValueError::Overflow);
    }
    let numer = dsm_periods * coupon + redemption;
    let accrued = a_periods * coupon;
    let price = numer / factor - accrued;
    if !price.is_finite() {
        return Err(ValueError::Overflow);
    }
    Ok(price)
}

fn fn_oddlprice(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 7 || args.len() > 8 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let last_interest = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[6], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 7, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0
        || yld < 0.0
        || redemption <= 0.0
        || last_interest >= settlement
        || settlement >= maturity
    {
        return Value::Error(ValueError::Overflow);
    }
    match oddlprice_from_yield(
        settlement,
        maturity,
        last_interest,
        rate,
        yld,
        redemption,
        frequency,
        basis,
    ) {
        Ok(p) => Value::Number(p),
        Err(e) => Value::Error(e),
    }
}

fn fn_oddlyield(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 7 || args.len() > 8 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let last_interest = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[6], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 7, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0
        || pr <= 0.0
        || redemption <= 0.0
        || last_interest >= settlement
        || settlement >= maturity
    {
        return Value::Error(ValueError::Overflow);
    }
    // ODDLPRICE has a closed-form in yld; solve directly.
    //   P + A_p*coupon = (DSM_p*coupon + R) / (1 + DSM_p * yld/F)
    //   => yld = F / DSM_p * ((numer / denom) - 1)
    let mut prev_q = last_interest;
    let mut k = 1i32;
    loop {
        let next_q = add_coupon_periods(last_interest, frequency, k);
        if next_q > settlement {
            break;
        }
        prev_q = next_q;
        k += 1;
        if k > 4_000 {
            return Value::Error(ValueError::Overflow);
        }
    }
    let f = frequency as f64;
    let a_periods = match yearfrac_basis(prev_q, settlement, basis) {
        Ok(v) => v * f,
        Err(e) => return Value::Error(e),
    };
    let dsm_periods = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v * f,
        Err(e) => return Value::Error(e),
    };
    if dsm_periods == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let coupon = 100.0 * rate / f;
    let numer = dsm_periods * coupon + redemption;
    let denom = pr + a_periods * coupon;
    if denom == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let y = f / dsm_periods * (numer / denom - 1.0);
    if y.is_finite() {
        Value::Number(y)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_coupncd(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[2], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let _basis = match fin_basis(args, 3, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(next_coupon_date(settlement, maturity, frequency))
}

fn fn_couppcd(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[2], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let _basis = match fin_basis(args, 3, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(prev_coupon_date(settlement, maturity, frequency))
}

fn fn_coupdaysnc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[2], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 3, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    let ncd = next_coupon_date(settlement, maturity, frequency);
    let days = if basis == 1 {
        day_diff(settlement, ncd).max(0.0)
    } else {
        let (_a, dsc, _e) = coup_period_split(settlement, maturity, frequency, basis);
        dsc
    };
    Value::Number(days)
}

fn fn_pduration(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate <= 0.0 || pv <= 0.0 || fv <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let log_base = (1.0 + rate).ln();
    if log_base == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let result = (fv / pv).ln() / log_base;
    if result.is_finite() {
        Value::Number(result)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_rri(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nper = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if nper <= 0.0 || pv <= 0.0 || fv <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let result = (fv / pv).powf(1.0 / nper) - 1.0;
    if result.is_finite() {
        Value::Number(result)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

fn fn_fvschedule(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let principal = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let mut product = principal;
    let mut err: Option<ValueError> = None;
    for_each_arg_value(&args[1], provider, &mut |_addr, v| {
        if err.is_some() {
            return;
        }
        match v {
            Value::Error(e) => err = Some(e),
            Value::Null => {}
            other => match coerce_to_number(&other) {
                Some(r) => {
                    product *= 1.0 + r;
                }
                None => err = Some(ValueError::WrongType),
            },
        }
    });
    if let Some(e) = err {
        return Value::Error(e);
    }
    if product.is_finite() {
        Value::Number(product)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

// ---------------------------------------------------------------------------
// R-batch helpers: CJK byte-aware text functions. Each treats CJK +
// full-width characters as 2 bytes (Shift-JIS / DBCS), everything else
// as 1. LEFTB / RIGHTB / MIDB substitute a space when a 2-byte char
// would be split across the byte boundary.
// ---------------------------------------------------------------------------

/// True when `c` would be 2 bytes in Shift-JIS / DBCS.
fn is_cjk_or_fullwidth(c: char) -> bool {
    let cp = c as u32;
    matches!(cp,
        0x3000..=0x303F   // CJK Symbols and Punctuation
        | 0x3040..=0x309F // Hiragana
        | 0x30A0..=0x30FF // Katakana
        | 0x3400..=0x4DBF // CJK Unified Ideographs Extension A
        | 0x4E00..=0x9FFF // CJK Unified Ideographs
        | 0xAC00..=0xD7AF // Hangul Syllables
        | 0xF900..=0xFAFF // CJK Compatibility Ideographs
        | 0xFF01..=0xFF60 // Full-width ASCII
        | 0xFFA0..=0xFFEF // Full-width Hangul Jamo etc.
    )
}

fn dbcs_byte_width(c: char) -> usize {
    if is_cjk_or_fullwidth(c) {
        2
    } else {
        1
    }
}

fn dbcs_byte_len(s: &str) -> usize {
    s.chars().map(dbcs_byte_width).sum()
}

fn dbcs_take_left(s: &str, num_bytes: usize) -> String {
    let mut out = String::new();
    let mut used = 0usize;
    for c in s.chars() {
        let w = dbcs_byte_width(c);
        if used + w <= num_bytes {
            out.push(c);
            used += w;
        } else if used < num_bytes {
            out.push(' ');
            break;
        } else {
            break;
        }
    }
    out
}

fn dbcs_take_right(s: &str, num_bytes: usize) -> String {
    let total = dbcs_byte_len(s);
    if num_bytes >= total {
        return s.to_string();
    }
    let target_start_byte = total - num_bytes;
    let mut out = String::new();
    let mut byte_off = 0usize;
    let mut leading_pad = false;
    for c in s.chars() {
        let w = dbcs_byte_width(c);
        let next = byte_off + w;
        if byte_off >= target_start_byte {
            out.push(c);
        } else if next > target_start_byte {
            leading_pad = true;
        }
        byte_off = next;
    }
    if leading_pad {
        let mut padded = String::with_capacity(out.len() + 1);
        padded.push(' ');
        padded.push_str(&out);
        padded
    } else {
        out
    }
}

fn dbcs_mid(s: &str, start_byte: usize, num_bytes: usize) -> String {
    if num_bytes == 0 {
        return String::new();
    }
    let end_byte = start_byte + num_bytes - 1;
    let mut out = String::new();
    let mut byte_pos = 1usize;
    for c in s.chars() {
        let w = dbcs_byte_width(c);
        let first = byte_pos;
        let last = byte_pos + w - 1;
        if last < start_byte || first > end_byte {
            // outside the slice
        } else if first >= start_byte && last <= end_byte {
            out.push(c);
        } else {
            out.push(' ');
        }
        byte_pos += w;
        if byte_pos > end_byte {
            break;
        }
    }
    out
}

fn fn_lenb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    Value::Number(dbcs_byte_len(&coerce_to_text(&v)) as f64)
}

fn fn_leftb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let s = coerce_to_text(&v);
    let n = if args.len() == 2 {
        let nv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = nv {
            return Value::Error(e);
        }
        match coerce_to_number(&nv) {
            Some(x) if x >= 0.0 => x.trunc() as usize,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    Value::Text(dbcs_take_left(&s, n))
}

fn fn_rightb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let s = coerce_to_text(&v);
    let n = if args.len() == 2 {
        let nv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = nv {
            return Value::Error(e);
        }
        match coerce_to_number(&nv) {
            Some(x) if x >= 0.0 => x.trunc() as usize,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    Value::Text(dbcs_take_right(&s, n))
}

fn fn_midb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let sv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = sv {
        return Value::Error(e);
    }
    let start_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = start_v {
        return Value::Error(e);
    }
    let num_v = eval_expr_with_provider(&args[2], provider);
    if let Value::Error(e) = num_v {
        return Value::Error(e);
    }
    let start = match coerce_to_number(&start_v) {
        Some(n) if n >= 1.0 => n.trunc() as usize,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    let num = match coerce_to_number(&num_v) {
        Some(n) if n >= 0.0 => n.trunc() as usize,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    let s = coerce_to_text(&sv);
    Value::Text(dbcs_mid(&s, start, num))
}

/// FINDB / SEARCHB shared byte-positioning engine. Returns Excel-style
/// 1-based byte index of the first match, or `Err(InvalidValue)` if no
/// match. `case_insensitive` mirrors SEARCH semantics.
fn dbcs_find_byte_index(
    needle: &str,
    haystack: &str,
    start_byte: usize,
    case_insensitive: bool,
) -> Result<usize, ValueError> {
    let total_bytes = dbcs_byte_len(haystack);
    if needle.is_empty() {
        if start_byte > total_bytes + 1 {
            return Err(ValueError::InvalidValue);
        }
        return Ok(start_byte);
    }
    if start_byte == 0 || start_byte > total_bytes {
        return Err(ValueError::InvalidValue);
    }
    let mut h_chars: Vec<char> = Vec::new();
    let mut h_offsets: Vec<usize> = Vec::new();
    {
        let mut off = 0usize;
        for c in haystack.chars() {
            h_chars.push(c);
            h_offsets.push(off);
            off += dbcs_byte_width(c);
        }
    }
    let needle_chars: Vec<char> = needle.chars().collect();
    let n_norm: Vec<char> = if case_insensitive {
        needle_chars.iter().flat_map(|c| c.to_lowercase()).collect()
    } else {
        needle_chars
    };
    for i in 0..h_chars.len() {
        let first_byte = h_offsets[i] + 1;
        if first_byte < start_byte {
            continue;
        }
        if i + n_norm.len() > h_chars.len() {
            break;
        }
        let slice = &h_chars[i..i + n_norm.len()];
        let cmp_eq = if case_insensitive {
            let lower: Vec<char> = slice.iter().flat_map(|c| c.to_lowercase()).collect();
            lower == n_norm
        } else {
            slice == n_norm.as_slice()
        };
        if cmp_eq {
            return Ok(first_byte);
        }
    }
    Err(ValueError::InvalidValue)
}

// ---- Regression + matrix algebra helpers (P batch) ---------------------
//
// Numerical strategy:
//   * Least-squares (LINEST/LOGEST/TREND/GROWTH/FORECAST) solve the
//     normal equations `(X^T X) β = X^T y` via in-place Gauss-Jordan on
//     the (k+1)×(k+2) augmented matrix. This is adequate for the
//     workbook-scale problems we expect (≤ ~50 variables). For larger /
//     near-collinear inputs we surface `#NUM!` (Overflow) when the
//     pivot drops below 1e-12, matching MINVERSE's singular guard.
//   * MINVERSE row-reduces `[A | I]` to `[I | A^-1]` with partial
//     pivoting. Same 1e-12 singular tolerance.
//   * MMULT is the textbook triple-loop (a×b)·(b×c) → (a×c). No BLAS
//     dependency; sizes are bounded by the workbook (1M-element cap).
//   * MUNIT / TRANSPOSE are O(n²) shape transforms.
//
// All array-producing functions return `Value::Array(Arc::new(...))`
// and are listed in `sheet::expr_may_produce_array` so the spill
// machinery picks them up.

/// Materialise a 2D argument as a `Vec<Vec<f64>>` matrix, propagating
/// errors and rejecting non-numeric cells. `Null` → 0.0, `Boolean` →
/// 0/1, `Text` / `Lambda` → `WrongType`.
fn arg_to_f64_matrix(arg: &Expr, provider: &dyn EvalProvider) -> Result<Vec<Vec<f64>>, ValueError> {
    let (rows, cols, data) = arg_to_2d(arg, provider)?;
    if rows == 0 || cols == 0 {
        return Ok(Vec::new());
    }
    let mut out: Vec<Vec<f64>> = vec![vec![0.0; cols as usize]; rows as usize];
    for r in 0..rows as usize {
        for c in 0..cols as usize {
            let idx = r * cols as usize + c;
            let v = &data[idx];
            match v {
                Value::Error(e) => return Err(e.clone()),
                Value::Number(n) => out[r][c] = *n,
                Value::Null => out[r][c] = 0.0,
                Value::Boolean(b) => out[r][c] = if *b { 1.0 } else { 0.0 },
                Value::Text(_) | Value::Lambda(_) => return Err(ValueError::WrongType),
                Value::Array(arr) => match arr.get(0, 0) {
                    Some(Value::Number(n)) => out[r][c] = *n,
                    Some(Value::Null) | None => out[r][c] = 0.0,
                    Some(Value::Boolean(b)) => out[r][c] = if *b { 1.0 } else { 0.0 },
                    Some(Value::Error(e)) => return Err(e.clone()),
                    Some(_) => return Err(ValueError::WrongType),
                },
            }
        }
    }
    Ok(out)
}

/// Flatten a 1-D-ish matrix (either 1×n, n×1, or already a flat list)
/// into a `Vec<f64>`. Errors on rank-2 inputs.
fn matrix_to_vector_strict(m: &[Vec<f64>]) -> Result<Vec<f64>, ValueError> {
    if m.is_empty() {
        return Ok(Vec::new());
    }
    let rows = m.len();
    let cols = m[0].len();
    if rows == 1 {
        return Ok(m[0].clone());
    }
    if cols == 1 {
        return Ok(m.iter().map(|r| r[0]).collect());
    }
    Err(ValueError::InvalidValue)
}

fn fn_findb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let find_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = find_v {
        return Value::Error(e);
    }
    let within_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = within_v {
        return Value::Error(e);
    }
    let start_byte = if args.len() == 3 {
        let s = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = s {
            return Value::Error(e);
        }
        match coerce_to_number(&s) {
            Some(n) if n >= 1.0 => n.trunc() as usize,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    let needle = coerce_to_text(&find_v);
    let hay = coerce_to_text(&within_v);
    match dbcs_find_byte_index(&needle, &hay, start_byte, false) {
        Ok(p) => Value::Number(p as f64),
        Err(e) => Value::Error(e),
    }
}

fn fn_searchb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let find_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = find_v {
        return Value::Error(e);
    }
    let within_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = within_v {
        return Value::Error(e);
    }
    let start_byte = if args.len() == 3 {
        let s = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = s {
            return Value::Error(e);
        }
        match coerce_to_number(&s) {
            Some(n) if n >= 1.0 => n.trunc() as usize,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    let needle = coerce_to_text(&find_v);
    let hay = coerce_to_text(&within_v);
    match dbcs_find_byte_index(&needle, &hay, start_byte, true) {
        Ok(p) => Value::Number(p as f64),
        Err(e) => Value::Error(e),
    }
}

fn fn_replaceb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = text_v {
        return Value::Error(e);
    }
    let start_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = start_v {
        return Value::Error(e);
    }
    let num_v = eval_expr_with_provider(&args[2], provider);
    if let Value::Error(e) = num_v {
        return Value::Error(e);
    }
    let new_v = eval_expr_with_provider(&args[3], provider);
    if let Value::Error(e) = new_v {
        return Value::Error(e);
    }
    let start = match coerce_to_number(&start_v) {
        Some(n) if n >= 1.0 => n.trunc() as usize,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    let num = match coerce_to_number(&num_v) {
        Some(n) if n >= 0.0 => n.trunc() as usize,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    let text = coerce_to_text(&text_v);
    let new_s = coerce_to_text(&new_v);
    let total = dbcs_byte_len(&text);
    let left = dbcs_take_left(&text, start.saturating_sub(1));
    let consumed_end = start.saturating_sub(1) + num;
    let right = if consumed_end < total {
        dbcs_take_right(&text, total - consumed_end)
    } else {
        String::new()
    };
    let mut out = String::new();
    out.push_str(&left);
    out.push_str(&new_s);
    out.push_str(&right);
    Value::Text(out)
}

// === Legacy statistical helper functions ===
//
// Wrappers that adapt the canonical Excel-365 `.DIST` / `.INV` signatures
// to the legacy Excel-2007 forms (no cumulative flag, single-arg signed
// form, tails switch, etc.), plus brand-new implementations for the
// four statistical hypothesis tests (CHISQ.TEST / F.TEST / T.TEST /
// Z.TEST), confidence intervals, and the lognormal distribution.

/// Legacy `BETADIST(x, alpha, beta, [A], [B])`. Always returns the
/// cumulative distribution (no boolean cumulative flag). Defaults:
/// `A = 0`, `B = 1`.
fn stat_legacy_betadist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Beta, ContinuousCDF};
    if !(3..=5).contains(&args.len()) {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let alpha = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let beta = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let a = if args.len() >= 4 {
        match stat_num(&args[3], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        0.0
    };
    let b = if args.len() == 5 {
        match stat_num(&args[4], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        1.0
    };
    if !(alpha > 0.0) || !(beta > 0.0) || !(b > a) || x < a || x > b {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Beta::new(alpha, beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let u = (x - a) / (b - a);
    stat_finite(dist.cdf(u))
}

/// Legacy `HYPGEOMDIST(sample_s, num_sample, pop_s, num_pop)`. Returns
/// the PMF only (no cumulative flag).
fn stat_legacy_hypgeomdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Discrete, Hypergeometric};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let sample_s = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let num_sample = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let pop_s = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let num_pop = match stat_num(&args[3], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    for v in [sample_s, num_sample, pop_s, num_pop] {
        if v < 0.0 || v.trunc() != v {
            return Value::Error(ValueError::Overflow);
        }
    }
    if pop_s > num_pop || num_sample > num_pop || sample_s > num_sample || sample_s > pop_s {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Hypergeometric::new(num_pop as u64, pop_s as u64, num_sample as u64) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.pmf(sample_s as u64))
}

/// Legacy `NEGBINOMDIST(num_f, num_s, prob_s)`. Returns PMF only.
fn stat_legacy_negbinomdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Discrete, NegativeBinomial};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let num_f = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let num_s = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let p = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p <= 1.0)
        || num_f < 0.0
        || num_s < 1.0
        || num_f.trunc() != num_f
        || num_s.trunc() != num_s
    {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match NegativeBinomial::new(num_s, p) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.pmf(num_f as u64))
}

/// Legacy `NORMSDIST(z)` — single-argument form that always returns the
/// standard-normal CDF (Excel's pre-2010 spelling for NORM.S.DIST in
/// cumulative mode).
fn stat_legacy_normsdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let z = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(dist.cdf(z))
}

/// Legacy `LOGNORMDIST(x, mean, sd)`. Cumulative only.
fn stat_legacy_lognormdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, LogNormal};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let mean = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let sd = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(sd > 0.0) || x <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match LogNormal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.cdf(x))
}

/// `LOGNORM.DIST(x, mean, sd, cumulative)`. statrs's `LogNormal` is
/// parameterised by the underlying normal's mean (μ) and stdev (σ),
/// matching Excel's signature directly.
fn stat_lognorm_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, LogNormal};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let mean = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let sd = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(sd > 0.0) || x <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match LogNormal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

/// `LOGNORM.INV(probability, mean, sd)`. Also exposed as legacy
/// `LOGINV`.
fn stat_lognorm_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, LogNormal};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let mean = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let sd = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p < 1.0) || !(sd > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match LogNormal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

/// Legacy `TDIST(x, deg_freedom, tails)`. `tails` must be 1 or 2:
///   - 1 → right-tail probability `P(T > x)`,
///   - 2 → two-tail probability  `P(|T| > x)`.
/// Excel requires `x >= 0`; negative `x` surfaces `#NUM!`.
fn stat_legacy_tdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let tails = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if x < 0.0 || !(df >= 1.0) {
        return Value::Error(ValueError::Overflow);
    }
    let tails_i = tails.trunc() as i64;
    if tails.trunc() != tails || (tails_i != 1 && tails_i != 2) {
        return Value::Error(ValueError::Overflow);
    }
    // Excel TDIST truncates df toward zero (it must be >= 1 after truncation).
    let df_trunc = df.trunc();
    if df_trunc < 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df_trunc) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let upper_tail = 1.0 - dist.cdf(x);
    stat_finite(if tails_i == 1 {
        upper_tail
    } else {
        2.0 * upper_tail
    })
}

/// `CONFIDENCE(alpha, stdev, size)` / `CONFIDENCE.NORM(alpha, stdev, size)`.
/// Returns the half-width of the normal-distribution confidence
/// interval: `NORM.S.INV(1 - alpha/2) * stdev / sqrt(size)`. Excel
/// truncates `size` toward zero before validating.
fn stat_confidence_norm(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let alpha = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let stdev = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let size_raw = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let size = size_raw.trunc();
    if !(alpha > 0.0 && alpha < 1.0) || !(stdev > 0.0) || size < 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    let z = dist.inverse_cdf(1.0 - alpha / 2.0);
    stat_finite(z * stdev / size.sqrt())
}

/// Mean and sample variance (divisor `n - 1`) of a flat slice. Returns
/// `None` if fewer than two values were given.
fn mean_and_sample_var(xs: &[f64]) -> Option<(f64, f64)> {
    let n = xs.len();
    if n < 2 {
        return None;
    }
    let mean = xs.iter().sum::<f64>() / n as f64;
    let var = xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n as f64 - 1.0);
    Some((mean, var))
}

/// `CHISQ.TEST(actual_range, expected_range)` / `CHITEST(...)`.
///
/// Computes the chi-square statistic
///   `χ² = Σ (actual_i - expected_i)² / expected_i`
/// over every paired-cell of the two equally-shaped grids, then returns
/// the right-tail probability of that statistic under a chi-square
/// distribution with `(rows - 1) * (cols - 1)` degrees of freedom (or
/// `n - 1` if either dimension is 1). Empty / non-numeric cells in a
/// pair are skipped (must skip in both); a zero expected value surfaces
/// `#DIV/0!`. Mismatched shapes surface `#N/A` (`InvalidValue`).
fn stat_chisq_test(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, ContinuousCDF};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let grid_a = match collect_range_2d_for_arg(&args[0], provider) {
        Some(g) => g,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let grid_b = match collect_range_2d_for_arg(&args[1], provider) {
        Some(g) => g,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let rows = grid_a.len();
    let cols = grid_a.first().map(|r| r.len()).unwrap_or(0);
    if rows != grid_b.len() || cols != grid_b.first().map(|r| r.len()).unwrap_or(0) {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut chi2 = 0.0_f64;
    let mut pairs: usize = 0;
    for r in 0..rows {
        for c in 0..cols {
            let av = &grid_a[r][c];
            let bv = &grid_b[r][c];
            if let Value::Error(e) = av {
                return Value::Error(e.clone());
            }
            if let Value::Error(e) = bv {
                return Value::Error(e.clone());
            }
            if let (Value::Number(a_n), Value::Number(b_n)) = (av, bv) {
                if *b_n == 0.0 {
                    return Value::Error(ValueError::DivisionByZero);
                }
                let diff = a_n - b_n;
                chi2 += diff * diff / b_n;
                pairs += 1;
            }
        }
    }
    if pairs < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // Degrees of freedom: contingency-table convention. Single row or
    // column -> n-1; otherwise (rows-1)*(cols-1).
    let df = if rows == 1 || cols == 1 {
        (pairs as f64) - 1.0
    } else {
        ((rows - 1) as f64) * ((cols - 1) as f64)
    };
    if df <= 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(1.0 - dist.cdf(chi2))
}

/// `F.TEST(arr1, arr2)` / `FTEST(...)`. Two-tail probability that two
/// samples have equal variance: `2 * min(P, 1-P)` where `P` is the F
/// distribution's right-tail probability at `var1 / var2` with
/// `(n1 - 1, n2 - 1)` degrees of freedom.
fn stat_f_test(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, FisherSnedecor};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let xs = collect_numbers(&[args[0].clone()], provider);
    let ys = collect_numbers(&[args[1].clone()], provider);
    let (_, var_x) = match mean_and_sample_var(&xs) {
        Some(t) => t,
        None => return Value::Error(ValueError::DivisionByZero),
    };
    let (_, var_y) = match mean_and_sample_var(&ys) {
        Some(t) => t,
        None => return Value::Error(ValueError::DivisionByZero),
    };
    if var_x == 0.0 || var_y == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let df1 = (xs.len() as f64) - 1.0;
    let df2 = (ys.len() as f64) - 1.0;
    let f = var_x / var_y;
    let dist = match FisherSnedecor::new(df1, df2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let p_right = 1.0 - dist.cdf(f);
    stat_finite(2.0 * p_right.min(1.0 - p_right))
}

/// `T.TEST(arr1, arr2, tails, type)` / `TTEST(...)`.
///
/// `type`:
///   1. Paired (arrays must be equal length, neither variance zero).
///   2. Two-sample, equal variance (pooled).
///   3. Two-sample, unequal variance (Welch's).
///
/// `tails`: 1 or 2.
fn stat_t_test(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let tails_raw = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let type_raw = match stat_num(&args[3], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if tails_raw.trunc() != tails_raw || type_raw.trunc() != type_raw {
        return Value::Error(ValueError::Overflow);
    }
    let tails = tails_raw as i64;
    let ttype = type_raw as i64;
    if (tails != 1 && tails != 2) || !(1..=3).contains(&ttype) {
        return Value::Error(ValueError::Overflow);
    }

    let (t_stat, df) = match ttype {
        1 => {
            // Paired t-test. Pair grids cell-by-cell (numeric pairs
            // only); skip pairs where either side is non-numeric.
            let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
                Ok(p) => p,
                Err(e) => return Value::Error(e),
            };
            let n = pairs.len();
            if n < 2 {
                return Value::Error(ValueError::DivisionByZero);
            }
            let diffs: Vec<f64> = pairs.iter().map(|(x, y)| x - y).collect();
            let (mean, var) = match mean_and_sample_var(&diffs) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            if var == 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            let se = (var / n as f64).sqrt();
            (mean / se, (n as f64) - 1.0)
        }
        2 => {
            // Two-sample equal-variance (pooled).
            let xs = collect_numbers(&[args[0].clone()], provider);
            let ys = collect_numbers(&[args[1].clone()], provider);
            let (mx, vx) = match mean_and_sample_var(&xs) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            let (my, vy) = match mean_and_sample_var(&ys) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            let n1 = xs.len() as f64;
            let n2 = ys.len() as f64;
            let pooled = ((n1 - 1.0) * vx + (n2 - 1.0) * vy) / (n1 + n2 - 2.0);
            if pooled <= 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            let se = (pooled * (1.0 / n1 + 1.0 / n2)).sqrt();
            ((mx - my) / se, n1 + n2 - 2.0)
        }
        3 => {
            // Welch's two-sample unequal-variance t-test.
            let xs = collect_numbers(&[args[0].clone()], provider);
            let ys = collect_numbers(&[args[1].clone()], provider);
            let (mx, vx) = match mean_and_sample_var(&xs) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            let (my, vy) = match mean_and_sample_var(&ys) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            let n1 = xs.len() as f64;
            let n2 = ys.len() as f64;
            let se_sq = vx / n1 + vy / n2;
            if se_sq <= 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            let t = (mx - my) / se_sq.sqrt();
            // Welch-Satterthwaite df.
            let df_num = se_sq.powi(2);
            let df_den = (vx / n1).powi(2) / (n1 - 1.0) + (vy / n2).powi(2) / (n2 - 1.0);
            if df_den <= 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            (t, df_num / df_den)
        }
        _ => unreachable!(),
    };
    if !df.is_finite() || df <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Two-tail probability is `2 * P(T > |t_stat|)`; one-tail is
    // `P(T > |t_stat|)`. Using `1 - cdf(|t|)` covers both signs.
    let p_one = 1.0 - dist.cdf(t_stat.abs());
    stat_finite(if tails == 1 { p_one } else { 2.0 * p_one })
}

/// `Z.TEST(array, x, [sigma])` / `ZTEST(...)`. Returns the one-tailed
/// P-value `1 - NORM.S.DIST((mean - x) / (sigma / sqrt(n)))`. When
/// `sigma` is omitted the sample standard deviation is used.
fn stat_z_test(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if !(2..=3).contains(&args.len()) {
        return Value::Error(ValueError::WrongArgCount);
    }
    let xs = collect_numbers(&[args[0].clone()], provider);
    let n = xs.len();
    if n < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let x0 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let (mean, var) = match mean_and_sample_var(&xs) {
        Some(t) => t,
        None => return Value::Error(ValueError::DivisionByZero),
    };
    let sigma = if args.len() == 3 {
        match stat_num(&args[2], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        var.sqrt()
    };
    if !(sigma > 0.0) {
        return Value::Error(ValueError::DivisionByZero);
    }
    let z = (mean - x0) / (sigma / (n as f64).sqrt());
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(1.0 - dist.cdf(z))
}

/// Invert a square matrix via Gauss-Jordan on `[A | I]`. Returns
/// `Err(ValueError::Overflow)` if singular within 1e-12. Consumes `a`.
fn matrix_inverse_inplace(a_in: Vec<Vec<f64>>) -> Result<Vec<Vec<f64>>, ValueError> {
    let n = a_in.len();
    if n == 0 || a_in.iter().any(|r| r.len() != n) {
        return Err(ValueError::InvalidValue);
    }
    let mut a: Vec<Vec<f64>> = a_in;
    let mut inv: Vec<Vec<f64>> = (0..n)
        .map(|i| {
            let mut row = vec![0.0; n];
            row[i] = 1.0;
            row
        })
        .collect();
    for i in 0..n {
        // Partial pivot.
        let mut piv = i;
        let mut piv_val = a[i][i].abs();
        for r in (i + 1)..n {
            let v = a[r][i].abs();
            if v > piv_val {
                piv_val = v;
                piv = r;
            }
        }
        if piv_val < 1e-12 {
            return Err(ValueError::Overflow);
        }
        if piv != i {
            a.swap(i, piv);
            inv.swap(i, piv);
        }
        // Normalise row i.
        let div = a[i][i];
        for c in 0..n {
            a[i][c] /= div;
            inv[i][c] /= div;
        }
        // Eliminate other rows.
        for r in 0..n {
            if r == i {
                continue;
            }
            let factor = a[r][i];
            if factor == 0.0 {
                continue;
            }
            for c in 0..n {
                a[r][c] -= factor * a[i][c];
                inv[r][c] -= factor * inv[i][c];
            }
        }
    }
    Ok(inv)
}

/// Linear least-squares core used by LINEST/LOGEST/TREND/GROWTH/FORECAST.
///
/// Inputs:
///   * `xs`: `n × k` matrix of regressors (already log-transformed for
///     LOGEST/GROWTH). One row per observation.
///   * `ys`: length-`n` vector (already log-transformed for LOGEST/GROWTH).
///   * `with_intercept`: when `false`, the model is `y = m1*x1 + …`;
///     when `true`, an implicit column of 1s is appended.
struct LinRegFit {
    /// Slopes in input order (`m1..mk`). Length = `k`.
    slopes: Vec<f64>,
    /// Intercept (`0.0` when `with_intercept = false`).
    intercept: f64,
    with_intercept: bool,
    ss_res: f64,
    ss_tot: f64,
    /// Per-slope standard errors, same order as `slopes`.
    se: Vec<f64>,
    se_intercept: f64,
    df: f64,
    k_vars: usize,
}

fn linreg_core(xs: &[Vec<f64>], ys: &[f64], with_intercept: bool) -> Result<LinRegFit, ValueError> {
    let n = ys.len();
    if n == 0 {
        return Err(ValueError::InvalidValue);
    }
    if !xs.is_empty() && xs.len() != n {
        return Err(ValueError::InvalidValue);
    }
    let k = if xs.is_empty() { 0 } else { xs[0].len() };
    for row in xs {
        if row.len() != k {
            return Err(ValueError::InvalidValue);
        }
    }
    let p_eff = k + if with_intercept { 1 } else { 0 };
    if p_eff == 0 {
        return Err(ValueError::InvalidValue);
    }
    if n < p_eff {
        return Err(ValueError::InvalidValue);
    }
    // Build the design matrix X (n × p_eff). Layout: x columns first,
    // then optional intercept column of 1s.
    let mut x_mat: Vec<Vec<f64>> = (0..n).map(|_| vec![0.0; p_eff]).collect();
    for r in 0..n {
        for c in 0..k {
            x_mat[r][c] = xs[r][c];
        }
        if with_intercept {
            x_mat[r][p_eff - 1] = 1.0;
        }
    }
    // Normal equations: A = X^T X (p×p), bvec = X^T y (p).
    let mut a: Vec<Vec<f64>> = vec![vec![0.0; p_eff]; p_eff];
    let mut bvec: Vec<f64> = vec![0.0; p_eff];
    for i in 0..p_eff {
        for j in 0..p_eff {
            let mut s = 0.0;
            for r in 0..n {
                s += x_mat[r][i] * x_mat[r][j];
            }
            a[i][j] = s;
        }
        let mut s = 0.0;
        for r in 0..n {
            s += x_mat[r][i] * ys[r];
        }
        bvec[i] = s;
    }
    // Keep a copy of A for SE computation (we need (X^T X)^-1).
    let a_copy: Vec<Vec<f64>> = a.iter().cloned().collect();
    // Solve via Gauss-Jordan augmented with bvec.
    let mut piv_a = a;
    {
        let n_local = p_eff;
        for i in 0..n_local {
            let mut piv = i;
            let mut piv_val = piv_a[i][i].abs();
            for r in (i + 1)..n_local {
                let v = piv_a[r][i].abs();
                if v > piv_val {
                    piv_val = v;
                    piv = r;
                }
            }
            if piv_val < 1e-12 {
                return Err(ValueError::Overflow);
            }
            if piv != i {
                piv_a.swap(i, piv);
                bvec.swap(i, piv);
            }
            let div = piv_a[i][i];
            for c in i..n_local {
                piv_a[i][c] /= div;
            }
            bvec[i] /= div;
            for r in 0..n_local {
                if r == i {
                    continue;
                }
                let factor = piv_a[r][i];
                if factor == 0.0 {
                    continue;
                }
                for c in i..n_local {
                    piv_a[r][c] -= factor * piv_a[i][c];
                }
                bvec[r] -= factor * bvec[i];
            }
        }
    }
    let betas = bvec; // length p_eff
    let slopes: Vec<f64> = (0..k).map(|i| betas[i]).collect();
    let intercept = if with_intercept {
        betas[p_eff - 1]
    } else {
        0.0
    };
    // Predicted ŷ.
    let mut predicted = vec![0.0_f64; n];
    for r in 0..n {
        let mut yhat = 0.0;
        for c in 0..k {
            yhat += xs[r][c] * slopes[c];
        }
        if with_intercept {
            yhat += intercept;
        }
        predicted[r] = yhat;
    }
    // SS_res, SS_tot.
    let y_mean: f64 = ys.iter().sum::<f64>() / (n as f64);
    let mut ss_res = 0.0;
    let mut ss_tot = 0.0;
    for r in 0..n {
        let resid = ys[r] - predicted[r];
        ss_res += resid * resid;
        // Excel treats SS_tot as Σ(y - ȳ)² when intercept = TRUE, and
        // as Σy² (uncorrected) when intercept = FALSE.
        if with_intercept {
            let diff = ys[r] - y_mean;
            ss_tot += diff * diff;
        } else {
            ss_tot += ys[r] * ys[r];
        }
    }
    let df = (n as f64) - (p_eff as f64);
    let mse = if df > 0.0 { ss_res / df } else { 0.0 };
    let (se_slopes, se_intercept) = if df > 0.0 {
        match matrix_inverse_inplace(a_copy) {
            Ok(inv) => {
                let mut se_v = vec![0.0_f64; k];
                for j in 0..k {
                    let var_j = inv[j][j] * mse;
                    se_v[j] = if var_j > 0.0 { var_j.sqrt() } else { 0.0 };
                }
                let se_int = if with_intercept {
                    let last = p_eff - 1;
                    let var_int = inv[last][last] * mse;
                    if var_int > 0.0 {
                        var_int.sqrt()
                    } else {
                        0.0
                    }
                } else {
                    0.0
                };
                (se_v, se_int)
            }
            Err(_) => (vec![0.0_f64; k], 0.0),
        }
    } else {
        (vec![0.0_f64; k], 0.0)
    };
    Ok(LinRegFit {
        slopes,
        intercept,
        with_intercept,
        ss_res,
        ss_tot,
        se: se_slopes,
        se_intercept,
        df,
        k_vars: k,
    })
}

/// Parse the optional 3rd/4th args of LINEST/LOGEST (`const`, `stats`).
/// Default `const` is TRUE, `stats` is FALSE.
fn linest_flags(
    args: &[Expr],
    flag_offset: usize,
    provider: &dyn EvalProvider,
) -> Result<(bool, bool), ValueError> {
    let with_intercept = if args.len() > flag_offset {
        let v = eval_expr_with_provider(&args[flag_offset], provider);
        if let Value::Error(e) = v {
            return Err(e);
        }
        coerce_to_bool(&v).unwrap_or(true)
    } else {
        true
    };
    let stats = if args.len() > flag_offset + 1 {
        let v = eval_expr_with_provider(&args[flag_offset + 1], provider);
        if let Value::Error(e) = v {
            return Err(e);
        }
        coerce_to_bool(&v).unwrap_or(false)
    } else {
        false
    };
    Ok((with_intercept, stats))
}

/// Build the LINEST/LOGEST diagnostic output array.
///
/// Excel surfaces slopes **right-to-left**: the last regressor's slope
/// is in column 0, the first regressor's slope sits just left of the
/// intercept (column k-1), and the intercept lands in column k. When
/// `stats = FALSE`, this is a single 1×(k+1) row. When `stats = TRUE`,
/// the shape is `5 × (k+1)`:
///
///   row 0: [mk, ..., m1, b]              ← slopes (reversed) + intercept
///   row 1: [se(mk), ..., se(m1), se(b)]
///   row 2: [r², SE_y, #N/A, ..., #N/A]
///   row 3: [F, df, #N/A, ..., #N/A]
///   row 4: [SS_reg, SS_resid, #N/A, ..., #N/A]
fn linest_array(fit: &LinRegFit, stats: bool, exp_coefs: bool) -> Value {
    let k = fit.k_vars;
    let cols = k + 1;
    if !stats {
        let mut row: Vec<Value> = Vec::with_capacity(cols);
        for j in 0..k {
            let s = fit.slopes[k - 1 - j];
            row.push(Value::Number(if exp_coefs { s.exp() } else { s }));
        }
        let b = fit.intercept;
        row.push(Value::Number(if exp_coefs { b.exp() } else { b }));
        return Value::Array(Arc::new(ArrayData::new(1, cols as u32, row)));
    }
    let mut data: Vec<Value> = Vec::with_capacity(5 * cols);
    // Row 0: slopes reversed + intercept (exp-transformed for LOGEST).
    for j in 0..k {
        let s = fit.slopes[k - 1 - j];
        data.push(Value::Number(if exp_coefs { s.exp() } else { s }));
    }
    data.push(Value::Number(if exp_coefs {
        fit.intercept.exp()
    } else {
        fit.intercept
    }));
    // Row 1: SEs (always log-space for LOGEST per Excel reference).
    for j in 0..k {
        data.push(Value::Number(fit.se[k - 1 - j]));
    }
    data.push(Value::Number(fit.se_intercept));
    // Row 2: R², SE_y.
    let r2 = if fit.ss_tot > 0.0 {
        1.0 - fit.ss_res / fit.ss_tot
    } else {
        0.0
    };
    let se_y = if fit.df > 0.0 {
        (fit.ss_res / fit.df).sqrt()
    } else {
        0.0
    };
    data.push(Value::Number(r2));
    data.push(Value::Number(se_y));
    for _ in 2..cols {
        data.push(Value::Error(ValueError::NotAvailable));
    }
    // Row 3: F-stat, df.
    let p = k as f64;
    let f_stat = if p > 0.0 && fit.df > 0.0 && fit.ss_res > 0.0 {
        let ss_reg = if fit.ss_tot > fit.ss_res {
            fit.ss_tot - fit.ss_res
        } else {
            0.0
        };
        (ss_reg / p) / (fit.ss_res / fit.df)
    } else {
        0.0
    };
    data.push(Value::Number(f_stat));
    data.push(Value::Number(fit.df));
    for _ in 2..cols {
        data.push(Value::Error(ValueError::NotAvailable));
    }
    // Row 4: SS_reg, SS_resid.
    let ss_reg = if fit.ss_tot > fit.ss_res {
        fit.ss_tot - fit.ss_res
    } else {
        0.0
    };
    data.push(Value::Number(ss_reg));
    data.push(Value::Number(fit.ss_res));
    for _ in 2..cols {
        data.push(Value::Error(ValueError::NotAvailable));
    }
    Value::Array(Arc::new(ArrayData::new(5, cols as u32, data)))
}

/// Extract `known_y` as a `Vec<f64>` and report whether the original
/// shape is vertical (`true` for n×1) or horizontal (`false` for 1×n).
fn extract_known_y(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<(Vec<f64>, bool), ValueError> {
    let m = arg_to_f64_matrix(arg, provider)?;
    if m.is_empty() {
        return Err(ValueError::InvalidValue);
    }
    let rows = m.len();
    let cols = m[0].len();
    if rows == 1 {
        Ok((m[0].clone(), false))
    } else if cols == 1 {
        Ok((m.iter().map(|r| r[0]).collect(), true))
    } else {
        Err(ValueError::InvalidValue)
    }
}

/// Extract `known_x` as an n×k regressor matrix. Each row is an
/// observation, each column is a variable. Auto-transposes when the
/// orientation doesn't match `y`.
fn extract_known_x(
    arg: Option<&Expr>,
    n_required: usize,
    y_vertical: bool,
    provider: &dyn EvalProvider,
) -> Result<Vec<Vec<f64>>, ValueError> {
    let Some(a) = arg else {
        // Default x = 1..n, single column.
        return Ok((0..n_required).map(|i| vec![(i + 1) as f64]).collect());
    };
    let m = arg_to_f64_matrix(a, provider)?;
    if m.is_empty() {
        return Err(ValueError::InvalidValue);
    }
    let rows = m.len();
    let cols = m[0].len();
    let (n_obs, k_vars, transpose) = if y_vertical {
        if rows == n_required {
            (rows, cols, false)
        } else if cols == n_required {
            (cols, rows, true)
        } else {
            return Err(ValueError::InvalidValue);
        }
    } else if cols == n_required {
        (cols, rows, true)
    } else if rows == n_required {
        (rows, cols, false)
    } else {
        return Err(ValueError::InvalidValue);
    };
    let mut out: Vec<Vec<f64>> = vec![vec![0.0; k_vars]; n_obs];
    for r in 0..n_obs {
        for c in 0..k_vars {
            out[r][c] = if transpose { m[c][r] } else { m[r][c] };
        }
    }
    Ok(out)
}

/// LINEST(known_y, [known_x], [const=TRUE], [stats=FALSE]).
/// LOGEST is the same dispatch with `log_y = true`.
fn fn_linest(args: &[Expr], provider: &dyn EvalProvider, log_y: bool) -> Value {
    if args.is_empty() || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (mut ys, y_vertical) = match extract_known_y(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    if log_y {
        for y in ys.iter_mut() {
            if !(*y > 0.0) {
                return Value::Error(ValueError::Overflow);
            }
            *y = y.ln();
        }
    }
    let n = ys.len();
    let x_arg = if args.len() >= 2 {
        Some(&args[1])
    } else {
        None
    };
    let xs = match extract_known_x(x_arg, n, y_vertical, provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    let (with_intercept, stats) = match linest_flags(args, 2, provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    let fit = match linreg_core(&xs, &ys, with_intercept) {
        Ok(f) => f,
        Err(e) => return Value::Error(e),
    };
    linest_array(&fit, stats, /* exp_coefs = */ log_y)
}

/// TREND(known_y, [known_x], [new_x], [const]).
/// GROWTH is the same shape with `log_y = true`.
fn fn_trend_growth(args: &[Expr], provider: &dyn EvalProvider, log_y: bool) -> Value {
    if args.is_empty() || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (mut ys, y_vertical) = match extract_known_y(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    if log_y {
        for y in ys.iter_mut() {
            if !(*y > 0.0) {
                return Value::Error(ValueError::Overflow);
            }
            *y = y.ln();
        }
    }
    let n = ys.len();
    let x_arg = if args.len() >= 2 {
        Some(&args[1])
    } else {
        None
    };
    let xs = match extract_known_x(x_arg, n, y_vertical, provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    let with_intercept = if args.len() >= 4 {
        let v = eval_expr_with_provider(&args[3], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        coerce_to_bool(&v).unwrap_or(true)
    } else {
        true
    };
    let fit = match linreg_core(&xs, &ys, with_intercept) {
        Ok(f) => f,
        Err(e) => return Value::Error(e),
    };
    let new_xs: Vec<Vec<f64>> = if args.len() >= 3 {
        match arg_to_f64_matrix(&args[2], provider) {
            Ok(m) if !m.is_empty() => {
                let rows = m.len();
                let cols = m[0].len();
                let k = fit.k_vars;
                let (n_new, k_new, transpose) = if cols == k {
                    (rows, cols, false)
                } else if rows == k {
                    (cols, rows, true)
                } else if k == 1 && (rows == 1 || cols == 1) {
                    if rows == 1 {
                        (cols, 1, true)
                    } else {
                        (rows, 1, false)
                    }
                } else {
                    return Value::Error(ValueError::InvalidValue);
                };
                let mut out: Vec<Vec<f64>> = vec![vec![0.0; k_new]; n_new];
                for r in 0..n_new {
                    for c in 0..k_new {
                        out[r][c] = if transpose { m[c][r] } else { m[r][c] };
                    }
                }
                out
            }
            Ok(_) => xs.clone(),
            Err(e) => return Value::Error(e),
        }
    } else {
        xs.clone()
    };
    let n_new = new_xs.len();
    let mut preds: Vec<Value> = Vec::with_capacity(n_new);
    for r in 0..n_new {
        let mut yhat = 0.0;
        for c in 0..fit.k_vars {
            yhat += new_xs[r][c] * fit.slopes[c];
        }
        if fit.with_intercept {
            yhat += fit.intercept;
        }
        if log_y {
            yhat = yhat.exp();
        }
        preds.push(Value::Number(yhat));
    }
    if y_vertical {
        Value::Array(Arc::new(ArrayData::new(n_new as u32, 1, preds)))
    } else {
        Value::Array(Arc::new(ArrayData::new(1, n_new as u32, preds)))
    }
}

/// FORECAST(x, known_y, known_x). Scalar single-variable forecast at `x`.
fn fn_forecast(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let xv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = xv {
        return Value::Error(e);
    }
    let x_at = match coerce_to_number(&xv) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let (ys, _y_vertical) = match extract_known_y(&args[1], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    let m_x = match arg_to_f64_matrix(&args[2], provider) {
        Ok(m) if !m.is_empty() => m,
        Ok(_) => return Value::Error(ValueError::InvalidValue),
        Err(e) => return Value::Error(e),
    };
    let xs_vec = match matrix_to_vector_strict(&m_x) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if xs_vec.len() != ys.len() {
        return Value::Error(ValueError::InvalidValue);
    }
    let xs: Vec<Vec<f64>> = xs_vec.iter().map(|x| vec![*x]).collect();
    let fit = match linreg_core(&xs, &ys, true) {
        Ok(f) => f,
        Err(e) => return Value::Error(e),
    };
    let m1 = fit.slopes.first().copied().unwrap_or(0.0);
    Value::Number(fit.intercept + m1 * x_at)
}

/// STEYX(known_y, known_x). Standard error of the predicted y in a
/// simple linear regression.
fn fn_steyx(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[1], &args[0], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.len() < 3 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let mut sxx = 0.0;
    let mut syy = 0.0;
    let mut sxy = 0.0;
    for (x, y) in &pairs {
        let dx = *x - mx;
        let dy = *y - my;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
    }
    if sxx == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let val = ((syy - sxy * sxy / sxx) / (n - 2.0)).max(0.0);
    Value::Number(val.sqrt())
}

/// RSQ(known_y, known_x). Pearson R² — square of the correlation.
fn fn_rsq(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.len() < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let mut sxy = 0.0;
    let mut sxx = 0.0;
    let mut syy = 0.0;
    for (x, y) in &pairs {
        let dx = *x - mx;
        let dy = *y - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
    }
    let denom = sxx * syy;
    if denom == 0.0 || !denom.is_finite() {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number((sxy * sxy) / denom)
}

// === Q batch helpers: RAND / RANDBETWEEN / PERCENTRANK / MODE.MULT /
//     MAXA / MINA / *VAR.A / SKEW.P / FREQUENCY / PROB / GAUSS / PHI ===

/// RAND() — uniform [0, 1). No args. Volatile: every call returns a
/// fresh draw from the OS-seeded thread RNG, so two `RAND()` uses in the
/// same formula give different numbers (Excel parity).
fn stat_rand(args: &[Expr]) -> Value {
    if !args.is_empty() {
        return Value::Error(ValueError::WrongArgCount);
    }
    use rand::Rng;
    let n: f64 = rand::thread_rng().gen_range(0.0..1.0);
    Value::Number(n)
}

/// RANDBETWEEN(low, high) — uniform integer in `[low, high]` inclusive.
/// Both args truncate toward zero before validation. `low > high` surfaces
/// #NUM! (Overflow), matching Excel.
fn stat_randbetween(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let lo = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let hi = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let lo_i = lo.trunc() as i64;
    let hi_i = hi.trunc() as i64;
    if lo_i > hi_i {
        return Value::Error(ValueError::Overflow);
    }
    use rand::Rng;
    // gen_range is exclusive on the high bound; widen to i128 to avoid
    // overflow when `hi_i == i64::MAX`.
    let pick = rand::thread_rng().gen_range((lo_i as i128)..(hi_i as i128 + 1));
    Value::Number(pick as f64)
}

/// PERCENTRANK / PERCENTRANK.INC(array, x[, significance=3]).
fn stat_percentrank_inc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    percentrank_common(args, provider, /*exclusive=*/ false)
}

/// PERCENTRANK.EXC(array, x[, significance=3]).
fn stat_percentrank_exc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    percentrank_common(args, provider, /*exclusive=*/ true)
}

fn percentrank_common(args: &[Expr], provider: &dyn EvalProvider, exclusive: bool) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let significance = if args.len() == 3 {
        match stat_num(&args[2], provider) {
            Ok(n) => {
                let s = n.trunc() as i64;
                if s < 1 {
                    return Value::Error(ValueError::Overflow);
                }
                s as u32
            }
            Err(e) => return e,
        }
    } else {
        3
    };
    let mut nums = collect_numbers(&args[..1], provider);
    if nums.is_empty() {
        return Value::Error(ValueError::Overflow);
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = nums.len();
    if x < nums[0] || x > nums[n - 1] {
        return Value::Error(ValueError::InvalidValue);
    }
    let (k_lower, exact) = locate_lower(&nums, x);
    let frac = if exact {
        0.0
    } else {
        let lo = nums[k_lower];
        let hi = nums[k_lower + 1];
        (x - lo) / (hi - lo)
    };
    let pos = k_lower as f64 + frac; // 0-based fractional index
    let rank = if exclusive {
        (pos + 1.0) / (n as f64 + 1.0)
    } else if n == 1 {
        1.0
    } else {
        pos / (n as f64 - 1.0)
    };
    Value::Number(truncate_digits(rank, significance))
}

/// Return `(idx, exact)` where `idx` is the largest i with `sorted[i] <= x`,
/// and `exact == true` when `sorted[idx] == x`. Caller has already
/// verified `x` lies in `[sorted[0], sorted[last]]`.
fn locate_lower(sorted: &[f64], x: f64) -> (usize, bool) {
    let mut best = 0usize;
    for (i, &v) in sorted.iter().enumerate() {
        if v <= x {
            best = i;
        } else {
            break;
        }
    }
    (best, (sorted[best] - x).abs() == 0.0)
}

/// Truncate `value` to `digits` decimal digits (Excel PERCENTRANK
/// significance semantics — truncation toward zero, not rounding).
fn truncate_digits(value: f64, digits: u32) -> f64 {
    if !value.is_finite() {
        return value;
    }
    let scale = 10f64.powi(digits as i32);
    (value * scale).trunc() / scale
}

/// MODE.MULT — array form returning every value tied for the most-frequent
/// count. Returns an n×1 `Value::Array`. If all values are unique, returns
/// `#N/A` (InvalidValue) just like single-value `MODE`.
fn stat_mode_mult(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    // Bucket integer-quantised numbers exactly like `MODE` does, so 1.0 and
    // 1.0 collide on hash; the 1e9 scale gives 9 decimal digits of fidelity.
    let mut nums: Vec<i64> = Vec::new();
    for arg in args {
        for_each_arg_value(arg, provider, &mut |_addr, v| {
            if let Value::Number(n) = v {
                nums.push((n * 1e9).round() as i64);
            }
        });
    }
    if nums.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut counts: HashMap<i64, usize> = HashMap::new();
    for n in &nums {
        *counts.entry(*n).or_insert(0) += 1;
    }
    let max_count = counts.values().copied().max().unwrap_or(0);
    if max_count <= 1 {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut seen: HashSet<i64> = HashSet::new();
    let mut modes: Vec<Value> = Vec::new();
    for n in &nums {
        if counts[n] == max_count && seen.insert(*n) {
            modes.push(Value::Number(*n as f64 / 1e9));
        }
    }
    let len = modes.len() as u32;
    Value::Array(Arc::new(ArrayData::new(len, 1, modes)))
}

/// Collect numbers + logical + text for the A-variants. Empty cells are
/// skipped; text contributes 0; logical TRUE/FALSE contributes 1/0.
fn collect_numbers_a(args: &[Expr], provider: &dyn EvalProvider) -> (Vec<f64>, Option<ValueError>) {
    let mut nums: Vec<f64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for arg in args {
        if err.is_some() {
            break;
        }
        for_each_arg_value(arg, provider, &mut |_addr, v| {
            if err.is_some() {
                return;
            }
            match v {
                Value::Error(e) => err = Some(e),
                Value::Number(n) => nums.push(n),
                Value::Boolean(true) => nums.push(1.0),
                Value::Boolean(false) => nums.push(0.0),
                Value::Text(_) => nums.push(0.0),
                Value::Null => {}
                Value::Array(_) => {}
                Value::Lambda(_) => err = Some(ValueError::WrongType),
            }
        });
    }
    (nums, err)
}

/// MAXA / MINA — A-variant of MAX / MIN.
fn stat_max_min_a(args: &[Expr], provider: &dyn EvalProvider, want_max: bool) -> Value {
    let (nums, err) = collect_numbers_a(args, provider);
    if let Some(e) = err {
        return Value::Error(e);
    }
    if nums.is_empty() {
        return Value::Number(0.0);
    }
    let result = if want_max {
        nums.iter().copied().fold(f64::NEG_INFINITY, f64::max)
    } else {
        nums.iter().copied().fold(f64::INFINITY, f64::min)
    };
    stat_finite(result)
}

/// STDEVA / STDEVPA / VARA / VARPA. `sample` selects n-1 vs n; `sqrt`
/// selects STDEV* (return s.d.) vs VAR* (return variance).
fn stat_var_a(args: &[Expr], provider: &dyn EvalProvider, sample: bool, sqrt: bool) -> Value {
    let (nums, err) = collect_numbers_a(args, provider);
    if let Some(e) = err {
        return Value::Error(e);
    }
    let n = nums.len();
    if (sample && n < 2) || (!sample && n < 1) {
        return Value::Error(ValueError::DivisionByZero);
    }
    let mean = nums.iter().sum::<f64>() / n as f64;
    let denom = if sample { (n - 1) as f64 } else { n as f64 };
    let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / denom;
    stat_finite(if sqrt { var.sqrt() } else { var })
}

/// SKEW.P — population skewness. Divides moment-3 by `n` and uses
/// population s.d. (vs SKEW which uses the sample n-1 + bias correction).
fn stat_skew_p(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    let n = nums.len() as f64;
    if nums.len() < 3 {
        return Value::Error(ValueError::Overflow);
    }
    let mean = nums.iter().sum::<f64>() / n;
    let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
    let s = var.sqrt();
    if s == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let m3 = nums.iter().map(|x| (x - mean).powi(3)).sum::<f64>() / n;
    stat_finite(m3 / s.powi(3))
}

/// FREQUENCY(data, bins). Returns a `(bins.len() + 1) × 1` column array.
///
/// Tie-handling: ties land in the LOWER bucket (Excel parity — comparison
/// is `x <= bin`, so a value equal to `bins[i]` belongs to bucket `i`,
/// never `i+1`). Bins are sorted ascending before bucketing.
fn stat_frequency(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let data = collect_numbers(&args[..1], provider);
    let mut bins = collect_numbers(&args[1..2], provider);
    bins.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let nbins = bins.len();
    let mut counts: Vec<u64> = vec![0; nbins + 1];
    for &x in &data {
        let mut placed = false;
        for (i, &b) in bins.iter().enumerate() {
            if x <= b {
                counts[i] += 1;
                placed = true;
                break;
            }
        }
        if !placed {
            counts[nbins] += 1;
        }
    }
    let out: Vec<Value> = counts
        .into_iter()
        .map(|c| Value::Number(c as f64))
        .collect();
    let rows = (nbins + 1) as u32;
    Value::Array(Arc::new(ArrayData::new(rows, 1, out)))
}

/// MMULT(array1, array2). Matrix product (a×b)·(b×c) → (a×c).
fn fn_mmult(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let a = match arg_to_f64_matrix(&args[0], provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    let b = match arg_to_f64_matrix(&args[1], provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    if a.is_empty() || b.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let ra = a.len();
    let ca = a[0].len();
    let rb = b.len();
    let cb = b[0].len();
    if ca != rb {
        return Value::Error(ValueError::InvalidValue);
    }
    let total = (ra as u64).checked_mul(cb as u64).unwrap_or(u64::MAX);
    if total > DYNAMIC_ARRAY_CELL_CAP {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut data: Vec<Value> = Vec::with_capacity(ra * cb);
    for r in 0..ra {
        for c in 0..cb {
            let mut s = 0.0;
            for k in 0..ca {
                s += a[r][k] * b[k][c];
            }
            if !s.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            data.push(Value::Number(s));
        }
    }
    Value::Array(Arc::new(ArrayData::new(ra as u32, cb as u32, data)))
}

/// MINVERSE(square_array). Inverse via Gauss-Jordan with partial pivoting.
fn fn_minverse(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let m = match arg_to_f64_matrix(&args[0], provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    let n = m.len();
    if n == 0 || m.iter().any(|r| r.len() != n) {
        return Value::Error(ValueError::InvalidValue);
    }
    if n > 100 {
        return Value::Error(ValueError::Overflow);
    }
    let inv = match matrix_inverse_inplace(m) {
        Ok(i) => i,
        Err(e) => return Value::Error(e),
    };
    let mut data: Vec<Value> = Vec::with_capacity(n * n);
    for r in 0..n {
        for c in 0..n {
            data.push(Value::Number(inv[r][c]));
        }
    }
    Value::Array(Arc::new(ArrayData::new(n as u32, n as u32, data)))
}

/// MUNIT(n). Identity matrix of size n×n.
fn fn_munit(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) if n >= 1.0 => n.trunc() as u32,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    if checked_array_len(n as u64, n as u64).is_err() {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut data: Vec<Value> = Vec::with_capacity((n as usize) * (n as usize));
    for r in 0..n {
        for c in 0..n {
            data.push(Value::Number(if r == c { 1.0 } else { 0.0 }));
        }
    }
    Value::Array(Arc::new(ArrayData::new(n, n, data)))
}

/// TRANSPOSE(array). Swap rows and columns. Preserves cell-error /
/// type cells verbatim (no numeric coercion required).
fn fn_transpose(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    if rows == 0 || cols == 0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let total = (rows as u64) * (cols as u64);
    if total > DYNAMIC_ARRAY_CELL_CAP {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut out: Vec<Value> = vec![Value::Null; (rows as usize) * (cols as usize)];
    // Source idx = r * cols + c; dest idx (in cols × rows) = c * rows + r.
    for r in 0..rows as usize {
        for c in 0..cols as usize {
            let src = r * (cols as usize) + c;
            let dst = c * (rows as usize) + r;
            out[dst] = data[src].clone();
        }
    }
    Value::Array(Arc::new(ArrayData::new(cols, rows, out)))
}

/// `PROB(x_range, prob_range, lower_limit, [upper_limit])` — sum probs for
/// x in [lower, upper]. Verify ∑prob_range ≈ 1 (tolerance 1e-9); any prob
/// ≤ 0 or > 1 → #NUM!. PROB_SUM_TOL is loose enough to absorb FP error from
/// summing 10⁴+ probabilities.
fn stat_prob(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.is_empty() {
        return Value::Error(ValueError::Overflow);
    }
    const PROB_SUM_TOL: f64 = 1e-9;
    let mut sum = 0.0_f64;
    for &(_, p) in &pairs {
        if p <= 0.0 || p > 1.0 {
            return Value::Error(ValueError::Overflow);
        }
        sum += p;
    }
    if (sum - 1.0).abs() > PROB_SUM_TOL {
        return Value::Error(ValueError::Overflow);
    }
    let lower = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let upper = if args.len() == 4 {
        match stat_num(&args[3], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        lower
    };
    let (lo, hi) = if lower <= upper {
        (lower, upper)
    } else {
        (upper, lower)
    };
    let mut total = 0.0_f64;
    for &(x, p) in &pairs {
        if x >= lo && x <= hi {
            total += p;
        }
    }
    Value::Number(total)
}

/// GAUSS(x) — `NORM.S.DIST(x, TRUE) - 0.5`.
fn stat_gauss(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(dist.cdf(x) - 0.5)
}

/// PHI(x) — standard normal pdf: `exp(-x²/2) / sqrt(2π)`.
fn stat_phi(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let two_pi = std::f64::consts::TAU; // 2π
    stat_finite((-0.5 * x * x).exp() / two_pi.sqrt())
}

/// Which host-pushed hidden-row sources a SUBTOTAL/AGGREGATE run excludes
/// (`design-filter-hidden-rows` §6.3). Excel's two-layer rule:
///
/// - `SUBTOTAL(1-11)` excludes FILTER-hidden rows but INCLUDES manually
///   hidden ones → [`ExcludeFilter`](Self::ExcludeFilter).
/// - `SUBTOTAL(101-111)` excludes both → [`ExcludeFilterAndManual`].
/// - `AGGREGATE` maps its ignore-hidden option bit (`& 1`, options 1/3/5/7)
///   onto a two-way pick (#32 §6.3, verified on real Excel): bit SET →
///   [`ExcludeFilterAndManual`] (drops BOTH sets), bit CLEAR →
///   [`IncludeAll`](Self::IncludeAll), which touches no provider hook and
///   therefore registers no epoch edge. AGGREGATE never uses the
///   [`ExcludeFilter`](Self::ExcludeFilter) filter-only tier — that is the
///   `SUBTOTAL(1-11)`-only middle case.
///
/// [`ExcludeFilterAndManual`]: Self::ExcludeFilterAndManual
#[derive(Clone, Copy, PartialEq, Eq)]
enum SubtotalHiddenPolicy {
    IncludeAll,
    ExcludeFilter,
    ExcludeFilterAndManual,
}

/// The (up to two) hidden-row sets a single SUBTOTAL data argument must
/// exclude. Kept as two independent `Option<Rc<..>>` handles rather than a
/// merged set: building a union would cost a `HashSet` allocation per
/// argument and destroy the source distinction the two-layer rule needs
/// (`design-filter-hidden-rows` §6.3 — "do not construct a union").
#[derive(Default)]
struct SubtotalHiddenSets {
    filter: Option<Rc<HashSet<u32>>>,
    manual: Option<Rc<HashSet<u32>>>,
}

impl SubtotalHiddenSets {
    /// Streaming membership test across both sets — two hash probes, no
    /// intermediate allocation. A row present in both is simply skipped once.
    fn contains(&self, row: u32) -> bool {
        self.filter.as_ref().is_some_and(|h| h.contains(&row))
            || self.manual.as_ref().is_some_and(|h| h.contains(&row))
    }

    fn is_empty(&self) -> bool {
        self.filter.is_none() && self.manual.is_none()
    }
}

/// Hidden-row sets a single SUBTOTAL data argument must exclude (design doc
/// #32 §6.2 + `design-filter-hidden-rows` §6.3). Resolves the argument's
/// referenced sheet ONCE: a cross-sheet ref (`Sheet2!A1:A10`, a cross-sheet
/// `Table`) consults the referenced sheet's sets; a bare ref consults the
/// current sheet.
///
/// The provider hooks are called SELECTIVELY, because calling one is what
/// registers its invalidation epoch edge:
/// - `ExcludeFilter` (1-11) reads only `filter_hidden_rows`, so a manual
///   hide/unhide never dirties a 1-11 formula.
/// - `ExcludeFilterAndManual` (101-111) reads both.
/// - `IncludeAll` reads neither and holds no edge at all.
fn subtotal_hidden_for_arg(
    arg: &Expr,
    provider: &dyn EvalProvider,
    policy: SubtotalHiddenPolicy,
) -> SubtotalHiddenSets {
    if policy == SubtotalHiddenPolicy::IncludeAll {
        return SubtotalHiddenSets::default();
    }
    let sheet_index = match runtime_ref_from_expr(arg, provider) {
        Ok(r) => match r.sheet {
            Some(name) => provider.sheet_index_of(&name),
            None => provider.current_sheet_index(),
        },
        // A scalar / literal arg has no cell rows to hide — fall back to the
        // current sheet; `for_each_arg_value` yields `addr == None` for it so
        // no row is ever filtered regardless.
        Err(_) => provider.current_sheet_index(),
    };
    SubtotalHiddenSets {
        filter: provider.filter_hidden_rows(sheet_index),
        manual: match policy {
            SubtotalHiddenPolicy::ExcludeFilterAndManual => provider.hidden_rows(sheet_index),
            _ => None,
        },
    }
}

/// Stream one SUBTOTAL data argument through `for_each_arg_value`, dropping
/// any cell whose row is in either hidden set. Delegates to the shared
/// streaming path so materialization / cross-sheet / spill semantics stay
/// byte-for-byte identical to the unfiltered case; only the row filter is
/// layered on top. The callback is value-only because every SUBTOTAL
/// accumulator ignores the address.
fn for_each_subtotal_value(
    arg: &Expr,
    provider: &dyn EvalProvider,
    hidden: &SubtotalHiddenSets,
    f: &mut dyn FnMut(Value),
) {
    for_each_arg_value(arg, provider, &mut |addr, v| {
        if !hidden.is_empty() {
            if let Some(addr) = addr {
                if hidden.contains(addr.row) {
                    return;
                }
            }
        }
        f(v);
    });
}

/// Shared body for SUBTOTAL function_num ∈ 1..=11. Walks every
/// `data_args` element via `for_each_subtotal_value` so streaming numeric
/// accumulators match the standalone SUM/AVERAGE/etc. arms. `policy` selects
/// which host-pushed hidden-row sources each argument excludes — see
/// [`SubtotalHiddenPolicy`]; the accumulator logic itself is identical across
/// all three policies.
fn run_subtotal(
    fn_num: u32,
    data_args: &[Expr],
    provider: &dyn EvalProvider,
    policy: SubtotalHiddenPolicy,
) -> Value {
    match fn_num {
        // 1: AVERAGE
        1 => {
            let mut total = 0.0_f64;
            let mut count = 0u64;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            total += n;
                            count += 1;
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if count == 0 {
                Value::Error(ValueError::DivisionByZero)
            } else {
                Value::Number(total / count as f64)
            }
        }
        // 2: COUNT (numerics only)
        2 => {
            let mut count = 0u64;
            for arg in data_args {
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if matches!(v, Value::Number(_)) {
                        count += 1;
                    }
                });
            }
            Value::Number(count as f64)
        }
        // 3: COUNTA (non-null)
        3 => {
            let mut count = 0u64;
            for arg in data_args {
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if !matches!(v, Value::Null) {
                        count += 1;
                    }
                });
            }
            Value::Number(count as f64)
        }
        // 4: MAX
        4 => {
            let mut max: Option<f64> = None;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            max = Some(max.map_or(n, |m: f64| m.max(n)));
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                return Value::Error(e);
            }
            max.map_or(Value::Number(0.0), Value::Number)
        }
        // 5: MIN
        5 => {
            let mut min: Option<f64> = None;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            min = Some(min.map_or(n, |m: f64| m.min(n)));
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                return Value::Error(e);
            }
            min.map_or(Value::Number(0.0), Value::Number)
        }
        // 6: PRODUCT
        6 => {
            let mut product = 1.0_f64;
            let mut saw_number = false;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            product *= n;
                            saw_number = true;
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_number {
                Value::Number(0.0)
            } else {
                Value::Number(product)
            }
        }
        // 7: STDEV / 8: STDEVP / 10: VAR / 11: VARP
        7 | 8 | 10 | 11 => {
            // Inline the numeric collection (rather than `collect_numbers`) so
            // the hidden-row exclusion layers onto the same streaming path;
            // `IncludeAll` collects everything, exactly as before.
            let mut nums = Vec::new();
            for arg in data_args {
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if let Value::Number(n) = v {
                        nums.push(n);
                    }
                });
            }
            let is_sample = matches!(fn_num, 7 | 10);
            let min_n = if is_sample { 2 } else { 1 };
            if nums.len() < min_n {
                return Value::Error(ValueError::DivisionByZero);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let denom = if is_sample {
                (nums.len() - 1) as f64
            } else {
                nums.len() as f64
            };
            let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / denom;
            let is_stdev = matches!(fn_num, 7 | 8);
            Value::Number(if is_stdev { var.sqrt() } else { var })
        }
        // 9: SUM
        9 => {
            let mut total = 0.0_f64;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => total += n,
                        _ => {}
                    }
                });
            }
            match err {
                Some(e) => Value::Error(e),
                None => Value::Number(total),
            }
        }
        _ => Value::Error(ValueError::InvalidValue),
    }
}

/// SUBTOTAL(function_num, ref1, [ref2…]).
fn fn_subtotal(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let f_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = f_v {
        return Value::Error(e);
    }
    let fn_raw = match coerce_to_number(&f_v) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    if !fn_raw.is_finite() {
        return Value::Error(ValueError::InvalidValue);
    }
    let fn_int = fn_raw.trunc() as i64;
    // Excel's two-layer rule (`design-filter-hidden-rows` §2/§6.3): BOTH
    // layers exclude the host's FILTER-hidden rows; only 101-111 additionally
    // exclude MANUALLY hidden rows. Both sets are read purely as evaluation
    // input — the engine models no hidden state and never infers a row's
    // source.
    let (fn_norm, policy) = if (1..=11).contains(&fn_int) {
        (fn_int as u32, SubtotalHiddenPolicy::ExcludeFilter)
    } else if (101..=111).contains(&fn_int) {
        (
            (fn_int - 100) as u32,
            SubtotalHiddenPolicy::ExcludeFilterAndManual,
        )
    } else {
        return Value::Error(ValueError::InvalidValue);
    };
    run_subtotal(fn_norm, &args[1..], provider, policy)
}

/// AGGREGATE(function_num, options, ref1, [ref2…]).
fn fn_aggregate(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let f_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = f_v {
        return Value::Error(e);
    }
    let fn_int = match coerce_to_number(&f_v) {
        Some(n) if n.is_finite() => n.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    if !(1..=19).contains(&fn_int) {
        return Value::Error(ValueError::InvalidValue);
    }
    let opt_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = opt_v {
        return Value::Error(e);
    }
    let options = match coerce_to_number(&opt_v) {
        Some(n) if n.is_finite() => n.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    if !(0..=7).contains(&options) {
        return Value::Error(ValueError::InvalidValue);
    }
    // Microsoft's AGGREGATE `options` bit map (official docs, verified
    // 2026-07-22): bit 0 (`& 1`) = ignore hidden rows {1,3,5,7}; bit 1
    // (`& 2`) = ignore error values {2,3,6,7}; bit 2 (`& 4`) governs nested
    // SUBTOTAL/AGGREGATE inclusion, NOT errors. Ignore-errors is therefore
    // `& 2` — `& 4` would have been the nested-function bit and mis-mapped
    // options 2/3 (silently NOT ignoring) and 4/5 (wrongly ignoring).
    let ignore_errors = (options & 2) != 0;
    // AGGREGATE's ignore-hidden bit (`& 1`, options 1/3/5/7) is a UNIFIED
    // switch over BOTH the manually-hidden AND the filter-hidden set —
    // verified against real Excel (#32 §6.3): with the bit SET a manual hide
    // and a filter hide are BOTH dropped; with it CLEAR BOTH are kept (even
    // filter-hidden rows still count). Unlike SUBTOTAL there is no "filter
    // only" tier here, so this is a straight two-way pick.
    // `subtotal_hidden_for_arg` touches the provider hidden hooks ONLY under
    // `ExcludeFilterAndManual`, so the two hidden epoch edges register exactly
    // when the bit is set and never when it is clear.
    let hidden_policy = if (options & 1) != 0 {
        SubtotalHiddenPolicy::ExcludeFilterAndManual
    } else {
        SubtotalHiddenPolicy::IncludeAll
    };

    let (data_args, k_arg): (&[Expr], Option<&Expr>) = if (14..=19).contains(&fn_int) {
        if args.len() < 4 {
            return Value::Error(ValueError::WrongArgCount);
        }
        let split = args.len() - 1;
        (&args[2..split], Some(&args[split]))
    } else {
        (&args[2..], None)
    };

    // Numeric collection shared by the ignore-errors 1-11 arms and every
    // k-arg / MEDIAN / MODE arm below. Hidden-row exclusion rides the same
    // per-argument `subtotal_hidden_for_arg` seam SUBTOTAL uses, so the
    // `options & 1` bit is honoured here identically to the `run_subtotal`
    // path (empty sets under `IncludeAll` => no filtering, no epoch edge).
    let collect_nums_skip_errors = |args_inner: &[Expr]| -> Result<Vec<f64>, ValueError> {
        let mut out = Vec::new();
        let mut err: Option<ValueError> = None;
        for arg in args_inner {
            if err.is_some() {
                break;
            }
            let hidden = subtotal_hidden_for_arg(arg, provider, hidden_policy);
            for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                if err.is_some() {
                    return;
                }
                match v {
                    Value::Error(_) if ignore_errors => {}
                    Value::Error(e) => err = Some(e),
                    Value::Number(n) => out.push(n),
                    _ => {}
                }
            });
        }
        if let Some(e) = err {
            Err(e)
        } else {
            Ok(out)
        }
    };

    match fn_int {
        1..=11 => {
            if !ignore_errors {
                // Errors propagate (bit `& 2` clear) => reuse the streaming
                // SUBTOTAL body, now with the ignore-hidden bit mapped onto its
                // policy. `IncludeAll` keeps every row and registers no epoch
                // edge; `ExcludeFilterAndManual` drops both hidden sets and
                // registers both edges (#32 §6.3).
                return run_subtotal(fn_int as u32, data_args, provider, hidden_policy);
            }
            let nums = match collect_nums_skip_errors(data_args) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            match fn_int {
                1 => {
                    if nums.is_empty() {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    Value::Number(nums.iter().sum::<f64>() / nums.len() as f64)
                }
                2 => Value::Number(nums.len() as f64),
                3 => {
                    // COUNTA under the ignore-errors path: same per-argument
                    // hidden filter as the numeric collector so `options & 1`
                    // drops hidden rows from the non-null count too.
                    let mut count = 0u64;
                    for arg in data_args {
                        let hidden = subtotal_hidden_for_arg(arg, provider, hidden_policy);
                        for_each_subtotal_value(arg, provider, &hidden, &mut |v| match v {
                            Value::Error(_) => {}
                            Value::Null => {}
                            _ => count += 1,
                        });
                    }
                    Value::Number(count as f64)
                }
                4 => nums
                    .iter()
                    .copied()
                    .fold(None::<f64>, |acc, n| Some(acc.map_or(n, |m| m.max(n))))
                    .map_or(Value::Number(0.0), Value::Number),
                5 => nums
                    .iter()
                    .copied()
                    .fold(None::<f64>, |acc, n| Some(acc.map_or(n, |m| m.min(n))))
                    .map_or(Value::Number(0.0), Value::Number),
                6 => {
                    if nums.is_empty() {
                        Value::Number(0.0)
                    } else {
                        Value::Number(nums.iter().product())
                    }
                }
                7 | 8 | 10 | 11 => {
                    let is_sample = matches!(fn_int, 7 | 10);
                    let min_n = if is_sample { 2 } else { 1 };
                    if nums.len() < min_n {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let mean = nums.iter().sum::<f64>() / nums.len() as f64;
                    let denom = if is_sample {
                        (nums.len() - 1) as f64
                    } else {
                        nums.len() as f64
                    };
                    let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / denom;
                    let is_stdev = matches!(fn_int, 7 | 8);
                    Value::Number(if is_stdev { var.sqrt() } else { var })
                }
                9 => Value::Number(nums.iter().sum::<f64>()),
                _ => Value::Error(ValueError::InvalidValue),
            }
        }
        12 => {
            let mut nums = match collect_nums_skip_errors(data_args) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let n = nums.len();
            let mid = if n % 2 == 1 {
                nums[n / 2]
            } else {
                (nums[n / 2 - 1] + nums[n / 2]) / 2.0
            };
            Value::Number(mid)
        }
        13 => {
            let nums = match collect_nums_skip_errors(data_args) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut best_val = nums[0];
            let mut best_count = 0usize;
            for (i, &v) in nums.iter().enumerate() {
                let mut c = 1usize;
                for &w in &nums[i + 1..] {
                    if w == v {
                        c += 1;
                    }
                }
                if c > best_count {
                    best_count = c;
                    best_val = v;
                }
            }
            if best_count <= 1 {
                Value::Error(ValueError::InvalidValue)
            } else {
                Value::Number(best_val)
            }
        }
        14 | 15 => {
            let mut nums = match collect_nums_skip_errors(data_args) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            let k_e = k_arg.expect("LARGE/SMALL require k arg");
            let k_v = eval_expr_with_provider(k_e, provider);
            if let Value::Error(e) = k_v {
                return Value::Error(e);
            }
            let k = match coerce_to_number(&k_v) {
                Some(n) if n >= 1.0 => n as usize,
                _ => return Value::Error(ValueError::WrongType),
            };
            if k > nums.len() {
                return Value::Error(ValueError::InvalidValue);
            }
            if fn_int == 14 {
                nums.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
            } else {
                nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            }
            Value::Number(nums[k - 1])
        }
        16 | 18 => {
            let k_e = k_arg.expect("PERCENTILE requires k arg");
            let k_v = eval_expr_with_provider(k_e, provider);
            if let Value::Error(e) = k_v {
                return Value::Error(e);
            }
            let k = match coerce_to_number(&k_v) {
                Some(n) => n,
                _ => return Value::Error(ValueError::WrongType),
            };
            let nums = match collect_nums_skip_errors(data_args) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut sorted = nums;
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            if fn_int == 16 {
                if !k.is_finite() || !(0.0..=1.0).contains(&k) {
                    return Value::Error(ValueError::InvalidValue);
                }
                let n = sorted.len();
                let pos = k * (n as f64 - 1.0);
                let lo = pos.floor() as usize;
                let hi = pos.ceil() as usize;
                if lo == hi {
                    Value::Number(sorted[lo])
                } else {
                    let frac = pos - lo as f64;
                    Value::Number(sorted[lo] + (sorted[hi] - sorted[lo]) * frac)
                }
            } else {
                if !k.is_finite() || k <= 0.0 || k >= 1.0 {
                    return Value::Error(ValueError::InvalidValue);
                }
                let n = sorted.len();
                let pos = k * (n as f64 + 1.0);
                if pos < 1.0 || pos > n as f64 {
                    return Value::Error(ValueError::InvalidValue);
                }
                let zero_based = pos - 1.0;
                let lo = zero_based.floor() as usize;
                let hi = zero_based.ceil() as usize;
                if lo == hi {
                    Value::Number(sorted[lo])
                } else {
                    let frac = zero_based - lo as f64;
                    Value::Number(sorted[lo] + (sorted[hi] - sorted[lo]) * frac)
                }
            }
        }
        17 | 19 => {
            let k_e = k_arg.expect("QUARTILE requires k arg");
            let k_v = eval_expr_with_provider(k_e, provider);
            if let Value::Error(e) = k_v {
                return Value::Error(e);
            }
            let q = match coerce_to_number(&k_v) {
                Some(n) if n.is_finite() && n.trunc() == n => n as i64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            if fn_int == 17 {
                if !(0..=4).contains(&q) {
                    return Value::Error(ValueError::InvalidValue);
                }
            } else if !(1..=3).contains(&q) {
                return Value::Error(ValueError::InvalidValue);
            }
            let nums = match collect_nums_skip_errors(data_args) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut sorted = nums;
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let k_frac = q as f64 / 4.0;
            if fn_int == 17 {
                let n = sorted.len();
                let pos = k_frac * (n as f64 - 1.0);
                let lo = pos.floor() as usize;
                let hi = pos.ceil() as usize;
                if lo == hi {
                    Value::Number(sorted[lo])
                } else {
                    let frac = pos - lo as f64;
                    Value::Number(sorted[lo] + (sorted[hi] - sorted[lo]) * frac)
                }
            } else {
                let n = sorted.len();
                let pos = k_frac * (n as f64 + 1.0);
                if pos < 1.0 || pos > n as f64 {
                    return Value::Error(ValueError::InvalidValue);
                }
                let zero_based = pos - 1.0;
                let lo = zero_based.floor() as usize;
                let hi = zero_based.ceil() as usize;
                if lo == hi {
                    Value::Number(sorted[lo])
                } else {
                    let frac = zero_based - lo as f64;
                    Value::Number(sorted[lo] + (sorted[hi] - sorted[lo]) * frac)
                }
            }
        }
        _ => Value::Error(ValueError::InvalidValue),
    }
}

/// EVEN(n) — round AWAY from zero to the nearest even integer.
fn fn_even(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    if n == 0.0 {
        return Value::Number(0.0);
    }
    let sign = if n < 0.0 { -1.0 } else { 1.0 };
    let absn = n.abs();
    let mut rounded = absn.ceil();
    if (rounded as i64) % 2 != 0 {
        rounded += 1.0;
    }
    Value::Number(sign * rounded)
}

/// FACTDOUBLE(n) — double factorial: n · (n-2) · (n-4) · … down to 2 or 1.
fn fn_factdouble(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) if n.is_finite() => n.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    if n < 0 {
        return Value::Error(ValueError::Overflow);
    }
    if n == 0 || n == 1 {
        return Value::Number(1.0);
    }
    if n > 300 {
        return Value::Error(ValueError::Overflow);
    }
    let mut acc = 1.0_f64;
    let mut k = n;
    while k >= 2 {
        acc *= k as f64;
        if !acc.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        k -= 2;
    }
    Value::Number(acc)
}

/// COMBINA(n, k) — combinations with repetition = C(n + k - 1, k).
fn fn_combina(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let kv = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = kv {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&nv) {
        Some(x) if x.is_finite() => x.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    let k = match coerce_to_number(&kv) {
        Some(x) if x.is_finite() => x.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    if n < 0 || k < 0 {
        return Value::Error(ValueError::Overflow);
    }
    if n == 0 && k == 0 {
        return Value::Number(1.0);
    }
    let top = (n + k - 1) as u64;
    let mut pick = k as u64;
    if top.saturating_sub(pick) < pick {
        pick = top - pick;
    }
    let mut acc = 1.0_f64;
    for i in 1..=pick {
        acc = acc * (top - i + 1) as f64 / i as f64;
        if !acc.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
    }
    Value::Number(acc.round())
}

/// MULTINOMIAL(n1, n2, …).
fn fn_multinomial(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() {
        return Value::Error(ValueError::WrongArgCount);
    }
    let mut nums: Vec<u64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for arg in args {
        if err.is_some() {
            break;
        }
        for_each_arg_value(arg, provider, &mut |_addr, v| {
            if err.is_some() {
                return;
            }
            match v {
                Value::Error(e) => err = Some(e),
                Value::Null => {}
                other => match coerce_to_number(&other) {
                    Some(n) if n.is_finite() && n.trunc() >= 0.0 => {
                        nums.push(n.trunc() as u64);
                    }
                    _ => err = Some(ValueError::WrongType),
                },
            }
        });
    }
    if let Some(e) = err {
        return Value::Error(e);
    }
    if nums.is_empty() {
        return Value::Error(ValueError::WrongArgCount);
    }
    let total: u64 = nums.iter().sum();
    let fact = |k: u64| -> Option<f64> {
        if k > 170 {
            return None;
        }
        let mut acc = 1.0_f64;
        for i in 2..=k {
            acc *= i as f64;
            if !acc.is_finite() {
                return None;
            }
        }
        Some(acc)
    };
    let num = match fact(total) {
        Some(x) => x,
        None => return Value::Error(ValueError::Overflow),
    };
    let mut den = 1.0_f64;
    for n in &nums {
        let f = match fact(*n) {
            Some(x) => x,
            None => return Value::Error(ValueError::Overflow),
        };
        den *= f;
        if !den.is_finite() || den == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
    }
    let r = num / den;
    if !r.is_finite() {
        Value::Error(ValueError::Overflow)
    } else {
        Value::Number(r.round())
    }
}

/// SERIESSUM(x, n, m, coefs).
fn fn_seriessum(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let xv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = xv {
        return Value::Error(e);
    }
    let nv = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let mv = eval_expr_with_provider(&args[2], provider);
    if let Value::Error(e) = mv {
        return Value::Error(e);
    }
    let x = match coerce_to_number(&xv) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    let n_init = match coerce_to_number(&nv) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    let m_step = match coerce_to_number(&mv) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    // 系数按区域内的**绝对位置**入座，第 i 项的指数是 `n + i*m`。老写法用
    // `push` 排队，稀疏 provider 不发空格，于是 `A1=1 / A2 空 / A3=1` 里的
    // A3 会坐到 i=1（指数 n+m）而不是 i=2 —— 同一份系数写成数组字面量
    // `{1,0,1}` 答案却是对的，两种形态自相矛盾。TS 参考引擎（数组恒稠密）
    // 把空格当 0 且占位，这里对齐它。
    let mut coefs: Vec<f64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for_each_arg_value_positioned(&args[3], provider, &mut |pos, v| {
        if err.is_some() {
            return;
        }
        let coef = match v {
            Value::Error(e) => {
                err = Some(e);
                return;
            }
            Value::Null => 0.0,
            other => match coerce_to_number(&other) {
                Some(n) => n,
                None => {
                    err = Some(ValueError::WrongType);
                    return;
                }
            },
        };
        // 空洞用 0 补齐；上限沿用动态数组那道闸门，免得 `SERIESSUM(x,n,m,A:A)`
        // 里一个孤零零的末行系数逼出一整列的 Vec。
        if pos > DYNAMIC_ARRAY_CELL_CAP {
            err = Some(ValueError::InvalidValue);
            return;
        }
        let idx = (pos - 1) as usize;
        if coefs.len() <= idx {
            coefs.resize(idx + 1, 0.0);
        }
        coefs[idx] = coef;
    });
    if let Some(e) = err {
        return Value::Error(e);
    }
    if coefs.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut total = 0.0_f64;
    for (i, c) in coefs.iter().enumerate() {
        let exponent = n_init + (i as f64) * m_step;
        let term = c * x.powf(exponent);
        if !term.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        total += term;
    }
    if total.is_finite() {
        Value::Number(total)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

/// ERROR.TYPE(error_value) — map ValueError to Excel-style numeric tags.
fn fn_error_type(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    match v {
        Value::Error(ValueError::DivisionByZero) => Value::Number(2.0),
        Value::Error(ValueError::Null) => Value::Number(1.0),
        Value::Error(ValueError::NotAvailable) => Value::Number(7.0),
        Value::Error(ValueError::InvalidValue) => Value::Number(3.0),
        Value::Error(ValueError::InvalidRef) => Value::Number(4.0),
        Value::Error(ValueError::InvalidName) => Value::Number(5.0),
        Value::Error(ValueError::Overflow) => Value::Number(6.0),
        Value::Error(ValueError::CyclicRef) => Value::Number(4.0),
        Value::Error(ValueError::WrongType) => Value::Number(3.0),
        Value::Error(ValueError::WrongArgCount) => Value::Number(3.0),
        Value::Error(ValueError::Spill) => Value::Number(9.0),
        Value::Error(ValueError::Calc) => Value::Number(14.0),
        _ => Value::Error(ValueError::NotAvailable),
    }
}

/// Format an absolute-value number with thousands separators and the
/// requested fractional precision. Used by DOLLAR and FIXED. `decimals`
/// may be negative (round to the left of the decimal point).
fn format_thousands(value: f64, decimals: i64, use_commas: bool) -> String {
    let abs = value.abs();
    if decimals < 0 {
        let factor = 10f64.powi((-decimals) as i32);
        let rounded = (abs / factor).round() * factor;
        let whole = rounded as u64;
        let whole_s = whole.to_string();
        if use_commas {
            return insert_commas(&whole_s);
        }
        return whole_s;
    }
    let dec = decimals.min(15) as usize;
    let formatted = format!("{:.*}", dec, abs);
    let (whole, frac) = match formatted.find('.') {
        Some(i) => (&formatted[..i], Some(&formatted[i + 1..])),
        None => (formatted.as_str(), None),
    };
    let whole_out = if use_commas {
        insert_commas(whole)
    } else {
        whole.to_string()
    };
    match frac {
        Some(f) if !f.is_empty() => format!("{}.{}", whole_out, f),
        _ => whole_out,
    }
}

fn insert_commas(digits: &str) -> String {
    let bytes = digits.as_bytes();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    let len = bytes.len();
    for (i, &b) in bytes.iter().enumerate() {
        if i > 0 && (len - i) % 3 == 0 {
            out.push(',');
        }
        out.push(b as char);
    }
    out
}

/// DOLLAR(number, [decimals=2]).
fn fn_dollar(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&nv) {
        Some(x) if x.is_finite() => x,
        _ => return Value::Error(ValueError::WrongType),
    };
    let decimals: i64 = if args.len() == 2 {
        let dv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = dv {
            return Value::Error(e);
        }
        match coerce_to_number(&dv) {
            Some(x) if x.is_finite() => x.trunc() as i64,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        2
    };
    let body = format_thousands(n, decimals, true);
    let result = if n < 0.0 {
        format!("(${})", body)
    } else {
        format!("${}", body)
    };
    Value::Text(result)
}

/// FIXED(number, [decimals=2], [no_commas=FALSE]).
fn fn_fixed(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&nv) {
        Some(x) if x.is_finite() => x,
        _ => return Value::Error(ValueError::WrongType),
    };
    let decimals: i64 = if args.len() >= 2 {
        let dv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = dv {
            return Value::Error(e);
        }
        match coerce_to_number(&dv) {
            Some(x) if x.is_finite() => x.trunc() as i64,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        2
    };
    let no_commas: bool = if args.len() == 3 {
        let bv = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = bv {
            return Value::Error(e);
        }
        coerce_to_bool(&bv).unwrap_or(false)
    } else {
        false
    };
    let body = format_thousands(n, decimals, !no_commas);
    let result = if n < 0.0 { format!("-{}", body) } else { body };
    Value::Text(result)
}

/// ODD(number) — round AWAY from zero to nearest odd integer.
fn fn_odd(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    if n == 0.0 {
        return Value::Number(1.0);
    }
    let sign = if n < 0.0 { -1.0 } else { 1.0 };
    let absn = n.abs();
    let mut rounded = absn.ceil();
    if (rounded as i64) % 2 == 0 {
        rounded += 1.0;
    }
    Value::Number(sign * rounded)
}

/// EXPAND(array, rows, [cols], [pad_with=#N/A]).
fn fn_expand(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    if rows == 0 || cols == 0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let new_rows = {
        let v = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) if n.is_finite() && n.trunc() >= 1.0 => n.trunc() as u32,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    };
    let new_cols = if args.len() >= 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) if n.is_finite() && n.trunc() >= 1.0 => n.trunc() as u32,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        cols
    };
    let pad = if args.len() == 4 {
        eval_expr_with_provider(&args[3], provider)
    } else {
        Value::Error(ValueError::NotAvailable)
    };
    if new_rows < rows || new_cols < cols {
        return Value::Error(ValueError::InvalidValue);
    }
    // 格数闸门。EXPAND 的输出尺寸**只由两个标量实参决定**，与输入数组无关 ——
    // 少了这一道，`=EXPAND(1,4294967295,4294967295)` 直接把 `Vec::with_capacity`
    // 顶到 capacity overflow（panic，不是错误值），在 WASM 里就是一条公式打死
    // worker。口径与 SEQUENCE / MAKEARRAY / TAKE 等同一个 `checked_array_len`。
    let cap = match checked_array_len(new_rows as u64, new_cols as u64) {
        Ok(cap) => cap,
        Err(e) => return Value::Error(e),
    };
    let mut out: Vec<Value> = Vec::with_capacity(cap);
    for r in 0..new_rows {
        for c in 0..new_cols {
            if r < rows && c < cols {
                out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
            } else {
                out.push(pad.clone());
            }
        }
    }
    Value::Array(Arc::new(ArrayData::new(new_rows, new_cols, out)))
}

/// XMATCH(needle, lookup_array, [match_mode=0], [search_mode=1]).
fn fn_xmatch(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let needle = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = needle {
        return Value::Error(e);
    }
    let match_mode: i32 = if args.len() >= 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) if n.is_finite() => n as i32,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        0
    };
    if !matches!(match_mode, -1 | 0 | 1 | 2) {
        return Value::Error(ValueError::InvalidValue);
    }
    let search_mode: i32 = if args.len() == 4 {
        let v = eval_expr_with_provider(&args[3], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) if n.is_finite() => n as i32,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        1
    };
    if !matches!(search_mode, -2 | -1 | 1 | 2) {
        return Value::Error(ValueError::InvalidValue);
    }
    // `items` 与 `positions` 一一对应：前者是**发出来的**格子（稀疏 provider
    // 会跳过空格），后者是每个格子在区域内的**绝对位置**。返回值取
    // `positions[i]` 而不是 `i + 1` —— 否则空格不占位，`A1=1 / A2 空 / A3=3`
    // 时 `XMATCH(3,A1:A3)` 会答 2 而不是 Excel 的 3。与 `MATCH` 同一根因。
    //
    // 只压缩不补齐（而不是把区域摊平成稠密数组）是刻意的：`XMATCH(x, A:A)`
    // 的稠密形态是 1,048,576 个槽，代价与这个函数的稀疏遍历初衷相反。
    let mut items: Vec<Value> = Vec::new();
    let mut positions: Vec<u64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for_each_arg_value_positioned(&args[1], provider, &mut |pos, v| {
        if err.is_some() {
            return;
        }
        if let Value::Error(e) = &v {
            err = Some(e.clone());
            return;
        }
        items.push(v);
        positions.push(pos);
    });
    if let Some(e) = err {
        return Value::Error(e);
    }
    if items.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let wildcard_pattern: Option<String> = match (&needle, match_mode) {
        (Value::Text(p), 2) => Some(p.clone()),
        (Value::Text(p), 0) if pattern_has_wildcard(p) => Some(p.clone()),
        _ => None,
    };
    let test_exact = |v: &Value| -> bool {
        match &wildcard_pattern {
            Some(p) => wildcard_match(p, &coerce_to_text(v)),
            None => values_equal(v, &needle),
        }
    };

    if matches!(search_mode, 2 | -2) {
        if wildcard_pattern.is_some() {
            return Value::Error(ValueError::InvalidValue);
        }
        let n = items.len();
        let mut lo = 0usize;
        let mut hi = n;
        let ascending = search_mode == 2;
        while lo < hi {
            let mid = (lo + hi) / 2;
            let ord = compare_lookup(&items[mid], &needle);
            if ord == std::cmp::Ordering::Equal {
                return Value::Number(positions[mid] as f64);
            }
            let go_right = if ascending {
                ord == std::cmp::Ordering::Less
            } else {
                ord == std::cmp::Ordering::Greater
            };
            if go_right {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        if match_mode == 0 || match_mode == 2 {
            return Value::Error(ValueError::NotAvailable);
        }
    }

    let n = items.len();
    let order: Box<dyn Iterator<Item = usize>> = if search_mode == -1 {
        Box::new((0..n).rev())
    } else {
        Box::new(0..n)
    };
    let mut best: Option<usize> = None;
    let mut best_diff: Option<f64> = None;
    let needle_num = coerce_to_number(&needle);
    for i in order {
        let v = &items[i];
        if test_exact(v) {
            return Value::Number(positions[i] as f64);
        }
        if matches!(match_mode, -1 | 1) {
            if let (Some(needle_n), Some(item_n)) = (needle_num, coerce_to_number(v)) {
                if match_mode == -1 && item_n <= needle_n {
                    let diff = needle_n - item_n;
                    if best_diff.map_or(true, |bd| diff < bd) {
                        best = Some(i);
                        best_diff = Some(diff);
                    }
                } else if match_mode == 1 && item_n >= needle_n {
                    let diff = item_n - needle_n;
                    if best_diff.map_or(true, |bd| diff < bd) {
                        best = Some(i);
                        best_diff = Some(diff);
                    }
                }
            }
        }
    }
    match best {
        Some(i) => Value::Number(positions[i] as f64),
        None => Value::Error(ValueError::NotAvailable),
    }
}

// === T-batch cleanup helpers (Q1 2026) ===
//
// CONFIDENCE.T half-width: `T.INV.2T(alpha, size - 1) * stdev / sqrt(size)`.
// Validation mirrors CONFIDENCE.NORM: 0 < alpha < 1, stdev > 0, size ≥ 2
// (size = 1 would give zero degrees of freedom).
fn stat_confidence_t(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let alpha = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let stdev = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let size = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(alpha > 0.0 && alpha < 1.0) || !(stdev > 0.0) || size < 2.0 {
        return Value::Error(ValueError::Overflow);
    }
    let n_int = size.trunc();
    let df = n_int - 1.0;
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Two-tail inverse: P(|T| > t) = alpha  →  P(T > t) = alpha/2.
    let t_crit = dist.inverse_cdf(1.0 - alpha / 2.0);
    stat_finite(t_crit * stdev / n_int.sqrt())
}

// BINOM.DIST.RANGE(trials, prob, lower[, upper]).
// Validation: integer trials ≥ 0, 0 ≤ prob ≤ 1, 0 ≤ lower ≤ trials and
// (if present) lower ≤ upper ≤ trials. Bounds are truncated to integers.
fn stat_binom_dist_range(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Binomial, Discrete};
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let trials = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let p = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let lower = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let upper = if args.len() == 4 {
        match stat_num(&args[3], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        lower
    };
    if !(p >= 0.0 && p <= 1.0) || trials < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let trials_i = trials.trunc() as i64;
    let lower_i = lower.trunc() as i64;
    let upper_i = upper.trunc() as i64;
    if lower_i < 0 || upper_i < lower_i || upper_i > trials_i {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Binomial::new(p, trials_i as u64) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let mut acc = 0.0_f64;
    for k in lower_i..=upper_i {
        acc += dist.pmf(k as u64);
    }
    stat_finite(acc)
}

// PERMUT(n, k) — `n! / (n - k)!`. Inputs truncated; negatives or k > n
// give #NUM!. Cap at n = 170 to avoid f64 overflow (170! is the
// largest representable factorial in f64).
fn stat_permut(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let n_f = match stat_num(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let k_f = match stat_num(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let n = n_f.trunc();
    let k = k_f.trunc();
    if n < 0.0 || k < 0.0 || k > n {
        return Value::Error(ValueError::Overflow);
    }
    let n_i = n as u64;
    let k_i = k as u64;
    let mut acc = 1.0_f64;
    // Product of the top k descending integers: n * (n-1) * … * (n-k+1).
    for i in 0..k_i {
        acc *= (n_i - i) as f64;
        if !acc.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
    }
    Value::Number(acc)
}

// PERMUTATIONA(n, k) — `n^k` (permutations with repetition).
fn stat_permutationa(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let n_f = match stat_num(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let k_f = match stat_num(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let n = n_f.trunc();
    let k = k_f.trunc();
    if n < 0.0 || k < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    // Special case 0^0 = 1 (Excel parity).
    if n == 0.0 && k == 0.0 {
        return Value::Number(1.0);
    }
    let r = n.powf(k);
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

// DAYS360(start_date, end_date[, method]) — 30/360 day-count.
// method=FALSE (default) → US (NASD) form (basis 0).
// method=TRUE → European form (basis 4).
// Internally we apply the same `(y2-y1)*360 + (m2-m1)*30 + (d2-d1)`
// formula as `yearfrac_basis`, but multiply by 360 (skip the divide).
// The US form clamps `d1 = min(d1, 30)` then if `d1 = 30` clamps
// `d2 = min(d2, 30)` (Excel's NASD30/360 quirk). The European form
// clamps both ends unconditionally.
fn date_days360(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let start = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let end = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let european = if args.len() == 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_bool(&v) {
            Some(b) => b,
            None => match coerce_to_number(&v) {
                Some(n) => n != 0.0,
                None => return Value::Error(ValueError::WrongType),
            },
        }
    } else {
        false
    };
    // Reject negative serials (Excel's date model starts at 1900-01-01,
    // which is serial 1; serial 0 is the placeholder Jan 0, 1900). Allow
    // anything ≥ 0.
    if start < 0.0 || end < 0.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let (y1, m1, d1) = date_from_serial(start);
    let (y2, m2, d2) = date_from_serial(end);
    let (mut d1, mut d2) = (d1 as i64, d2 as i64);
    if european {
        if d1 == 31 {
            d1 = 30;
        }
        if d2 == 31 {
            d2 = 30;
        }
    } else {
        // US (NASD): if d1 == 31 → d1 = 30. Then if d1 == 30 (after the
        // adjustment) AND d2 == 31 → d2 = 30.
        if d1 == 31 {
            d1 = 30;
        }
        if d1 == 30 && d2 == 31 {
            d2 = 30;
        }
    }
    let result = (y2 - y1) as f64 * 360.0 + (m2 as f64 - m1 as f64) * 30.0 + (d2 - d1) as f64;
    Value::Number(result)
}

// Sentinel for parallel-agent merges — every new free helper fn (`fn yearfrac_basis(...)`),
// helper struct, or module-private const goes BEFORE this marker so concurrent worktrees
// don't conflict on `fn collect_numbers`'s preceding blank line.

fn collect_numbers(args: &[Expr], provider: &dyn EvalProvider) -> Vec<f64> {
    let mut out = Vec::new();
    for arg in args {
        for_each_arg_value(arg, provider, &mut |_addr, v| {
            if let Value::Number(n) = v {
                out.push(n);
            }
        });
    }
    out
}

/// Iterative Euclidean GCD on u64. `gcd(a, 0) = a`. Used by GCD / LCM.
fn gcd_u64(mut a: u64, mut b: u64) -> u64 {
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}

fn values_equal(a: &Value, b: &Value) -> bool {
    if let (Some(an), Some(bn)) = (coerce_to_number(a), coerce_to_number(b)) {
        an == bn
    } else {
        coerce_to_text(a) == coerce_to_text(b)
    }
}

/// Naive Gregorian-only days-from-epoch. Epoch: 1970-01-01 = 0.
///
/// TODO(excel-1900-epoch): if Excel file import/export becomes a requirement,
/// switch to Excel's 1900-01-01 = serial 1 convention. Constraints:
///   - serials need a +25569 offset (days between 1900-01-01 and 1970-01-01,
///     including the phantom Feb 29 1900 that Excel preserves for Lotus 1-2-3
///     compatibility);
///   - the phantom 1900-02-29 must be reproduced for serials 60..; dates before
///     1900-03-01 stay off by one day from the real Gregorian calendar;
///   - dates before 1900-01-01 → #NUM! (Excel rejects them);
///   - every test in `eval_*date*` / `eval_weekday` / `eval_eomonth` / etc.
///     needs its expected values regenerated against the new baseline.
/// Until then 1970 epoch is internally consistent and has no leap-year bug.
fn date_serial(year: i32, month: u32, day: u32) -> f64 {
    if month == 0 || month > 12 || day == 0 || day > 31 {
        return f64::NAN;
    }
    // Days in each month for non-leap years.
    const DOM: [u32; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    fn is_leap(y: i32) -> bool {
        (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
    }
    let mut days: i64 = 0;
    if year >= 1970 {
        for y in 1970..year {
            days += if is_leap(y) { 366 } else { 365 };
        }
    } else {
        for y in year..1970 {
            days -= if is_leap(y) { 366 } else { 365 };
        }
    }
    for m in 1..month {
        days += DOM[(m - 1) as usize] as i64;
        if m == 2 && is_leap(year) {
            days += 1;
        }
    }
    days += (day - 1) as i64;
    days as f64
}

fn date_from_serial(serial: f64) -> (i32, u32, u32) {
    let days = serial as i64;
    let mut year = 1970i32;
    let mut remaining = days;
    fn is_leap(y: i32) -> bool {
        (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
    }
    if remaining >= 0 {
        loop {
            let dy = if is_leap(year) { 366 } else { 365 };
            if remaining < dy {
                break;
            }
            remaining -= dy;
            year += 1;
        }
    } else {
        while remaining < 0 {
            year -= 1;
            let dy = if is_leap(year) { 366 } else { 365 };
            remaining += dy;
        }
    }
    const DOM: [u32; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1u32;
    while month <= 12 {
        let dm = DOM[(month - 1) as usize] as i64 + if month == 2 && is_leap(year) { 1 } else { 0 };
        if remaining < dm {
            break;
        }
        remaining -= dm;
        month += 1;
    }
    let day = remaining as u32 + 1;
    (year, month, day)
}

fn date_part(
    args: &[Expr],
    provider: &dyn EvalProvider,
    f: impl Fn(i32, u32, u32) -> f64,
) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    match coerce_to_number(&v) {
        Some(n) => {
            let (y, m, d) = date_from_serial(n);
            Value::Number(f(y, m, d))
        }
        None => Value::Error(ValueError::WrongType),
    }
}

fn coerce_to_bool(v: &Value) -> Option<bool> {
    match v {
        Value::Boolean(b) => Some(*b),
        Value::Number(n) => Some(*n != 0.0),
        _ => None,
    }
}

fn unary_number(args: &[Expr], provider: &dyn EvalProvider, f: impl Fn(f64) -> f64) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    match coerce_to_number(&v) {
        Some(n) => {
            let r = f(n);
            if r.is_finite() {
                Value::Number(r)
            } else {
                Value::Error(ValueError::Overflow)
            }
        }
        None => Value::Error(ValueError::WrongType),
    }
}

fn text_unary(args: &[Expr], provider: &dyn EvalProvider, f: impl Fn(&str) -> String) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    Value::Text(f(&coerce_to_text(&v)))
}

fn text_slice(
    args: &[Expr],
    provider: &dyn EvalProvider,
    take: impl Fn(&str, usize) -> String,
) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let s = coerce_to_text(&eval_expr_with_provider(&args[0], provider));
    let n = if args.len() == 2 {
        match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
            Some(n) if n >= 0.0 => n as usize,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        1
    };
    Value::Text(take(&s, n))
}

fn format_with_text_pattern(value: f64, pattern: &str) -> Option<String> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return None;
    }

    if pattern == "0.00" {
        return Some(format!("{:.2}", value));
    }

    if pattern.chars().all(|c| c == '0') {
        let width = pattern.len();
        let rounded = format!("{:.0}", value);
        let (sign, digits) = rounded
            .strip_prefix('-')
            .map_or(("", rounded.as_str()), |digits| ("-", digits));
        return Some(format!("{sign}{}", format!("{:0>width$}", digits)));
    }

    if pattern.contains('.') {
        let (left, right) = pattern.split_once('.')?;
        if left.is_empty()
            || right.is_empty()
            || !left.chars().all(|c| c == '0')
            || !right.chars().all(|c| c == '0')
        {
            return None;
        }
        let decimals = right.len();
        return Some(format!("{:.*}", decimals, value));
    }

    None
}

/// Match a value against a SUMIF/COUNTIF criterion. Supports:
/// - Bare values: equality
/// - Text starting with `>`, `<`, `>=`, `<=`, `<>`, `=` followed by a number
fn matches_criterion(v: &Value, criterion: &Value) -> bool {
    let crit_text = coerce_to_text(criterion);
    // Try operator prefix forms first.
    let (op, rest) = parse_criterion_op(&crit_text);
    if let Some(target_n) = rest.parse::<f64>().ok() {
        if let Some(vn) = coerce_to_number(v) {
            return match op {
                ">" => vn > target_n,
                ">=" => vn >= target_n,
                "<" => vn < target_n,
                "<=" => vn <= target_n,
                "<>" => vn != target_n,
                _ => vn == target_n,
            };
        }
    }
    // Excel wildcard semantics: ? = 1 char, * = 0+ chars, ~ escapes the next char.
    // Wildcards apply only to the "rest" (after any operator prefix). `=` and
    // `<>` honor wildcards (match / not-match); comparison operators (`>`,
    // `<`, `>=`, `<=`) fall through to text equality (existing legacy
    // behavior — those forms don't apply meaningfully to text patterns).
    //
    // 通配符判据**只匹配文本格**。数字 / 布尔 / 错误 / 空格都不是文本，一律
    // 不命中 —— 于是 `"*"` 数的正是文本格个数，`"<>*"` 是它在整个区域上的
    // 严格补集。依据是 Exceljet「Count cells that contain text」：
    // “Empty cells and cells that contain numeric values or errors should not
    // be included in the count.”，同页的 `=COUNTIF(data,"<>*")` 在同一个 11
    // 格区域上回 7、`"*"` 回 4，两者严格互补。
    //
    // 这里曾经先 `coerce_to_text(v)` 再匹配，于是 `"*"` 把数字、布尔、错误格
    // 全数了进去（8 格夹具上回 8 而不是 5），`"<>*"` 相应地恒为 0。
    //
    // 与「条件字符串里写错误码」（`"#N/A"`）不冲突：那一档**不带**通配符，走
    // 下面的文本兜底，错误格在那里按显示文本参与比较。一个看模式里有没有
    // `?`/`*`/`~`，一个看值的种类 —— 别把两档合并。
    if pattern_has_wildcard(rest) {
        let matched = match criterion_cell_text(v) {
            Some(text) => wildcard_match(rest, &text),
            None => false,
        };
        return match op {
            "<>" => !matched,
            // Comparison operators against a wildcard pattern fall back to
            // equality semantics (Excel does the same).
            _ => matched,
        };
    }
    // Fallback: text comparison (Excel-compatible default) for any `op` the
    // numeric / wildcard branches above didn't take.
    //
    // `<>` 必须是真的「不等于」。这里曾经无视 op 直接回 `text == rest`，于是
    // `COUNTIF(rng,"<>apple")` 回的是**等于** apple 的个数，正好反过来；
    // `"<>#N/A"` 这条标准错误过滤配方也因此拿不到正确答案。
    //
    // 注意这一档同时承载「条件字符串里写错误码」：`coerce_to_text` 把
    // `Value::Error` 渲染成 `#N/A` / `#DIV/0!`，所以 `"#N/A"` 命中错误格、
    // `"<>#N/A"` 命中除它以外的一切。这与「criteria 实参**本身**是错误值」
    // 是两回事 —— 那一档在各调用点求值后就直接传播，走不到 `matches_criterion`。
    //
    // 比较**不区分大小写**。MS 官方 COUNTIF 文档原话：“Criteria aren't case
    // sensitive. In other words, the string "apples" and the string "APPLES"
    // will match the same cells.” 这里曾经是逐字节 `==`，于是
    // `COUNTIF(rng,"APPLE")` 数不到内容为 `apple` 的格子 —— 而上面的通配符档
    // 一直是不敏感的（`wildcard_match` 两侧都折成小写），同一个函数里两套口径。
    //
    // 别拿 `EXACT()` 来推翻这条：那个函数**区分**大小写，正是 criteria 做不到
    // 大小写敏感时的标准替代写法（`SUMPRODUCT(--EXACT(rng,"APPLE"))`）。
    let cell_text = coerce_to_text(v);
    // 先走逐字节相等的快路径，绝大多数格子在这里就判完，不必分配两个小写串。
    let equal = cell_text == rest || cell_text.to_lowercase() == rest.to_lowercase();
    match op {
        "<>" => !equal,
        _ => equal,
    }
}

/// 通配符判据眼里的「文本格」。
///
/// 只有 `Value::Text` 算文本 —— 数字、布尔、错误、空格一律 `None`，于是
/// `matches_criterion` 的通配符档对它们不命中。数组按本文件既有约定塌成左上角
/// （与 `coerce_to_text` 同形）。
///
/// 刻意**不**复用 `coerce_to_text`：那个函数会把 `5` 渲染成 `"5"`、把 `#N/A`
/// 渲染成 `"#N/A"`，正是本次要去掉的行为。
fn criterion_cell_text(v: &Value) -> Option<String> {
    match v {
        Value::Text(s) => Some(s.clone()),
        Value::Array(arr) => arr.get(0, 0).and_then(criterion_cell_text),
        _ => None,
    }
}

fn parse_criterion_op(s: &str) -> (&str, &str) {
    for op in ["<>", ">=", "<=", ">", "<", "="] {
        if let Some(rest) = s.strip_prefix(op) {
            return (op, rest);
        }
    }
    ("=", s)
}

/// Detect whether a pattern is "wildcard-style". A pattern is wildcard-style
/// if it contains an unescaped `?`/`*` OR any `~` escape sequence — the
/// escape sequence itself needs the wildcard matcher to decode it (e.g.
/// `~*` is a literal `*` only after escape resolution; a plain string
/// compare against the raw pattern would still see the `~`).
fn pattern_has_wildcard(pattern: &str) -> bool {
    let mut chars = pattern.chars();
    while let Some(c) = chars.next() {
        if c == '~' {
            // A `~` always triggers the wildcard matcher so escapes are
            // decoded uniformly. Consume the escaped char and continue.
            let _ = chars.next();
            return true;
        }
        if c == '?' || c == '*' {
            return true;
        }
    }
    false
}

/// Excel wildcard semantics: `?` = exactly one char, `*` = zero-or-more
/// chars, `~` escapes the next char (`~?`, `~*`, `~~`). Match is
/// case-insensitive (Excel convention; same as SEARCH).
///
/// Implementation: iterative two-pointer matcher with `*` backtracking. The
/// pattern is pre-decoded into a token vector (`Lit(c) | Q | Star`) so the
/// matcher itself only deals with three cases. Time complexity is O(p·t)
/// in the worst case (multiple `*`s with backtracking); criteria patterns
/// are short in practice so this is fine.
fn wildcard_match(pattern: &str, text: &str) -> bool {
    enum Tok {
        Lit(char),
        Q,
        Star,
    }
    // Decode pattern → tokens, honoring `~` escape. Case-folded to lower.
    let mut toks: Vec<Tok> = Vec::with_capacity(pattern.len());
    let mut it = pattern.chars();
    while let Some(c) = it.next() {
        if c == '~' {
            // Escape: the next char is a literal (any char; `~` at end is
            // treated as a literal `~`, matching Excel parity).
            match it.next() {
                Some(next) => toks.push(Tok::Lit(next.to_lowercase().next().unwrap_or(next))),
                None => toks.push(Tok::Lit('~')),
            }
        } else if c == '?' {
            toks.push(Tok::Q);
        } else if c == '*' {
            toks.push(Tok::Star);
        } else {
            toks.push(Tok::Lit(c.to_lowercase().next().unwrap_or(c)));
        }
    }
    // Case-fold the text too.
    let text_chars: Vec<char> = text.chars().flat_map(|c| c.to_lowercase()).collect();

    // Two-pointer matcher with `*` backtracking. `star_p` is the index of
    // the most recent `*` in the pattern (or None); `star_t` is the text
    // index where that `*` last attempted to "start eating".
    let mut p = 0usize;
    let mut t = 0usize;
    let mut star_p: Option<usize> = None;
    let mut star_t: usize = 0;
    while t < text_chars.len() {
        match toks.get(p) {
            Some(Tok::Lit(c)) if text_chars[t] == *c => {
                p += 1;
                t += 1;
            }
            Some(Tok::Q) => {
                p += 1;
                t += 1;
            }
            Some(Tok::Star) => {
                star_p = Some(p);
                star_t = t;
                p += 1;
            }
            _ => {
                // Mismatch or end-of-pattern with text remaining. Try to
                // backtrack to the last `*` and let it consume one more char.
                if let Some(sp) = star_p {
                    p = sp + 1;
                    star_t += 1;
                    t = star_t;
                } else {
                    return false;
                }
            }
        }
    }
    // Consume any trailing `*`s; anything else means leftover required
    // tokens that have no text to match against.
    while let Some(Tok::Star) = toks.get(p) {
        p += 1;
    }
    p == toks.len()
}

// --- TEXTSPLIT / TEXTBEFORE / TEXTAFTER / LOOKUP / FORMULATEXT / AREAS / ENCODEURL
//     helpers. The arms in `eval_func` are intentionally thin (`fn_*`-call
//     style) so the bulk of the new logic sits below, near the other text /
//     lookup helpers, instead of bloating the giant `match`.

/// Collect a Vec<String> of delimiters from a TEXTSPLIT argument: a scalar
/// becomes a single element, a `Value::Array` is flattened in row-major
/// order. Empty / Null array slots are silently dropped — TEXTSPLIT can't
/// split on an empty string anyway, and Excel ignores blanks in the
/// delimiter array.
fn collect_textsplit_delims(v: &Value, include_empty: bool) -> Result<Vec<String>, ValueError> {
    match v {
        Value::Error(e) => Err(e.clone()),
        Value::Array(arr) => {
            let mut out = Vec::new();
            for elem in arr.data.iter() {
                match elem {
                    Value::Error(e) => return Err(e.clone()),
                    Value::Null => {
                        if include_empty {
                            out.push(String::new());
                        }
                    }
                    other => {
                        let s = coerce_to_text(other);
                        if !s.is_empty() || include_empty {
                            out.push(s);
                        }
                    }
                }
            }
            Ok(out)
        }
        Value::Null => {
            if include_empty {
                Ok(vec![String::new()])
            } else {
                Ok(Vec::new())
            }
        }
        other => {
            let s = coerce_to_text(other);
            if s.is_empty() && !include_empty {
                Ok(Vec::new())
            } else {
                Ok(vec![s])
            }
        }
    }
}

/// Walk `text` from byte position `start`, looking for the earliest start
/// position of any delimiter in `delims`. Returns `(byte_start, byte_end,
/// matched_index)` or `None`. `match_mode == 1` means case-insensitive
/// (we lower-case both sides before comparing — fine for ASCII; Unicode
/// case folding is best-effort via `to_lowercase()`).
fn find_first_textsplit_delim(
    text: &str,
    delims: &[String],
    start: usize,
    match_mode: i64,
) -> Option<(usize, usize, usize)> {
    if delims.is_empty() || start > text.len() {
        return None;
    }
    let case_insensitive = match_mode == 1;
    let hay_lower: Option<String> = if case_insensitive {
        Some(text.to_lowercase())
    } else {
        None
    };
    let mut best: Option<(usize, usize, usize)> = None;
    for (idx, d) in delims.iter().enumerate() {
        if d.is_empty() {
            continue;
        }
        let needle: String;
        let needle_ref: &str = if case_insensitive {
            needle = d.to_lowercase();
            &needle
        } else {
            d.as_str()
        };
        let hay: &str = if case_insensitive {
            hay_lower.as_deref().unwrap()
        } else {
            text
        };
        // For case-insensitive search, `to_lowercase()` can change byte
        // length per char — we still want byte indices in the ORIGINAL
        // text, but with non-ASCII case-folding the lengths may differ.
        // We accept this best-effort limitation and search in the lowered
        // strings; the returned byte indices then point into the LOWERED
        // text. Since we use them to slice the lowered string for the
        // output, we must reconstruct via the original. To keep this
        // simple we restrict case-insensitive mode to byte-identical
        // length transformations (ASCII): if a delim is non-ASCII, fall
        // back to case-sensitive search for that delim so we don't
        // mis-slice. This matches Excel's behavior for typical usage.
        if case_insensitive && (!d.is_ascii() || !text.is_ascii()) {
            // ASCII-fallback: search the original text directly. This
            // means non-ASCII text matches case-sensitively under
            // match_mode=1 — documented gap.
            if let Some(pos) = text[start..].find(d.as_str()) {
                let abs = start + pos;
                let end = abs + d.len();
                match best {
                    Some((b, _, _)) if b <= abs => {}
                    _ => best = Some((abs, end, idx)),
                }
            }
            continue;
        }
        if let Some(pos) = hay[start..].find(needle_ref) {
            let abs = start + pos;
            let end = abs + needle_ref.len();
            match best {
                Some((b, _, _)) if b <= abs => {}
                _ => best = Some((abs, end, idx)),
            }
        }
    }
    best
}

/// Split `text` into fragments by `delims`, honoring `ignore_empty` and
/// `match_mode`. Returns the flat list of fragments in source order.
fn textsplit_one_axis(
    text: &str,
    delims: &[String],
    ignore_empty: bool,
    match_mode: i64,
) -> Vec<String> {
    if delims.is_empty() {
        return vec![text.to_string()];
    }
    let mut out: Vec<String> = Vec::new();
    let mut pos = 0usize;
    while pos <= text.len() {
        match find_first_textsplit_delim(text, delims, pos, match_mode) {
            Some((s, e, _)) => {
                let frag = &text[pos..s];
                if !(ignore_empty && frag.is_empty()) {
                    out.push(frag.to_string());
                }
                pos = e;
                if pos > text.len() {
                    break;
                }
            }
            None => {
                let frag = &text[pos..];
                if !(ignore_empty && frag.is_empty()) {
                    out.push(frag.to_string());
                }
                break;
            }
        }
    }
    if out.is_empty() && !ignore_empty {
        // Excel TEXTSPLIT on "" returns a 1×1 with "". Keep that.
        out.push(String::new());
    }
    out
}

fn eval_optional_value_arg(
    arg: Option<&Expr>,
    provider: &dyn EvalProvider,
    default: Value,
) -> Value {
    match arg {
        Some(expr) => eval_expr_with_provider(expr, provider),
        None => default,
    }
}

/// 一个 `TEXTJOIN` 结果最多多少个字符。Excel 的单元格文本上限就是这个数，
/// 官方文档把「结果超过 32767 字符」明确列为 `#VALUE!`。
const TEXTJOIN_MAX_CHARS: u64 = 32767;

/// TEXTJOIN(delim, ignore_empty, ...)。
///
/// # 空格要占位
///
/// `ignore_empty = FALSE` 时区域里的空格**要产出一个空片段**，也就是要多出一个
/// 分隔符：`A1=1 / A2 空 / A3=3` 的 `TEXTJOIN(",",FALSE,A1:A3)` 是 `"1,,3"`，
/// 不是 `"1,3"`。但稀疏 provider 的 `for_each_range_cell` 只发非空格，所以光靠
/// 「发出来的值」拼不出中间那个空片段 —— 同一个引擎里数组字面量形态
/// `TEXTJOIN(",",FALSE,{1,"",3})` 早就答对了 `"1,,3"`，区域形态却答 `"1,3"`，
/// 两种形态自相矛盾。
///
/// 修法是**按位置补洞**：`for_each_arg_value_positioned` 交出每个格子在区域里的
/// 绝对位次，两次回调之间的位次缺口有几个就补几个空片段，实参末尾没发到的位次
/// 用矩形格数补齐。
///
/// # 为什么不会铺开一百万个空格
///
/// 两道闸门，都是闭式的：
///
/// 1. **分隔符为空串时根本不补洞**。空片段 + 空分隔符对结果的贡献恒为零，
///    `TEXTJOIN("",FALSE,A:A)` 的答案与稀疏流一模一样。于是「整列 + 空分隔符」
///    这条最容易爆的路径连循环都不进。
/// 2. **分隔符非空时补洞循环自带上限**。每补一个洞至少推进一个分隔符（≥ 1 字符），
///    所以最多补到 `TEXTJOIN_MAX_CHARS` 就必然越界、置错并停手 ——
///    `TEXTJOIN(",",FALSE,A:A)` 走的是「补满 32768 个空片段 → `#VALUE!`」，
///    而不是「走一百万格」。这也正是 Excel 的答案：一百万个分隔符远超单元格
///    32767 字符上限，Excel 同样给 `#VALUE!`。
///
/// 字符数用**累加计数器**而不是每次 `out.chars().count()`：后者在补洞路径上是
/// O(n²)（32768 次 × 每次重数整串），前者 O(1)。
fn text_join_delimited(args: &[Expr], provider: &dyn EvalProvider) -> Value {
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
    let ignore_empty = match coerce_to_bool(&ignore_v) {
        Some(b) => b,
        None => return Value::Error(ValueError::WrongType),
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

fn fn_textsplit(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    // `col_delim` 是必填的：下面直接索引 `args[1]`，只挡 `args.is_empty()`
    // 时 `=TEXTSPLIT("a")` 会 panic（index out of bounds），在 WASM 里等于
    // 一条公式打死 worker。TS 参考引擎判的是 `args.length < 2`，这里向它收敛。
    if args.len() < 2 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    // text
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = &text_v {
        return Value::Error(e.clone());
    }
    let text = coerce_to_text(&text_v);

    // col_delim
    let col_v = eval_expr_with_provider(&args[1], provider);
    let col_delims = match collect_textsplit_delims(&col_v, false) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };

    // row_delim (optional)
    let row_delims = if args.len() >= 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        match v {
            Value::Null => Vec::new(),
            v => match collect_textsplit_delims(&v, false) {
                Ok(d) => d,
                Err(e) => return Value::Error(e),
            },
        }
    } else {
        Vec::new()
    };

    // ignore_empty (default FALSE)
    let ignore_empty = if args.len() >= 4 {
        let v = eval_expr_with_provider(&args[3], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        coerce_to_bool(&v).unwrap_or(false)
    } else {
        false
    };

    // match_mode (default 0)
    let match_mode: i64 = if args.len() >= 5 {
        let v = eval_expr_with_provider(&args[4], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        0
    };
    if !matches!(match_mode, 0 | 1) {
        return Value::Error(ValueError::InvalidValue);
    }

    // Empty text — Excel returns a 1×1 with "" regardless of delims.
    if text.is_empty() {
        return Value::Array(Arc::new(ArrayData::new(
            1,
            1,
            vec![Value::Text(String::new())],
        )));
    }

    if row_delims.is_empty() {
        // 1×N column-split. Drop empty fragments per `ignore_empty`.
        let fragments = textsplit_one_axis(&text, &col_delims, ignore_empty, match_mode);
        let cols = fragments.len().max(1) as u32;
        let data: Vec<Value> = fragments.into_iter().map(Value::Text).collect();
        return Value::Array(Arc::new(ArrayData::new(1, cols, data)));
    }

    // 2D split. Outer = rows, inner = cols. We first split on row
    // delimiters, then each row on column delimiters. Pad jagged rows
    // with `pad`.
    let rows_raw = textsplit_one_axis(&text, &row_delims, ignore_empty, match_mode);
    let mut grid: Vec<Vec<String>> = Vec::with_capacity(rows_raw.len());
    let mut max_cols = 0usize;
    for row in &rows_raw {
        let cols = textsplit_one_axis(row, &col_delims, ignore_empty, match_mode);
        if cols.len() > max_cols {
            max_cols = cols.len();
        }
        grid.push(cols);
    }
    if grid.is_empty() {
        return Value::Array(Arc::new(ArrayData::new(
            1,
            1,
            vec![Value::Text(String::new())],
        )));
    }
    if max_cols == 0 {
        max_cols = 1;
    }
    let r = grid.len() as u32;
    let c = max_cols as u32;
    // 格数闸门。TEXTSPLIT 的输出是**两轴分隔符个数之积**，对长度 L 的文本最坏
    // (L/2)²；到这里为止的分配都还是线性的（`grid` 里的 String 总数 ≤ L + 行数），
    // 二次爆炸只发生在下面按 `max_cols` 补齐 pad 的那一步 —— 所以闸门必须钉在
    // `Vec::with_capacity` 之前。实测 `REPT(";",16383)&REPT(",",16383)`（32766
    // 字符，公式能造出的最长文本量级）= 16384 × 16384 = 268,435,456 格 ≈ 6.4 GB。
    //
    // 只数格数，**不看行列各自是否越网格** —— 后者是 `DYNAMIC_ARRAY_CELL_CAP`
    // 注释里登记的那条未决分歧，不在这里顺手统一。
    // 口径与 SEQUENCE / EXPAND / MAKEARRAY 等同一个 `checked_array_len`。
    //
    // 1×N 分支（`row_delims` 为空）不需要这道闸门：它的格数 = 片段数 ≤ L + 1，
    // 是线性的，而公式能造出的最长文本被 REPT / CONCAT / TEXTJOIN 卡在 32767
    // 字符 → 最坏 32768 格，只有上限的 3%。
    let cap = match checked_array_len(r as u64, c as u64) {
        Ok(cap) => cap,
        Err(e) => return Value::Error(e),
    };
    let mut data: Vec<Value> = Vec::with_capacity(cap);
    let pad_arg = args.get(5);
    let mut pad: Option<Value> = None;
    for row in grid {
        for j in 0..max_cols {
            if j < row.len() {
                data.push(Value::Text(row[j].clone()));
            } else {
                let pad_value = pad
                    .get_or_insert_with(|| {
                        eval_optional_value_arg(
                            pad_arg,
                            provider,
                            Value::Error(ValueError::NotAvailable),
                        )
                    })
                    .clone();
                data.push(pad_value);
            }
        }
    }
    Value::Array(Arc::new(ArrayData::new(r, c, data)))
}

/// Shared engine for TEXTBEFORE / TEXTAFTER. The shape is identical save
/// the final slice direction.
///
/// Spec recap (Excel 365):
///   TEXTBEFORE(text, delim[, instance_num=1[, match_mode=0[, match_end=0[, if_not_found]]]])
///   TEXTAFTER (text, delim[, instance_num=1[, match_mode=0[, match_end=0[, if_not_found]]]])
///
/// - `instance_num`: 1-based; negative counts from the right (-1 = last).
/// - `match_mode`: 0 case-sensitive (default), 1 case-insensitive.
/// - `match_end`: 1 treats start- or end-of-string as an implicit match.
///   Then asking for the last occurrence with end-of-string-match returns
///   the tail / "" (TEXTAFTER) or whole text / before-tail (TEXTBEFORE).
/// - `if_not_found`: returned on miss (default `#N/A`).
fn fn_text_before_after(args: &[Expr], provider: &dyn EvalProvider, before: bool) -> Value {
    if args.len() < 2 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = &text_v {
        return Value::Error(e.clone());
    }
    let text = coerce_to_text(&text_v);

    let delim_v = eval_expr_with_provider(&args[1], provider);
    let delims = match collect_textsplit_delims(&delim_v, true) {
        Ok(d) => d,
        Err(e) => return Value::Error(e),
    };

    let instance: i64 = if args.len() >= 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    if instance == 0 {
        return Value::Error(ValueError::InvalidValue);
    }

    let match_mode: i64 = if args.len() >= 4 {
        let v = eval_expr_with_provider(&args[3], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        0
    };
    if !matches!(match_mode, 0 | 1) {
        return Value::Error(ValueError::InvalidValue);
    }

    let match_end: i64 = if args.len() >= 5 {
        let v = eval_expr_with_provider(&args[4], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        0
    };
    if !matches!(match_end, 0 | 1) {
        return Value::Error(ValueError::InvalidValue);
    }

    let not_found_arg = args.get(5);
    let not_found = || {
        eval_optional_value_arg(
            not_found_arg,
            provider,
            Value::Error(ValueError::NotAvailable),
        )
    };

    if delims.iter().any(|d| d.is_empty()) {
        return match instance {
            1 => Value::Text(if before { String::new() } else { text.clone() }),
            -1 => Value::Text(if before { text.clone() } else { String::new() }),
            _ => not_found(),
        };
    }

    // Enumerate every match position as (start, end). With `match_end`,
    // Excel treats only the end of the string as an implicit match.
    let mut matches: Vec<(usize, usize)> = Vec::new();
    let mut pos = 0usize;
    while let Some((s, e, _)) = find_first_textsplit_delim(&text, &delims, pos, match_mode) {
        matches.push((s, e));
        if e == s {
            // Empty delim guarded above, but defensive: avoid infinite loop.
            pos = s + 1;
        } else {
            pos = e;
        }
        if pos > text.len() {
            break;
        }
    }
    if match_end == 1 {
        matches.push((text.len(), text.len()));
    }

    // Resolve the requested instance.
    let pick: Option<(usize, usize)> = if instance > 0 {
        let i = instance as usize;
        if i == 0 || i > matches.len() {
            None
        } else {
            Some(matches[i - 1])
        }
    } else {
        let i = (-instance) as usize;
        if i == 0 || i > matches.len() {
            None
        } else {
            Some(matches[matches.len() - i])
        }
    };

    match pick {
        Some((s, e)) => {
            if before {
                Value::Text(text[..s].to_string())
            } else {
                Value::Text(text[e..].to_string())
            }
        }
        None => not_found(),
    }
}

/// LOOKUP. Two forms:
///   - Vector form (3 args, or 2 args with a 1D vector second arg).
///   - Array form  (2 args, second arg is a 2D shape — pick longer axis).
fn fn_lookup(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let needle = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = &needle {
        return Value::Error(e.clone());
    }
    let lookup_grid = match collect_range_2d_for_arg(&args[1], provider) {
        Some(g) => g,
        None => {
            // Non-range — accept a scalar / array value as a 1×1 grid.
            let v = eval_expr_with_provider(&args[1], provider);
            match v {
                Value::Error(e) => return Value::Error(e),
                Value::Array(arr) => {
                    let (rows, cols) = arr.shape();
                    let data = arr.data.clone();
                    let mut g = Vec::with_capacity(rows as usize);
                    for r in 0..rows as usize {
                        let mut row = Vec::with_capacity(cols as usize);
                        for c in 0..cols as usize {
                            row.push(data[r * (cols as usize) + c].clone());
                        }
                        g.push(row);
                    }
                    g
                }
                other => vec![vec![other]],
            }
        }
    };

    if lookup_grid.is_empty() || lookup_grid[0].is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }

    // Decide vector vs array form.
    let lookup_rows = lookup_grid.len();
    let lookup_cols = lookup_grid[0].len();

    if args.len() == 2 {
        // Either a 1D vector (treat as vector form, result = lookup) or
        // 2D (array form).
        if lookup_rows == 1 || lookup_cols == 1 {
            // Vector form, result_vector = lookup_vector.
            let keys: Vec<Value> = if lookup_rows == 1 {
                lookup_grid[0].clone()
            } else {
                lookup_grid.iter().map(|r| r[0].clone()).collect()
            };
            return lookup_vector_walk(&keys, &keys, &needle);
        }
        // Array form: pick the longer dimension for lookup, the OPPOSITE
        // end of the other dimension for the result.
        if lookup_cols >= lookup_rows {
            // Horizontal: first row = keys, last row = result.
            let keys: Vec<Value> = lookup_grid[0].clone();
            let result: Vec<Value> = lookup_grid[lookup_rows - 1].clone();
            return lookup_vector_walk(&keys, &result, &needle);
        } else {
            // Vertical: first col = keys, last col = result.
            let keys: Vec<Value> = lookup_grid.iter().map(|r| r[0].clone()).collect();
            let result: Vec<Value> = lookup_grid
                .iter()
                .map(|r| r[lookup_cols - 1].clone())
                .collect();
            return lookup_vector_walk(&keys, &result, &needle);
        }
    }

    // 3-arg vector form. Both must be 1D; lengths must agree.
    let lookup_vec: Vec<Value> = if lookup_rows == 1 {
        lookup_grid[0].clone()
    } else if lookup_cols == 1 {
        lookup_grid.iter().map(|r| r[0].clone()).collect()
    } else {
        // Not a vector — Excel still searches the first column/row but
        // we surface #VALUE! to match the spec we documented for this
        // commit (shape mismatch).
        return Value::Error(ValueError::WrongType);
    };
    let result_grid = match collect_range_2d_for_arg(&args[2], provider) {
        Some(g) => g,
        None => {
            let v = eval_expr_with_provider(&args[2], provider);
            match v {
                Value::Error(e) => return Value::Error(e),
                Value::Array(arr) => {
                    let (rows, cols) = arr.shape();
                    let data = arr.data.clone();
                    let mut g = Vec::with_capacity(rows as usize);
                    for r in 0..rows as usize {
                        let mut row = Vec::with_capacity(cols as usize);
                        for c in 0..cols as usize {
                            row.push(data[r * (cols as usize) + c].clone());
                        }
                        g.push(row);
                    }
                    g
                }
                other => vec![vec![other]],
            }
        }
    };
    if result_grid.is_empty() || result_grid[0].is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let r_rows = result_grid.len();
    let r_cols = result_grid[0].len();
    let result_vec: Vec<Value> = if r_rows == 1 {
        result_grid[0].clone()
    } else if r_cols == 1 {
        result_grid.iter().map(|r| r[0].clone()).collect()
    } else {
        return Value::Error(ValueError::WrongType);
    };
    if lookup_vec.len() != result_vec.len() {
        return Value::Error(ValueError::WrongType);
    }
    lookup_vector_walk(&lookup_vec, &result_vec, &needle)
}

/// Linear "exact-or-next-smaller" walk shared by LOOKUP's vector and
/// array forms. We pick the index of the largest key still ≤ needle.
/// If no key is ≤ needle, surface #N/A.
fn lookup_vector_walk(keys: &[Value], result: &[Value], needle: &Value) -> Value {
    if keys.is_empty() || keys.len() != result.len() {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut best: Option<usize> = None;
    for (i, k) in keys.iter().enumerate() {
        if let Value::Error(e) = k {
            return Value::Error(e.clone());
        }
        if compare_lookup(k, needle).is_le() {
            best = Some(i);
        }
        // Note: we do NOT break when overshoot, because the spec says
        // we should treat the input as ascending but a relaxed walk
        // tolerates non-sorted vectors. Last qualifying key wins —
        // matches Excel's behavior on sorted input.
    }
    match best {
        Some(i) => result[i].clone(),
        None => Value::Error(ValueError::NotAvailable),
    }
}

/// FORMULATEXT(ref). Walk the supported reference-shaped expressions and
/// consult the provider for the cell's source formula text. A
/// `Value::Error(ValueError::NotAvailable)` is returned when the
/// referenced cell holds a primitive — Excel returns `#N/A` for "this
/// cell has no formula".
fn fn_formulatext(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    match &args[0] {
        Expr::CellRef(addr, _) => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            match provider.cell_formula_text(*addr) {
                Some(s) => Value::Text(s),
                None => Value::Error(ValueError::NotAvailable),
            }
        }
        Expr::Range { start, end, .. } => {
            let r = CellRange::new(*start, *end).normalize();
            match provider.cell_formula_text(r.start) {
                Some(s) => Value::Text(s),
                None => Value::Error(ValueError::NotAvailable),
            }
        }
        Expr::SheetRef { sheet, addr, .. } => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            if provider.sheet_index_of(sheet).is_none() {
                return Value::Error(ValueError::InvalidRef);
            }
            match provider.sheet_cell_formula_text(sheet, *addr) {
                Some(s) => Value::Text(s),
                None => Value::Error(ValueError::NotAvailable),
            }
        }
        Expr::SheetRange {
            sheet, start, end, ..
        } => {
            if provider.sheet_index_of(sheet).is_none() {
                return Value::Error(ValueError::InvalidRef);
            }
            let r = CellRange::new(*start, *end).normalize();
            match provider.sheet_cell_formula_text(sheet, r.start) {
                Some(s) => Value::Text(s),
                None => Value::Error(ValueError::NotAvailable),
            }
        }
        _ => Value::Error(ValueError::WrongType),
    }
}

/// ENCODEURL(text). Percent-encode `text` per RFC 3986 unreserved set
/// `[A-Za-z0-9-_.~]`; every other byte (including multi-byte UTF-8 tail
/// bytes) emits as `%XX` uppercase. Empty input → empty string.
fn fn_encodeurl(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = &v {
        return Value::Error(e.clone());
    }
    let text = coerce_to_text(&v);
    let mut out = String::with_capacity(text.len());
    for b in text.bytes() {
        let c = b as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            out.push('%');
            out.push_str(&format!("{:02X}", b));
        }
    }
    Value::Text(out)
}

// 单元测试。原来是一个 17,375 行的内联 `mod tests`（占本文件 43.7%），现按
// **被测的东西**（函数族）拆到 `eval_tests/` 下，每个文件一件事。与
// `eval_regex_tests.rs` / `formula/*_tests.rs` 同一个约定：`#[path]` 挂在实现
// 文件上，`tests` 仍是 `eval` 的子模块，因此拿得到本模块的私有项。
#[cfg(test)]
#[path = "eval_tests/mod.rs"]
mod tests;
