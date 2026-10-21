//! Rectangle-union coverage uses boundary bands, never enumerating worksheet cells.
use super::ProtectionRange;

pub(super) fn fully_covered(target: ProtectionRange, ranges: &[ProtectionRange]) -> bool {
    let intersections: Vec<_> = ranges.iter().filter_map(|range| {
        let clipped = ProtectionRange {
            row_start: range.row_start.max(target.row_start),
            row_end: range.row_end.min(target.row_end),
            col_start: range.col_start.max(target.col_start),
            col_end: range.col_end.min(target.col_end),
        };
        (clipped.row_start <= clipped.row_end && clipped.col_start <= clipped.col_end)
            .then_some(clipped)
    }).collect();
    let mut boundaries = vec![target.row_start, target.row_end + 1];
    for range in &intersections {
        boundaries.extend([range.row_start, range.row_end + 1]);
    }
    boundaries.sort_unstable();
    boundaries.dedup();
    boundaries.windows(2).all(|band| {
        let mut intervals: Vec<_> = intersections.iter()
            .filter(|range| range.row_start <= band[0] && range.row_end >= band[1] - 1)
            .map(|range| (range.col_start, range.col_end)).collect();
        intervals.sort_unstable();
        let mut next_column = target.col_start;
        for (start, end) in intervals {
            if start > next_column { return false; }
            next_column = next_column.max(end + 1);
            if next_column > target.col_end { return true; }
        }
        false
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn r(r0: u32, c0: u32, r1: u32, c1: u32) -> ProtectionRange {
        ProtectionRange { row_start: r0, col_start: c0, row_end: r1, col_end: c1 }
    }
    #[test]
    fn adjacent_rectangles_cover_without_a_per_cell_scan() {
        assert!(fully_covered(r(0, 0, 1_048_575, 16_383),
            &[r(0, 0, 1_048_575, 7_999), r(0, 8_000, 1_048_575, 16_383)]));
    }
    #[test]
    fn diagonal_and_one_cell_holes_are_locked() {
        assert!(!fully_covered(r(0, 0, 1, 1), &[r(0, 0, 0, 0), r(1, 1, 1, 1)]));
        assert!(!fully_covered(r(0, 0, 5, 5), &[r(0, 0, 2, 5), r(3, 1, 5, 5)]));
    }
}
