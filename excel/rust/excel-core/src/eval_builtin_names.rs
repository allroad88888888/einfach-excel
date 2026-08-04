//! 内建公式名称的公开保留名入口。

use super::{
    eval_builtin_names_a_h::is_builtin_name_a_h,
    eval_builtin_names_i_r::is_builtin_name_i_r,
    eval_builtin_names_s_z::is_builtin_name_s_z,
};

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
    is_builtin_name_a_h(name) || is_builtin_name_i_r(name) || is_builtin_name_s_z(name)
}
