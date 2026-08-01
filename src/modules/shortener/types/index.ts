/**
 * One remembered link, as it sits in this browser's storage.
 *
 * Shaped for what the recent-links list has to show without a round trip, and
 * nothing more. It deliberately carries `editUrl`: a one-time edit link that
 * only ever existed in the response that created it is a feature nobody uses,
 * because nobody saved it. Keeping it here is what makes "change the
 * destination later" a real promise on a returning visit — and it is also why
 * the tool says out loud that this list is a credential store, and gives one
 * button to empty it.
 */
export type LinkHistoryEntry = {
    readonly slug: string;
    readonly shortUrl: string;
    readonly target: string;
    readonly editUrl: string;
    readonly hasPassword: boolean;
    /** ISO instants, or `null` for "no window". */
    readonly startsAt: string | null;
    readonly expiresAt: string | null;
    readonly createdAt: string;
};

/** Everything the create form holds, in one object with one updater. */
export type ShortenerDraft = {
    readonly target: string;
    readonly alias: string;
    readonly password: string;
    /** `datetime-local` values — wall clock in the reader's own zone. */
    readonly startsAt: string;
    readonly expiresAt: string;
};

/** Which optional panels the reader has opened. */
export type ShortenerToggles = {
    readonly alias: boolean;
    readonly password: boolean;
    readonly schedule: boolean;
};
