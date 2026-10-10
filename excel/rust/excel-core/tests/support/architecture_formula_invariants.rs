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

    // 条件谓词不是 cell formula：不安装单元格、不保存值，只覆盖当前显示快照。
    // 逐文件限定两个顶层用途，不能通过增加总数放行任意新的求值入口。
    let allowed = ["workbook_names", "workbook_conditional_format_formula"];
    let sources = workbook_family_sources();
    for (name, source) in &sources {
        assert_eq!(
            source.matches("eval_expr_with_provider(").count(),
            usize::from(allowed.contains(&name.as_str())),
            "unexpected workbook evaluation entry in {name}"
        );
    }
    for name in allowed {
        assert!(
            sources.iter().any(|(path, _)| path == name),
            "missing evaluation owner {name}"
        );
    }
    let predicate = sources
        .iter()
        .find(|(name, _)| name == "workbook_conditional_format_formula")
        .unwrap();
    for write_or_cache in [
        "set_cell(",
        "set_formula(",
        "create_atom(",
        "create_derived",
        "HashMap<",
        "BTreeMap<",
    ] {
        assert!(
            !predicate.1.contains(write_or_cache),
            "display predicate acquired writable or cached workbook state: {write_or_cache}"
        );
    }
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
        // FormulaRecord now lives in a sheet child module. Its sibling users
        // require child-tree visibility; visibility is not response state.
        .map(|line| line.strip_prefix("pub(super) ").unwrap_or(line))
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
            "case'debugFormulaCacheState':returnhandled(state.workbook.debugFormulaCacheState(\
             Number(msg.sheet),String(msg.addr??'')),)"
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
