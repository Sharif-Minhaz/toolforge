import { describe, expect, test } from "bun:test";

import { parseSubdomainIndex } from "@/modules/subdomain-lookup/domain/parse";

/**
 * Twelve lines taken verbatim from a real reply, tabs and all:
 *
 *     curl 'https://crt.name/v1/search?apex=lazycoders.co&dates=1'
 *
 * Captured rather than invented, because the whole risk in this file is reading
 * somebody else's format from memory. It is the shape the parser is written
 * against, so if the endpoint ever changes its separator or its date format, the
 * assertions below are where that shows up.
 */
const REAL_REPLY = [
    "lazycoders.co\t2024-11-12T15:18:24Z",
    "test.lazycoders.co\t2026-02-05T00:00:00Z",
    "www.test.lazycoders.co\t2026-02-05T00:00:00Z",
    "staging.lazycoders.co\t2026-02-06T00:00:00Z",
    "www.staging.lazycoders.co\t2026-02-06T00:00:00Z",
    "www.lazycoders.co\t2026-05-03T23:28:51Z",
    "dev.lazycoders.co\t2026-05-07T22:19:22Z",
    "oneteam.lazycoders.co\t2026-05-08T00:06:54Z",
    "www.community.lazycoders.co\t2026-05-08T00:55:03Z",
    "community.lazycoders.co\t2026-05-08T00:55:04Z",
    "tutor.lazycoders.co\t2026-05-08T00:55:04Z",
    "www.tutor.lazycoders.co\t2026-05-08T00:55:04Z",
].join("\n");

describe("parseSubdomainIndex", () => {
    test("reads a real reply into names, labels, depths and dates", () => {
        const parsed = parseSubdomainIndex(REAL_REPLY, "lazycoders.co");

        expect(parsed.returned).toBe(12);
        expect(parsed.truncated).toBe(false);
        expect(parsed.records).toHaveLength(12);

        // The apex row has no label and sits at depth zero.
        expect(parsed.records[0]).toEqual({
            name: "lazycoders.co",
            label: null,
            depth: 0,
            firstSeen: "2024-11-12T15:18:24.000Z",
        });

        expect(parsed.records[2]).toEqual({
            name: "www.test.lazycoders.co",
            label: "www.test",
            depth: 2,
            firstSeen: "2026-02-05T00:00:00.000Z",
        });
    });

    test("a reply without dates still parses, with no date invented", () => {
        const parsed = parseSubdomainIndex("api.example.com\nexample.com\n", "example.com");

        expect(parsed.records).toEqual([
            { name: "api.example.com", label: "api", depth: 1, firstSeen: null },
            { name: "example.com", label: null, depth: 0, firstSeen: null },
        ]);
    });

    test("blank lines, stray whitespace and a root dot are absorbed", () => {
        const parsed = parseSubdomainIndex(
            "\n  API.Example.com.  \t2026-01-02T03:04:05Z\n\n\n",
            "example.com",
        );

        expect(parsed.records).toEqual([
            {
                name: "api.example.com",
                label: "api",
                depth: 1,
                firstSeen: "2026-01-02T03:04:05.000Z",
            },
        ]);
    });

    test("a name outside the apex is dropped rather than filed under it", () => {
        // The index has never returned one. If it ever does, a row reading
        // `evil.example.net` under a lookup for `example.com` is the kind of
        // wrong row that ends up in somebody's report.
        const parsed = parseSubdomainIndex(
            "api.example.com\nevil.example.net\nnotexample.com\n",
            "example.com",
        );

        expect(parsed.records.map((record) => record.name)).toEqual(["api.example.com"]);
        expect(parsed.returned).toBe(1);
    });

    test("a duplicate collapses and keeps the earliest sighting", () => {
        const parsed = parseSubdomainIndex(
            [
                "api.example.com\t2026-05-08T00:00:00Z",
                "api.example.com\t2024-01-01T00:00:00Z",
                "api.example.com",
            ].join("\n"),
            "example.com",
        );

        expect(parsed.records).toEqual([
            {
                name: "api.example.com",
                label: "api",
                depth: 1,
                firstSeen: "2024-01-01T00:00:00.000Z",
            },
        ]);
        expect(parsed.returned).toBe(1);
    });

    test("a date without a zone is recorded as no date at all", () => {
        // `2026-05-08T00:55:04` is read against whichever clock parses it, so it
        // would be one instant on the server and another in the browser. There
        // is already a rendering for "no date", and there is none for "wrong by
        // six hours".
        const parsed = parseSubdomainIndex("api.example.com\t2026-05-08T00:55:04", "example.com");

        expect(parsed.records[0].firstSeen).toBeNull();
    });

    test("a date that matches the shape but is not a day is refused", () => {
        const parsed = parseSubdomainIndex("api.example.com\t2026-02-31T00:00:00Z", "example.com");

        expect(parsed.records[0].firstSeen).toBeNull();
    });

    test("a leap day is kept in a leap year and refused outside one", () => {
        expect(
            parseSubdomainIndex("a.example.com\t2028-02-29T00:00:00Z", "example.com").records[0]
                .firstSeen,
        ).toBe("2028-02-29T00:00:00.000Z");
        expect(
            parseSubdomainIndex("a.example.com\t2027-02-29T00:00:00Z", "example.com").records[0]
                .firstSeen,
        ).toBeNull();
    });

    test("an offset other than Z is kept, normalised to UTC", () => {
        const parsed = parseSubdomainIndex(
            "api.example.com\t2026-05-08T06:55:04+06:00",
            "example.com",
        );

        expect(parsed.records[0].firstSeen).toBe("2026-05-08T00:55:04.000Z");
    });

    test("the record cap keeps a prefix, says so, and still counts the rest", () => {
        const body = Array.from({ length: 50 }, (_, index) => `n${index}.example.com`).join("\n");
        const parsed = parseSubdomainIndex(body, "example.com", 10);

        expect(parsed.records).toHaveLength(10);
        // `returned` is what the index held, not what fitted — the number the
        // reader needs to know the list in front of them is a prefix.
        expect(parsed.returned).toBe(50);
        expect(parsed.truncated).toBe(true);
    });

    test("an empty body is an empty answer, not a failure", () => {
        expect(parseSubdomainIndex("", "example.com")).toEqual({
            records: [],
            returned: 0,
            truncated: false,
        });
    });
});
