/**
 * Whether a string could be somewhere this server is willing to try to reach.
 *
 * Shape only, and shape is not safety: a perfectly well-formed
 * `http://metadata.attacker.example/` passes this and is exactly the attack
 * `tools/repository/address-guard.ts` exists to stop. It runs first because it
 * is free — a typo must not cost a DNS lookup, a quota write or a packet — and
 * the guard runs afterwards because it needs a resolver's answer.
 *
 * Lifted out of the Mock Server Studio when the shared remote-image import
 * needed the same first gate. One copy, because the interesting part is the
 * comment above the credentials check rather than the four lines under it.
 */

/** Only these two. No `file:`, no `gopher:`, no `data:`. */
export const ALLOWED_PUBLIC_URL_SCHEMES = ["http:", "https:"] as const;

/**
 * Both members are also message keys in every catalogue that renders them, so
 * renaming one means renaming it in `en.json` and `bn.json` too.
 */
export type PublicUrlProblem = "invalid_url" | "scheme_not_allowed";

export type PublicUrlCheck =
    | { readonly ok: true; readonly url: URL }
    | { readonly ok: false; readonly reason: PublicUrlProblem };

export function checkPublicUrl(raw: string): PublicUrlCheck {
    let url: URL;

    try {
        url = new URL(raw.trim());
    } catch {
        return { ok: false, reason: "invalid_url" };
    }

    if (!(ALLOWED_PUBLIC_URL_SCHEMES as readonly string[]).includes(url.protocol)) {
        return { ok: false, reason: "scheme_not_allowed" };
    }

    // Credentials in a URL would be sent to whatever the guard resolves, and
    // there is no caller here that needs to express one this way.
    if (url.username !== "" || url.password !== "") {
        return { ok: false, reason: "invalid_url" };
    }

    return { ok: true, url };
}
