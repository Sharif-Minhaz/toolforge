import { describe, expect, test } from "bun:test";

import { DEFAULT_URL_OPTIONS, MAX_URL_INPUT_BYTES } from "@/modules/url/domain/constants";
import { convert, type UrlConversionRequest } from "@/modules/url/domain/convert";
import type { UrlConversionOptions, UrlSource } from "@/modules/url/types";

const TEXT_SOURCE: UrlSource = { kind: "text", text: "a b" };

const FILE_SOURCE: UrlSource = {
    kind: "file",
    name: "note.txt",
    bytes: new Uint8Array([0x61, 0x20, 0x62]),
};

function request(overrides: Partial<UrlConversionRequest> = {}): UrlConversionRequest {
    return {
        mode: "encode",
        source: TEXT_SOURCE,
        options: DEFAULT_URL_OPTIONS,
        ...overrides,
    };
}

function options(patch: Partial<UrlConversionOptions>): UrlConversionOptions {
    return { ...DEFAULT_URL_OPTIONS, ...patch };
}

function output(overrides: Partial<UrlConversionRequest>): string {
    const result = convert(request(overrides));

    if (!result.ok) {
        throw new Error(`expected a conversion, got ${result.reason}`);
    }

    return result.output;
}

describe("convert — encode", () => {
    test("percent-encodes typed text", () => {
        expect(output({ source: { kind: "text", text: "a b&c" } })).toBe("a%20b%26c");
    });

    test("reports the byte counts on both sides", () => {
        const result = convert(request({ source: { kind: "text", text: "café" } }));

        expect(result).toMatchObject({ ok: true, output: "caf%C3%A9", inputBytes: 5 });
        expect(result.ok && result.outputBytes).toBe("caf%C3%A9".length);
    });

    test("always reports a single pass", () => {
        expect(convert(request())).toMatchObject({ passes: 1 });
    });

    test("keeps a whole URL intact under the uri profile", () => {
        expect(
            output({
                source: { kind: "text", text: "https://a.test/x y?q=1" },
                options: options({ profile: "uri" }),
            }),
        ).toBe("https://a.test/x%20y?q=1");
    });

    test("writes spaces as + under the form profile", () => {
        expect(output({ options: options({ profile: "form" }) })).toBe("a+b");
    });

    test("honours lowercase hex", () => {
        expect(
            output({
                source: { kind: "text", text: "café" },
                options: options({ uppercaseHex: false }),
            }),
        ).toBe("caf%c3%a9");
    });

    test("encodes each line on its own when asked", () => {
        expect(
            output({
                source: { kind: "text", text: "a b\nc d" },
                options: options({ perLine: true }),
            }),
        ).toBe("a%20b\nc%20d");
    });

    test("writes those lines with the chosen separator", () => {
        expect(
            output({
                source: { kind: "text", text: "a b\nc d" },
                options: options({ perLine: true, newline: "crlf" }),
            }),
        ).toBe("a%20b\r\nc%20d");
    });

    test("encodes the line endings themselves when not going line by line", () => {
        expect(output({ source: { kind: "text", text: "a\nb" } })).toBe("a%0Ab");
        expect(
            output({
                source: { kind: "text", text: "a\nb" },
                options: options({ newline: "crlf" }),
            }),
        ).toBe("a%0D%0Ab");
    });

    test("encodes a file's bytes directly, ignoring the character set", () => {
        expect(output({ source: FILE_SOURCE, options: options({ charset: "utf-16le" }) })).toBe(
            "a%20b",
        );
    });

    test("wraps long output without splitting an escape", () => {
        const wrapped = output({
            source: { kind: "text", text: "é".repeat(40) },
            options: options({ wrapLines: true }),
        });

        expect(wrapped.split("\n").every((line) => line.length <= 76)).toBe(true);
        expect(wrapped.split("\n").join("")).toBe("%C3%A9".repeat(40));
    });

    test("uses the source character set", () => {
        expect(
            output({
                source: { kind: "text", text: "é" },
                options: options({ charset: "iso-8859-1" }),
            }),
        ).toBe("%E9");
    });

    test("reports a character the source set cannot write", () => {
        expect(
            convert(
                request({
                    source: { kind: "text", text: "aé" },
                    options: options({ charset: "ascii" }),
                }),
            ),
        ).toEqual({ ok: false, reason: "unencodable_character", position: 2 });
    });

    test("names the line that failed in per-line mode", () => {
        expect(
            convert(
                request({
                    source: { kind: "text", text: "ok\nbad é" },
                    options: options({ charset: "ascii", perLine: true }),
                }),
            ),
        ).toEqual({ ok: false, reason: "unencodable_character", position: 5, line: 2 });
    });

    test("rejects an input past the size ceiling", () => {
        expect(
            convert(
                request({ source: { kind: "text", text: "a".repeat(MAX_URL_INPUT_BYTES + 1) } }),
            ),
        ).toEqual({ ok: false, reason: "too_large" });
    });

    test("rejects an oversized file too", () => {
        expect(
            convert(
                request({
                    source: {
                        kind: "file",
                        name: "big.bin",
                        bytes: new Uint8Array(MAX_URL_INPUT_BYTES + 1),
                    },
                }),
            ),
        ).toEqual({ ok: false, reason: "too_large" });
    });

    test("converts an empty input to an empty output", () => {
        expect(convert(request({ source: { kind: "text", text: "" } }))).toMatchObject({
            ok: true,
            output: "",
            inputBytes: 0,
            outputBytes: 0,
        });
    });
});

