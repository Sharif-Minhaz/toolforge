import "server-only";

import { decideRedirect } from "../domain/redirect";
import { isResolvableSlug } from "../domain/slug";
import type { RedirectDecision } from "../types";
import { findRedirectRecord } from "./links";

/**
 * One slug, one verdict — the whole read path behind a short link.
 *
 * Both redirect routes and the unlock gate call this, so a window or a password
 * behaves identically whichever address the visitor arrived on. It also keeps
 * `Date.now()` out of a server component's body, where reading the clock during
 * render is exactly the kind of impurity the React rules forbid.
 *
 * The slug is checked before the query, so a mistyped link — or a scripted walk
 * of the keyspace — never reaches the database.
 */
export async function resolveShortLink(slug: string): Promise<RedirectDecision> {
    if (!isResolvableSlug(slug)) {
        return { kind: "missing" };
    }

    return decideRedirect(await findRedirectRecord(slug), Date.now());
}
