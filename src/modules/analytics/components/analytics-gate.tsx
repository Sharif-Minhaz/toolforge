import { getAnalyticsState } from "../presenters/analytics-state";
import { AnalyticsConsentBanner } from "./analytics-consent-banner";
import { AnalyticsScripts } from "./analytics-scripts";

/**
 * Reads the consent cookie, so the layout renders it inside `<Suspense>` — the
 * one per-request piece of the chrome, kept out of the prerendered shell.
 */
export async function AnalyticsGate() {
    const analytics = await getAnalyticsState();

    return (
        <>
            {analytics.isConsentPending ? <AnalyticsConsentBanner /> : null}
            <AnalyticsScripts measurementId={analytics.measurementId} />
        </>
    );
}
