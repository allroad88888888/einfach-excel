//! 大纲区间模型：嵌套、端点、折叠并集及非法配置的原子拒绝。
use einfach_excel_core::outline::{OutlineAction as Action, OutlineAxis as Axis, SheetOutline};

#[test]
fn nested_and_duplicate_ranges_have_stable_levels_and_independent_collapse() {
    let outline = SheetOutline::default()
        .changed(Axis::Row, Action::Group { start: 4, end: 6 })
        .unwrap()
        .changed(Axis::Row, Action::Group { start: 2, end: 9 })
        .unwrap()
        .changed(Axis::Row, Action::Group { start: 4, end: 6 })
        .unwrap();
    assert_eq!(outline.levels(Axis::Row).unwrap(), vec![1, 2, 3]);
    let collapsed = outline
        .changed(
            Axis::Row,
            Action::SetCollapsed {
                index: 0,
                collapsed: true,
            },
        )
        .unwrap()
        .changed(
            Axis::Row,
            Action::SetCollapsed {
                index: 2,
                collapsed: true,
            },
        )
        .unwrap();
    assert_eq!(
        collapsed.hidden_indices(Axis::Row).collect::<Vec<_>>(),
        (2..=9).collect::<Vec<_>>()
    );
    let expanded = collapsed
        .changed(
            Axis::Row,
            Action::SetCollapsed {
                index: 0,
                collapsed: false,
            },
        )
        .unwrap();
    assert_eq!(
        expanded.hidden_indices(Axis::Row).collect::<Vec<_>>(),
        vec![4, 5, 6]
    );
    let ungrouped = expanded
        .changed(Axis::Row, Action::Ungroup { start: 2, end: 9 })
        .unwrap();
    assert_eq!(ungrouped.levels(Axis::Row).unwrap(), vec![1, 2]);
    assert!(ungrouped.hidden_indices(Axis::Row).next().is_none());
}

#[test]
fn eight_levels_and_disjoint_axes_are_bounded_without_cells() {
    let mut outline = SheetOutline::default();
    for _ in 0..8 {
        outline = outline
            .changed(
                Axis::Row,
                Action::Group {
                    start: 0,
                    end: 1_048_575,
                },
            )
            .unwrap();
    }
    assert!(outline
        .changed(Axis::Row, Action::Group { start: 0, end: 0 })
        .is_err());
    outline = outline
        .changed(
            Axis::Column,
            Action::Group {
                start: 16_383,
                end: 16_383,
            },
        )
        .unwrap();
    assert_eq!(outline.levels(Axis::Column).unwrap(), vec![1]);
    let collapsed = outline
        .changed(Axis::Row, Action::ShowLevel { level: 1 })
        .unwrap();
    assert_eq!(collapsed.hidden_indices(Axis::Row).count(), 1_048_576);
    let expanded = collapsed
        .changed(Axis::Row, Action::ShowLevel { level: 9 })
        .unwrap();
    assert!(expanded.hidden_indices(Axis::Row).next().is_none());
}

#[test]
fn rejects_partial_overlap_bounds_missing_group_invalid_level_and_unsorted_restore() {
    let outline = SheetOutline::default()
        .changed(Axis::Row, Action::Group { start: 2, end: 5 })
        .unwrap();
    for action in [
        Action::Group { start: 4, end: 7 },
        Action::Group { start: 1, end: 3 },
        Action::Group { start: 9, end: 8 },
        Action::Group {
            start: 0,
            end: 1_048_576,
        },
        Action::SetCollapsed {
            index: 1,
            collapsed: true,
        },
        Action::ShowLevel { level: 0 },
        Action::ShowLevel { level: 10 },
    ] {
        assert!(outline.changed(Axis::Row, action).is_err());
    }
    assert!(outline
        .changed(
            Axis::Column,
            Action::Group {
                start: 0,
                end: 16_384
            }
        )
        .is_err());
    let mut restored = outline
        .changed(Axis::Row, Action::Group { start: 0, end: 8 })
        .unwrap();
    restored.rows.reverse();
    assert!(restored.validate().is_err());
    assert_eq!(outline.rows.len(), 1);
}

#[test]
fn level_buttons_and_ungroup_leave_disjoint_branches_independent() {
    let mut outline = SheetOutline::default();
    for (start, end) in [(1, 9), (2, 4), (6, 8), (20, 25)] {
        outline = outline
            .changed(Axis::Row, Action::Group { start, end })
            .unwrap();
    }
    outline = outline
        .changed(Axis::Row, Action::ShowLevel { level: 2 })
        .unwrap();
    assert_eq!(
        outline.hidden_indices(Axis::Row).collect::<Vec<_>>(),
        vec![2, 3, 4, 6, 7, 8]
    );
    outline = outline
        .changed(Axis::Row, Action::Ungroup { start: 1, end: 9 })
        .unwrap();
    assert_eq!(
        outline
            .rows
            .iter()
            .map(|g| (g.start, g.end))
            .collect::<Vec<_>>(),
        vec![(1, 9), (20, 25)]
    );
}
