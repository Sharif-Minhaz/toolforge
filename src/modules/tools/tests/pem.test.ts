import { describe, expect, test } from "bun:test";

import { PEM_LINE_LENGTH, looksLikePem, parsePem, toPem, wrapBase64 } from "../domain/pem";
import { pemLabelFor } from "../domain/rsa-der";

const DER = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]);

describe("wrapBase64", () => {
    test("breaks at 64 characters, which is what RFC 7468 asks for", () => {
        const wrapped = wrapBase64("A".repeat(200));

        expect(wrapped.split("\n").map((line) => line.length)).toEqual([64, 64, 64, 8]);
    });

    test("leaves a body shorter than one line alone", () => {
        expect(wrapBase64("QUJD")).toBe("QUJD");
    });

    test("emits nothing for an empty body rather than a bare newline", () => {
        expect(wrapBase64("")).toBe("");
    });

    test("never leaves a trailing newline for the caller to strip", () => {
        expect(wrapBase64("A".repeat(PEM_LINE_LENGTH))).not.toContain("\n");
    });
});

describe("toPem", () => {
    const der = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]);

    test("writes the header, the body and the footer", () => {
        expect(toPem("PUBLIC KEY", der)).toBe(
            "-----BEGIN PUBLIC KEY-----\nMAMCAQA=\n-----END PUBLIC KEY-----\n",
        );
    });

    /** Line-oriented shell tools expect it, and OpenSSL writes it. */
    test("ends with a newline", () => {
        expect(toPem("PRIVATE KEY", der).endsWith("\n")).toBe(true);
    });

    test("wraps a long body at the PEM width", () => {
        const long = new Uint8Array(300).fill(0x41);
        const body = toPem("RSA PRIVATE KEY", long).split("\n").slice(1, -2);

        for (const line of body) {
            expect(line.length).toBeLessThanOrEqual(PEM_LINE_LENGTH);
        }

        expect(body.length).toBeGreaterThan(1);
    });
});

describe("pemLabelFor", () => {
    /**
     * The asymmetry that trips people up: PKCS#8's public half is not called
     * "PKCS#8 PUBLIC KEY" — it is a SubjectPublicKeyInfo, from a different
     * specification, and it says `PUBLIC KEY`.
     */
    test("pairs PKCS#8 with SubjectPublicKeyInfo", () => {
        expect(pemLabelFor("pkcs8", "private")).toBe("PRIVATE KEY");
        expect(pemLabelFor("pkcs8", "public")).toBe("PUBLIC KEY");
    });

    test("gives PKCS#1 both of its own headers", () => {
        expect(pemLabelFor("pkcs1", "private")).toBe("RSA PRIVATE KEY");
        expect(pemLabelFor("pkcs1", "public")).toBe("RSA PUBLIC KEY");
    });
});

describe("parsePem", () => {
    test("reads back exactly what toPem wrote", () => {
        const parsed = parsePem(toPem("PUBLIC KEY", DER));

        expect(parsed?.label).toBe("PUBLIC KEY");
        expect(parsed?.der).toEqual(DER);
    });

    test("reads every header an RSA key can carry", () => {
        for (const label of ["PUBLIC KEY", "PRIVATE KEY", "RSA PUBLIC KEY", "RSA PRIVATE KEY"]) {
            expect(parsePem(toPem(label, DER))?.label).toBe(label);
        }
    });

    /**
     * What lands in a key box is whatever was selected in a terminal or an
     * editor, which routinely carries a shell prompt above it and a blank line
     * below.
     */
    test("ignores whatever was selected around the block", () => {
        const noisy = `$ cat key.pem\n${toPem("PUBLIC KEY", DER)}\n\n`;

        expect(parsePem(noisy)?.der).toEqual(DER);
    });

    test("tolerates a body whose lines were re-wrapped or run together", () => {
        const runTogether = "-----BEGIN PUBLIC KEY-----\nMAMC\nAQA=\n-----END PUBLIC KEY-----";

        expect(parsePem(runTogether)?.der).toEqual(DER);
    });

    /**
     * A block whose two ends disagree is a paste that lost its middle. Reading
     * it as though the header were right would import half of one key under the
     * name of another.
     */
    test("refuses a block whose header and footer name different things", () => {
        expect(
            parsePem("-----BEGIN PUBLIC KEY-----\nMAMCAQA=\n-----END PRIVATE KEY-----"),
        ).toBeNull();
    });

    test("refuses a body that is not base64", () => {
        expect(parsePem("-----BEGIN PUBLIC KEY-----\n!!!!\n-----END PUBLIC KEY-----")).toBeNull();
    });

    test("refuses text with no block in it", () => {
        expect(parsePem("")).toBeNull();
        expect(parsePem("MAMCAQA=")).toBeNull();
        expect(parsePem("-----BEGIN PUBLIC KEY-----\nMAMCAQA=")).toBeNull();
    });
});

describe("looksLikePem", () => {
    test("recognises a block, and does not mistake bare base64 or JSON for one", () => {
        expect(looksLikePem(toPem("PRIVATE KEY", DER))).toBe(true);
        expect(looksLikePem("MAMCAQA=")).toBe(false);
        expect(looksLikePem('{ "kty": "RSA" }')).toBe(false);
    });
});
