use super::*;

pub(super) fn yearfrac_basis(start: f64, end: f64, basis: i64) -> Result<f64, ValueError> {
    let (lo, hi) = if start <= end {
        (start, end)
    } else {
        (end, start)
    };
    match basis {
        0 | 4 => {
            let (y1, m1, d1) = date_from_serial(lo);
            let (y2, m2, d2) = date_from_serial(hi);
            let num =
                (y2 - y1) as f64 * 360.0 + (m2 as f64 - m1 as f64) * 30.0 + (d2 as f64 - d1 as f64);
            Ok(num / 360.0)
        }
        1 => Ok((hi - lo) / 365.0),
        2 => Ok((hi - lo) / 360.0),
        3 => Ok((hi - lo) / 365.0),
        _ => Err(ValueError::InvalidValue),
    }
}

pub(super) fn fin_basis(args: &[Expr], idx: usize, provider: &dyn EvalProvider) -> Result<i64, ValueError> {
    if args.len() <= idx {
        return Ok(0);
    }
    let b = fin_coerce(&args[idx], provider)?;
    let n = b.trunc() as i64;
    if !(0..=4).contains(&n) {
        return Err(ValueError::InvalidValue);
    }
    Ok(n)
}

pub(super) fn day_diff(start: f64, end: f64) -> f64 {
    end.floor() - start.floor()
}

pub(super) fn fn_sln(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let life = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if life <= 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number((cost - salvage) / life)
}

pub(super) fn fn_syd(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let life = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let per = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if life <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if per < 1.0 || per > life {
        return Value::Error(ValueError::Overflow);
    }
    let result = (cost - salvage) * (life - per + 1.0) * 2.0 / (life * (life + 1.0));
    Value::Number(result)
}
