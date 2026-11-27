import { describe, expect, test } from "bun:test";

import {
    dohStatusFailure,
    parseCymruAsName,
    parseCymruOrigin,
    readReverseAnswer,
    stripRootDot,
    unquoteTxt,
} from "@/modules/tools/domain/dns";

describe("dohStatusFailure", () => {
    test("NOERROR is an answer", () => {
        expect(dohStatusFailure(0)).toBeNull();
    });

    test("NXDOMAIN keeps its own name", () => {
        expect(dohStatusFailure(3)).toBe("nxdomain");
    });

    test("SERVFAIL and REFUSED are server failures, not empty zones", () => {
        expect(dohStatusFailure(2)).toBe("server_failure");
        expect(dohStatusFailure(5)).toBe("server_failure");
    });
});

describe("readReverseAnswer", () => {
    const ptr = {
        name: "219.199.86.103.in-addr.arpa.",
        type: 12,
        TTL: 604800,
        data: "host219.maishabd.net.",
    };

    test("reads the PTR name without its root dot", () => {
        expect(readReverseAnswer({ ok: true, answers: [ptr] })).toEqual({
            kind: "found",
            name: "host219.maishabd.net",
        });
    });

    test("skips the CNAME a classless delegation answers with first", () => {
        const cname = { ...ptr, type: 5, data: "219.192-26.199.86.103.in-addr.arpa." };

        expect(readReverseAnswer({ ok: true, answers: [cname, ptr] })).toEqual({
            kind: "found",
            name: "host219.maishabd.net",
        });
    });

    test("an empty answer and NXDOMAIN are absent", () => {
        expect(readReverseAnswer({ ok: true, answers: [] })).toEqual({ kind: "absent" });
        expect(readReverseAnswer({ ok: false, reason: "nxdomain" })).toEqual({ kind: "absent" });
    });

    test("a timeout or a server failure is failed, never absent", () => {
        for (const reason of [
            "timeout",
            "network_error",
            "unreadable_response",
            "server_failure",
        ]) {
            expect(readReverseAnswer({ ok: false, reason })).toEqual({ kind: "failed" });
        }
    });
});

describe("unquoteTxt", () => {
    test("strips the quotes a JSON API adds", () => {
        expect(unquoteTxt('"v=spf1 -all"')).toBe("v=spf1 -all");
    });

    test("joins the character strings a long record is split into", () => {
        // A TXT record over 255 octets is published as several strings, and
        // their wire meaning is the concatenation with nothing between them.
        expect(unquoteTxt('"v=DKIM1; k=rsa; p=AAAA" "BBBB"')).toBe("v=DKIM1; k=rsa; p=AAAABBBB");
    });

    test("unescapes an escaped quote", () => {
        expect(unquoteTxt('"a\\"b"')).toBe('a"b');
    });

    test("returns an unquoted value unchanged", () => {
        expect(unquoteTxt("v=spf1 -all")).toBe("v=spf1 -all");
    });
});

describe("stripRootDot", () => {
    test("removes only a trailing dot", () => {
        expect(stripRootDot("example.com.")).toBe("example.com");
        expect(stripRootDot("example.com")).toBe("example.com");
    });
});

describe("Cymru TXT parsing", () => {
    test("reads an origin answer", () => {
        expect(parseCymruOrigin("15169 | 8.8.8.0/24 | US | arin | 1992-12-01")).toEqual({
            asn: 15169,
            prefix: "8.8.8.0/24",
            country: "US",
            registry: "arin",
        });
    });

    test("takes the first AS of a multi-origin prefix", () => {
        expect(parseCymruOrigin("64512 64513 | 10.0.0.0/8 | ZZ | ripencc | 2020-01-01")?.asn).toBe(
            64512,
        );
    });

    test("returns null for a truncated answer", () => {
        expect(parseCymruOrigin("15169 | 8.8.8.0/24")).toBeNull();
    });

    test("reads the operator name out of an AS answer", () => {
        expect(parseCymruAsName("15169 | US | arin | 2000-03-30 | GOOGLE, US")).toBe("GOOGLE, US");
    });

    test("returns null when the AS answer carries no name", () => {
        expect(parseCymruAsName("15169 | US | arin | 2000-03-30")).toBeNull();
    });
});
