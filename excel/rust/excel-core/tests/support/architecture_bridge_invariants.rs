// Transitional bridge-marker architecture invariant test.

#[test]
fn bridge_markers_within_policy() {
    let mut total = 0;
    let mut violations = Vec::new();
    for key in ["sheet", "workbook", "store"] {
        let src = file_by_key(key);
        for (line_no, line) in src.lines().enumerate() {
            let mut rest = line;
            while let Some(pos) = rest.find("BRIDGE") {
                rest = &rest[pos + "BRIDGE".len()..];
                total += 1;
                let phase = rest
                    .strip_prefix("(delete-by: P")
                    .and_then(|t| t.chars().next())
                    .and_then(|c| c.to_digit(10))
                    .filter(|_| rest.contains("-exit)"));
                match phase {
                    None => violations.push(format!(
                        "{key}.rs:{}: BRIDGE without well-formed `(delete-by: P<n>-exit)` tag",
                        line_no + 1
                    )),
                    Some(p) if (PHASE as u32) >= p => violations.push(format!(
                        "{key}.rs:{}: BRIDGE(delete-by: P{p}-exit) survived past its phase (now P{PHASE})",
                        line_no + 1
                    )),
                    Some(_) => {}
                }
            }
        }
    }
    assert!(
        violations.is_empty(),
        "INV-8 violations:\n  {}",
        violations.join("\n  ")
    );
    if PHASE >= 6 {
        assert_eq!(total, 0, "INV-8: {total} BRIDGE marker(s) survived P6 exit");
    }
}
