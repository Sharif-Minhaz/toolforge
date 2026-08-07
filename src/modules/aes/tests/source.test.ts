import { describe, expect, test } from "bun:test";

import { MAX_AES_INPUT_BYTES } from "../domain/constants";
import { runAes, supportsPlaintextEncoding } from "../domain/crypt";
import { AES_MODES } from "../types";
import { fileSource, request, textSource } from "./factory";

/** A short stretch of bytes that is deliberately not valid UTF-8. */
const BINARY = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x01];

describe("supportsPlaintextEncoding", () => {
    test("is false only when encrypting a file", () => {
        expect(supportsPlaintextEncoding("encrypt", fileSource(BINARY))).toBe(false);
        expect(supportsPlaintextEncoding("encrypt", textSource("hi"))).toBe(true);
        expect(supportsPlaintextEncoding("decrypt", fileSource(BINARY))).toBe(true);
        expect(supportsPlaintextEncoding("decrypt", textSource("hi"))).toBe(true);
    });
});

describe("encrypting a file", () => {
    test("takes its bytes as the plaintext", async () => {
        const result = await runAes(request({ source: fileSource(BINARY) }));

        expect(result).toMatchObject({ ok: true, inputBytes: BINARY.length });
    });

    /**
     * The reason the picker is disabled rather than ignored: if the encoding
     * were still read, these bytes would be run through a UTF-8 encoder that
     * cannot represent them and the ciphertext would be of something else.
     */
    test("ignores the plaintext encoding entirely", async () => {
        const asUtf8 = await runAes(
            request({ source: fileSource(BINARY), options: { textEncoding: "utf-8" } }),
        );
        const asHex = await runAes(
            request({ source: fileSource(BINARY), options: { textEncoding: "hex" } }),
        );

        expect(asUtf8.ok && asHex.ok && asUtf8.output).toBe(asHex.ok ? asHex.output : "");
    });

    test("refuses a file past the byte ceiling", async () => {
        const oversized = fileSource(Array.from({ length: MAX_AES_INPUT_BYTES + 1 }, () => 0));

        expect(await runAes(request({ source: oversized }))).toEqual({
            ok: false,
            reason: "too_large",
        });
    });

    test("names an empty file rather than encrypting nothing", async () => {
        expect(await runAes(request({ source: fileSource([]) }))).toEqual({
            ok: false,
            reason: "empty_input",
        });
    });
});

describe("decrypting a file", () => {
    /** Reads the file as text, which is what a `.txt` this tool saved holds. */
    for (const mode of AES_MODES) {
        test(`${mode} closes the file round trip`, async () => {
            const encrypted = await runAes(
                request({ source: fileSource(BINARY), options: { mode } }),
            );

            expect(encrypted.ok).toBe(true);

            if (!encrypted.ok) {
                return;
            }

            // Exactly what a reader does: save the ciphertext, open that file
            // again in the other direction. Hex, because these bytes are not
            // text and UTF-8 would refuse them — see the test below.
            const saved = fileSource([...new TextEncoder().encode(encrypted.output)], "cipher.txt");
            const decrypted = await runAes(
                request({
                    direction: "decrypt",
                    source: saved,
                    options: { mode, textEncoding: "hex" },
                }),
            );

            expect(decrypted.ok).toBe(true);
            // The plaintext is not text, so only the bytes are the answer.
            expect(decrypted.ok && [...decrypted.bytes]).toEqual(BINARY);
        });
    }

    /**
     * The one rough edge of the file path, pinned rather than papered over: a
     * decrypted file is bytes, and UTF-8 cannot render most bytes. The refusal
     * keeps its own name and the copy under the box names Hex as the way out,
     * which is also what makes the bytes download reachable.
     */
    test("refuses to render binary plaintext as UTF-8, and says which failure it is", async () => {
        const encrypted = await runAes(request({ source: fileSource(BINARY) }));

        expect(encrypted.ok).toBe(true);

        if (!encrypted.ok) {
            return;
        }

        const decrypted = await runAes(
            request({
                direction: "decrypt",
                input: encrypted.output,
                options: { textEncoding: "utf-8" },
            }),
        );

        expect(decrypted).toEqual({ ok: false, reason: "undecodable_text" });
    });

    test("refuses a file whose text is not the chosen encoding", async () => {
        const noise = fileSource([...new TextEncoder().encode("not base64 at all !!!")]);
        const result = await runAes(request({ direction: "decrypt", source: noise }));

        expect(result).toEqual({ ok: false, reason: "invalid_input_encoding" });
    });
});

describe("the bytes carried alongside the rendered output", () => {
    test("are the ciphertext when encrypting", async () => {
        const result = await runAes(
            request({ input: "hello", options: { cipherEncoding: "hex" } }),
        );

        expect(result.ok && result.bytes.length).toBe(result.ok ? result.outputBytes : 0);
    });

    test("are the plaintext when decrypting, whatever the output box shows", async () => {
        const encrypted = await runAes(request({ input: "hello" }));

        expect(encrypted.ok).toBe(true);

        if (!encrypted.ok) {
            return;
        }

        const decrypted = await runAes(
            request({
                direction: "decrypt",
                input: encrypted.output,
                options: { textEncoding: "base64" },
            }),
        );

        expect(decrypted.ok && new TextDecoder().decode(decrypted.bytes)).toBe("hello");
    });
});
