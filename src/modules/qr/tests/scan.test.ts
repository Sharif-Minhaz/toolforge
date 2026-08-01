import { describe, expect, test } from "bun:test";

import { getFollowableUrl, parseScannedText } from "@/modules/qr/domain/scan";
import type { QrPayloadKind } from "@/modules/qr/types";

describe("parseScannedText — kinds", () => {
    const cases: readonly { readonly text: string; readonly kind: QrPayloadKind }[] = [
        { text: "https://example.com", kind: "url" },
        { text: "http://example.com", kind: "url" },
        { text: "WIFI:T:WPA;S:Net;;", kind: "wifi" },
        { text: "wifi:T:WPA;S:Net;;", kind: "wifi" },
        { text: "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:A\r\nEND:VCARD", kind: "contact" },
        { text: "MECARD:N:Doe,John;TEL:123;;", kind: "contact" },
        { text: "SMSTO:+1555:hi", kind: "sms" },
        { text: "mailto:a@b.co", kind: "email" },
        { text: "tel:+1555", kind: "phone" },
        { text: "just some words", kind: "text" },
        { text: "ftp://example.com/file", kind: "text" },
    ];

    for (const { text, kind } of cases) {
        test(`${JSON.stringify(text.slice(0, 28))} reads as ${kind}`, () => {
            expect(parseScannedText(text).kind).toBe(kind);
        });
    }
});

describe("parseScannedText — wifi", () => {
    test("splits on unescaped separators only", () => {
        const parsed = parseScannedText(String.raw`WIFI:T:WPA;S:My\;Net;P:a\;b\\c;H:true;;`);

        expect(parsed.fields).toEqual([
            { name: "ssid", value: "My;Net" },
            { name: "password", value: "a;b\\c" },
            { name: "encryption", value: "WPA" },
            { name: "hidden", value: "true" },
        ]);
    });

    test("field order is fixed, whatever order the code used", () => {
        const parsed = parseScannedText("WIFI:P:pw;H:true;S:Net;T:WEP;;");

        expect(parsed.fields.map((entry) => entry.name)).toEqual([
            "ssid",
            "password",
            "encryption",
            "hidden",
        ]);
    });

    test("an unknown key is ignored rather than shown raw", () => {
        const parsed = parseScannedText("WIFI:T:WPA;S:Net;X:junk;;");

        expect(parsed.fields.map((entry) => entry.name)).toEqual(["ssid", "encryption"]);
    });

    test("a malformed payload degrades to whatever it could read", () => {
        expect(parseScannedText("WIFI:").fields).toEqual([]);
        expect(parseScannedText("WIFI:S").fields).toEqual([]);
    });
});

describe("parseScannedText — contact", () => {
    const card = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        String.raw`N:Lovelace\, Ada;;;;`,
        "FN:Ada Lovelace",
        String.raw`ORG:Analytical Engines\, Ltd`,
        "TEL;TYPE=CELL:+44 20 7946 0958",
        "EMAIL;TYPE=INTERNET:ada@example.com",
        "URL:https://example.com/ada",
        String.raw`ADR;TYPE=HOME:;;12 High St\; London;;;;`,
        "END:VCARD",
    ].join("\r\n");

    test("reads the properties regardless of their parameters", () => {
        expect(parseScannedText(card).fields).toEqual([
            { name: "fullName", value: "Ada Lovelace" },
            { name: "organization", value: "Analytical Engines, Ltd" },
            { name: "phone", value: "+44 20 7946 0958" },
            { name: "email", value: "ada@example.com" },
            { name: "url", value: "https://example.com/ada" },
            { name: "address", value: "12 High St; London" },
        ]);
    });

    test("a structured value joins its non-empty components", () => {
        const parsed = parseScannedText("BEGIN:VCARD\nADR:;;12 High St;London;;SW1;UK\nEND:VCARD");

        expect(parsed.fields).toEqual([{ name: "address", value: "12 High St, London, SW1, UK" }]);
    });

    test("bare LF line endings still parse", () => {
        expect(parseScannedText("BEGIN:VCARD\nFN:A B\nEND:VCARD").fields).toEqual([
            { name: "fullName", value: "A B" },
        ]);
    });

    test("the first occurrence of a repeated property wins", () => {
        const parsed = parseScannedText("BEGIN:VCARD\nTEL:111\nTEL;TYPE=WORK:222\nEND:VCARD");

        expect(parsed.fields).toEqual([{ name: "phone", value: "111" }]);
    });
});

describe("parseScannedText — messaging", () => {
    test("SMSTO with and without a body", () => {
        expect(parseScannedText("SMSTO:+1555:on my way").fields).toEqual([
            { name: "phone", value: "+1555" },
            { name: "message", value: "on my way" },
        ]);
        expect(parseScannedText("SMSTO:+1555").fields).toEqual([{ name: "phone", value: "+1555" }]);
    });

    test("the RFC 5724 sms: spelling is understood too", () => {
        expect(parseScannedText("SMS:+1555?body=hello%20there").fields).toEqual([
            { name: "phone", value: "+1555" },
            { name: "message", value: "hello there" },
        ]);
    });

    test("mailto splits address, subject and body", () => {
        expect(parseScannedText("mailto:a@b.co?subject=Hi%20there&body=Line%20one").fields).toEqual(
            [
                { name: "email", value: "a@b.co" },
                { name: "subject", value: "Hi there" },
                { name: "body", value: "Line one" },
            ],
        );
    });

    test("a stray percent does not throw", () => {
        expect(parseScannedText("mailto:100%@example.com").fields).toEqual([
            { name: "email", value: "100%@example.com" },
        ]);
    });
});

describe("getFollowableUrl", () => {
    test("returns an http or https link", () => {
        expect(getFollowableUrl(parseScannedText("https://example.com/a"))).toBe(
            "https://example.com/a",
        );
        expect(getFollowableUrl(parseScannedText("http://example.com/"))).toBe(
            "http://example.com/",
        );
    });

    test("refuses anything that is not a link the reader can safely open", () => {
        expect(getFollowableUrl(parseScannedText("javascript:alert(1)"))).toBeNull();
        expect(getFollowableUrl(parseScannedText("data:text/html,<script>"))).toBeNull();
        expect(getFollowableUrl(parseScannedText("tel:+1555"))).toBeNull();
        expect(getFollowableUrl(parseScannedText("plain text"))).toBeNull();
    });
});
