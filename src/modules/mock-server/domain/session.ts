import { isWorkspaceSecret } from "./credentials";
import { MAX_WORKSPACES_PER_BROWSER, WORKSPACE_COOKIE_SEPARATOR } from "./constants";

/**
 * The cookie's contents, as a value rather than as I/O.
 *
 * Kept pure and separate from `repository/session.ts` for the same reason the
 * short-link history is: a full cookie, a hand-edited one, and a browser that
 * sends nothing at all are all reachable from a test with no request in scope.
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
 * UI says what it holds, and `removeSecret` is what the "forget this workspace"
 * button calls. A browser that quietly accumulated edit rights to twenty
 * workspaces would be exactly the thing this site tells people it is not.
 */

/**
 * Secrets in the order they were added, newest first.
 *
 * Filtered rather than validated: a malformed entry is dropped and the rest are
 * kept. Duplicates collapse, because two identical secrets are one workspace
 * and rendering it twice in the switcher would be a bug nobody could explain.
 */
export function parseSecretList(raw: string | undefined | null): readonly string[] {
    if (!raw) {
        return [];
    }

    const seen = new Set<string>();

    for (const entry of raw.split(WORKSPACE_COOKIE_SEPARATOR)) {
        if (isWorkspaceSecret(entry)) {
            seen.add(entry);
        }
    }

    // Sliced on the way out as well as on the way in, so a cookie that predates
    // a lowered cap cannot keep more than the cap allows.
    return [...seen].slice(0, MAX_WORKSPACES_PER_BROWSER);
}

export function serializeSecretList(secrets: readonly string[]): string {
    return secrets.join(WORKSPACE_COOKIE_SEPARATOR);
}

export type AddSecretResult =
    | { readonly ok: true; readonly secrets: readonly string[] }
    | { readonly ok: false; readonly reason: "cookie_full" };

/**
 * Adds a secret at the front, or refuses.
 *
 * Refuses rather than evicting the oldest, deliberately. Eviction would silently
 * drop somebody's only handle on a workspace they have not saved a recovery key
 * for, and it would do it at the moment their attention is on the *new*
 * workspace. A visitor told "forget one first" loses nothing.
 *
 * Re-adding a secret already held is a success and a no-op, so importing a
 * workspace this browser already owns cannot be made to fail by a full list.
 */
export function addSecret(secrets: readonly string[], secret: string): AddSecretResult {
    if (secrets.includes(secret)) {
        return { ok: true, secrets };
    }

    if (secrets.length >= MAX_WORKSPACES_PER_BROWSER) {
        return { ok: false, reason: "cookie_full" };
    }

    return { ok: true, secrets: [secret, ...secrets] };
}

export function removeSecret(secrets: readonly string[], secret: string): readonly string[] {
    return secrets.filter((held) => held !== secret);
}

export function hasCapacity(secrets: readonly string[]): boolean {
    return secrets.length < MAX_WORKSPACES_PER_BROWSER;
}
