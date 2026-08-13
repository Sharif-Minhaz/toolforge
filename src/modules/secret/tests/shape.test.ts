import { describe, expect, test } from "bun:test";

import { MAX_VARIABLE_NAME_LENGTH } from "@/modules/secret/domain/constants";
import {
    formatSecret,
    isValidVariableName,
    sanitizeVariableName,
    supportsVariableName,
} from "@/modules/secret/domain/shape";
import { SECRET_SHAPES } from "@/modules/secret/types";

const SECRET = "kJ8xQm2vR7";

describe("formatSecret", () => {
    test("lays the secret out for each destination", () => {
        expect(formatSecret(SECRET, "bare", "AUTH_SECRET")).toBe(SECRET);
        expect(formatSecret(SECRET, "env", "AUTH_SECRET")).toBe(`AUTH_SECRET=${SECRET}`);
        expect(formatSecret(SECRET, "export", "AUTH_SECRET")).toBe(
            `export AUTH_SECRET="${SECRET}"`,
        );
    });

    test("leaves the secret itself untouched in every shape", () => {
        for (const shape of SECRET_SHAPES) {
            expect(formatSecret(SECRET, shape, "AUTH_SECRET")).toContain(SECRET);
        }
    });

    test("ignores the variable name in the bare shape", () => {
        expect(formatSecret(SECRET, "bare", "IGNORED")).toBe(SECRET);
        expect(supportsVariableName("bare")).toBe(false);
        expect(supportsVariableName("env")).toBe(true);
        expect(supportsVariableName("export")).toBe(true);
    });
});

describe("isValidVariableName", () => {
    test("accepts what a shell accepts", () => {
        for (const name of ["AUTH_SECRET", "_private", "a", "JWT_SECRET_2", "lowercase_ok"]) {
            expect(isValidVariableName(name)).toBe(true);
        }
    });

    test("refuses a leading digit, a space, and an empty name", () => {
        for (const name of ["2FA_SECRET", "AUTH SECRET", "", "AUTH-SECRET", "AUTH.SECRET"]) {
            expect(isValidVariableName(name)).toBe(false);
        }
    });

    test("refuses a name past the cap", () => {
        expect(isValidVariableName("A".repeat(MAX_VARIABLE_NAME_LENGTH))).toBe(true);
        expect(isValidVariableName("A".repeat(MAX_VARIABLE_NAME_LENGTH + 1))).toBe(false);
    });
});

describe("sanitizeVariableName", () => {
    test("drops the characters a shell would not take", () => {
        expect(sanitizeVariableName("AUTH SECRET")).toBe("AUTHSECRET");
        expect(sanitizeVariableName("auth-secret!")).toBe("authsecret");
    });

    test("keeps case, because upper-casing somebody's typing reads as a bug", () => {
        expect(sanitizeVariableName("auth_secret")).toBe("auth_secret");
    });

    test("caps at the field's ceiling", () => {
        expect(sanitizeVariableName("A".repeat(200))).toHaveLength(MAX_VARIABLE_NAME_LENGTH);
    });

    /**
     * Sanitising per keystroke cannot itself produce a name the domain then
     * refuses — except for the two cases the field can legitimately be in on
     * the way to a good name: empty, and starting with a digit.
     */
    test("produces a valid name from anything that still has a usable first character", () => {
        expect(isValidVariableName(sanitizeVariableName("my secret key!"))).toBe(true);
        expect(isValidVariableName(sanitizeVariableName("2fa"))).toBe(false);
        expect(isValidVariableName(sanitizeVariableName("!!!"))).toBe(false);
    });
});