describe("convert — decode", () => {
    test("turns escapes back into text", () => {
        expect(output({ mode: "decode", source: { kind: "text", text: "a%20b%26c" } })).toBe(
            "a b&c",
        );
    });

    test("leaves + alone by default", () => {
        expect(output({ mode: "decode", source: { kind: "text", text: "a+b" } })).toBe("a+b");
    });

    test("reads + as a space when told to", () => {
        expect(
            output({
                mode: "decode",
                source: { kind: "text", text: "a+b" },
                options: options({ plusAsSpace: true }),
            }),
        ).toBe("a b");
    });

    test("joins wrapped lines back into one payload", () => {
        expect(output({ mode: "decode", source: { kind: "text", text: "a%2\n0b" } })).toBe("a b");
    });

    test("round-trips wrapped output", () => {
        const original = "é".repeat(40);
        const encoded = output({
            source: { kind: "text", text: original },
            options: options({ wrapLines: true }),
        });

        expect(output({ mode: "decode", source: { kind: "text", text: encoded } })).toBe(original);
    });

    test("decodes each line on its own when asked", () => {
        expect(
            output({
                mode: "decode",
                source: { kind: "text", text: "a%20b\nc%20d" },
                options: options({ perLine: true }),
            }),
        ).toBe("a b\nc d");
    });

    test("keeps blank lines in their place", () => {
        expect(
            output({
                mode: "decode",
                source: { kind: "text", text: "a%20b\n\nc" },
                options: options({ perLine: true }),
            }),
        ).toBe("a b\n\nc");
    });

    test("decodes into the destination character set", () => {
        expect(
            output({
                mode: "decode",
                source: { kind: "text", text: "%E9" },
                options: options({ charset: "iso-8859-1" }),
            }),
        ).toBe("é");
    });

    test("round-trips a set whose bytes are not ASCII-compatible", () => {
        // UTF-16LE leaves every ASCII character raw next to a %00, so decoding
        // has to read that raw character as one byte, not re-encode it.
        const encoded = output({
            source: { kind: "text", text: "Hi" },
            options: options({ charset: "utf-16le" }),
        });

        expect(encoded).toBe("H%00i%00");
        expect(
            output({
                mode: "decode",
                source: { kind: "text", text: encoded },
                options: options({ charset: "utf-16le" }),
            }),
        ).toBe("Hi");
    });

    test("reports a malformed escape at its position", () => {
        expect(
            convert(request({ mode: "decode", source: { kind: "text", text: "ab%zz" } })),
        ).toEqual({ ok: false, reason: "invalid_escape", position: 3 });
    });

    test("names the line a malformed escape sits on", () => {
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "ok\n%zz" },
                    options: options({ perLine: true }),
                }),
            ),
        ).toEqual({ ok: false, reason: "invalid_escape", position: 1, line: 2 });
    });

    test("reports bytes that are not text in the destination set", () => {
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "%FF" },
                    options: options({ charset: "utf-8" }),
                }),
            ),
        ).toEqual({ ok: false, reason: "undecodable_text" });
    });

    test("decodes a file's text", () => {
        expect(
            output({
                mode: "decode",
                source: {
                    kind: "file",
                    name: "note.txt",
                    bytes: new TextEncoder().encode("a%20b"),
                },
            }),
        ).toBe("a b");
    });
});

describe("convert — repeated decoding", () => {
    test("unwraps only once by default", () => {
        expect(
            convert(request({ mode: "decode", source: { kind: "text", text: "%2520" } })),
        ).toMatchObject({ ok: true, output: "%20", passes: 1 });
    });

    test("keeps going until the text stops changing", () => {
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "%2520" },
                    options: options({ recursive: true }),
                }),
            ),
        ).toMatchObject({ ok: true, output: " ", passes: 2 });
    });

    test("reports a single pass for text that was never encoded", () => {
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "plain" },
                    options: options({ recursive: true }),
                }),
            ),
        ).toMatchObject({ ok: true, output: "plain", passes: 1 });
    });

    test("stops at the last clean result rather than failing on a later pass", () => {
        // `%25` decodes to a bare `%`, which is not the start of an escape.
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "%25" },
                    options: options({ recursive: true }),
                }),
            ),
        ).toMatchObject({ ok: true, output: "%", passes: 1 });
    });

    test("still reports a first-pass failure", () => {
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "%zz" },
                    options: options({ recursive: true }),
                }),
            ),
        ).toEqual({ ok: false, reason: "invalid_escape", position: 1 });
    });

    test("reports the deepest line's pass count in per-line mode", () => {
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "a%20b\n%252520c" },
                    options: options({ perLine: true, recursive: true }),
                }),
            ),
        ).toMatchObject({ ok: true, output: "a b\n c", passes: 3 });
    });

    test("gives up after the pass ceiling rather than looping", () => {
        // Seventeen layers deep, so sixteen passes leave one still wrapped.
        let payload = " ";

        for (let layer = 0; layer < 17; layer += 1) {
            payload = output({ source: { kind: "text", text: payload } });
        }

        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: payload },
                    options: options({ recursive: true }),
                }),
            ),
        ).toMatchObject({ ok: true, output: "%20", passes: 16 });
    });
});
