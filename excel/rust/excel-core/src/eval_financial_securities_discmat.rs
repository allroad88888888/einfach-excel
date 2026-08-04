use super::*;

pub(super) fn fn_pricedisc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
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
    let discount = match fin_coerce(&args[2], provider) {
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
    if discount <= 0.0 || redemption <= 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    Value::Number(redemption * (1.0 - discount * yf))
}

pub(super) fn fn_yielddisc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
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
    if pr <= 0.0 || redemption <= 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if yf == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number((redemption - pr) / pr / yf)
}

pub(super) fn fn_pricemat(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 6 {
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
    let issue = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate < 0.0 || yld < 0.0 || settlement >= maturity || issue >= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let dim = match yearfrac_basis(issue, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let a = match yearfrac_basis(issue, settlement, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let dsm = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let denom = 1.0 + dsm * yld;
    if denom == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let numer = 100.0 + dim * rate * 100.0;
    let price = numer / denom - a * rate * 100.0;
    if price.is_finite() {
        Value::Number(price)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_yieldmat(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 6 {
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
    let issue = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate < 0.0 || pr <= 0.0 || settlement >= maturity || issue >= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let dim = match yearfrac_basis(issue, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let a = match yearfrac_basis(issue, settlement, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let dsm = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if dsm == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // YIELDMAT closed form: y = ((1 + DIM*rate) / (pr/100 + A*rate) - 1) / DSM.
    let denom_inner = pr / 100.0 + a * rate;
    if denom_inner == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let y = ((1.0 + dim * rate) / denom_inner - 1.0) / dsm;
    if y.is_finite() {
        Value::Number(y)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
