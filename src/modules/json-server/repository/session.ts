import "server-only";

import { cookies } from "next/headers";

import {
    parseSecretList,
    SECRET_COOKIE_MAX_AGE_SECONDS,
    serializeSecretList,
} from "@/modules/tools/domain/secret-cookie";

import { MAX_SERVERS_PER_BROWSER, SERVER_COOKIE_NAME } from "../domain/constants";

/**
 * The cookie itself. Everything about *what* it may contain is in
 * `tools/domain/secret-cookie.ts`; this file is only the reading and the
 * writing.
 *
 * `httpOnly` is the whole design. The client cannot enumerate the secrets, so
 * the server list is fed by a Server Action rather than by anything the browser
 * can read — which means a script injected into the page cannot walk off with
 * edit rights to five databases.
 *
 * Its own cookie name rather than sharing the Mock Server Studio's, because the
 * two hold different things with different caps and a single list would make
 * "you can hold three" and "you can hold five" the same sentence.
 */

export async function readServerSecrets(): Promise<readonly string[]> {
    const store = await cookies();

    return parseSecretList(store.get(SERVER_COOKIE_NAME)?.value, MAX_SERVERS_PER_BROWSER);
}

export async function writeServerSecrets(secrets: readonly string[]): Promise<void> {
    const store = await cookies();

    if (secrets.length === 0) {
        store.delete(SERVER_COOKIE_NAME);

        return;
    }

    store.set(SERVER_COOKIE_NAME, serializeSecretList(secrets), {
        httpOnly: true,
        // `lax` rather than `strict`: a visitor following a link to their own
        // studio from a note or a chat should arrive still owning it. Nothing
        // here is a state-changing GET, so `lax` gives up nothing.
        sameSite: "lax",
        // Off in development so the cookie works over plain-HTTP localhost;
        // every deployment this ships to is HTTPS.
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SECRET_COOKIE_MAX_AGE_SECONDS,
    });
}
