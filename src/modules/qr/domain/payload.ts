import type {
    ContactFields,
    EmailFields,
    QrDraft,
    QrPayload,
    QrPayloadKind,
    SmsFields,
    WifiFields,
} from "../types";

/**
 * Turns typed fields into the string a scanner actually acts on. Every format
 * here is a de-facto standard rather than part of ISO/IEC 18004 — the symbol
 * carries bytes and nothing more, and it is the phone's camera app that decides
 * a payload starting `WIFI:` is an offer to join a network.
 *
 * Blank required fields produce an empty string rather than a skeleton. A code
 * that encodes `BEGIN:VCARD … END:VCARD` around nothing scans perfectly and
 * saves an empty contact, which is worse than showing no code at all.
 */

/* -------------------------------------------------------------- escaping --- */

/**
 * `WIFI:` fields are terminated by `;`, so those four characters have to be
 * escaped or a passphrase containing one silently truncates the network name.
 */
function escapeWifi(value: string): string {
    return value.replace(/([\\;,:"])/g, "\\$1");
}

/** vCard 3.0 escaping: the structural characters, plus real line breaks. */
function escapeVCard(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r\n|\r|\n/g, "\\n");
}

/* -------------------------------------------------------------- builders --- */

/**
 * A bare `example.com` is not a URL, and a scanner shown one offers a search
 * rather than the site. Anything that already names a scheme is left alone, so
 * `mailto:` and custom app schemes still pass through.
 */
export function normalizeUrl(raw: string): string {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
        return "";
    }

    return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function buildWifi(fields: WifiFields): string {
    const ssid = fields.ssid.trim();

    if (ssid.length === 0) {
        return "";
    }

    const parts = [`T:${fields.encryption}`, `S:${escapeWifi(ssid)}`];

    // An open network carries no password field at all; a scanner shown an
    // empty one on some Android builds prompts for a passphrase anyway.
    if (fields.encryption !== "nopass" && fields.password.length > 0) {
        parts.push(`P:${escapeWifi(fields.password)}`);
    }

    if (fields.hidden) {
        parts.push("H:true");
    }

    return `WIFI:${parts.join(";")};;`;
}

/** vCard 3.0 — the version every phone contact app still reads. */
function buildContact(fields: ContactFields): string {
    const entries: [string, string][] = [];
    const name = fields.fullName.trim();

    if (name.length > 0) {
        // `N` is structured as family;given;middle;prefix;suffix. Splitting a
        // free-text name into those is guesswork, so the whole thing goes in
        // the family slot and `FN` carries the display form.
        entries.push(["N", `${escapeVCard(name)};;;;`], ["FN", escapeVCard(name)]);
    }

    if (fields.organization.trim().length > 0) {
        entries.push(["ORG", escapeVCard(fields.organization.trim())]);
    }

    if (fields.phone.trim().length > 0) {
        entries.push(["TEL;TYPE=CELL", escapeVCard(fields.phone.trim())]);
    }

    if (fields.email.trim().length > 0) {
        entries.push(["EMAIL;TYPE=INTERNET", escapeVCard(fields.email.trim())]);
    }

    if (fields.url.trim().length > 0) {
        entries.push(["URL", escapeVCard(normalizeUrl(fields.url))]);
    }

    if (fields.address.trim().length > 0) {
        // The seven-part ADR structure, with the whole address in the street
        // slot for the same reason `N` carries the whole name.
        entries.push(["ADR;TYPE=HOME", `;;${escapeVCard(fields.address.trim())};;;;`]);
    }

    if (entries.length === 0) {
        return "";
    }

    const lines = ["BEGIN:VCARD", "VERSION:3.0"];

    for (const [key, value] of entries) {
        lines.push(`${key}:${value}`);
    }

    lines.push("END:VCARD");

    // CRLF, as RFC 6350 requires. Some Android readers drop the last property
    // of a bare-LF card.
    return lines.join("\r\n");
}

function buildSms(fields: SmsFields): string {
    const phone = fields.phone.trim();

    if (phone.length === 0) {
        return "";
    }

    // `SMSTO:` rather than `sms:` — it is the form both iOS and Android have
    // understood for longest, and the only one that reliably prefills a body.
    return fields.message.length > 0 ? `SMSTO:${phone}:${fields.message}` : `SMSTO:${phone}`;
}

function buildEmail(fields: EmailFields): string {
    const address = fields.address.trim();

    if (address.length === 0) {
        return "";
    }

    const query = new URLSearchParams();

    if (fields.subject.length > 0) {
        query.set("subject", fields.subject);
    }

    if (fields.body.length > 0) {
        query.set("body", fields.body);
    }

    const search = query.toString();

    // `URLSearchParams` encodes a space as `+`, which a mail client shows
    // literally in a subject line. Percent-encoding is what `mailto:` wants.
    return search.length > 0
        ? `mailto:${address}?${search.replace(/\+/g, "%20")}`
        : `mailto:${address}`;
}

/* ----------------------------------------------------------------- entry --- */

export function buildPayloadText(payload: QrPayload): string {
    switch (payload.kind) {
        case "url":
            return normalizeUrl(payload.url);
        case "text":
            return payload.text;
        case "wifi":
            return buildWifi(payload);
        case "contact":
            return buildContact(payload);
        case "sms":
            return buildSms(payload);
        case "email":
            return buildEmail(payload);
        case "phone": {
            const number = payload.number.trim();

            return number.length === 0 ? "" : `tel:${number}`;
        }
    }
}

/** Pulls one kind's fields out of the draft the workbench keeps for all seven. */
export function selectPayload(kind: QrPayloadKind, draft: QrDraft): QrPayload {
    switch (kind) {
        case "url":
            return { kind, url: draft.url };
        case "text":
            return { kind, text: draft.text };
        case "wifi":
            return { kind, ...draft.wifi };
        case "contact":
            return { kind, ...draft.contact };
        case "sms":
            return { kind, ...draft.sms };
        case "email":
            return { kind, ...draft.email };
        case "phone":
            return { kind, ...draft.phone };
    }
}

/** The payload text for whichever kind is showing. */
export function buildDraftText(kind: QrPayloadKind, draft: QrDraft): string {
    return buildPayloadText(selectPayload(kind, draft));
}
