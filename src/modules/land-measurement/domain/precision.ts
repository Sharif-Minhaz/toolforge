/** Digits after the point for a figure of one or more: a hundredth of a কাঠা is 7 sq ft. */
const WHOLE_FRACTION_DIGITS = 4;

/** Significant digits kept below one, so 0.00002296 acres does not round to 0. */
const SMALL_SIGNIFICANT_DIGITS = 4;

/** `Intl.NumberFormat` refuses more than this many fraction digits in older engines. */
const MAX_FRACTION_DIGITS = 12;

/**
 * How many decimals to show a converted figure with. A fixed count fails both
 * ways: four places turn one sq ft in acres into a zero, and twelve turn five
 * কাঠা in sq ft into 3,600.000000000000. So whole figures get four places and
 * fractions get four significant digits, however far after the point those are.
 */
export function fractionDigitsFor(value: number): number {
    const magnitude = Math.abs(value);

    if (magnitude === 0 || magnitude >= 1) {
        return WHOLE_FRACTION_DIGITS;
    }

    const leadingZeros = Math.floor(-Math.log10(magnitude));

    return Math.min(MAX_FRACTION_DIGITS, leadingZeros + SMALL_SIGNIFICANT_DIGITS);
}
