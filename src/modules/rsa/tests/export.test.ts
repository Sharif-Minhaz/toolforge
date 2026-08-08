import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";

import {
    buildRsaArchiveFilename,
    buildRsaKeyFilename,
    createRsaKeyFile,
    createRsaKeyPairArchive,
} from "../domain/export";

const AT = new Date("2026-08-08T10:15:00.000Z");

const PUBLIC_PEM = "-----BEGIN PUBLIC KEY-----\nMAM=\n-----END PUBLIC KEY-----\n";
const PRIVATE_PEM = "-----BEGIN PRIVATE KEY-----\nMAM=\n-----END PRIVATE KEY-----\n";

describe("filenames", () => {
    test("stamps the instant so a folder of them sorts chronologically", () => {
        expect(buildRsaKeyFilename("public", "pem", AT)).toBe("rsa-public-20260808T101500Z.pem");
        expect(buildRsaKeyFilename("private", "pem", AT)).toBe("rsa-private-20260808T101500Z.pem");
    });

    /**
     * `.b64`, not `.der`. A `.der` file holds raw bytes, and `openssl rsa
     * -inform DER` would fail on base64 text saved under that name — a wrong
     * extension turns a correct key into a bug report.
     */
    test("names the base64 form for the text it actually is", () => {
        expect(buildRsaKeyFilename("public", "der", AT)).toBe("rsa-public-20260808T101500Z.b64");
    });

    test("gives a JWK a .json suffix an editor will recognise", () => {
        expect(buildRsaKeyFilename("private", "jwk", AT)).toBe(
            "rsa-private-20260808T101500Z.jwk.json",
        );
    });

    test("names the archive after the pair rather than after either half", () => {
        expect(buildRsaArchiveFilename(AT)).toBe("rsa-keypair-20260808T101500Z.zip");
    });
});

describe("createRsaKeyFile", () => {
    test("saves a PEM as text, unchanged", () => {
        const file = createRsaKeyFile({
            kind: "public",
            content: PUBLIC_PEM,
            outputFormat: "pem",
            generatedAt: AT,
        });

        expect(file.content).toBe(PUBLIC_PEM);
        expect(file.mimeType).toBe("text/plain;charset=utf-8");
    });

    test("declares a JWK as JSON, so an editor opens it as one", () => {
        const file = createRsaKeyFile({
            kind: "private",
            content: '{\n  "kty": "RSA"\n}',
            outputFormat: "jwk",
            generatedAt: AT,
        });

        expect(file.mimeType).toBe("application/json;charset=utf-8");
    });

    test("terminates a body that had no final newline", () => {
        const file = createRsaKeyFile({
            kind: "public",
            content: "MIIBIjANBg",
            outputFormat: "der",
            generatedAt: AT,
        });

        expect(file.content).toBe("MIIBIjANBg\n");
    });

    test("does not add a second newline to a body that already ends in one", () => {
        const file = createRsaKeyFile({
            kind: "public",
            content: PUBLIC_PEM,
            outputFormat: "pem",
            generatedAt: AT,
        });

        expect(file.content.endsWith("KEY-----\n")).toBe(true);
    });
});

describe("createRsaKeyPairArchive", () => {
    async function entriesOf(): Promise<Record<string, string>> {
        const download = createRsaKeyPairArchive({
            publicKey: PUBLIC_PEM,
            privateKey: PRIVATE_PEM,
            outputFormat: "pem",
            generatedAt: AT,
        });
        const bytes = new Uint8Array(await download.blob.arrayBuffer());
        const decoder = new TextDecoder();

        return Object.fromEntries(
            Object.entries(unzipSync(bytes)).map(([name, content]) => [
                name,
                decoder.decode(content),
            ]),
        );
    }

    /**
     * One archive rather than two downloads a second apart: a browser blocks the
     * second programmatic download, and a reader given one key out of two would
     * not find out until the key did not work.
     */
    test("carries both halves, each under its own name", async () => {
        const entries = await entriesOf();

        expect(Object.keys(entries).toSorted()).toEqual([
            "rsa-private-20260808T101500Z.pem",
            "rsa-public-20260808T101500Z.pem",
        ]);
    });

    test("keeps each key byte for byte", async () => {
        const entries = await entriesOf();

        expect(entries["rsa-public-20260808T101500Z.pem"]).toBe(PUBLIC_PEM);
        expect(entries["rsa-private-20260808T101500Z.pem"]).toBe(PRIVATE_PEM);
    });

    test("stamps both members from the one generation", async () => {
        const download = createRsaKeyPairArchive({
            publicKey: PUBLIC_PEM,
            privateKey: PRIVATE_PEM,
            outputFormat: "jwk",
            generatedAt: AT,
        });

        expect(download.filename).toBe("rsa-keypair-20260808T101500Z.zip");
        expect(download.blob.type).toBe("application/zip");
    });

    test("produces the same bytes for the same pair and the same instant", async () => {
        const build = () =>
            createRsaKeyPairArchive({
                publicKey: PUBLIC_PEM,
                privateKey: PRIVATE_PEM,
                outputFormat: "pem",
                generatedAt: AT,
            }).blob.arrayBuffer();

        const [first, second] = await Promise.all([build(), build()]);

        expect(new Uint8Array(first)).toEqual(new Uint8Array(second));
    });
});
