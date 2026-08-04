use super::*;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum SubtotalHiddenPolicy {
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
pub(super) struct SubtotalHiddenSets {
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
pub(super) fn subtotal_hidden_for_arg(
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
pub(super) fn for_each_subtotal_value(
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
