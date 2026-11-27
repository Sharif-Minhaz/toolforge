import { describe, expect, test } from "bun:test";

import { formatDayFirst, parseDateInput } from "../domain/gregorian";
import { ageSearchParamsSchema } from "../validation/age-options";

describe("parseDateInput", () => {
    test.each([
        ["12/05/1998"],
        ["12-05-1998"],
        ["12.05.1998"],
        ["12 05 1998"],
        ["12/5/1998"],
        ["  12/05/1998  "],
        ["1998-05-12"],
        ["১২/০৫/১৯৯৮"],
    ])("reads %s as 12 May 1998, day first", (text) => {
        expect(parseDateInput(text)).toEqual({
            ok: true,
            date: { year: 1998, month: 5, day: 12 },
        });
    });

    test("refuses rolled-over fields instead of absorbing them", () => {
        expect(parseDateInput("31/04/1998")).toEqual({ ok: false, reason: "invalid_date" });
        expect(parseDateInput("29/02/2025")).toEqual({ ok: false, reason: "invalid_date" });
        expect(parseDateInput("12/13/1998")).toEqual({ ok: false, reason: "invalid_date" });
    });

    test("names what is wrong", () => {
        expect(parseDateInput(" ")).toEqual({ ok: false, reason: "empty" });
        expect(parseDateInput("12 May 1998")).toEqual({ ok: false, reason: "invalid_format" });
        expect(parseDateInput("1/1/98")).toEqual({ ok: false, reason: "invalid_format" });
        expect(parseDateInput("01/01/1899")).toEqual({ ok: false, reason: "out_of_range" });
    });

    test("formats back to the form it reads", () => {
        expect(formatDayFirst({ year: 2026, month: 3, day: 5 })).toBe("05/03/2026");
    });
});

describe("ageSearchParamsSchema", () => {
    test("reads a shared link", () => {
        expect(
            ageSearchParamsSchema.parse({ dob: "12/05/1998", max: "30", alt: "25/03/2020" }),
        ).toEqual({ dob: "12/05/1998", max: 30, alt: "25/03/2020" });
    });

    test("drops each malformed field on its own", () => {
        expect(
            ageSearchParamsSchema.parse({
                mode: "nope",
                min: "eighteen",
                max: "300",
                hadj: "5",
                cal: "julian",
                date: "1/1/1431",
                dob: "12/05/1998",
            }),
        ).toEqual({ dob: "12/05/1998" });
    });
});
