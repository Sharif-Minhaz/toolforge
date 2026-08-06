import { isBrowserSecret } from "./browser-secret";

/**
 * The contents of a cookie holding one secret per thing this browser owns, as a
 * value rather than as I/O.
 *
 * Kept pure and separate from the repository layer that reads and writes it, for
 * the same reason the short-link history is: a full cookie, a hand-edited one,
 * and a browser that sends nothing at all are all reachable from a test with no
 * request in scope.
 *
 * Two rules hold everything here together.
 *
 * **Every read is total.** Absent, truncated, containing one entry somebody
 * typed by hand, carrying the same secret twice — each degrades to whatever can
 * still be read rather than throwing. This cookie is the visitor's only handle
 * on their work when they have not saved a recovery key, so discarding all of
 * it over one bad entry is the one outcome worth engineering against.
 *
 * **The list is a credential store and is treated as one.** It is capped, the
 * UI says what it holds, and `removeSecret` is what the "forget this" button
 * calls. A browser that quietly accumulated edit rights to twenty of somebody's
 * things would be exactly what this site tells people it is not.
 *
 * The cap is a parameter rather than a constant here, because it is the one
 * thing two callers legitimately disagree about — the Mock Server Studio holds
 * three workspaces, the JSON Server Studio five servers — and each names its own
 * in its module's `domain/constants.ts`, so a limit still lives in exactly one
 * place per tool.
 */

/**
 * Secrets are joined by a character the alphabet cannot contain, so parsing is
 * a `split` that cannot be confused by a value. JSON in a cookie would need
 * escaping and would fail closed on one bad byte instead of one bad entry.
 */
export const SECRET_COOKIE_SEPARATOR = ".";

/**
 * A year. The cookie *is* the visitor's only handle on their work unless they
 * saved the recovery key, so a short expiry would quietly delete it for them.
 */
export const SECRET_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Secrets in the order they were added, newest first.
 *
 * Filtered rather than validated: a malformed entry is dropped and the rest are
 * kept. Duplicates collapse, because two identical secrets are one thing and
 * rendering it twice in a switcher would be a bug nobody could explain.
 */
export function parseSecretList(raw: string | undefined | null, cap: number): readonly string[] {
    if (!raw) {
        return [];
    }

    const seen = new Set<string>();

    for (const entry of raw.split(SECRET_COOKIE_SEPARATOR)) {
        if (isBrowserSecret(entry)) {
            seen.add(entry);
        }
    }

    // Sliced on the way out as well as on the way in, so a cookie that predates
    // a lowered cap cannot keep more than the cap allows.
    return [...seen].slice(0, cap);
}

export function serializeSecretList(secrets: readonly string[]): string {
    return secrets.join(SECRET_COOKIE_SEPARATOR);
}

export type AddSecretResult =
    | { readonly ok: true; readonly secrets: readonly string[] }
    | { readonly ok: false; readonly reason: "cookie_full" };

/**
 * Adds a secret at the front, or refuses.
 *
 * Refuses rather than evicting the oldest, deliberately. Eviction would silently
 * drop somebody's only handle on something they have not saved a recovery key
 * for, and it would do it at the moment their attention is on the *new* thing. A
 * visitor told "forget one first" loses nothing.
 *
 * Re-adding a secret already held is a success and a no-op, so importing
 * something this browser already owns cannot be made to fail by a full list.
 */
export function addSecret(
    secrets: readonly string[],
    secret: string,
    cap: number,
): AddSecretResult {
    if (secrets.includes(secret)) {
        return { ok: true, secrets };
    }

    if (secrets.length >= cap) {
        return { ok: false, reason: "cookie_full" };
    }

    return { ok: true, secrets: [secret, ...secrets] };
}

export function removeSecret(secrets: readonly string[], secret: string): readonly string[] {
    return secrets.filter((held) => held !== secret);
}

export function hasCapacity(secrets: readonly string[], cap: number): boolean {
    return secrets.length < cap;
}
