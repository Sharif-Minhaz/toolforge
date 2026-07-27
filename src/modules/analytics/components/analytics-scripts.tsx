import { GoogleAnalytics } from "@next/third-parties/google";

/**
 * Loads gtag.js through `@next/third-parties`, which defers the request until
 * after hydration so it never competes with the first paint.
 *
 * Renders nothing when `measurementId` is `null`. See `resolveAnalyticsState`
 * for the gates that produce it — the script is never in the document until
 * consent is granted, which is stricter than loading it in a denied state.
 */
export function AnalyticsScripts({ measurementId }: { measurementId: string | null }) {
    if (!measurementId) {
        return null;
    }

    return <GoogleAnalytics gaId={measurementId} />;
}
