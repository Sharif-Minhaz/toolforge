import { describe, expect, test } from "bun:test";

import {
    add,
    compare,
    div,
    fromNumber,
    int,
    mul,
    parseExact,
    ratio,
    sub,
    sum,
    toDecimal,
} from "@/modules/zakat/domain/exact";

const parse = (text: string) => {
    const value = parseExact(text);

    if (value === null) {
        throw new Error(`unparseable: ${text}`);
    }

    return value;
};

describe("exact fractions", () => {
    test("0.1 + 0.2 is exactly 0.3", () => {
        expect(add(parse("0.1"), parse("0.2"))).toEqual(parse("0.3"));
    });

    test("normalises to lowest terms with a positive denominator", () => {
        expect(ratio(10, -4)).toEqual({ n: -5n, d: 2n });
        expect(parse("2.50")).toEqual({ n: 5n, d: 2n });
    });

    test("a troy-ounce price per gram survives the round trip", () => {
        const perOunce = parse("3627.899902");
        const ounce = parse("31.1034768");
        const perGram = div(perOunce, ounce);

        expect(mul(perGram, ounce)).toEqual(perOunce);
    });

    test("2.5% of a large estate is exact to the paisa", () => {
        // 1,234,567,890.15 × 0.025 = 30,864,197.25375
        const zakat = mul(parse("1234567890.15"), parse("0.025"));

        expect(toDecimal(zakat, 5)).toBe("30864197.25375");
        expect(toDecimal(zakat, 2, "up")).toBe("30864197.26");
        expect(toDecimal(zakat, 2, "down")).toBe("30864197.25");
        expect(toDecimal(zakat, 2, "half-up")).toBe("30864197.25");
    });

    test("rounding modes on exact halves and on negatives", () => {
        expect(toDecimal(parse("0.125"), 2, "half-up")).toBe("0.13");
        expect(toDecimal(parse("0.125"), 2, "down")).toBe("0.12");
        expect(toDecimal(parse("-1.5"), 0, "half-up")).toBe("-2");
        expect(toDecimal(parse("-0.001"), 2, "half-up")).toBe("0.00");
        expect(toDecimal(int(7), 0)).toBe("7");
        expect(toDecimal(ratio(1, 3), 4)).toBe("0.3333");
    });

    test("compare, sum and sub", () => {
        expect(compare(parse("85"), parse("85.000"))).toBe(0);
        expect(compare(parse("84.999"), parse("85"))).toBe(-1);
        expect(sum([parse("1.1"), parse("2.2"), parse("3.3")])).toEqual(parse("6.6"));
        expect(sub(parse("1"), parse("1.01"))).toEqual(parse("-0.01"));
    });

    test("parses only plain decimals", () => {
        expect(parseExact("1e3")).toBeNull();
        expect(parseExact("1,000")).toBeNull();
        expect(parseExact("")).toBeNull();
        expect(parseExact(" 12.5 ")).toEqual(ratio(25, 2));
    });

    test("fromNumber takes the shortest spelling, not the binary noise", () => {
        expect(fromNumber(0.1)).toEqual(ratio(1, 10));
        expect(fromNumber(43.279999)).toEqual(parse("43.279999"));
        expect(fromNumber(1e-7)).toEqual(ratio(1, 10_000_000));
        expect(fromNumber(Number.NaN)).toBeNull();
    });

    test("division by zero is a programmer error", () => {
        expect(() => div(int(1), int(0))).toThrow(RangeError);
    });
});
