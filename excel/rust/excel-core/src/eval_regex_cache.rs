//! Per-thread memo of compiled `regex::Regex` values.
//!
//! Separate from `eval_regex.rs` because it is a different concern from the
//! three built-ins that consume it: they own Excel argument semantics, this
//! owns a bounded cache and its eviction policy. `compile_regex` is the only
//! entry point the built-ins reach for.
//!
//! Compiled only when `regex-formulas` is on — the `#[cfg]` sits on the
//! `mod eval_regex;` declaration in `eval.rs`, so nothing below repeats it.

#[cfg(test)]
use std::cell::Cell;
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Arc;

/// Upper bound on distinct compiled regexes held per thread.
///
/// Sized against the *pattern* cardinality of a spreadsheet, not its cell
/// count: patterns are almost always literals typed into a formula and then
/// filled down a column, so a column of 100k `=REGEXTEST(A1,"…")` is ONE
/// distinct pattern. 64 leaves room for a workbook with dozens of distinct
/// regex columns (times the two case-sensitivity variants, which key
/// separately) while capping worst-case memory. The cap is deliberately far
/// below the repo's other bounded caches (history 100, named ranges 500,
/// find matches 500) because a compiled `Regex` is orders of magnitude
/// heavier per entry than a cursor or a match record — it carries the
/// compiled program plus a lazy-DFA cache pool.
pub(super) const REGEX_CACHE_CAP: usize = 64;

thread_local! {
    /// Compiled-regex memo keyed by `(pattern, case_insensitive)`.
    ///
    /// **Why this exists**: regex *compilation* dominates regex *matching*
    /// by orders of magnitude for the short patterns spreadsheets use, and
    /// the previous code recompiled on every single cell evaluation — a
    /// 100k-row REGEXTEST column paid 100k compilations (plus 100k `format!`
    /// allocations on the case-insensitive path) to run 100k trivial
    /// matches.
    ///
    /// **Why `thread_local!` + `RefCell` rather than `OnceLock<Mutex<..>>`**:
    /// the shipping target is wasm, which is single-threaded, so a mutex
    /// would be pure overhead there; natively `cargo test` runs on many
    /// threads and one shared lock would serialise every regex evaluation
    /// in the process and put lock traffic on the hottest path. Per-thread
    /// caches make a hit lock-free. The cost — each thread compiles a
    /// pattern once — is bounded by `REGEX_CACHE_CAP` × threads and is not
    /// wasted work anyway: a `Regex`'s internal DFA cache is per-thread in
    /// substance regardless of how the object is shared. `eval.rs`'s `LET_FRAMES`
    /// already establishes `thread_local!` as the evaluator's idiom.
    ///
    /// **Why `Arc<Regex>`**: callers hold the regex across `captures_iter`
    /// borrows, so handing out a clone is far simpler than lending a
    /// `RefCell` borrow into caller code. `Arc` makes the clone an
    /// unambiguous refcount bump instead of relying on `Regex: Clone` being
    /// cheap.
    ///
    /// **Why two maps instead of one keyed by `(String, bool)`**: a tuple key
    /// cannot be probed with a borrowed `&str`, so every *hit* would have to
    /// allocate a `String` just to look itself up — reintroducing on the hot
    /// path the allocation this cache exists to remove. Indexing by
    /// `case_insensitive as usize` keeps the lookup allocation-free.
    static REGEX_CACHE: RefCell<[HashMap<String, Arc<regex::Regex>>; 2]> =
        RefCell::new([HashMap::new(), HashMap::new()]);
}

#[cfg(test)]
thread_local! {
    /// Test-only count of *actual* `regex::Regex::new` calls, so the cache
    /// tests can assert a repeat evaluation never reaches the compiler.
    /// Thread-local to match the cache it observes — `cargo test` is
    /// multi-threaded and a shared counter would be both racy and
    /// cross-contaminated by other tests.
    static REGEX_COMPILE_COUNT: Cell<usize> = const { Cell::new(0) };
}

/// Compile `pattern`, memoised per thread.
///
/// Only *successes* are cached, on purpose:
///   - A failure has no `Arc<Regex>` to store, and `regex::Error` carries a
///     `String` we would have to clone on every subsequent hit.
///   - An invalid pattern is a cold path — the cell shows `#VALUE!` and the
///     author fixes the typo — so the recompile cost is irrelevant, whereas
///     a sheet that generates garbage patterns (`=REGEXTEST(A1, B1)` over a
///     column of junk) would otherwise evict the genuinely hot entries.
///   - Not caching failures also means no pattern can ever be *pinned* as
///     permanently-failing by a cache entry: every evaluation of a bad
///     pattern re-derives its error from the compiler.
/// The observable result of an invalid pattern is therefore byte-identical
/// to the uncached version.
pub(super) fn compile_regex(
    pattern: &str,
    case_insensitive: bool,
) -> Result<Arc<regex::Regex>, regex::Error> {
    let slot = usize::from(case_insensitive);
    // Borrow only long enough to look up: `Regex::new` below must not run
    // while the `RefCell` is held.
    let hit = REGEX_CACHE.with(|cache| cache.borrow()[slot].get(pattern).cloned());
    if let Some(re) = hit {
        return Ok(re);
    }

    #[cfg(test)]
    REGEX_COMPILE_COUNT.with(|c| c.set(c.get() + 1));
    // 方言改写只在**未命中**时跑：缓存键是原始模式，命中路径一个字节都不动。
    // 见 `eval_regex_ascii.rs` —— `\d` 一族要和 Excel（PCRE2 默认）以及 TS
    // 引擎（JS `RegExp`）一样只认 ASCII。
    let rewritten = super::ascii::to_ascii_classes(pattern);
    let compiled = if case_insensitive {
        regex::Regex::new(&format!("(?i){}", rewritten))?
    } else {
        regex::Regex::new(&rewritten)?
    };
    let re = Arc::new(compiled);

    REGEX_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        // Eviction is clear-all rather than LRU. With pattern cardinality
        // far under the cap this branch is effectively never taken; when it
        // IS taken the workload is one that synthesises patterns per row,
        // where there is no reuse for recency to exploit — LRU would tax
        // every cache *hit* with bookkeeping to buy nothing. Clear-all is
        // O(1) amortised, adds zero cost to the hit path, and its worst
        // case is a single recompile of a still-hot pattern.
        if cache[0].len() + cache[1].len() >= REGEX_CACHE_CAP {
            cache[0].clear();
            cache[1].clear();
        }
        cache[slot].insert(pattern.to_string(), Arc::clone(&re));
    });
    Ok(re)
}

/// Live entry count across both case slots. Test-only introspection for the
/// cache tests — nothing in the evaluator needs it.
#[cfg(test)]
pub(super) fn regex_cache_len() -> usize {
    REGEX_CACHE.with(|cache| {
        let cache = cache.borrow();
        cache[0].len() + cache[1].len()
    })
}

/// How many times this thread actually invoked `regex::Regex::new`.
#[cfg(test)]
pub(super) fn regex_compile_count() -> usize {
    REGEX_COMPILE_COUNT.with(|c| c.get())
}

/// Drop this thread's cache and zero its compile counter. Cache state is
/// per-thread and libtest gives no ordering guarantee about which tests
/// share a thread, so a cache test must start from a known-empty state
/// rather than assume it owns the thread.
#[cfg(test)]
pub(super) fn regex_cache_reset() {
    REGEX_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        cache[0].clear();
        cache[1].clear();
    });
    REGEX_COMPILE_COUNT.with(|c| c.set(0));
}
