import { createBrowserSecret, hashCredential, isBrowserSecret } from "./browser-secret";
import { timingSafeEqual } from "./timing-safe";
import type { RandomBytes } from "../types";

/**
 * The credential a stranger's program presents to a public server address —
 * `/j/<key>`, `/m/<key>`, `/g/<key>` — when its owner has made it private.
 *
 * It is not the studio cookie and not the recovery key, and must never be
 * either. Both of those grant *edit rights to the server itself*; this one is
 * pasted into Postman, a `.env`, and sometimes a front end, so it grants only
 * what the public address already answers. Leaking it costs the data behind
 * one server, and Rotate takes it back.
 *
 * Stored as a SHA-256 digest beside the server row, for the reason
 * `browser-secret.ts` gives: a database copy must not hand out working
 * credentials. The value is ~165 random bits, so the digest is neither salted
 * nor stretched.
 *
 * Lifted into `tools/` from the start because three servers share it.
 */

/**
 * Its own header rather than `Authorization`, because the Mock Server Studio's
 * endpoints check `Authorization` themselves — an author modelling a 401 for a
 * missing Bearer token could not do so if the platform claimed that header.
 */
export const ACCESS_TOKEN_HEADER = "x-toolforge-key";

/** Makes a pasted token recognisable in a `.env` and in a secret scanner. */
export const ACCESS_TOKEN_PREFIX = "tf_";

/** Matches the Prisma `ServerAccess` enum value for value. */
export const SERVER_ACCESS_MODES = ["OPEN", "PRIVATE"] as const;

export type ServerAccess = (typeof SERVER_ACCESS_MODES)[number];

/** Two refusals, kept apart so a caller knows whether to add or fix the header. */
export type AccessRefusal = "token_required" | "token_invalid";

/** What a server row carries for the gate. Never the token itself. */
export type AccessGate = {
    readonly access: ServerAccess;
    readonly accessTokenHash: string | null;
};

/**
 * Who is asking. `owner` is passed only after the caller's studio cookie has
 * been matched against the server's claims — today only by the GraphQL
 * endpoint, so its studio's Run button keeps working on a private server.
 */
export type AccessCredential =
    { readonly kind: "token"; readonly value: string | null } | { readonly kind: "owner" };

export function createAccessToken(randomBytes: RandomBytes): string {
    return `${ACCESS_TOKEN_PREFIX}${createBrowserSecret(randomBytes)}`;
}

/**
 * `null` means the request may proceed.
 *
 * Fails closed: a private server with no digest on file — never issued, or a
 * row a migration left half-written — refuses every token rather than none.
 */
export async function checkAccess(
    gate: AccessGate,
    credential: AccessCredential,
): Promise<AccessRefusal | null> {
    if (gate.access === "OPEN" || credential.kind === "owner") {
        return null;
    }

    const presented = credential.value?.trim() ?? "";

    if (presented === "") {
        return "token_required";
    }

    // Shape before hashing: a header of junk costs a regular expression.
    if (
        gate.accessTokenHash === null ||
        !presented.startsWith(ACCESS_TOKEN_PREFIX) ||
        !isBrowserSecret(presented.slice(ACCESS_TOKEN_PREFIX.length))
    ) {
        return "token_invalid";
    }

    return timingSafeEqual(await hashCredential(presented), gate.accessTokenHash)
        ? null
        : "token_invalid";
}
