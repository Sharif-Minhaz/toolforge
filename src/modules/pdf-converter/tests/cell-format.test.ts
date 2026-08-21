import { describe, expect, test } from "bun:test";

import {
    formatCellNumber,
    isDateFormat,
    isDateFormatCode,
    isPercentFormat,
    serialToDateParts,
} from "@/modules/pdf-converter/domain/cell-format";

describe("format codes", () => {
    test("recognises the built-in date and time ids", () => {
        expect(isDateFormat(14, null)).toBe(true);
        expect(isDateFormat(22, null)).toBe(true);
        expect(isDateFormat(0, null)).toBe(false);
    });

    test("reads a custom code, ignoring literal text and locale prefixes", () => {
        expect(isDateFormatCode("dd/mm/yyyy")).toBe(true);
        expect(isDateFormatCode('"day" 0.00')).toBe(false);
        expect(isDateFormatCode("[$-409]0.00")).toBe(false);
        expect(isDateFormatCode("[$-409]d-mmm-yy")).toBe(true);
    });

    test("recognises percentages", () => {
        expect(isPercentFormat(9, null)).toBe(true);
        expect(isPercentFormat(164, "0.0%")).toBe(true);
        expect(isPercentFormat(164, '0.00" %complete"')).toBe(false);
    });
});

describe("serial dates", () => {
    // Verified against the values Excel itself shows for these serials, which
    // is the reference implementation this reader is cloning. 1 is 1900-01-01
    // in the 1900 system because day 1 is 1899-12-31 plus Lotus's phantom leap
    // day being absent below serial 61.
    test.each([
        [1, "1900-01-01"],
        [59, "1900-02-28"],
        [61, "1900-03-01"],
        [25_569, "1970-01-01"],
        [45_000, "2023-03-15"],
    ])("1900 system: serial %i is %s", (serial, expected) => {
        expect(serialToDateParts(serial, false)?.date).toBe(expected);
    });

    test("the 1904 system counts from a different epoch and has no phantom day", () => {
        expect(serialToDateParts(0, true)?.date).toBe("1904-01-01");
        expect(serialToDateParts(24_107, true)?.date).toBe("1970-01-01");
    });

    test("a fraction is a time, rounded to the minute rather than truncated", () => {
        // 0.39583333 is 09:30 stored as a float; truncating gives 09:29:59.
        expect(serialToDateParts(45_000.39583333, false)).toEqual({
            date: "2023-03-15",
            time: "09:30",
        });
    });

    test("a whole day carries no time", () => {
        expect(serialToDateParts(45_000, false)?.time).toBe(null);
    });

    test("refuses a serial that is not one", () => {
        expect(serialToDateParts(Number.NaN, false)).toBe(null);
        expect(serialToDateParts(-1, false)).toBe(null);
    });
});

describe("numbers", () => {
    test("keeps an integer whole", () => {
        expect(formatCellNumber(42)).toBe("42");
    });

    test("does not let a float's tail reach the page", () => {
        expect(formatCellNumber(0.1 + 0.2)).toBe("0.3");
    });

    test("keeps precision a sheet actually stores", () => {
        expect(formatCellNumber(1234.5678)).toBe("1234.5678");
    });
});
