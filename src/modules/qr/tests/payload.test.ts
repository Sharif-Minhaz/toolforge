import { describe, expect, test } from "bun:test";

import { DEFAULT_DRAFT } from "@/modules/qr/domain/constants";
import {
    buildDraftText,
    buildPayloadText,
    normalizeUrl,
    selectPayload,
} from "@/modules/qr/domain/payload";
import { parseScannedText } from "@/modules/qr/domain/scan";
import { QR_PAYLOAD_KINDS, type QrDraft, type ScannedFieldName } from "@/modules/qr/types";

function fieldValue(text: string, name: ScannedFieldName): string | undefined {
    return parseScannedText(text).fields.find((entry) => entry.name === name)?.value;
}

describe("normalizeUrl", () => {
    test("adds https to a bare host", () => {
        expect(normalizeUrl("example.com")).toBe("https://example.com");
        expect(normalizeUrl("  example.com/a/b  ")).toBe("https://example.com/a/b");
    });

    test("leaves an existing scheme alone", () => {
        expect(normalizeUrl("http://example.com")).toBe("http://example.com");
        expect(normalizeUrl("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
        expect(normalizeUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
        expect(normalizeUrl("myapp+deep://open")).toBe("myapp+deep://open");
    });

    test("an empty value stays empty", () => {
        expect(normalizeUrl("")).toBe("");
        expect(normalizeUrl("   ")).toBe("");
    });
});

describe("buildPayloadText — empty input", () => {
    test("every kind produces nothing until its required field is filled", () => {
        for (const kind of QR_PAYLOAD_KINDS) {
            expect(buildDraftText(kind, DEFAULT_DRAFT)).toBe("");
        }
    });

    test("a contact with only an organisation is still a contact", () => {
        const draft: QrDraft = {
            ...DEFAULT_DRAFT,
            contact: { ...DEFAULT_DRAFT.contact, organization: "ToolForge" },
        };

        expect(buildDraftText("contact", draft)).toContain("ORG:ToolForge");
    });
});

describe("buildPayloadText — wifi", () => {
    test("writes the fields scanners expect, terminated twice", () => {
        const text = buildPayloadText({
            kind: "wifi",
            ssid: "Cafe Guest",
            password: "hunter2",
            encryption: "WPA",
            hidden: false,
        });

        expect(text).toBe("WIFI:T:WPA;S:Cafe Guest;P:hunter2;;");
    });

    test("escapes the four characters that would truncate a field", () => {
        const text = buildPayloadText({
            kind: "wifi",
            ssid: 'a;b,c:d"e\\f',
            password: "p;w",
            encryption: "WPA",
            hidden: true,
        });

        expect(text).toBe(String.raw`WIFI:T:WPA;S:a\;b\,c\:d\"e\\f;P:p\;w;H:true;;`);
    });

    test("an open network carries no password field", () => {
        const text = buildPayloadText({
            kind: "wifi",
            ssid: "Guest",
            password: "ignored",
            encryption: "nopass",
            hidden: false,
        });

        expect(text).toBe("WIFI:T:nopass;S:Guest;;");
    });

    test("survives the trip back through the parser", () => {
        const text = buildPayloadText({
            kind: "wifi",
            ssid: 'My; Network"',
            password: "p,a:ss\\word",
            encryption: "WPA",
            hidden: true,
        });

        expect(fieldValue(text, "ssid")).toBe('My; Network"');
        expect(fieldValue(text, "password")).toBe("p,a:ss\\word");
        expect(fieldValue(text, "hidden")).toBe("true");
    });
});

describe("buildPayloadText — contact", () => {
    const contact = {
        kind: "contact",
        fullName: "Ada Lovelace",
        phone: "+44 20 7946 0958",
        email: "ada@example.com",
        organization: "Analytical Engines, Ltd",
        url: "example.com/ada",
        address: "12 High St; London",
    } as const;

    test("is a vCard 3.0 with CRLF line endings", () => {
        const text = buildPayloadText(contact);

        expect(text.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
        expect(text.endsWith("\r\nEND:VCARD")).toBe(true);
        expect(text).toContain("FN:Ada Lovelace");
        expect(text).toContain("TEL;TYPE=CELL:+44 20 7946 0958");
        expect(text).toContain("URL:https://example.com/ada");
    });

    test("escapes the structural characters", () => {
        const text = buildPayloadText(contact);

        expect(text).toContain(String.raw`ORG:Analytical Engines\, Ltd`);
        expect(text).toContain(String.raw`ADR;TYPE=HOME:;;12 High St\; London;;;;`);
    });

    test("a newline inside a field becomes an escape, not a new property", () => {
        const text = buildPayloadText({ ...contact, address: "12 High St\nLondon" });

        expect(text).toContain(String.raw`12 High St\nLondon`);
        // BEGIN, VERSION, N, FN, ORG, TEL, EMAIL, URL, ADR, END — and no more.
        expect(text.split("\r\n")).toHaveLength(10);
    });

    test("survives the trip back through the parser", () => {
        const text = buildPayloadText(contact);

        expect(fieldValue(text, "fullName")).toBe("Ada Lovelace");
        expect(fieldValue(text, "organization")).toBe("Analytical Engines, Ltd");
        expect(fieldValue(text, "address")).toBe("12 High St; London");
        expect(fieldValue(text, "email")).toBe("ada@example.com");
    });
});

describe("buildPayloadText — messaging", () => {
    test("sms uses SMSTO, with and without a body", () => {
        expect(buildPayloadText({ kind: "sms", phone: " +15551234 ", message: "" })).toBe(
            "SMSTO:+15551234",
        );
        expect(buildPayloadText({ kind: "sms", phone: "+15551234", message: "on my way" })).toBe(
            "SMSTO:+15551234:on my way",
        );
    });

    test("email percent-encodes the query rather than using plus signs", () => {
        const text = buildPayloadText({
            kind: "email",
            address: "hi@example.com",
            subject: "Quick question",
            body: "Line one\nLine two & more",
        });

        expect(text).toBe(
            "mailto:hi@example.com?subject=Quick%20question&body=Line%20one%0ALine%20two%20%26%20more",
        );
        expect(text).not.toContain("+");
    });

    test("email with no extras is a bare mailto", () => {
        expect(
            buildPayloadText({ kind: "email", address: "hi@example.com", subject: "", body: "" }),
        ).toBe("mailto:hi@example.com");
    });

    test("phone is a tel URI", () => {
        expect(buildPayloadText({ kind: "phone", number: " +1 555 0100 " })).toBe(
            "tel:+1 555 0100",
        );
    });

    test("messaging payloads survive the trip back through the parser", () => {
        const sms = buildPayloadText({ kind: "sms", phone: "+15551234", message: "on my way" });

        expect(fieldValue(sms, "phone")).toBe("+15551234");
        expect(fieldValue(sms, "message")).toBe("on my way");

        const email = buildPayloadText({
            kind: "email",
            address: "hi@example.com",
            subject: "Quick question",
            body: "Line one\nLine two & more",
        });

        expect(fieldValue(email, "subject")).toBe("Quick question");
        expect(fieldValue(email, "body")).toBe("Line one\nLine two & more");
    });
});

describe("selectPayload", () => {
    test("pulls each kind's fields out of the one draft", () => {
        const draft: QrDraft = {
            ...DEFAULT_DRAFT,
            url: "example.com",
            wifi: { ssid: "Net", password: "pw", encryption: "WEP", hidden: true },
        };

        expect(selectPayload("url", draft)).toEqual({ kind: "url", url: "example.com" });
        expect(selectPayload("wifi", draft)).toEqual({
            kind: "wifi",
            ssid: "Net",
            password: "pw",
            encryption: "WEP",
            hidden: true,
        });
    });

    test("switching kinds leaves the other kinds' fields untouched", () => {
        const draft: QrDraft = { ...DEFAULT_DRAFT, url: "example.com", text: "kept" };

        expect(buildDraftText("url", draft)).toBe("https://example.com");
        expect(buildDraftText("text", draft)).toBe("kept");
    });
});
