import type { ShortLinkTool } from "../types";

/**
 * Characters a drawn slug uses: digits and consonants only. No vowels, so no
 * short code ever spells a word by accident, and no `0`/`o`/`1`/`l` to be
 * misread off a poster.
 */
export const SLUG_ALPHABET = "23456789bcdfghjkmnpqrstvwxz";

export const SLUG_LENGTH = 8;

/** 40 characters of the same alphabet, roughly 190 bits. */
export const EDIT_TOKEN_LENGTH = 40;

/**
 * A chosen alias is a wider alphabet than a drawn slug — people want words,
 * and a word needs vowels. Lowercase only, so `/s/Launch` and `/s/launch`
 * cannot be two different destinations.
 */
export const ALIAS_ALPHABET_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const ALIAS_LENGTH = { min: 3, max: 40 } as const;

/**
 * Aliases nobody may take.
 *
 * Two reasons, and the second matters more. `/s/` may grow sub-routes, so the
 * words this service might one day mean itself are held back. And a short link
 * reading `…/s/login` or `…/s/verify` is a phishing lure wearing this origin's
 * name — those are refused outright rather than moderated later.
 */
export const RESERVED_ALIASES: readonly string[] = [
    "about",
    "account",
    "admin",
    "api",
    "auth",
    "billing",
    "confirm",
    "contact",
    "dashboard",
    "edit",
    "help",
    "index",
    "login",
    "logout",
    "new",
    "password",
    "pay",
    "payment",
    "privacy",
    "recover",
    "reset",
    "root",
    "secure",
    "settings",
    "signin",
    "signup",
    "support",
    "terms",
    "tools",
    "unlock",
    "update",
    "verify",
    "wallet",
];

export const MAX_TARGET_URL_LENGTH = 2_000;

/**
 * Where each tool's links live. Both resolve the same table, so a target
 * pointing at either one is a chain this service refuses to be part of.
 */
export const QR_REDIRECT_PREFIX = "/q";

export const SHORTENER_REDIRECT_PREFIX = "/s";

export const REDIRECT_PREFIXES: readonly string[] = [QR_REDIRECT_PREFIX, SHORTENER_REDIRECT_PREFIX];

/** Where the owner goes to re-point a link, per tool. */
export const QR_EDIT_PREFIX = "/tools/qr/edit";

export const SHORTENER_EDIT_PREFIX = "/tools/shortener/edit";

/** Where a visitor is sent to type a link's password. */
export const UNLOCK_PREFIX = "/unlock";

/** The pair of paths each tool builds its links from. */
export const TOOL_PREFIXES: Record<
    ShortLinkTool,
    { readonly redirect: string; readonly edit: string }
> = {
    qr: { redirect: QR_REDIRECT_PREFIX, edit: QR_EDIT_PREFIX },
    shortener: { redirect: SHORTENER_REDIRECT_PREFIX, edit: SHORTENER_EDIT_PREFIX },
};

/**
 * Link passwords are shared out loud — read over a phone, pasted into a chat —
 * so the floor is low enough to be usable and the digest is what carries the
 * weight. The ceiling only exists so a megabyte cannot be sent to PBKDF2.
 */
export const PASSWORD_LENGTH = { min: 4, max: 128 } as const;

/**
 * OWASP's 2023 floor for PBKDF2-HMAC-SHA256. High enough to matter, low enough
 * that an unlock page still answers immediately.
 */
export const PBKDF2_ITERATIONS = 210_000;

export const PBKDF2_SALT_BYTES = 16;

export const PBKDF2_KEY_BITS = 256;
