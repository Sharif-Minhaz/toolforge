import "server-only";

import { cookies } from "next/headers";

import { logEvent } from "@/modules/observability/domain/logger";
import { type AnalyticsState, resolveAnalyticsState } from "../domain/analytics-state";
import { CONSENT_COOKIE, parseConsent } from "../domain/consent";
import { parseMeasurementId } from "../domain/measurement-id";

// `NEXT_PUBLIC_*` is inlined at build time, so this check runs once per process
// rather than once per request — a typo warns without flooding the logs.
const configuredId = process.env.NEXT_PUBLIC_MEASUREMENT_ID;

if (configuredId && !parseMeasurementId(configuredId)) {
    logEvent("warn", "analytics.measurement_id_invalid", { configured: configuredId });
}

/** Reads the consent cookie and resolves what analytics may do this request. */
export async function getAnalyticsState(): Promise<AnalyticsState> {
    const store = await cookies();

    return resolveAnalyticsState({
        configuredId,
        consent: parseConsent(store.get(CONSENT_COOKIE)?.value),
        isProduction: process.env.NODE_ENV === "production",
    });
}
