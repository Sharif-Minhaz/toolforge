import { describe, expect, test } from "bun:test";

import { DEFAULT_CONVERSION_OPTIONS } from "@/modules/base64/domain/constants";
import {
    convert,
    supportsDataUri,
    type Base64ConversionRequest,
} from "@/modules/base64/domain/convert";
import { textToBytes } from "@/modules/base64/domain/text-codec";
import type { Base64ConversionOptions, Base64Source } from "@/modules/base64/types";

const TEXT_SOURCE: Base64Source = { kind: "text", text: "foobar" };

const FILE_SOURCE: Base64Source = {
    kind: "file",
    name: "pixel.png",
    mimeType: "image/png",
    bytes: new Uint8Array([0xff, 0xef, 0xbf]),
};

function utf8(text: string): Uint8Array {
    const encoded = textToBytes(text, "utf-8");

    if (!encoded.ok) {
        throw new Error("UTF-8 can encode any string");
    }

    return encoded.bytes;
}

function request(
    overrides: Partial<Omit<Base64ConversionRequest, "options">> & {
        options?: Partial<Base64ConversionOptions>;
    } = {},
): Base64ConversionRequest {
    const { options, ...rest } = overrides;

    return {
        mode: "encode",
        source: TEXT_SOURCE,
        ...rest,
        options: { ...DEFAULT_CONVERSION_OPTIONS, ...options },
    };
}

describe("convert — encoding", () => {
    test("encodes typed text and counts both sides", () => {
        expect(convert(request())).toEqual({
            ok: true,
            output: "Zm9vYmFy",
            inputBytes: 6,
            outputBytes: 8,
        });
    });

    test("counts the UTF-8 length of the input, not its characters", () => {
        const result = convert(request({ source: { kind: "text", text: "বাংলা" } }));

        expect(result).toMatchObject({ ok: true, inputBytes: 15 });
    });

    test("wraps the output in a data URI when asked", () => {
        expect(convert(request({ options: { dataUri: true } }))).toMatchObject({
            output: "data:text/plain;charset=utf-8;base64,Zm9vYmFy",
        });
    });

    test("uses the file's own media type for a data URI", () => {
        expect(convert(request({ source: FILE_SOURCE, options: { dataUri: true } }))).toMatchObject(
            {
                output: "data:image/png;base64,/++/",
            },
        );
    });

    test("skips the data URI header on the URL-safe alphabet, which cannot carry one", () => {
        expect(convert(request({ options: { dataUri: true, alphabet: "urlSafe" } }))).toMatchObject(
            { output: "Zm9vYmFy" },
        );
    });

    test("honours the padding option", () => {
        expect(
            convert(request({ source: { kind: "text", text: "f" }, options: { padded: false } })),
        ).toMatchObject({ output: "Zg" });
    });

    test("refuses a file larger than the input ceiling", () => {
        const source: Base64Source = {
            kind: "file",
            name: "huge.bin",
            mimeType: "application/octet-stream",
            bytes: new Uint8Array(1_048_577),
        };

        expect(convert(request({ source }))).toEqual({ ok: false, reason: "too_large" });
    });
});

describe("convert — character sets", () => {
    test("writes text in a single-byte set instead of UTF-8", () => {
        // "é" is one byte in Windows-1252 and two in UTF-8.
        expect(
            convert(
                request({
                    source: { kind: "text", text: "é" },
                    options: { charset: "windows-1252" },
                }),
            ),
        ).toMatchObject({ output: "6Q==", inputBytes: 1 });

        expect(convert(request({ source: { kind: "text", text: "é" } }))).toMatchObject({
            output: "w6k=",
            inputBytes: 2,
        });
    });

    test("reports the character a set cannot write, by position", () => {
        expect(
            convert(
                request({
                    source: { kind: "text", text: "ok বাংলা" },
                    options: { charset: "ascii" },
                }),
            ),
        ).toEqual({ ok: false, reason: "unencodable_character", position: 4 });
    });

    test("refuses a decode-only set in the encode direction", () => {
        expect(convert(request({ options: { charset: "shift_jis" } }))).toEqual({
            ok: false,
            reason: "unencodable_character",
        });
    });

    test("reads bytes back through the chosen destination set", () => {
        // 0xE9 is "é" in Windows-1252 and invalid on its own in UTF-8.
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "6Q==" },
                    options: { charset: "windows-1252" },
                }),
            ),
        ).toMatchObject({ output: "é" });

        expect(
            convert(request({ mode: "decode", source: { kind: "text", text: "6Q==" } })),
        ).toEqual({ ok: false, reason: "undecodable_text" });
    });

    test("keeps ISO-8859-1 clear of the Windows-1252 substitutions", () => {
        // 0x80 is the euro sign in Windows-1252 and a C1 control in Latin-1.
        const latin1 = convert(
            request({
                mode: "decode",
                source: { kind: "text", text: "gA==" },
                options: { charset: "iso-8859-1" },
            }),
        );

        expect(latin1).toMatchObject({ output: "" });
    });

    test("refuses bytes outside the 7-bit range for ASCII", () => {
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "6Q==" },
                    options: { charset: "ascii" },
                }),
            ),
        ).toEqual({ ok: false, reason: "undecodable_text" });
    });

    test("round-trips text through UTF-16LE", () => {
        const encoded = convert(request({ options: { charset: "utf-16le" } }));

        expect(encoded).toMatchObject({ inputBytes: 12 });

        if (!encoded.ok) {
            throw new Error("expected the encode to succeed");
        }

        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: encoded.output },
                    options: { charset: "utf-16le" },
                }),
            ),
        ).toMatchObject({ output: "foobar" });
    });
});

