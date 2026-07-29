/**
 * Cloudflare Turnstile, shared by every tool that spends a metered upstream
 * call. The endpoints and bounds live here; the per-tool part is the `action`
 * string, which each widget passes in so Cloudflare's dashboard can tell the
 * challenges apart.
 */

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const TURNSTILE_SCRIPT_URL =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Turnstile tokens are ~600 characters today; the cap only bounds abuse. */
export const MAX_TURNSTILE_TOKEN_LENGTH = 2_048;

/** siteverify answers in well under a second; past this it is a stall. */
export const TURNSTILE_VERIFY_TIMEOUT_MS = 10_000;
