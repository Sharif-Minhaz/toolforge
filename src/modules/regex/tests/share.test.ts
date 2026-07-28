import { describe, expect, test } from "bun:test";

import {
    DEFAULT_REGEX_DELIMITER,
    DEFAULT_REGEX_FLAGS,
    DEFAULT_REGEX_MODE,
    DEFAULT_REPLACEMENT,
} from "@/modules/regex/domain/constants";
import {
    buildShareUrl,
    MAX_SHARE_URL_LENGTH,
    type ShareRequest,
} from "@/modules/regex/domain/share";
import { regexSearchParamsSchema } from "@/modules/regex/validation/regex-options";

function request(overrides: Partial<ShareRequest> = {}): ShareRequest {
    return {
        path: "/tools/regex",
        pattern: "\\d+",
        flags: DEFAULT_REGEX_FLAGS,
        mode: DEFAULT_REGEX_MODE,
        delimiter: DEFAULT_REGEX_DELIMITER,
        replacement: DEFAULT_REPLACEMENT,
        testString: "a1 b2",
        ...overrides,
    };
}

function urlOf(overrides: Partial<ShareRequest> = {}): string {
    const result = buildShareUrl(request(overrides));

    if (!result.ok) {
        throw new Error("expected a shareable url");
    }

    return result.url;
}

function paramsOf(url: string) {
    const query = new URLSearchParams(url.split("?")[1] ?? "");

    return regexSearchParamsSchema.parse(Object.fromEntries(query));
}

describe("buildShareUrl", () => {
    test("writes only what differs from the defaults", () => {
        const url = urlOf();

        expect(url.startsWith("/tools/regex?")).toBe(true);
        expect(url).not.toContain("flags=");
        expect(url).not.toContain("mode=");
        expect(url).not.toContain("delimiter=");
        expect(url).not.toContain("replacement=");
    });

    test("writes each field once it leaves its default", () => {
        const url = urlOf({
            flags: ["global"],
            mode: "list",
            delimiter: "tilde",
            replacement: "$1",
        });

        expect(paramsOf(url)).toMatchObject({
            pattern: "\\d+",
            flags: ["global"],
            mode: "list",
            delimiter: "tilde",
            replacement: "$1",
        });
    });

    // The link is only worth anything if the page reads back what it wrote.
    test("round-trips through the search-param schema", () => {
        const original = request({
            pattern: "^(?<year>\\d{4})-(\\d{2})$",
            flags: ["global", "ignoreCase"],
            mode: "substitute",
            delimiter: "hash",
            replacement: "$<year>",
            testString: "2026-07\n1999-12",
        });
        const result = buildShareUrl(original);

        expect(result.ok).toBe(true);
        expect(paramsOf(result.ok ? result.url : "")).toEqual({
            pattern: original.pattern,
            flags: [...original.flags],
            mode: original.mode,
            delimiter: original.delimiter,
            replacement: original.replacement,
            test: original.testString,
        });
    });

    test("an empty test string is written, not omitted", () => {
        // Otherwise the page would fall back to the sample document, which is
        // not what a deliberately blank link means.
        expect(paramsOf(urlOf({ testString: "" })).test).toBe("");
    });

    test("an empty pattern leaves the pattern out", () => {
        expect(urlOf({ pattern: "", testString: "" })).not.toContain("pattern=");
    });

    test("escapes characters that would otherwise reshape the query", () => {
        const url = urlOf({ pattern: "a&b=c#d", testString: "" });

        expect(url).not.toContain("a&b=c#d");
        expect(paramsOf(url).pattern).toBe("a&b=c#d");
    });

    describe("when the link would be too long", () => {
        test("drops the test string and says so", () => {
            const result = buildShareUrl(request({ testString: "x".repeat(5_000) }));

            expect(result).toMatchObject({ ok: true, omittedTestString: true });
            expect(result.ok && result.url.length).toBeLessThanOrEqual(MAX_SHARE_URL_LENGTH);
            expect(result.ok && result.url).not.toContain("test=");
        });

        test("fails when even the pattern will not fit", () => {
            expect(buildShareUrl(request({ pattern: "a".repeat(5_000) }))).toEqual({
                ok: false,
                reason: "too_long",
            });
        });

        test("keeps the whole test string when it fits", () => {
            const result = buildShareUrl(request());

            expect(result).toMatchObject({ ok: true, omittedTestString: false });
        });
    });
});
