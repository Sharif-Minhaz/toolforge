import { describe, expect, test } from "bun:test";

import { isConsentValue, parseConsent } from "@/modules/analytics/domain/consent";

describe("isConsentValue", () => {
    test("accepts the two persisted answers", () => {
        expect(isConsentValue("granted")).toBe(true);
        expect(isConsentValue("denied")).toBe(true);
    });

    const rejected: readonly unknown[] = [undefined, null, "", "GRANTED", "yes", "true", 1, {}, []];

    for (const value of rejected) {
        test(`rejects ${JSON.stringify(value) ?? "undefined"}`, () => {
            expect(isConsentValue(value)).toBe(false);
        });
    }
});

describe("parseConsent", () => {
    test("returns the stored answer", () => {
        expect(parseConsent("granted")).toBe("granted");
        expect(parseConsent("denied")).toBe("denied");
    });

    test("treats a missing cookie as unanswered rather than denied", () => {
        expect(parseConsent(undefined)).toBeNull();
    });

    test("treats a tampered cookie as unanswered, so the visitor is asked again", () => {
        expect(parseConsent("granted; drop table")).toBeNull();
        expect(parseConsent("Granted")).toBeNull();
    });
});
