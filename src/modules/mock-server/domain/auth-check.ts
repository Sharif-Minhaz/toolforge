import type { NormalizedRequest } from "../types/graph";

/**
 * Whether a request carries the credential an endpoint was told to expect.
 *
 * Configured entirely through the UI, as the brief asked — the reader picks a
 * mode and fills two boxes, and never writes a header name into a template.
 *
 * **This is a mock, and the copy has to say so.** It checks that a credential
 * *looks* like the one configured; it does not verify a JWT signature, and it
 * cannot, because the point of a mock is that there is no identity provider
 * behind it. `jwt` here means "there is a Bearer token that parses as three
 * base64url segments" — enough to model the 401 path, and nothing more. Saying
 * otherwise would invite somebody to test an auth flow against a check that
 * accepts anything.
 */

export const AUTH_MODES = ["none", "apiKey", "bearer", "basic", "jwt"] as const;

export type AuthMode = (typeof AUTH_MODES)[number];

export function isAuthMode(value: string): value is AuthMode {
    return (AUTH_MODES as readonly string[]).includes(value);
}

export type AuthConfig = {
    readonly mode: AuthMode;
    /** Which header carries an API key. Ignored by every other mode. */
    readonly header: string;
    /**
     * What the credential must be. Blank means "any credential of the right
     * shape", which is what somebody modelling a 401 usually wants — they care
     * that the header is *there*, not what is in it.
     */
    readonly value: string;
};

function headerValue(request: NormalizedRequest, name: string): string {
    const wanted = name.trim().toLowerCase();

    for (const [key, value] of Object.entries(request.headers)) {
        if (key.toLowerCase() === wanted) {
            return value;
        }
    }

    return "";
}

/** `Bearer abc` → `abc`, case-insensitively on the scheme, as RFC 7235 says. */
function scheme(header: string, name: string): string | null {
    const prefix = `${name.toLowerCase()} `;

    return header.toLowerCase().startsWith(prefix) ? header.slice(prefix.length).trim() : null;
}

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export function checkAuth(config: AuthConfig, request: NormalizedRequest): boolean {
    const expected = config.value.trim();

    switch (config.mode) {
        case "none":
            return true;

        case "apiKey": {
            const supplied = headerValue(request, config.header || "x-api-key");

            return supplied !== "" && (expected === "" || supplied === expected);
        }

        case "bearer": {
            const token = scheme(headerValue(request, "authorization"), "bearer");

            return token !== null && token !== "" && (expected === "" || token === expected);
        }

        case "basic": {
            const encoded = scheme(headerValue(request, "authorization"), "basic");

            if (encoded === null || encoded === "") {
                return false;
            }

            if (expected === "") {
                return true;
            }

            // Compared decoded, so the reader configures `user:pass` rather than
            // its base64 — nobody should have to encode a credential by hand to
            // fill in a form.
            return decodeBasic(encoded) === expected;
        }

        default: {
            const token = scheme(headerValue(request, "authorization"), "bearer");

            if (token === null || !JWT_SHAPE.test(token)) {
                return false;
            }

            return expected === "" || token === expected;
        }
    }
}

function decodeBasic(encoded: string): string {
    try {
        return atob(encoded);
    } catch {
        // Not base64 at all. It cannot match a configured `user:pass`, and
        // throwing here would turn a malformed header into a 500 rather than
        // the 401 it should be.
        return "";
    }
}
