// Formula-state architecture invariant tests.

#[test]
fn formula_cell_evaluation_has_one_store_owned_entry() {
    let sheet = sheet_rs();
    let sheet_production = sheet.split("#[cfg(test)]").next().unwrap_or(&sheet);
    assert_eq!(
        sheet_production.matches("eval_expr_with_provider(").count(),
        1,
        "formula-cell evaluation gained a parallel entry outside formula-inner"
    );

    let workbook = workbook_rs();
    let workbook_production = workbook.split("#[cfg(test)]").next().unwrap_or(&workbook);
    assert_eq!(
        workbook_production
            .matches("eval_expr_with_provider(")
            .count(),
        1,
        "workbook direct evaluation must stay limited to top-level defined-name construction"
    );
}

#[test]
fn formula_record_is_structural_metadata_only() {
    let source = sheet_rs();
    let (_, after_start) = source
        .split_once("pub(crate) struct FormulaRecord {")
        .expect("FormulaRecord declaration");
    let (body, _) = after_start
        .split_once("\n}")
        .expect("FormulaRecord closing brace");
    let fields: Vec<&str> = body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("///"))
        .collect();
    assert_eq!(
        fields,
        [
            "expr: Rc<Expr>,",
            "cycle_checked_at: Cell<u64>,",
            "deps: RefCell<HashSet<CellAddress>>,",
            "static_ranges: RefCell<HashSet<CellRange>>,",
        ],
        "FormulaRecord acquired response state; formula results/reactive freshness must stay in Store"
    );
}

#[test]
fn ts_worker_formula_debug_state_has_no_shadow_override() {
    if PHASE < 7 {
        return;
    }

    let source = worker_runtime_ts();
    let compact = source.replace([' ', '\n', '\r', '\t'], "");
    assert!(
        compact.contains(
            "case'debugFormulaCacheState':returnstate.workbook.debugFormulaCacheState(\
             Number(msg.sheet),String(msg.addr??''))"
        ),
        "P7 requires debugFormulaCacheState to delegate directly to workbook state"
    );

    let retired_shadow_state = [
        "readFormulaCells",
        "markFormulaRead",
        "hasFormulaRead",
        "invalidateReadOnMutation",
    ];
    let survived: Vec<&str> = retired_shadow_state
        .into_iter()
        .filter(|name| source.contains(name))
        .collect();
    assert!(
        survived.is_empty(),
        "P7 worker debug shadow state reintroduced: {survived:?}"
    );
}
