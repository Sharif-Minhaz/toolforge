import type { ConsentValue } from "./consent";
import { parseMeasurementId } from "./measurement-id";

export type AnalyticsState = {
    /** Id to hand gtag.js, or `null` when no script may load. */
    readonly measurementId: string | null;
    /** Whether the consent banner still owes the visitor a question. */
    readonly isConsentPending: boolean;
};

type AnalyticsInput = {
    readonly configuredId: string | undefined;
    readonly consent: ConsentValue | null;
    readonly isProduction: boolean;
};

/**
 * Decides what analytics may do for this request.
 *
 * Three gates, all of which must open before gtag.js loads:
 *
 * 1. a well-formed measurement id is configured
 * 2. the visitor granted consent
 * 3. the build is production, so local and preview traffic never reaches the
 *    live property
 *
 * The banner is a separate question. It is raised whenever an id is configured
 * and the visitor has not answered — including in development, so the prompt
 * stays reviewable locally even though nothing would be reported there.
 */
export function resolveAnalyticsState({
    configuredId,
    consent,
    isProduction,
}: AnalyticsInput): AnalyticsState {
    const measurementId = parseMeasurementId(configuredId);

    // Nothing can be reported, so there is nothing to ask permission for.
    if (!measurementId) {
        return { measurementId: null, isConsentPending: false };
    }

    return {
        measurementId: consent === "granted" && isProduction ? measurementId : null,
        isConsentPending: consent === null,
    };
}
