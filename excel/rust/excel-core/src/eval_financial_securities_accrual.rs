use super::*;

pub(super) fn fn_accrint(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 8 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let issue = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // first_interest is consumed for parity with Excel's signature but
    // doesn't affect the simplified computation.
    let _first_interest = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let settlement = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let par = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[5], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // calc_method (arg 7) is accepted for parity but doesn't change our
    // simplified result (Excel only varies behavior when settlement
    // crosses multiple periods backward).
    if args.len() == 8 {
        if let Err(e) = fin_coerce(&args[7], provider) {
            return Value::Error(e);
        }
    }
    if rate <= 0.0 || par <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if settlement <= issue {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(issue, settlement, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    Value::Number(par * rate * yf)
}

pub(super) fn fn_accrintm(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let issue = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let settlement = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let par = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate <= 0.0 || par <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if settlement <= issue {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(issue, settlement, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    Value::Number(par * rate * yf)
}

pub(super) fn fn_disc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if pr <= 0.0 || redemption <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if yf == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let r = (redemption - pr) / redemption / yf;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_intrate(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let investment = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if investment <= 0.0 || redemption <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if yf == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let r = (redemption - investment) / investment / yf;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
