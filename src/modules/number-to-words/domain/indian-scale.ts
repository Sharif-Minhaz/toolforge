/**
 * The South Asian ladder both lines can count on, largest first. After the
 * thousand every rung is a hundred times the one below — lakh, crore, then the
 * traditional names above a crore: arab (10⁹), kharab (10¹¹), neel (10¹³),
 * padma (10¹⁵) and shankh (10¹⁷).
 *
 * Shankh is the top of the ladder in common use, so a count of shankhs is
 * itself a number spelled the same way — 10¹⁹ is "one hundred shankh".
 */
export const INDIAN_SCALES = [
    "shankh",
    "padma",
    "neel",
    "kharab",
    "arab",
    "crore",
    "lakh",
    "thousand",
] as const;

export type IndianScale = (typeof INDIAN_SCALES)[number];

const UNITS: Readonly<Record<IndianScale, bigint>> = {
    shankh: 10n ** 17n,
    padma: 10n ** 15n,
    neel: 10n ** 13n,
    kharab: 10n ** 11n,
    arab: 10n ** 9n,
    crore: 10n ** 7n,
    lakh: 10n ** 5n,
    thousand: 10n ** 3n,
};

export type IndianPart = {
    /** Below a hundred on every rung but shankh, which can hold any number. */
    readonly count: bigint;
    /** `null` for the last part, the units below a thousand. */
    readonly scale: IndianScale | null;
};

/** A number taken apart into its non-zero rungs, largest first. */
export function splitIndian(value: bigint): IndianPart[] {
    const parts: IndianPart[] = [];
    let rest = value;

    for (const scale of INDIAN_SCALES) {
        const unit = UNITS[scale];
        const count = rest / unit;

        if (count > 0n) {
            parts.push({ count, scale });
        }

        rest %= unit;
    }

    if (rest > 0n) {
        parts.push({ count: rest, scale: null });
    }

    return parts;
}
