import { describe, expect, test } from "bun:test";

import { decodeJwt } from "@/modules/jwt/domain/decode";
import {
    buildDecodedDocument,
    buildJwtExportFilename,
    createJwtExportFile,
} from "@/modules/jwt/domain/export";
import type { DecodedJwt } from "@/modules/jwt/types";

const GENERATED_AT = new Date("2026-07-27T10:15:00.000Z");

const CANONICAL_TOKEN =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
    ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" +
    ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

function canonical(): DecodedJwt {
    const result = decodeJwt(CANONICAL_TOKEN);

    if (!result.ok) {
        throw new Error(`expected a successful decode, got ${result.reason}`);
    }

    return result;
}

describe("buildJwtExportFilename", () => {
    test("names each direction and sorts by timestamp", () => {
        expect(buildJwtExportFilename("decode", GENERATED_AT)).toBe(
            "jwt-decoded-20260727T101500Z.json",
        );
        expect(buildJwtExportFilename("encode", GENERATED_AT)).toBe(
            "jwt-encoded-20260727T101500Z.txt",
        );
    });
});

describe("buildDecodedDocument", () => {
    test("carries both halves and the signature verbatim", () => {
        expect(JSON.parse(buildDecodedDocument(canonical()))).toEqual({
            header: { alg: "HS256", typ: "JWT" },
            payload: { sub: "1234567890", name: "John Doe", iat: 1516239022 },
            signature: "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
        });
    });
});

describe("createJwtExportFile", () => {
    test("labels a decoded export as JSON", () => {
        const file = createJwtExportFile({
            mode: "decode",
            content: buildDecodedDocument(canonical()),
            generatedAt: GENERATED_AT,
        });

        expect(file.mimeType).toBe("application/json;charset=utf-8");
        expect(file.content.endsWith("\n")).toBe(true);
    });

    test("labels an encoded export as text", () => {
        const file = createJwtExportFile({
            mode: "encode",
            content: CANONICAL_TOKEN,
            generatedAt: GENERATED_AT,
        });

        expect(file.mimeType).toBe("text/plain;charset=utf-8");
        expect(file.content).toBe(`${CANONICAL_TOKEN}\n`);
    });

    test("does not add a newline twice", () => {
        expect(
            createJwtExportFile({
                mode: "encode",
                content: `${CANONICAL_TOKEN}\n`,
                generatedAt: GENERATED_AT,
            }).content,
        ).toBe(`${CANONICAL_TOKEN}\n`);
    });

    test("leaves an empty export empty", () => {
        expect(
            createJwtExportFile({ mode: "encode", content: "", generatedAt: GENERATED_AT }).content,
        ).toBe("");
    });
});