describe("convert — line handling", () => {
    test("rewrites line endings before encoding", () => {
        const lf = convert(request({ source: { kind: "text", text: "a\nb" } }));
        const crlf = convert(
            request({ source: { kind: "text", text: "a\nb" }, options: { newline: "crlf" } }),
        );

        expect(lf).toMatchObject({ output: "YQpi", inputBytes: 3 });
        expect(crlf).toMatchObject({ output: "YQ0KYg==", inputBytes: 4 });
    });

    test("normalises mixed line endings to the chosen one", () => {
        expect(
            convert(
                request({
                    source: { kind: "text", text: "a\r\nb\rc\nd" },
                    options: { newline: "lf" },
                }),
            ),
        ).toMatchObject({ inputBytes: 7 });
    });

    test("encodes each line on its own when asked", () => {
        expect(
            convert(
                request({ source: { kind: "text", text: "foo\nbar" }, options: { perLine: true } }),
            ),
        ).toMatchObject({ output: "Zm9v\nYmFy" });
    });

    test("decodes each line on its own, keeping blank lines in place", () => {
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "Zm9v\n\nYmFy" },
                    options: { perLine: true },
                }),
            ),
        ).toMatchObject({ output: "foo\n\nbar" });
    });

    test("reports which line failed to decode", () => {
        expect(
            convert(
                request({
                    mode: "decode",
                    source: { kind: "text", text: "Zm9v\nYm!y" },
                    options: { perLine: true },
                }),
            ),
        ).toEqual({ ok: false, reason: "invalid_character", position: 3, line: 2 });
    });

    test("treats a whole multi-line payload as one message by default", () => {
        expect(
            convert(request({ mode: "decode", source: { kind: "text", text: "Zm9v\nYmFy" } })),
        ).toMatchObject({ output: "foobar" });
    });

    test("splits encoded output at 76 characters for MIME", () => {
        const result = convert(
            request({
                source: { kind: "text", text: "a".repeat(120) },
                options: { wrapLines: true },
            }),
        );

        if (!result.ok) {
            throw new Error("expected the encode to succeed");
        }

        const lines = result.output.split("\n");

        expect(lines).toHaveLength(3);
        expect(lines[0]).toHaveLength(76);
        expect(lines[1]).toHaveLength(76);
        expect(lines.join("")).toBe("YWFh".repeat(40));
    });

    test("wraps with the chosen line ending", () => {
        const result = convert(
            request({
                source: { kind: "text", text: "a".repeat(120) },
                options: { wrapLines: true, newline: "crlf" },
            }),
        );

        expect(result).toMatchObject({ ok: true });
        expect((result as { output: string }).output).toContain("\r\n");
    });
});

describe("supportsDataUri", () => {
    test("needs one unwrapped, standard-alphabet payload", () => {
        expect(supportsDataUri(DEFAULT_CONVERSION_OPTIONS)).toBe(true);
        expect(supportsDataUri({ ...DEFAULT_CONVERSION_OPTIONS, alphabet: "urlSafe" })).toBe(false);
        expect(supportsDataUri({ ...DEFAULT_CONVERSION_OPTIONS, wrapLines: true })).toBe(false);
        expect(supportsDataUri({ ...DEFAULT_CONVERSION_OPTIONS, perLine: true })).toBe(false);
    });
});

describe("convert — decoding", () => {
    test("decodes base64 text back to its original", () => {
        expect(
            convert(request({ mode: "decode", source: { kind: "text", text: "Zm9vYmFy" } })),
        ).toEqual({ ok: true, output: "foobar", inputBytes: 8, outputBytes: 6 });
    });

    test("reads base64 out of an uploaded text file", () => {
        const source: Base64Source = {
            kind: "file",
            name: "payload.txt",
            mimeType: "text/plain",
            bytes: utf8("Zm9vYmFy"),
        };

        expect(convert(request({ mode: "decode", source }))).toMatchObject({ output: "foobar" });
    });

    test("passes a decode failure through untouched", () => {
        expect(
            convert(request({ mode: "decode", source: { kind: "text", text: "Zm9v!" } })),
        ).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 5,
        });
    });

    test("reports payloads that are not text in the chosen set", () => {
        expect(
            convert(request({ mode: "decode", source: { kind: "text", text: "/w==" } })),
        ).toEqual({
            ok: false,
            reason: "undecodable_text",
        });
    });

    test("treats empty input as an empty result rather than an error", () => {
        expect(convert(request({ mode: "decode", source: { kind: "text", text: "" } }))).toEqual({
            ok: true,
            output: "",
            inputBytes: 0,
            outputBytes: 0,
        });
    });
});
