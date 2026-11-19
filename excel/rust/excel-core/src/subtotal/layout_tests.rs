use super::layout::plan_subtotal_layout;
use super::layout_contract::{
    SubtotalCalculation, SubtotalFunction, SubtotalLabel, SubtotalLayer, SubtotalPlacement,
};
use crate::{CellAddress, CellRange};
use einfach_core::Value;

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn records(rows: &[(&str, &str, f64)]) -> Vec<Vec<Value>> {
    rows.iter()
        .map(|&(region, category, amount)| {
            vec![
                Value::Text(region.into()),
                Value::Text(category.into()),
                Value::Number(amount),
            ]
        })
        .collect()
}

#[test]
fn nested_runs_preserve_detail_order_and_place_child_before_parent_totals() {
    let details = records(&[
        ("East", "Ball", 10.0),
        ("east", "Ball", 20.0),
        ("East", "Court", 2.0),
        ("West", "Court", 3.0),
        ("East", "Ball", 4.0),
    ]);
    let sum = SubtotalCalculation {
        function: SubtotalFunction::Sum,
        columns: vec![2],
    };
    let result = plan_subtotal_layout(
        range("A1", "C6"),
        &details,
        &[
            SubtotalLayer {
                group_by_column: 0,
                calculations: vec![sum.clone()],
            },
            SubtotalLayer {
                group_by_column: 1,
                calculations: vec![sum],
            },
        ],
        SubtotalPlacement::Below,
        40,
        12,
    )
    .unwrap();
    assert_eq!(result.target, range("A1", "C14"));
    assert_eq!(result.insertions, [(3, 1), (4, 2), (5, 2), (6, 3)]);
    assert_eq!(
        result
            .summaries
            .iter()
            .map(|row| row.row)
            .collect::<Vec<_>>(),
        [3, 5, 6, 8, 9, 11, 12, 13]
    );
    assert_eq!(result.summaries[2].details, 1..=4);
    assert_eq!(
        result.summaries[2].label,
        SubtotalLabel::Group {
            column: 0,
            value: "East".into()
        }
    );
    assert_eq!(result.summaries[7].details, 1..=10);
    assert_eq!(result.outline[..3], [1..=12, 1..=5, 1..=2]);
}

#[test]
fn above_layout_keeps_summary_rows_outside_their_own_collapsible_detail() {
    let details = records(&[("East", "Ball", 10.0), ("east", "Ball", 20.0)]);
    let result = plan_subtotal_layout(
        range("B5", "D7"),
        &details,
        &[SubtotalLayer {
            group_by_column: 1,
            calculations: vec![SubtotalCalculation {
                function: SubtotalFunction::Average,
                columns: vec![3],
            }],
        }],
        SubtotalPlacement::Above,
        40,
        12,
    )
    .unwrap();
    assert_eq!(result.insertions, [(5, 2)]);
    assert_eq!(result.summaries[0].row, 5);
    assert_eq!(
        result.summaries[0].label,
        SubtotalLabel::GrandTotal { column: 1 }
    );
    assert_eq!(result.summaries[1].row, 6);
    assert_eq!(result.summaries[1].details, 7..=8);
    assert_eq!(result.outline, [6..=8, 7..=8]);
}
