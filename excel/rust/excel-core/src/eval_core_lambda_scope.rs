use super::*;

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
pub(super) struct LetFrame {
    bindings: HashMap<String, Value>,
    /// 本帧里**因为调用方没给实参**而绑成空值的 LAMBDA 形参名。
    /// `ISOMITTED(形参)` 靠它答 TRUE；LET 帧永远是空集。
    omitted: HashSet<String>,
    /// 本帧是不是一次 LAMBDA 调用的活动记录（LET 帧不是）。
    /// `ISOMITTED` 在 LAMBDA 之外没有意义，栈上没有这样的帧就答 `#NAME?`。
    lambda_activation: bool,
}

impl LetFrame {
    pub(super) fn new() -> Self {
        LetFrame {
            bindings: HashMap::new(),
            omitted: HashSet::new(),
            lambda_activation: false,
        }
    }

    pub(super) fn bind(&mut self, name: String, value: Value) {
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
    pub(super) static LET_FRAMES: RefCell<Vec<LetFrame>> = const { RefCell::new(Vec::new()) };

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
    pub(super) static NAMED_CALL_DEPTH: Cell<usize> = const { Cell::new(0) };
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

/// Walk the active LET frame stack from innermost to outermost. Returns
/// the first binding for `name`, or `None` if unbound.
pub(super) fn lookup_let_binding(name: &str) -> Option<Value> {
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
pub(super) fn snapshot_let_frames() -> Vec<(String, Value)> {
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
///
/// 额外记下哪些形参是「调用方没给」的，并把本帧标成一次 LAMBDA 活动记录 ——
/// `ISOMITTED` 要靠这两样东西回答。
pub(super) fn push_lambda_frame(initial: Vec<(String, Value)>, omitted: HashSet<String>) {
    LET_FRAMES.with(|frames| {
        let mut frame = LetFrame::new();
        for (k, v) in initial {
            frame.bind(k, v);
        }
        frame.omitted = omitted;
        frame.lambda_activation = true;
        frames.borrow_mut().push(frame);
    });
}

/// 栈上有没有 LAMBDA 活动记录。`ISOMITTED` 用它区分「在 LAMBDA 体内」与
/// 「在裸公式 / LET 里」—— 后者答 `#NAME?`（与 TS 引擎
/// `evaluateIsOmitted` 的 `if (!ctx.lambdaOmittedParams)` 同一条）。
pub(super) fn in_lambda_activation() -> bool {
    LET_FRAMES.with(|frames| frames.borrow().iter().any(|f| f.lambda_activation))
}

/// `name` 是不是一个「调用方没给实参」的 LAMBDA 形参。
///
/// 按 `lookup_let_binding` 同样的innermost-first walk 找到**第一个绑定它的
/// 帧**再问 —— 内层重新绑定（LET 或嵌套 LAMBDA）自然把外层的省略标记盖掉，
/// 不需要额外的删除动作。
pub(super) fn lambda_param_is_omitted(name: &str) -> bool {
    LET_FRAMES.with(|frames| {
        let frames = frames.borrow();
        for frame in frames.iter().rev() {
            if frame.bindings.contains_key(name) {
                return frame.omitted.contains(name);
            }
        }
        false
    })
}

pub(super) fn pop_let_frame() {
    LET_FRAMES.with(|frames| {
        frames.borrow_mut().pop();
    });
}
