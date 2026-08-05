import "server-only";

import { cookies } from "next/headers";

import { WORKSPACE_COOKIE_MAX_AGE_SECONDS, WORKSPACE_COOKIE_NAME } from "../domain/constants";
import { parseSecretList, serializeSecretList } from "../domain/session";

/**
 * The cookie itself. Everything about *what* it may contain is in
 * `domain/session.ts`; this file is only the reading and the writing.
 *
 * `httpOnly` is the whole design. The client cannot enumerate the secrets, so
 * the workspace switcher is fed by a Server Action rather than by anything the
 * browser can read — which means a script injected into the page cannot walk
 * off with edit rights to three workspaces.
 */

export async function readWorkspaceSecrets(): Promise<readonly string[]> {
    const store = await cookies();

    return parseSecretList(store.get(WORKSPACE_COOKIE_NAME)?.value);
}

export async function writeWorkspaceSecrets(secrets: readonly string[]): Promise<void> {
    const store = await cookies();

    if (secrets.length === 0) {
        store.delete(WORKSPACE_COOKIE_NAME);

        return;
    }

    store.set(WORKSPACE_COOKIE_NAME, serializeSecretList(secrets), {
        httpOnly: true,
        // `lax` rather than `strict`: a visitor following a link to their own
        // studio from a note or a chat should arrive still owning it. Nothing
        // here is a state-changing GET, so `lax` gives up nothing.
        sameSite: "lax",
        // Off in development so the cookie works over plain-HTTP localhost;
        // every deployment this ships to is HTTPS.
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: WORKSPACE_COOKIE_MAX_AGE_SECONDS,
    });
}
