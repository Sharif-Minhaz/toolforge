import type { ScannedField, ScannedFieldName, ScannedPayload } from "../types";

/**
 * The inverse of `payload.ts`: a decoded string back into labelled parts.
 *
 * Everything here is best-effort by design. The string came off someone else's
 * code and may be malformed in any way at all, so nothing throws and nothing is
 * rejected — a payload that fails to parse as a known form is reported as plain
 * text, which is exactly what a scanner would show.
 */

function field(name: ScannedFieldName, value: string): ScannedField | null {
    const trimmed = value.trim();

    return trimmed.length === 0 ? null : { name, value: trimmed };
}

function compact(fields: readonly (ScannedField | null)[]): ScannedField[] {
    return fields.filter((entry): entry is ScannedField => entry !== null);
}

/** Drops the backslashes `WIFI:` and vCard use to protect their punctuation. */
function unescape(value: string): string {
    return value.replace(/\\([\s\S])/g, (_match, character: string) =>
        character === "n" ? "\n" : character,
    );
}

/**
 * Splits on unescaped separators. A naive `split(";")` would cut a passphrase
 * containing `\;` in half, which is the whole reason the escaping exists.
 */
function splitUnescaped(value: string, separator: string): string[] {
    const parts: string[] = [];
    let current = "";
    let escaped = false;

    for (const character of value) {
        if (escaped) {
            current += `\\${character}`;
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (character === separator) {
            parts.push(current);
            current = "";
            continue;
        }

        current += character;
    }

    if (escaped) {
        current += "\\";
    }

    parts.push(current);

    return parts;
}

/* ------------------------------------------------------------------ wifi --- */

const WIFI_KEYS: Record<string, ScannedFieldName> = {
    S: "ssid",
    P: "password",
    T: "encryption",
    H: "hidden",
};

function parseWifi(text: string): ScannedPayload {
    const body = text.slice("WIFI:".length);
    const found = new Map<ScannedFieldName, string>();

    for (const entry of splitUnescaped(body, ";")) {
        const separator = entry.indexOf(":");

        if (separator === -1) {
            continue;
        }

        const name = WIFI_KEYS[entry.slice(0, separator).trim().toUpperCase()];

        if (name !== undefined) {
            found.set(name, unescape(entry.slice(separator + 1)));
        }
    }

    // Fixed order, so the panel reads the same way whichever order the code
    // happened to write the fields in.
    const order: ScannedFieldName[] = ["ssid", "password", "encryption", "hidden"];

    return {
        kind: "wifi",
        text,
        fields: compact(order.map((name) => field(name, found.get(name) ?? ""))),
    };
}

/* --------------------------------------------------------------- contact --- */

const VCARD_KEYS: Record<string, ScannedFieldName> = {
    FN: "fullName",
    ORG: "organization",
    TEL: "phone",
    EMAIL: "email",
    URL: "url",
    ADR: "address",
};

function parseVCard(text: string): ScannedPayload {
    const found = new Map<ScannedFieldName, string>();

    for (const line of text.split(/\r\n|\r|\n/)) {
        const separator = line.indexOf(":");

        if (separator === -1) {
            continue;
        }

        // `TEL;TYPE=CELL` and `TEL` are the same property; the parameters after
        // the semicolon say how to label it, which this panel does not.
        const property = line.slice(0, separator).split(";")[0].trim().toUpperCase();
        const name = VCARD_KEYS[property];

        if (name === undefined || found.has(name)) {
            continue;
        }

        // Structured values (`N`, `ADR`) pad with empty components; joining the
        // non-empty ones back with spaces is closer to an address than the raw
        // `;;12 High St;;;;` would be.
        const value = splitUnescaped(line.slice(separator + 1), ";")
            .map((part) => unescape(part).trim())
            .filter((part) => part.length > 0)
            .join(", ");

        found.set(name, value);
    }

    const order: ScannedFieldName[] = [
        "fullName",
        "organization",
        "phone",
        "email",
        "url",
        "address",
    ];

    return {
        kind: "contact",
        text,
        fields: compact(order.map((name) => field(name, found.get(name) ?? ""))),
    };
}

/**
 * MECARD is the older Japanese convention some scanners still emit. It is a
 * different syntax for the same idea, so it lands on the same kind.
 */
function parseMeCard(text: string): ScannedPayload {
    const keys: Record<string, ScannedFieldName> = {
        N: "fullName",
        ORG: "organization",
        TEL: "phone",
        EMAIL: "email",
        URL: "url",
        ADR: "address",
    };
    const found = new Map<ScannedFieldName, string>();

    for (const entry of splitUnescaped(text.slice("MECARD:".length), ";")) {
        const separator = entry.indexOf(":");

        if (separator === -1) {
            continue;
        }

        const name = keys[entry.slice(0, separator).trim().toUpperCase()];

        if (name !== undefined && !found.has(name)) {
            found.set(name, unescape(entry.slice(separator + 1)).replace(/,/g, " "));
        }
    }

    const order: ScannedFieldName[] = [
        "fullName",
        "organization",
        "phone",
        "email",
        "url",
        "address",
    ];

    return {
        kind: "contact",
        text,
        fields: compact(order.map((name) => field(name, found.get(name) ?? ""))),
    };
}

/* ----------------------------------------------------------------- other --- */

function parseSms(text: string): ScannedPayload {
    const body = text.replace(/^(SMSTO|smsto|SMS|sms):/, "");
    const separator = body.indexOf(":");
    const phone = separator === -1 ? body : body.slice(0, separator);
    const message = separator === -1 ? "" : body.slice(separator + 1);

    // `sms:+123?body=hi` is the RFC 5724 spelling, and some readers emit it.
    const [number, query] = phone.split("?");
    const queried = query ? new URLSearchParams(query).get("body") : null;

    return {
        kind: "sms",
        text,
        fields: compact([field("phone", number), field("message", queried ?? message)]),
    };
}

function parseMailto(text: string): ScannedPayload {
    const body = text.slice("mailto:".length);
    const [addresses, query] = body.split("?");
    const params = new URLSearchParams(query ?? "");

    return {
        kind: "email",
        text,
        fields: compact([
            field("email", decodeSafely(addresses)),
            field("subject", params.get("subject") ?? ""),
            field("body", params.get("body") ?? ""),
        ]),
    };
}

/** A stray `%` in a scanned string must not take the whole panel down. */
function decodeSafely(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/* ----------------------------------------------------------------- entry --- */

export function parseScannedText(text: string): ScannedPayload {
    const trimmed = text.trim();

    if (/^WIFI:/i.test(trimmed)) {
        return parseWifi(trimmed);
    }

    if (/^BEGIN:VCARD/i.test(trimmed)) {
        return parseVCard(trimmed);
    }

    if (/^MECARD:/i.test(trimmed)) {
        return parseMeCard(trimmed);
    }

    if (/^(SMSTO|SMS):/i.test(trimmed)) {
        return parseSms(trimmed);
    }

    if (/^mailto:/i.test(trimmed)) {
        return parseMailto(trimmed);
    }

    if (/^tel:/i.test(trimmed)) {
        return {
            kind: "phone",
            text: trimmed,
            fields: compact([field("phone", trimmed.slice("tel:".length))]),
        };
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return { kind: "url", text: trimmed, fields: compact([field("url", trimmed)]) };
    }

    return { kind: "text", text, fields: compact([field("text", text)]) };
}

/**
 * Whether the scanned payload is a link the reader could follow. Checked here
 * rather than in the panel so `javascript:` and `data:` — both of which a
 * hostile code can carry — never reach an anchor's `href`.
 */
export function getFollowableUrl(payload: ScannedPayload): string | null {
    if (payload.kind !== "url") {
        return null;
    }

    try {
        const url = new URL(payload.text);

        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
}
