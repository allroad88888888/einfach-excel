// Dependency-graph and source-wiring architecture invariant tests.

#[test]
fn forbidden_identifiers_absent_for_current_phase() {
    let mut violations = Vec::new();
    for (ident, from_phase, files) in FORBIDDEN {
        if PHASE < *from_phase {
            continue;
        }
        for key in *files {
            let src = file_by_key(key);
            if src.contains(ident) {
                violations.push(format!(
                    "{key}.rs still contains `{ident}` (forbidden since P{from_phase})"
                ));
            }
        }
    }
    assert!(
        violations.is_empty(),
        "parallel-graph machinery survived its deletion phase:\n  {}\nSee WORKPLAN §2/§6.",
        violations.join("\n  ")
    );
}

#[test]
fn forbidden_type_shapes_absent_for_current_phase() {
    let strip = |s: &str| s.replace([' ', '\n', '\t'], "");
    let mut sources: Vec<(String, String)> = sheet_family_sources()
        .into_iter()
        .map(|(name, src)| (name, strip(&src)))
        .collect();
    sources.extend(
        workbook_family_sources()
            .into_iter()
            .map(|(name, src)| (name, strip(&src))),
    );
    sources.extend(
        eval_family_sources()
            .into_iter()
            .map(|(name, src)| (name, strip(&src))),
    );
    let mut violations = Vec::new();
    for (shape, from_phase) in FORBIDDEN_SHAPES {
        if PHASE < *from_phase {
            continue;
        }
        for (name, src) in &sources {
            if src.contains(shape) {
                violations.push(format!(
                    "{name}.rs contains forbidden dep-graph shape `{shape}`"
                ));
            }
        }
    }
    assert!(
        violations.is_empty(),
        "address→formula dependency shape reintroduced (INV-2):\n  {}",
        violations.join("\n  ")
    );
}

#[test]
fn required_store_functions_present_for_current_phase() {
    let src = store_rs();
    let missing: Vec<&str> = REQUIRED_STORE_FNS
        .iter()
        .filter(|(_, from)| PHASE >= *from)
        .filter(|(f, _)| !src.contains(f))
        .map(|(f, _)| *f)
        .collect();
    assert!(
        missing.is_empty(),
        "store.rs is missing store.ts-isomorphic functions (INV-1): {missing:?}"
    );
}

#[test]
fn required_sheet_store_wiring_present_for_current_phase() {
    let source = sheet_rs();
    let production = source.split("#[cfg(test)]").next().unwrap_or(&source);
    let compact = production.replace([' ', '\n', '\r', '\t'], "");
    let missing: Vec<&str> = REQUIRED_SHEET_WIRING
        .iter()
        .filter(|(_, from)| PHASE >= *from)
        .filter(|(shape, _)| !compact.contains(shape))
        .map(|(shape, _)| *shape)
        .collect();
    assert!(
        missing.is_empty(),
        "sheet.rs is missing Store-owned formula/range wiring (INV-1/INV-2): {missing:?}"
    );
}

#[test]
fn required_workbook_store_wiring_present_for_current_phase() {
    let source = workbook_rs();
    let production = source.split("#[cfg(test)]").next().unwrap_or(&source);
    let compact = production.replace([' ', '\n', '\r', '\t'], "");
    let missing: Vec<&str> = REQUIRED_WORKBOOK_WIRING
        .iter()
        .filter(|(_, from)| PHASE >= *from)
        .filter(|(shape, _)| !compact.contains(shape))
        .map(|(shape, _)| *shape)
        .collect();
    assert!(
        missing.is_empty(),
        "workbook.rs is missing shared Store/context wiring (INV-1/INV-2): {missing:?}"
    );
}
