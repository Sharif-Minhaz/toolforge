import { describe, expect, test } from "bun:test";

import {
    gradeSecurityHeaders,
    readSecurityHeaders,
    toHeaderMap,
} from "@/modules/domain-inspector/domain/headers";
import {
    decodeEntities,
    readAttribute,
    readDeclaredLicense,
    readGenerator,
    readPageTitle,
} from "@/modules/domain-inspector/domain/markup";
import { SECURITY_HEADERS } from "@/modules/domain-inspector/types";

describe("toHeaderMap", () => {
    test("lower-cases names, because the wire does not care about their case", () => {
        expect(toHeaderMap([["Content-Type", "text/html"]])).toEqual({
            "content-type": "text/html",
        });
    });
});

describe("security headers", () => {
    test("reports every header, present or not", () => {
        const headers = readSecurityHeaders(toHeaderMap([["x-frame-options", "DENY"]]));

        expect(headers).toHaveLength(SECURITY_HEADERS.length);
        expect(headers.find((header) => header.name === "x-frame-options")?.value).toBe("DENY");
        expect(
            headers.find((header) => header.name === "content-security-policy")?.value,
        ).toBeNull();
    });

    const GRADES = [
        [0, "weak"],
        [1, "weak"],
        [2, "partial"],
        [4, "partial"],
        [5, "strong"],
        [6, "strong"],
    ] as const;

    for (const [present, expected] of GRADES) {
        test(`${present} of ${SECURITY_HEADERS.length} headers grades ${expected}`, () => {
            const headers = SECURITY_HEADERS.map((name, index) => ({
                name,
                value: index < present ? "set" : null,
            }));

            expect(gradeSecurityHeaders(headers)).toBe(expected);
        });
    }
});

describe("decodeEntities", () => {
    test("decodes the named entities that actually appear in titles", () => {
        expect(decodeEntities("Tom &amp; Jerry &lt;3 &quot;x&quot;")).toBe('Tom & Jerry <3 "x"');
    });

    test("decodes numeric and hex references", () => {
        expect(decodeEntities("caf&#233; &#x2014; bar")).toBe("café — bar");
    });

    test("leaves an unknown entity exactly as written", () => {
        expect(decodeEntities("a &notareal; b")).toBe("a &notareal; b");
    });
});

describe("readPageTitle", () => {
    test("reads a title and collapses its whitespace", () => {
        expect(readPageTitle("<head><title>\n  Example\n  Domain\n</title></head>")).toBe(
            "Example Domain",
        );
    });

    test("reads a title with attributes on the tag", () => {
        expect(readPageTitle('<title data-x="1">Hi</title>')).toBe("Hi");
    });

    test("returns null when there is no title, and for an empty one", () => {
        expect(readPageTitle("<head></head>")).toBeNull();
        expect(readPageTitle("<title>   </title>")).toBeNull();
    });
});

describe("readAttribute", () => {
    const QUOTING = [
        ['<link href="/a.txt">', "/a.txt"],
        ["<link href='/a.txt'>", "/a.txt"],
        ["<link href=/a.txt>", "/a.txt"],
        ['<link HREF="/a.txt">', "/a.txt"],
    ] as const;

    for (const [tag, expected] of QUOTING) {
        test(`reads href from ${tag}`, () => {
            expect(readAttribute(tag, "href")).toBe(expected);
        });
    }

    test("returns null for an attribute that is not there", () => {
        expect(readAttribute("<link href=/a>", "title")).toBeNull();
    });
});

describe("readGenerator", () => {
    test("reads the generator a CMS names itself with", () => {
        expect(readGenerator('<meta name="generator" content="WordPress 6.5" />')).toBe(
            "WordPress 6.5",
        );
    });

    test("reads it with the attributes the other way round", () => {
        expect(readGenerator('<meta content="Astro v4.10.2" name="generator">')).toBe(
            "Astro v4.10.2",
        );
    });

    test("returns null when the page names none", () => {
        expect(readGenerator("<head><title>x</title></head>")).toBeNull();
    });
});

describe("readDeclaredLicense", () => {
    test("reads the link relation, title and all", () => {
        expect(
            readDeclaredLicense(
                '<link rel="license" href="https://creativecommons.org/licenses/by/4.0/" title="CC BY 4.0">',
            ),
        ).toEqual({ name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" });
    });

    test("reads a link relation that carries other tokens too", () => {
        expect(readDeclaredLicense('<link rel="alternate license" href="/LICENSE">')).toEqual({
            name: null,
            url: "/LICENSE",
        });
    });

    test("falls back to the meta form, telling a URL from a name", () => {
        expect(readDeclaredLicense('<meta name="license" content="MIT">')).toEqual({
            name: "MIT",
            url: null,
        });
        expect(
            readDeclaredLicense('<meta name="license" content="https://example.com/LICENSE">'),
        ).toEqual({ name: null, url: "https://example.com/LICENSE" });
    });

    test("returns null when the page declares nothing", () => {
        expect(readDeclaredLicense('<link rel="stylesheet" href="/a.css">')).toBeNull();
    });
});
