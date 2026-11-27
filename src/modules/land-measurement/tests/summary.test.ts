import { describe, expect, test } from "bun:test";

import { buildSummary, type SummaryRow } from "@/modules/land-measurement/domain/summary";

const ROWS: readonly SummaryRow[] = [
    { unit: "bigha", figure: "0.25", short: "bigha", region: null },
    { unit: "katha", figure: "5", short: "katha", region: null },
    { unit: "square-foot", figure: "3,600", short: "sq ft", region: null },
];

describe("buildSummary", () => {
    test("heads the text with what was typed and leaves that unit out of the lines", () => {
        expect(buildSummary("5 katha is:", "katha", ROWS)).toBe(
            "5 katha is:\n0.25 bigha\n3,600 sq ft",
        );
    });

    test("names the district on a district-sized unit", () => {
        const rows: readonly SummaryRow[] = [
            { unit: "bigha", figure: "0.27", short: "bigha", region: "Faridpur size" },
        ];

        expect(buildSummary("5 katha is:", "katha", rows)).toBe(
            "5 katha is:\n0.27 bigha (Faridpur size)",
        );
    });

    test("skips a unit with no figure rather than printing a bare name", () => {
        const rows: readonly SummaryRow[] = [
            { unit: "bigha", figure: "", short: "bigha", region: null },
        ];

        expect(buildSummary("heading", "katha", rows)).toBe("heading");
    });
});
