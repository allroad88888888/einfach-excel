//! 异步自定义函数调用的挂起态与结果缓存键。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// One drained async custom-formula request. The host runs the JS callback
/// for `name(args)` on its own event loop and reports the outcome through
/// `Workbook::resolve_async_custom_call(call_id, value)`.
#[derive(Debug, Clone)]
pub struct PendingAsyncCustomCall {
    pub call_id: u64,
    pub name: String,
    pub args: Vec<Value>,
}

/// Per (name, args) memo entry for an async custom-formula call. The result
/// atom is created on first read with `#BUSY!` and its identity never changes
/// afterwards — registry invalidation resets the VALUE back to `#BUSY!` and
/// re-arms the call under a new `call_id`, so formulas that depend on the
/// atom re-derive without any subscription rekeying.
pub(super) struct AsyncCustomEntry {
    pub(super) atom: AtomId,
    pub(super) call_id: u64,
    pub(super) generation: u64,
}

/// Async custom-formula state: content-addressed result cache + pending-call
/// queue. `generation` bumps on every registry change; a settle whose entry
/// generation (or call_id) is stale is dropped, so in-flight Promises from
/// before an unregister/replace can never write into the new registry's view.
pub(super) struct AsyncCustomState {
    pub(super) entries: HashMap<String, AsyncCustomEntry>,
    pub(super) by_call_id: HashMap<u64, String>,
    pub(super) pending: Vec<PendingAsyncCustomCall>,
    pub(super) next_call_id: u64,
    pub(super) generation: u64,
}

/// Bounded cache: cap on memoized async custom-formula results. Enforced
/// best-effort at drain/resolve time (never inside a read frame) by evicting
/// entries whose result atom has no dependents and no subscribers; entries
/// still observed by a formula are never evicted, so the cache can exceed
/// the cap while more than 512 distinct calls are simultaneously live.
pub(crate) const ASYNC_CUSTOM_RESULT_CACHE_CAP: usize = 512;

/// Content-addressed key for an async custom-formula call. Must agree with
/// `Value`'s `PartialEq` (NaN normalized to one bit pattern, `+0.0`/`-0.0`
/// distinct via `to_bits`, arrays element-wise). Text is length-prefixed so
/// concatenation cannot alias across arg boundaries. Lambdas cannot reach
/// custom args (`eval_arg_for_custom` materializes scalars/arrays only) but
/// are keyed by Arc identity defensively.
pub(super) fn canonical_custom_call_key(name: &str, args: &[Value]) -> String {
    use std::fmt::Write;
    fn write_value(out: &mut String, v: &Value) {
        match v {
            Value::Number(n) => {
                let bits = if n.is_nan() {
                    f64::NAN.to_bits()
                } else {
                    n.to_bits()
                };
                let _ = write!(out, "N:{bits:016x}");
            }
            Value::Text(s) => {
                let _ = write!(out, "T:{}:", s.len());
                out.push_str(s);
            }
            Value::Boolean(b) => out.push_str(if *b { "B:1" } else { "B:0" }),
            Value::Null => out.push('Z'),
            Value::Error(e) => {
                let _ = write!(out, "E:{e}");
            }
            Value::Array(arr) => {
                let _ = write!(out, "A:{}x{}", arr.rows, arr.cols);
                for cell in &arr.data {
                    out.push(',');
                    write_value(out, cell);
                }
            }
            Value::Lambda(l) => {
                let _ = write!(out, "L:{:p}", Arc::as_ptr(l));
            }
        }
    }
    let mut key = String::with_capacity(24 + args.len() * 20);
    key.push_str(&name.to_ascii_uppercase());
    for v in args {
        key.push('|');
        write_value(&mut key, v);
    }
    key
}
