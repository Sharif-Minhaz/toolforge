import { describe, expect, test } from "bun:test";

import { resolveAnalyticsState } from "@/modules/analytics/domain/analytics-state";
import type { ConsentValue } from "@/modules/analytics/domain/consent";

const VALID_ID = "G-ABC1234XYZ";

describe("resolveAnalyticsState", () => {
    test("loads gtag.js only when id, consent, and production all line up", () => {
        expect(
            resolveAnalyticsState({
                configuredId: VALID_ID,
                consent: "granted",
                isProduction: true,
            }),
        ).toEqual({ measurementId: VALID_ID, isConsentPending: false });
    });

    test("stays silent in development even after consent", () => {
        expect(
            resolveAnalyticsState({
                configuredId: VALID_ID,
                consent: "granted",
                isProduction: false,
            }).measurementId,
        ).toBeNull();
    });

    test("never loads the script for a declined visitor", () => {
        expect(
            resolveAnalyticsState({
                configuredId: VALID_ID,
                consent: "denied",
                isProduction: true,
            }),
        ).toEqual({ measurementId: null, isConsentPending: false });
    });

    test("holds the script back while the question is unanswered", () => {
        expect(
            resolveAnalyticsState({
                configuredId: VALID_ID,
                consent: null,
                isProduction: true,
            }),
        ).toEqual({ measurementId: null, isConsentPending: true });
    });

    test("raises the banner in development so it stays reviewable locally", () => {
        expect(
            resolveAnalyticsState({
                configuredId: VALID_ID,
                consent: null,
                isProduction: false,
            }).isConsentPending,
        ).toBe(true);
    });

    const unusableIds: readonly (string | undefined)[] = [undefined, "", "UA-123456-1", "G-"];

    for (const configuredId of unusableIds) {
        test(`asks nothing when the id is ${JSON.stringify(configuredId)}`, () => {
            const consents: readonly (ConsentValue | null)[] = [null, "granted", "denied"];

            for (const consent of consents) {
                expect(
                    resolveAnalyticsState({ configuredId, consent, isProduction: true }),
                ).toEqual({ measurementId: null, isConsentPending: false });
            }
        });
    }
});
