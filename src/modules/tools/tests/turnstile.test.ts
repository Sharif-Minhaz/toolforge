import { describe, expect, test } from "bun:test";

import {
    MAX_TURNSTILE_TOKEN_LENGTH,
    TURNSTILE_SCRIPT_URL,
    TURNSTILE_VERIFY_TIMEOUT_MS,
    TURNSTILE_VERIFY_URL,
} from "@/modules/tools/domain/turnstile";
import { turnstileVerificationSchema } from "@/modules/tools/validation/turnstile";

describe("turnstileVerificationSchema", () => {
    test("reads a pass and a fail", () => {
        expect(turnstileVerificationSchema.safeParse({ success: true }).success).toBe(true);
        expect(
            turnstileVerificationSchema.safeParse({
                success: false,
                "error-codes": ["timeout-or-duplicate"],
            }).success,
        ).toBe(true);
    });

    test("rejects a reply with no verdict in it", () => {
        expect(turnstileVerificationSchema.safeParse({}).success).toBe(false);
    });
});

describe("turnstile constants", () => {
    test("both endpoints are Cloudflare's, over https", () => {
        for (const url of [TURNSTILE_VERIFY_URL, TURNSTILE_SCRIPT_URL]) {
            expect(new URL(url).protocol).toBe("https:");
            expect(new URL(url).hostname).toBe("challenges.cloudflare.com");
        }
    });

    test("the script is asked to render explicitly, not by auto-scan", () => {
        expect(new URL(TURNSTILE_SCRIPT_URL).searchParams.get("render")).toBe("explicit");
    });

    test("the bounds leave room for a real token and a real round trip", () => {
        expect(MAX_TURNSTILE_TOKEN_LENGTH).toBeGreaterThan(600);
        expect(TURNSTILE_VERIFY_TIMEOUT_MS).toBeGreaterThan(0);
    });
});
