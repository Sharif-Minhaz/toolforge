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
