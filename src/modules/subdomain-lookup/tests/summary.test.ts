import { describe, expect, test } from "bun:test";

import {
    buildSubdomainCsv,
    buildSubdomainJson,
    buildSubdomainText,
    createSubdomainCsvFile,
    createSubdomainJsonFile,
    createSubdomainTextFile,
} from "@/modules/subdomain-lookup/domain/export";
import { parseSubdomainIndex } from "@/modules/subdomain-lookup/domain/parse";
import { summarize } from "@/modules/subdomain-lookup/domain/summary";
import type { SubdomainReport } from "@/modules/subdomain-lookup/types";

const NOW = new Date("2026-06-15T12:00:00.000Z");

const BODY = [
    "example.com\t2020-01-01T00:00:00Z",
    "api.example.com\t2026-06-01T00:00:00Z",
    "api.staging.example.com\t2026-01-01T00:00:00Z",
    "db.staging.example.com",
].join("\n");

const PARSED = parseSubdomainIndex(BODY, "example.com");

const REPORT: SubdomainReport = {
    ok: true,
    apex: "example.com",
    narrowedFrom: null,
    records: PARSED.records,
    summary: summarize(PARSED, "example.com", NOW),
    fetchedAt: NOW.toISOString(),
    allowance: { remaining: 19, resetsAt: 1_781_000_000 },
};

describe("summarize", () => {
    test("counts the shape of the answer", () => {
        expect(REPORT.summary).toEqual({
            total: 4,
            truncated: false,
            returned: 4,
            apexIncluded: true,
            maxDepth: 2,
            dated: 3,
            newestAt: "2026-06-01T00:00:00.000Z",
            oldestAt: "2020-01-01T00:00:00.000Z",
            // Two weeks before `NOW`, so inside the thirty-day window; the other
            // two dated names are not.
            recent: 1,
        });
    });

    test("the recent count is measured against the instant it is given", () => {
        // A parameter rather than the clock, because this number is rendered on
        // the server and must not change under the browser's feet at hydration.
        const later = summarize(PARSED, "example.com", new Date("2027-01-01T00:00:00.000Z"));

        expect(later.recent).toBe(0);
    });

    test("an apex the index has no row for is reported as absent", () => {
        const parsed = parseSubdomainIndex("api.example.com", "example.com");

        expect(summarize(parsed, "example.com", NOW).apexIncluded).toBe(false);
    });

    test("an empty answer is all zeroes and two nulls, not a crash", () => {
        expect(summarize(parseSubdomainIndex("", "example.com"), "example.com", NOW)).toEqual({
            total: 0,
            truncated: false,
            returned: 0,
            apexIncluded: false,
            maxDepth: 0,
            dated: 0,
            newestAt: null,
            oldestAt: null,
            recent: 0,
        });
    });
});

describe("exports", () => {
    test("the text form is bare names, so it pipes into something else", () => {
        expect(buildSubdomainText(REPORT.records)).toBe(
            "example.com\napi.example.com\napi.staging.example.com\ndb.staging.example.com",
        );
    });

    test("the CSV carries a header and an empty cell for a missing date", () => {
        expect(buildSubdomainCsv(REPORT.records).split("\n")).toEqual([
            "subdomain,label,depth,first_seen",
            "example.com,,0,2020-01-01T00:00:00.000Z",
            "api.example.com,api,1,2026-06-01T00:00:00.000Z",
            "api.staging.example.com,api.staging,2,2026-01-01T00:00:00.000Z",
            "db.staging.example.com,db.staging,2,",
        ]);
    });

    test("the JSON records what was asked, when, and whether it was complete", () => {
        const parsedBack = JSON.parse(buildSubdomainJson(REPORT, REPORT.records)) as {
            apex: string;
            source: string;
            fetchedAt: string;
            exported: number;
            summary: { truncated: boolean };
        };

        expect(parsedBack.apex).toBe("example.com");
        expect(parsedBack.source).toBe("crt.name");
        expect(parsedBack.fetchedAt).toBe(NOW.toISOString());
        expect(parsedBack.exported).toBe(4);
        // The field that makes a saved file trustworthy a month later.
        expect(parsedBack.summary.truncated).toBe(false);
    });

    test("an export holds the list it is given, filter and order included", () => {
        const filtered = REPORT.records.filter((entry) => entry.depth === 2);

        expect(buildSubdomainText(filtered)).toBe(
            "api.staging.example.com\ndb.staging.example.com",
        );
        expect(createSubdomainTextFile(REPORT, filtered).content).toBe(
            buildSubdomainText(filtered),
        );
    });

    test("filenames name the apex and the day, and carry the right type", () => {
        expect(createSubdomainTextFile(REPORT, REPORT.records)).toMatchObject({
            filename: "subdomains-example.com-2026-06-15.txt",
            mimeType: "text/plain;charset=utf-8",
        });
        expect(createSubdomainCsvFile(REPORT, REPORT.records)).toMatchObject({
            filename: "subdomains-example.com-2026-06-15.csv",
            mimeType: "text/csv;charset=utf-8",
        });
        expect(createSubdomainJsonFile(REPORT, REPORT.records)).toMatchObject({
            filename: "subdomains-example.com-2026-06-15.json",
            mimeType: "application/json",
        });
    });
});
