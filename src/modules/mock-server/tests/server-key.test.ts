import { describe, expect, test } from "bun:test";

import { RESERVED_SERVER_KEYS, SERVER_KEY_LENGTH } from "@/modules/mock-server/domain/constants";
import {
    checkServerKey,
    createServerKey,
    suggestServerKey,
} from "@/modules/mock-server/domain/server-key";
import type { RandomBytes } from "@/modules/tools/types";

const zeroBytes: RandomBytes = (length) => new Uint8Array(length);

describe("checkServerKey", () => {
    test("accepts an ordinary key", () => {
        expect(checkServerKey("payments")).toEqual({ ok: true, key: "payments" });
    });

    test("accepts digits and single hyphens", () => {
        expect(checkServerKey("payments-v2")).toEqual({ ok: true, key: "payments-v2" });
    });

    test("lower-cases what was typed", () => {
        expect(checkServerKey("Payments")).toEqual({ ok: true, key: "payments" });
    });

    test("trims surrounding whitespace", () => {
        expect(checkServerKey("  payments  ")).toEqual({ ok: true, key: "payments" });
    });

    test("accepts a key at the minimum length", () => {
        expect(checkServerKey("abc").ok).toBe(true);
    });

    test("accepts a key at the maximum length", () => {
        expect(checkServerKey("a".repeat(SERVER_KEY_LENGTH.max)).ok).toBe(true);
    });

    test("refuses the empty string", () => {
        expect(checkServerKey("")).toEqual({ ok: false, reason: "empty_key" });
    });

    test("refuses whitespace alone", () => {
        expect(checkServerKey("   ")).toEqual({ ok: false, reason: "empty_key" });
    });

    test("refuses one character below the minimum", () => {
        expect(checkServerKey("ab")).toEqual({ ok: false, reason: "too_short" });
    });

    test("refuses one character above the maximum", () => {
        expect(checkServerKey("a".repeat(SERVER_KEY_LENGTH.max + 1))).toEqual({
            ok: false,
            reason: "too_long",
        });
    });

    test("refuses an underscore", () => {
        expect(checkServerKey("pay_ments")).toEqual({ ok: false, reason: "invalid_characters" });
    });

    test("refuses a dot", () => {
        expect(checkServerKey("pay.ments")).toEqual({ ok: false, reason: "invalid_characters" });
    });

    test("refuses a leading hyphen", () => {
        expect(checkServerKey("-payments")).toEqual({ ok: false, reason: "edge_hyphen" });
    });

    test("refuses a trailing hyphen", () => {
        expect(checkServerKey("payments-")).toEqual({ ok: false, reason: "edge_hyphen" });
    });

    /**
     * `xn--` is the punycode prefix. Refusing every doubled hyphen is simpler
     * than refusing only that position and costs nothing anybody wanted.
     */
    test("refuses a doubled hyphen", () => {
        expect(checkServerKey("pay--ments")).toEqual({ ok: false, reason: "double_hyphen" });
    });

    test("refuses an infrastructure name", () => {
        expect(checkServerKey("api")).toEqual({ ok: false, reason: "reserved" });
    });

    /** A `/m/secure-login/...` link borrows this site's name to look like a
     * sign-in page, which is the reservation that actually matters. */
    test("refuses a name that reads as a lure", () => {
        for (const lure of ["login", "verify", "secure", "wallet", "billing"]) {
            expect(checkServerKey(lure)).toEqual({ ok: false, reason: "reserved" });
        }
    });

    test("refuses a reserved name typed in capitals", () => {
        expect(checkServerKey("LOGIN")).toEqual({ ok: false, reason: "reserved" });
    });

    test("allows a reserved word as part of a longer key", () => {
        expect(checkServerKey("my-login-api").ok).toBe(true);
    });

    test("every reserved key would otherwise have been valid", () => {
        // Guards against a reservation nobody could have typed anyway, which
        // reads as protection while protecting nothing.
        for (const reserved of RESERVED_SERVER_KEYS) {
            expect(reserved.length).toBeGreaterThanOrEqual(SERVER_KEY_LENGTH.min);
            expect(reserved).toMatch(/^[a-z0-9-]+$/);
        }
    });
});

describe("createServerKey", () => {
    test("draws a key the checker accepts", () => {
        expect(checkServerKey(createServerKey(zeroBytes)).ok).toBe(true);
    });

    test("never draws a look-alike glyph", () => {
        const drawn = createServerKey(zeroBytes);

        for (const confusing of ["l", "1", "0", "o"]) {
            expect(drawn).not.toContain(confusing);
        }
    });

    test("takes its randomness from the injected source alone", () => {
        expect(createServerKey(zeroBytes)).toBe(createServerKey(zeroBytes));
    });
});

describe("suggestServerKey", () => {
    test("turns a display name into a key", () => {
        expect(suggestServerKey("Payments API")).toBe("payments-api");
    });

    test("collapses runs of punctuation into one hyphen", () => {
        expect(suggestServerKey("Payments   &&&   API")).toBe("payments-api");
    });

    test("drops leading and trailing separators", () => {
        expect(suggestServerKey("  --Payments--  ")).toBe("payments");
    });

    test("keeps digits", () => {
        expect(suggestServerKey("Payments v2")).toBe("payments-v2");
    });

    /** Separators rather than deletion, so words do not run together. */
    test("does not run words together", () => {
        expect(suggestServerKey("Auth/Users")).toBe("auth-users");
    });

    test("truncates to the maximum length without a trailing hyphen", () => {
        const suggestion = suggestServerKey(`${"ab ".repeat(40)}`);

        expect(suggestion.length).toBeLessThanOrEqual(SERVER_KEY_LENGTH.max);
        expect(suggestion.endsWith("-")).toBe(false);
    });

    test("returns nothing usable for a name with no Latin characters", () => {
        // Best-effort by design: `checkServerKey` is what decides, and the
        // reader can always type their own.
        expect(suggestServerKey("পেমেন্ট")).toBe("");
    });

    test("whatever it suggests is either empty or checkable", () => {
        for (const name of ["Payments API", "A", "Shop 2026", "  "]) {
            const suggestion = suggestServerKey(name);

            if (suggestion !== "") {
                expect(suggestion).toMatch(/^[a-z0-9-]+$/);
                expect(suggestion.startsWith("-")).toBe(false);
                expect(suggestion.endsWith("-")).toBe(false);
            }
        }
    });
});
