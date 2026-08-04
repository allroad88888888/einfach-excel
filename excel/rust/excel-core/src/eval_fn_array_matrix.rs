//! Dispatches array matrix formula functions.

use super::*;

pub(super) fn eval_fn_array_matrix(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"MDETERM" => fn_mdeterm(args, provider),

        // NETWORKDAYS(start, end[, holidays]) — count working days
        // (Mon..Fri, excluding `holidays`) between `start` and `end`
        // inclusive on both ends. If `start > end`, the result is
        // negated (matches Excel).
        //
        // Epoch note: serials here are 1970-01-01 = 0 (see
        // TODO(excel-1900-epoch) on `date_serial`). 1970-01-01 was a
        // Thursday, so the Sunday-indexed day-of-week formula is
        // `((serial.floor() as i64) + 4).rem_euclid(7)`.
        //
        // Holidays are filtered to whole-day integers (non-numeric
        // cells are silently skipped — Excel raises #VALUE! on text
        // holidays, but we stay lenient because mixed-type holiday
        // columns are common when data is sparse). Errors inside the
        // holiday range *do* propagate via WrongType to mirror the
        // strict path of NETWORKDAYS.INTL.
        "MMULT" => fn_mmult(args, provider),
        "MINVERSE" => fn_minverse(args, provider),
        "MUNIT" => fn_munit(args, provider),
        "TRANSPOSE" => fn_transpose(args, provider),
        // === Q batch: random / ranking / percentile / mode / A-variants / stats ===

        // RAND() — uniform [0, 1). Volatile: every evaluation draws fresh
        // from the OS-seeded thread RNG, so two `RAND()` calls in the same
        // formula return different values (Excel parity).
                _ => unreachable!(),
    }
}
