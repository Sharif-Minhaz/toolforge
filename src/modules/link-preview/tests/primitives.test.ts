import { describe, expect, test } from "bun:test";

import { DEFAULT_CHARSET, sniffCharset } from "@/modules/link-preview/domain/charset";
import { readImageSize } from "@/modules/link-preview/domain/image-size";
import {
    clipGraphemes,
    clipUtf8Bytes,
    countGraphemes,
    countUtf8Bytes,
} from "@/modules/link-preview/domain/text";
import {
    displayHost,
    isSamePage,
    normalizeTypedUrl,
    resolveTagUrl,
} from "@/modules/link-preview/domain/urls";

const ascii = (text: string) => new TextEncoder().encode(text);

describe("readImageSize", () => {
    // The format readers are cross-checked against sharp over 62 encodes in a
    // scratch run (see the case study); these pin the hand-built edge cases
    // sharp cannot produce.

    test("reads a BMP with a negative, top-down height", () => {
        const bytes = new Uint8Array(30);
        bytes.set(ascii("BM"), 0);
        new DataView(bytes.buffer).setInt32(14, 40, true);
        new DataView(bytes.buffer).setInt32(18, 640, true);
        new DataView(bytes.buffer).setInt32(22, -480, true);

        expect(readImageSize(bytes)).toEqual({ width: 640, height: 480 });
    });

    test("reads an OS/2 BMP with 16-bit sizes", () => {
        const bytes = new Uint8Array(30);
        bytes.set(ascii("BM"), 0);
        new DataView(bytes.buffer).setInt32(14, 12, true);
        new DataView(bytes.buffer).setUint16(18, 32, true);
        new DataView(bytes.buffer).setUint16(20, 16, true);

        expect(readImageSize(bytes)).toEqual({ width: 32, height: 16 });
    });

    test("reads a PNG IHDR", () => {
        const bytes = new Uint8Array(24);
        bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
        bytes.set(ascii("IHDR"), 12);
        new DataView(bytes.buffer).setUint32(16, 1200);
        new DataView(bytes.buffer).setUint32(20, 630);

        expect(readImageSize(bytes)).toEqual({ width: 1200, height: 630 });
    });

    test("returns null for a truncated JPEG with no frame header", () => {
        expect(
            readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0, 0, 0, 0, 0, 0])),
        ).toBeNull();
    });

    test("returns null rather than zero for a zero-sized header", () => {
        const bytes = new Uint8Array(10);
        bytes.set(ascii("GIF89a"), 0);

        expect(readImageSize(bytes)).toBeNull();
    });

    test("returns null for SVG and for nothing at all", () => {
        expect(readImageSize(ascii("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
        expect(readImageSize(new Uint8Array())).toBeNull();
    });
});

describe("grapheme and byte clipping", () => {
    test("counts a Bangla conjunct and a toned emoji as one each", () => {
        expect(countGraphemes("ক্ষমা👍🏽")).toBe(3);
    });

    test("leaves short text alone", () => {
        expect(clipGraphemes("short", 10)).toEqual({ text: "short", truncated: false });
    });

    test("clips to the limit, ellipsis included, without a trailing space", () => {
        expect(clipGraphemes("hello world again", 7)).toEqual({ text: "hello…", truncated: true });
    });

    test("never splits a conjunct", () => {
        expect(clipGraphemes("ক্ষমা করো", 2).text).toBe("ক্ষ…");
    });

    test("counts bytes the way Discord does", () => {
        expect(countUtf8Bytes("abc")).toBe(3);
        expect(countUtf8Bytes("ক")).toBe(3);
    });

    test("byte-clips Bangla to a third of the English length", () => {
        const clipped = clipUtf8Bytes("ক".repeat(30), 70);

        expect(clipped.truncated).toBe(true);
        expect(countUtf8Bytes(clipped.text)).toBeLessThanOrEqual(70);
        // 70 bytes less the 3-byte ellipsis leaves room for 22 letters.
        expect(countGraphemes(clipped.text)).toBe(23);
    });

    test("exactly at the byte limit is not clipped", () => {
        expect(clipUtf8Bytes("a".repeat(70), 70).truncated).toBe(false);
    });
});

describe("resolveTagUrl", () => {
    const base = new URL("https://example.com/blog/post");

    test("resolves a relative address against the page and says it was relative", () => {
        expect(resolveTagUrl("/cover.png", base)).toEqual({
            absolute: "https://example.com/cover.png",
            relative: true,
            insecure: false,
        });
    });

    test("counts a scheme-relative address as relative", () => {
        expect(resolveTagUrl("//cdn.example/a.png", base).relative).toBe(true);
    });

    test("flags plain http", () => {
        expect(resolveTagUrl("http://cdn.example/a.png", base).insecure).toBe(true);
    });

    test("refuses a data: or javascript: address", () => {
        expect(resolveTagUrl("data:image/png;base64,AAAA", base).absolute).toBeNull();
        expect(resolveTagUrl("javascript:alert(1)", base).absolute).toBeNull();
    });

    test("cannot resolve a relative address with no page to resolve against", () => {
        expect(resolveTagUrl("/a.png", null)).toEqual({
            absolute: null,
            relative: true,
            insecure: false,
        });
    });
});

describe("displayHost and isSamePage", () => {
    test("drops www. and lower-cases", () => {
        expect(displayHost(new URL("https://WWW.Example.COM/x"))).toBe("example.com");
    });

    test("ignores a trailing slash and the fragment, keeps the query", () => {
        expect(isSamePage("https://example.com/a/", "https://EXAMPLE.com/a#top")).toBe(true);
        expect(isSamePage("https://example.com/a?id=1", "https://example.com/a?id=2")).toBe(false);
        expect(isSamePage("http://example.com/a", "https://example.com/a")).toBe(false);
    });
});

describe("sniffCharset", () => {
    test("a byte-order mark wins over everything", () => {
        expect(
            sniffCharset("text/html; charset=shift_jis", new Uint8Array([0xef, 0xbb, 0xbf])),
        ).toBe("utf-8");
    });

    test("the header wins over the meta", () => {
        expect(sniffCharset("text/html; charset=Shift_JIS", ascii(`<meta charset="utf-8">`))).toBe(
            "shift_jis",
        );
    });

    test("reads <meta charset> and the http-equiv form", () => {
        expect(sniffCharset("text/html", ascii(`<meta charset='windows-1252'>`))).toBe(
            "windows-1252",
        );
        expect(
            sniffCharset(
                null,
                ascii(`<meta http-equiv="Content-Type" content="text/html; charset=gbk">`),
            ),
        ).toBe("gbk");
    });

    test("defaults to UTF-8", () => {
        expect(sniffCharset(null, ascii("<title>x</title>"))).toBe(DEFAULT_CHARSET);
    });
});

describe("normalizeTypedUrl", () => {
    test("adds https:// to a bare host or path", () => {
        expect(normalizeTypedUrl(" example.com/post ")).toBe("https://example.com/post");
        expect(normalizeTypedUrl("//example.com")).toBe("https://example.com");
    });

    test("leaves an address with a scheme alone, so a bad scheme is refused by name", () => {
        expect(normalizeTypedUrl("http://example.com")).toBe("http://example.com");
        expect(normalizeTypedUrl("ftp://example.com")).toBe("ftp://example.com");
    });

    test("leaves empty input empty", () => {
        expect(normalizeTypedUrl("   ")).toBe("");
    });
});
