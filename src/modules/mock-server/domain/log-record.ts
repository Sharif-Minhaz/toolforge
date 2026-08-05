import type { ExecutionLogLine, JsonValue, TraceEntry } from "../types/graph";

/**
 * What a request log row may contain, and what it must never.
 *
 * People point mock servers at code that is mid-development, which means the
 * requests arriving carry whatever that code sends — including real bearer
 * tokens, session cookies and API keys aimed at a *different* service. A log
 * that stores those verbatim is a credential store nobody agreed to, sitting in
 * a database whose whole purpose is to be disposable.
 *
 * So redaction happens **before the row is written**, not when it is read. A
 * filter on the read path is one forgotten query away from leaking, and it does
 * nothing at all about the copy already on disk.
 */

/**
 * Headers whose values are replaced with a marker.
 *
 * Matched case-insensitively, because HTTP header names are. The list is
 * deliberately broader than "authorization": `x-api-key` and `x-auth-token` are
 * what people actually send, and a cookie header carries a session for whatever
 * origin the caller was working against.
 */
export const REDACTED_HEADERS: readonly string[] = [
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-apikey",
    "x-auth-token",
    "x-access-token",
    "x-csrf-token",
    "x-session-token",
    "api-key",
    "auth-token",
];

/** What a redacted value reads as. Not the empty string — absence and
 *  suppression are different facts, and the reader deserves to see which. */
export const REDACTION_MARKER = "[redacted]";

/** Keys inside a JSON body whose values are replaced, matched loosely. */
const SENSITIVE_KEY = /(password|passwd|secret|token|apikey|api_key|credential|private_key)/iu;

export const MAX_LOGGED_BODY_BYTES = 8 * 1_024;

/** How many rows one workspace keeps. Oldest beyond this are swept. */
export const MAX_LOGS_PER_WORKSPACE = 500;

export const LOG_RETENTION_DAYS = 7;

export function redactHeaders(
    headers: Readonly<Record<string, string>>,
    keepRaw: boolean,
): Record<string, string> {
    const out: Record<string, string> = {};

    for (const [name, value] of Object.entries(headers)) {
        out[name] =
            !keepRaw && REDACTED_HEADERS.includes(name.toLowerCase()) ? REDACTION_MARKER : value;
    }

    return out;
}

/**
 * Replaces the values of sensitive-looking keys anywhere in a body.
 *
 * Depth-limited and total. A body is arbitrary JSON somebody else's program
 * sent, so it can be recursive in shape, enormous, or not an object at all.
 */
export function redactBody(value: JsonValue, keepRaw: boolean, depth = 0): JsonValue {
    if (keepRaw || depth > 8) {
        return keepRaw ? value : null;
    }

    if (Array.isArray(value)) {
        return value.map((item) => redactBody(item, false, depth + 1));
    }

    if (value !== null && typeof value === "object") {
        const out: Record<string, JsonValue> = {};

        for (const [key, child] of Object.entries(value)) {
            out[key] = SENSITIVE_KEY.test(key)
                ? REDACTION_MARKER
                : redactBody(child, false, depth + 1);
        }

        return out;
    }

    return value;
}

export type BodyPreview = {
    readonly preview: string;
    readonly truncated: boolean;
};

/**
 * A body cut to a readable size, measured in **bytes** rather than characters.
 *
 * A cut mid-way through a multi-byte character would produce a broken string,
 * so the slice steps back to a boundary. Truncation is flagged explicitly: a
 * silently shortened body reads as the whole thing and sends somebody hunting
 * for a field that was never missing.
 */
export function previewBody(text: string, limit = MAX_LOGGED_BODY_BYTES): BodyPreview {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);

    if (bytes.length <= limit) {
        return { preview: text, truncated: false };
    }

    // `fatal: false` is the default, and the replacement character at a cut
    // boundary is fine — but stepping back to a valid boundary first means the
    // preview ends cleanly rather than with a stray U+FFFD.
    const decoder = new TextDecoder("utf-8");
    let end = limit;

    while (end > 0 && (bytes[end] & 0b1100_0000) === 0b1000_0000) {
        end -= 1;
    }

    return { preview: decoder.decode(bytes.subarray(0, end)), truncated: true };
}

export type LoggedRequest = {
    readonly headers: Record<string, string>;
    readonly query: Readonly<Record<string, string>>;
    readonly bodyPreview: string;
    readonly bodyTruncated: boolean;
};

export type LoggedResponse = {
    readonly headers: Record<string, string>;
    readonly bodyPreview: string;
    readonly bodyTruncated: boolean;
};

export type LoggedTrace = {
    readonly nodes: readonly TraceEntry[];
    readonly log: readonly ExecutionLogLine[];
};

export function buildLoggedRequest(
    headers: Readonly<Record<string, string>>,
    query: Readonly<Record<string, string>>,
    rawBody: string,
    keepRaw: boolean,
): LoggedRequest {
    const body = previewBody(rawBody);
    const redacted = keepRaw ? body.preview : redactBodyText(body.preview);

    return {
        headers: redactHeaders(headers, keepRaw),
        query,
        bodyPreview: redacted,
        bodyTruncated: body.truncated,
    };
}

/**
 * Redacts a body that is still text.
 *
 * Parsed and re-serialised when it is JSON, so key-based redaction can run;
 * left alone when it is not, because a form body or an XML document has no keys
 * this can reason about and mangling it would help nobody.
 */
function redactBodyText(text: string): string {
    if (text.trim() === "") {
        return text;
    }

    try {
        return JSON.stringify(redactBody(JSON.parse(text) as JsonValue, false));
    } catch {
        return text;
    }
}

export function buildLoggedResponse(
    headers: readonly { readonly name: string; readonly value: string }[],
    body: string,
    keepRaw: boolean,
): LoggedResponse {
    const preview = previewBody(body);

    return {
        headers: redactHeaders(
            Object.fromEntries(headers.map((row) => [row.name, row.value])),
            keepRaw,
        ),
        bodyPreview: preview.preview,
        bodyTruncated: preview.truncated,
    };
}

/** Whether a status code reads as a success, for the log table's tint. */
export function statusTone(status: number): "success" | "warning" | "error" {
    if (status >= 500) {
        return "error";
    }

    return status >= 400 ? "warning" : "success";
}
