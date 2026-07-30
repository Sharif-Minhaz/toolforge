import { describe, expect, test } from "bun:test";

import { PASSWORD_LENGTH_RANGE } from "@/modules/password/domain/constants";
import { clampLength } from "@/modules/password/domain/generate";
import {
    passwordOptionsSchema,
    passwordSearchParamsSchema,
} from "@/modules/password/validation/generation-options";

describe("passwordOptionsSchema", () => {
    test("accepts a fully specified option set", () => {
        const parsed = passwordOptionsSchema.safeParse({
            mode: "random",
            length: 20,
            uppercase: true,
            lowercase: true,
            numbers: true,
            symbols: false,
            excludeSimilar: true,
            excludeAmbiguous: false,
            separator: "hyphen",
            capitalize: false,
            includeNumber: false,
            attack: "sha256",
        });

        expect(parsed.success).toBe(true);
    });

    test("rejects a mode, separator or attacker it does not know", () => {
        for (const patch of [
            { mode: "quantum" },
            { separator: "tilde" },
            { attack: "asic-farm" },
        ]) {
            const parsed = passwordOptionsSchema.safeParse({
                mode: "random",
                length: 20,
                uppercase: true,
                lowercase: true,
                numbers: true,
                symbols: true,
                excludeSimilar: false,
                excludeAmbiguous: false,
                separator: "hyphen",
                capitalize: false,
                includeNumber: false,
                attack: "sha256",
                ...patch,
            });

            expect(parsed.success).toBe(false);
        }
    });
});

describe("passwordSearchParamsSchema", () => {
    test("reads a shareable link", () => {
        const parsed = passwordSearchParamsSchema.parse({
            mode: "memorable",
            length: "8",
            separator: "dot",
            caps: "1",
            digit: "true",
            attack: "md5",
        });

        expect(parsed).toEqual({
            mode: "memorable",
            length: 8,
            separator: "dot",
            caps: true,
            digit: true,
            attack: "md5",
            upper: undefined,
            lower: undefined,
            numbers: undefined,
            symbols: undefined,
            noSimilar: undefined,
            noAmbiguous: undefined,
        });
    });

    test("degrades a malformed field to a default instead of failing the page", () => {
        const parsed = passwordSearchParamsSchema.parse({
            mode: "nonsense",
            length: "four hundred",
            symbols: "yes",
            attack: "",
        });

        expect(parsed.mode).toBeUndefined();
        expect(parsed.length).toBeUndefined();
        expect(parsed.symbols).toBeUndefined();
        expect(parsed.attack).toBeUndefined();
    });

    test("accepts a length the widest mode allows, and the page narrows it", () => {
        const parsed = passwordSearchParamsSchema.parse({ mode: "memorable", length: "128" });

        expect(parsed.length).toBe(128);
        // 128 words is not a passphrase, so the page pulls it into range.
        expect(clampLength("memorable", parsed.length ?? 0)).toBe(
            PASSWORD_LENGTH_RANGE.memorable.max,
        );
    });

    test("has no field that could carry the password itself", () => {
        const parsed = passwordSearchParamsSchema.parse({
            password: "hunter2",
            value: "hunter2",
        });

        expect(Object.values(parsed)).not.toContain("hunter2");
    });
});
