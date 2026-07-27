/**
 * GA4 measurement ids are a `G-` prefix followed by an uppercase alphanumeric
 * stream token. Anything else is a paste error — a Universal Analytics `UA-`
 * property, a Tag Manager `GTM-` container, or a truncated copy.
 */
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

/**
 * Narrows the configured measurement id to a usable value.
 *
 * Returns `null` when the variable is unset, blank, or malformed, so callers
 * can skip loading gtag.js entirely rather than shipping a script that reports
 * into nothing.
 */
export function parseMeasurementId(value: string | undefined): string | null {
    const trimmed = value?.trim() ?? "";

    return MEASUREMENT_ID_PATTERN.test(trimmed) ? trimmed : null;
}
