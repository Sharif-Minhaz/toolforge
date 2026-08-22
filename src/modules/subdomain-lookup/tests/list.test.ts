import { describe, expect, test } from "bun:test";

import {
    filterRecords,
    pageCount,
    pageOf,
    sortRecords,
} from "@/modules/subdomain-lookup/domain/list";
import type { SubdomainRecord } from "@/modules/subdomain-lookup/types";

function record(name: string, firstSeen: string | null = null): SubdomainRecord {
    const apex = "example.com";
    const label = name === apex ? null : name.slice(0, name.length - apex.length - 1);

    return { name, label, depth: label === null ? 0 : label.split(".").length, firstSeen };
}

const RECORDS: readonly SubdomainRecord[] = [
    record("api.example.com", "2026-03-01T00:00:00.000Z"),
    record("api.staging.example.com", "2026-01-01T00:00:00.000Z"),
    record("example.com", "2020-01-01T00:00:00.000Z"),
    record("db.staging.example.com"),
    record("www.example.com", "2026-06-01T00:00:00.000Z"),
];

describe("sortRecords", () => {
    test("hierarchy groups a branch together instead of scattering it", () => {
        // The point of comparing right to left: `api.staging` and `db.staging`
        // are neighbours, and alphabetical order would put `api.staging`
        // immediately after `api` and half the tree away from `db.staging`.
        expect(sortRecords(RECORDS, "hierarchy").map((entry) => entry.name)).toEqual([
            "example.com",
            "api.example.com",
            "api.staging.example.com",
            "db.staging.example.com",
            "www.example.com",
        ]);
    });

    test("name is plain alphabetical, which reads differently on purpose", () => {
        expect(sortRecords(RECORDS, "name").map((entry) => entry.name)).toEqual([
            "api.example.com",
            "api.staging.example.com",
            "db.staging.example.com",
            "example.com",
            "www.example.com",
        ]);
    });

    test("newest first, with undated names last rather than treated as ancient", () => {
        expect(sortRecords(RECORDS, "newest").map((entry) => entry.name)).toEqual([
            "www.example.com",
            "api.example.com",
            "api.staging.example.com",
            "example.com",
            "db.staging.example.com",
        ]);
    });

    test("oldest first puts undated names last too, not at the front", () => {
        expect(sortRecords(RECORDS, "oldest").map((entry) => entry.name)).toEqual([
            "example.com",
            "api.staging.example.com",
            "api.example.com",
            "www.example.com",
            "db.staging.example.com",
        ]);
    });

    test("depth is deepest first, and ties fall back to hierarchy", () => {
        expect(sortRecords(RECORDS, "depth").map((entry) => entry.name)).toEqual([
            "api.staging.example.com",
            "db.staging.example.com",
            "api.example.com",
            "www.example.com",
            "example.com",
        ]);
    });

    test("sorting never mutates the list it was handed", () => {
        const before = RECORDS.map((entry) => entry.name);

        sortRecords(RECORDS, "newest");

        expect(RECORDS.map((entry) => entry.name)).toEqual(before);
    });
});

describe("filterRecords", () => {
    test("matches anywhere in the name, ignoring case", () => {
        expect(filterRecords(RECORDS, "STAGING").map((entry) => entry.name)).toEqual([
            "api.staging.example.com",
            "db.staging.example.com",
        ]);
    });

    test("an empty or blank query returns the same list, not a copy of it", () => {
        expect(filterRecords(RECORDS, "   ")).toBe(RECORDS);
    });

    test("a query that matches nothing is an empty list, not everything", () => {
        expect(filterRecords(RECORDS, "nope")).toEqual([]);
    });
});

describe("pageOf", () => {
    const many = Array.from({ length: 25 }, (_, index) =>
        record(`n${String(index).padStart(2, "0")}.example.com`),
    );

    test("slices the page asked for", () => {
        expect(pageOf(many, 2, 10).map((entry) => entry.name)).toEqual(
            many.slice(10, 20).map((entry) => entry.name),
        );
    });

    test("the last page holds the remainder", () => {
        expect(pageOf(many, 3, 10)).toHaveLength(5);
    });

    test("a page past the end clamps to the last one rather than emptying", () => {
        // Derived state: a reader on page 3 who types a filter has a page number
        // the new list cannot honour, and the answer is the last page that
        // exists.
        expect(pageOf(many, 99, 10)).toEqual(pageOf(many, 3, 10));
        expect(pageOf(many, 0, 10)).toEqual(pageOf(many, 1, 10));
    });

    test("an empty list still has one page, so the pager never reads zero of zero", () => {
        expect(pageCount(0, 10)).toBe(1);
        expect(pageOf([], 1, 10)).toEqual([]);
    });

    test("an exact multiple does not gain an empty trailing page", () => {
        expect(pageCount(20, 10)).toBe(2);
    });
});
