/**
 * The short-link layer both the QR tool and the URL Shortener stand on.
 *
 * One keyspace, one table, one redirect contract. A dynamic QR code and a
 * shortened URL differ only in what gets printed on the way in — behind the
 * slug they are the same row, so they had better be the same code too.
 */

/**
 * Which tool minted a link. Not stored — it only decides which pair of paths a
 * view is built with, so the QR tool keeps handing out `/q/…` while the
 * shortener hands out `/s/…` from the same table.
 */
export const SHORT_LINK_TOOLS = ["qr", "shortener"] as const;

export type ShortLinkTool = (typeof SHORT_LINK_TOOLS)[number];

export type ShortLinkFailureReason =
    | "not_configured"
    | "invalid_target"
    | "target_too_long"
    | "unsupported_scheme"
    | "self_referential"
    | "invalid_alias"
    | "alias_reserved"
    | "alias_taken"
    | "invalid_schedule"
    | "expiry_in_past"
    | "weak_password"
    | "password_too_long"
    | "challenge_required"
    | "challenge_failed"
    | "not_found"
    | "storage_unavailable";

export type ShortLinkResult<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly reason: ShortLinkFailureReason };

/** A stored link as the domain layer sees it. The password digest never appears. */
export type ShortLink = {
    readonly slug: string;
    readonly target: string;
    /** Whether a visitor has to type a password before the redirect happens. */
    readonly hasPassword: boolean;
    /** Instant the link starts working, or `null` for "already". */
    readonly startsAt: Date | null;
    /** Instant the link stops working, or `null` for "never". */
    readonly expiresAt: Date | null;
    readonly scans: number;
    readonly createdAt: Date;
    readonly lastScanAt: Date | null;
};

/** A link plus the token that lets its owner edit it, returned exactly once. */
export type ShortLinkCreation = {
    readonly link: ShortLink;
    readonly editToken: string;
};

/** What the repository is asked to store. Digests arrive already computed. */
export type NewShortLink = {
    readonly target: string;
    /** A chosen slug, or `null` to draw a random one. */
    readonly alias: string | null;
    readonly passwordHash: string | null;
    readonly startsAt: Date | null;
    readonly expiresAt: Date | null;
};

/**
 * What an edit may change. `passwordHash` is deliberately three-valued:
 * absent leaves the existing password alone, `null` removes it, a string
 * replaces it. Two booleans would let "set" and "clear" be requested at once.
 */
export type ShortLinkPatch = {
    readonly target: string;
    readonly startsAt: Date | null;
    readonly expiresAt: Date | null;
    readonly passwordHash?: string | null;
};

/**
 * The columns a redirect needs, and the only shape the password digest is ever
 * handed out in — to server code deciding whether to release the destination.
 */
export type RedirectRecord = {
    readonly target: string;
    readonly passwordHash: string | null;
    readonly startsAt: Date | null;
    readonly expiresAt: Date | null;
};

/** Whether a link is before, inside, or past its window. */
export type ScheduleState = "pending" | "active" | "expired";

/**
 * The three ways a redirect can refuse, as a tool page hears about them. Kept
 * apart from each other rather than flattened into "not found": being told a
 * link expired is the difference between "I mistyped it" and "I need a new one".
 */
export const LINK_STATES = ["missing", "pending", "expired"] as const;

export type LinkState = (typeof LINK_STATES)[number];

/**
 * What a visit to `/s/<slug>` or `/q/<slug>` should do. Every branch is a
 * different answer to the visitor, so none of them collapse into "not found".
 */
export type RedirectDecision =
    | { readonly kind: "redirect"; readonly target: string }
    | { readonly kind: "password" }
    | { readonly kind: "pending" }
    | { readonly kind: "expired" }
    | { readonly kind: "missing" };

/**
 * A stored link on its way to the browser. Timestamps are ISO strings rather
 * than `Date`s: this shape crosses a server-action boundary, and a string is
 * the one representation that survives it unchanged in every runtime.
 */
export type ShortLinkView = {
    readonly slug: string;
    /** The absolute link a visitor follows — printed, pasted, or scanned. */
    readonly shortUrl: string;
    readonly target: string;
    readonly hasPassword: boolean;
    readonly startsAt: string | null;
    readonly expiresAt: string | null;
    readonly scans: number;
    readonly createdAt: string;
    readonly lastScanAt: string | null;
};

/** The same, plus the one-time link that lets the owner re-point it. */
export type ShortLinkCreatedView = ShortLinkView & {
    readonly editUrl: string;
};

/* --------------------------------------------------------------- actions --- */

/**
 * Action payloads live here rather than beside the actions: a `"use server"`
 * module may only export async functions, and a type sitting next to one is a
 * trap for whoever edits it next.
 */
export type CreateLinkInput = {
    readonly tool: ShortLinkTool;
    readonly target: string;
    /** Blank or absent draws a slug instead. */
    readonly alias: string | null;
    readonly password: string | null;
    /** ISO instants; the browser resolved the reader's zone before sending them. */
    readonly startsAt: string | null;
    readonly expiresAt: string | null;
    readonly token: string;
};

export type UpdateLinkInput = {
    readonly tool: ShortLinkTool;
    readonly editToken: string;
    readonly target: string;
    /**
     * Absent leaves the existing password alone, `null` removes it, a string
     * replaces it. The three cases are what stop "I only changed the
     * destination" from silently unlocking a link.
     */
    readonly password?: string | null;
    readonly startsAt: string | null;
    readonly expiresAt: string | null;
};

export type UnlockFailureReason =
    "not_configured" | "wrong_password" | "missing" | "pending" | "expired";

export type UnlockResult =
    | { readonly ok: true; readonly target: string }
    | { readonly ok: false; readonly reason: UnlockFailureReason };
