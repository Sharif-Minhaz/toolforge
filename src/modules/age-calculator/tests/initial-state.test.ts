import { describe, expect, test } from "bun:test";

import { buildInitialState } from "../domain/initial-state";

const TODAY = { year: 2026, month: 11, day: 27 };

describe("buildInitialState", () => {
    test("opens on today's date as the cut-off, with nothing else filled in", () => {
        expect(buildInitialState({}, TODAY)).toEqual({
            mode: "age",
            ageFields: { birth: "", reference: "27/11/2026", min: "", max: "", relaxation: "" },
            convertFields: { calendar: "gregorian", day: "27", month: 11, year: "2026" },
            hijriAdjustment: 0,
        });
    });

    test("takes a shared link's dates and limits as typed", () => {
        const state = buildInitialState(
            { dob: "12/05/1998", on: "31/12/2026", min: 18, max: 30, alt: "25/03/2020" },
            TODAY,
        );

        expect(state.ageFields).toEqual({
            birth: "12/05/1998",
            reference: "31/12/2026",
            min: "18",
            max: "30",
            relaxation: "25/03/2020",
        });
    });

    test("opens the convert side on today in the calendar a link names", () => {
        expect(buildInitialState({ mode: "convert", cal: "bangla" }, TODAY).convertFields).toEqual({
            calendar: "bangla",
            day: "12",
            month: 8,
            year: "1433",
        });
        expect(
            buildInitialState({ cal: "bangla", date: "8-11-1431" }, TODAY).convertFields,
        ).toEqual({ calendar: "bangla", day: "8", month: 11, year: "1431" });
    });

    test("falls back to today when a link's month is out of range", () => {
        expect(buildInitialState({ date: "1-13-2026" }, TODAY).convertFields.month).toBe(11);
    });
});
