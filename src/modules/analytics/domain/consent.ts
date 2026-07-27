export const CONSENT_VALUES = ["granted", "denied"] as const;

export type ConsentValue = (typeof CONSENT_VALUES)[number];

/**
 * Cookie recording the visitor's analytics answer. Not `httpOnly` — the value
 * carries no authority, and keeping it readable leaves room for a future
 * "change your choice" control without another round trip.
 */
export const CONSENT_COOKIE = "toolforge.analytics-consent";

/** Six months. Long enough not to nag, short enough that consent stays current. */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export function isConsentValue(value: unknown): value is ConsentValue {
    return typeof value === "string" && CONSENT_VALUES.includes(value as ConsentValue);
}

/**
 * Reads the persisted answer.
 *
 * `null` means the visitor has not answered yet — which is deliberately
 * distinct from `"denied"`, because only the unanswered case is allowed to
 * raise the banner.
 */
export function parseConsent(value: string | undefined): ConsentValue | null {
    return isConsentValue(value) ? value : null;
}
