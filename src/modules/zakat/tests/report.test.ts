import { describe, expect, test } from "bun:test";

import { buildZakatReport } from "@/modules/zakat/domain/report";

describe("buildZakatReport", () => {
    test("aligns values in a column per section, and skips empty sections", () => {
        const text = buildZakatReport({
            title: "Zakat report",
            subtitle: ["27 November 2026"],
            sections: [
                {
                    heading: "Assets",
                    rows: [
                        ["Cash", "৳1,000"],
                        ["Gold, 22 karat", "৳96,228"],
                    ],
                },
                { heading: "Empty", rows: [] },
                { heading: "Notes", rows: [], notes: ["Not a fatwa."] },
            ],
            footer: ["toolforge"],
        });

        expect(text).toBe(
            [
                "Zakat report",
                "============",
                "27 November 2026",
                "",
                "Assets",
                "------",
                "Cash            ৳1,000",
                "Gold, 22 karat  ৳96,228",
                "",
                "Notes",
                "-----",
                "  Not a fatwa.",
                "",
                "toolforge",
                "",
            ].join("\n"),
        );
    });
});
