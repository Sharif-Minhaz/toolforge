import type { ShortenerDraft, ShortenerToggles } from "../types";

/** Names this tool's Turnstile challenge in Cloudflare's dashboard. */
export const TURNSTILE_ACTION = "shortener-create";

export const DEFAULT_DRAFT: ShortenerDraft = {
    target: "",
    alias: "",
    password: "",
    startsAt: "",
    expiresAt: "",
};

export const DEFAULT_TOGGLES: ShortenerToggles = {
    alias: false,
    password: false,
    schedule: false,
};

/**
 * The clock the date picker fills in when a day is chosen and no time has been.
 *
 * Not the same value at both ends. "Starts on the 9th" means the moment the 9th
 * begins, and "ends on the 9th" means the moment it finishes — a shared default
 * of midnight would make the second one kill the link a whole day early.
 */
export const SCHEDULE_DEFAULT_TIME = { start: "00:00", end: "23:59" } as const;
