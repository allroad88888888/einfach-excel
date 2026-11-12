//! Exact finite-f64 accumulation, rounded once after division by the numeric count.
//! Each value is an integer multiple of 2^-1074. 34 limbs cover 2098 value bits
//! plus the 64-bit maximum slice length; no scaling can discard a small residual.
const LIMBS: usize = 34;
type Magnitude = [u64; LIMBS];

fn accumulate(sum: &mut Magnitude, number: f64) {
    let bits = number.to_bits();
    let exponent = ((bits >> 52) & 0x7ff) as usize;
    let mantissa = (bits & ((1_u64 << 52) - 1)) | if exponent == 0 { 0 } else { 1_u64 << 52 };
    let shift = exponent.saturating_sub(1);
    let mut index = shift / 64;
    let mut carry = (mantissa as u128) << (shift % 64);
    while carry != 0 {
        let total = sum[index] as u128 + (carry & u64::MAX as u128);
        sum[index] = total as u64;
        carry = (carry >> 64) + (total >> 64);
        index += 1;
    }
}

fn subtract(larger: &mut Magnitude, smaller: &Magnitude) {
    let mut borrow = false;
    for (large, small) in larger.iter_mut().zip(smaller) {
        let (difference, first) = large.overflowing_sub(*small);
        let (difference, second) = difference.overflowing_sub(u64::from(borrow));
        *large = difference;
        borrow = first || second;
    }
    debug_assert!(!borrow);
}

fn divide(value: &mut Magnitude, count: usize) -> u64 {
    let mut remainder = 0_u128;
    for limb in value.iter_mut().rev() {
        let numerator = (remainder << 64) | *limb as u128;
        *limb = (numerator / count as u128) as u64;
        remainder = numerator % count as u128;
    }
    remainder as u64
}

fn rounded(value: &Magnitude, remainder: u64, count: usize) -> f64 {
    let bits = value.iter().rposition(|limb| *limb != 0)
        .map(|index| index * 64 + 64 - value[index].leading_zeros() as usize).unwrap_or(0);
    let shift = bits.saturating_sub(53);
    let index = shift / 64;
    let offset = shift % 64;
    let mut significand = value[index] >> offset;
    if offset != 0 && index + 1 < LIMBS {
        significand |= value[index + 1] << (64 - offset);
    }
    let round_up = if shift == 0 {
        let twice = remainder as u128 * 2;
        twice > count as u128 || (twice == count as u128 && significand & 1 != 0)
    } else {
        let guard_index = (shift - 1) / 64;
        let guard_offset = (shift - 1) % 64;
        let guard = value[guard_index] & (1_u64 << guard_offset) != 0;
        let sticky = remainder != 0 || value[..guard_index].iter().any(|limb| *limb != 0)
            || value[guard_index] & ((1_u64 << guard_offset) - 1) != 0;
        guard && (sticky || significand & 1 != 0)
    };
    significand += u64::from(round_up);
    if bits <= 52 { return f64::from_bits(significand); }
    let mut exponent = bits - 52;
    if significand == 1_u64 << 53 {
        significand >>= 1;
        exponent += 1;
    }
    // A mean of finite inputs is bounded by the largest finite input.
    debug_assert!(exponent < 0x7ff);
    f64::from_bits((exponent as u64) << 52 | (significand & ((1_u64 << 52) - 1)))
}

pub(super) fn mean(numbers: &[f64]) -> f64 {
    debug_assert!(!numbers.is_empty() && numbers.iter().all(|n| n.is_finite()));
    let (mut positive, mut negative) = ([0; LIMBS], [0; LIMBS]);
    for &number in numbers {
        accumulate(if number.is_sign_negative() { &mut negative } else { &mut positive }, number);
    }
    let negative_result = positive.iter().rev().cmp(negative.iter().rev()).is_lt();
    let mut magnitude = if negative_result {
        subtract(&mut negative, &positive);
        negative
    } else {
        subtract(&mut positive, &negative);
        positive
    };
    let remainder = divide(&mut magnitude, numbers.len());
    let result = rounded(&magnitude, remainder, numbers.len());
    if negative_result { -result } else { result }
}

#[cfg(test)]
mod tests {
    use super::mean;
    #[test]
    fn extreme_cancellation_preserves_representable_residuals() {
        for small in [2.0_f64.powi(-100), f64::MIN_POSITIVE, f64::from_bits(4)] {
            let large = 2.0_f64.powi(1023);
            assert_eq!(mean(&[large, small, -large, 0.]), small / 4.);
            assert_eq!(mean(&[-large, -small, large, 0.]), -small / 4.);
        }
    }
    #[test]
    fn finite_maxima_and_subnormal_means_round_without_overflow_or_underflow_loss() {
        for count in [1, 2, 3, 11, 1000] {
            assert_eq!(mean(&vec![f64::MAX; count]), f64::MAX);
            assert_eq!(mean(&vec![f64::from_bits(1); count]), f64::from_bits(1));
        }
        assert_eq!(mean(&[f64::MAX, -f64::MAX]), 0.);
        assert_eq!(mean(&[f64::from_bits(1), 0.]), 0.);
        assert_eq!(mean(&[f64::from_bits(3), 0.]), f64::from_bits(2));
        assert_eq!(mean(&[f64::MIN_POSITIVE, f64::from_bits((1_u64 << 52) - 1)]), f64::MIN_POSITIVE);
    }
    #[test]
    fn ordinary_means_and_round_to_even_boundaries() {
        assert_eq!(mean(&[0., 10., 20., 20.]), 12.5);
        assert_eq!(mean(&[-6., -3., 0.]), -3.);
        assert_eq!(mean(&[1., f64::from_bits(1.0_f64.to_bits() + 1)]), 1.);
        assert_eq!(mean(&[1., f64::from_bits(1.0_f64.to_bits() + 3)]), f64::from_bits(1.0_f64.to_bits() + 2));
        assert_eq!(mean(&[1e308, 1., -1e308, 0.25]), 0.3125);
    }
}
