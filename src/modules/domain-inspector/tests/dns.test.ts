import { describe, expect, test } from "bun:test";

import { DNS_TYPE_CODES } from "@/modules/domain-inspector/domain/constants";
import {
    buildMailPosture,
    findDmarc,
    findSpf,
    hasMtaSts,
    parseCymruAsName,
    parseCymruOrigin,
    stripRootDot,
    toDnsRecords,
    unquoteTxt,
    type DohAnswer,
} from "@/modules/domain-inspector/domain/dns";

function answer(type: number, data: string, name = "example.com."): DohAnswer {
    return { name, type, TTL: 300, data };
}

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

describe("toDnsRecords", () => {
    test("drops answers of another type", () => {
        // A query for A on a name behind a CNAME returns the CNAME as well.
        const answers = [
            answer(DNS_TYPE_CODES.CNAME, "target.example.net."),
            answer(DNS_TYPE_CODES.A, "93.184.216.34"),
        ];

        expect(toDnsRecords("A", DNS_TYPE_CODES.A, answers)).toEqual([
            { name: "example.com", ttl: 300, value: "93.184.216.34" },
        ]);
    });

    test("splits an MX preference from its exchange", () => {
        const records = toDnsRecords("MX", DNS_TYPE_CODES.MX, [
            answer(DNS_TYPE_CODES.MX, "10 mail.example.com."),
        ]);

        expect(records[0]).toEqual({
            name: "example.com",
            ttl: 300,
            value: "mail.example.com",
            priority: 10,
        });
    });

    test("keeps a malformed MX record rather than dropping it", () => {
        const records = toDnsRecords("MX", DNS_TYPE_CODES.MX, [
            answer(DNS_TYPE_CODES.MX, "mail.example.com."),
        ]);

        expect(records[0].value).toBe("mail.example.com.");
        expect(records[0].priority).toBeUndefined();
    });

    test("strips the root dot from names and from NS targets", () => {
        const records = toDnsRecords("NS", DNS_TYPE_CODES.NS, [
            answer(DNS_TYPE_CODES.NS, "a.iana-servers.net."),
        ]);

        expect(records[0]).toMatchObject({ name: "example.com", value: "a.iana-servers.net" });
    });

    test("leaves SOA and CAA in their presentation form", () => {
        const soa = "ns.example.com. host.example.com. 2026080401 7200 3600 1209600 3600";
        const records = toDnsRecords("SOA", DNS_TYPE_CODES.SOA, [answer(DNS_TYPE_CODES.SOA, soa)]);

        expect(records[0].value).toBe(soa);
    });

    test("floors a fractional TTL and never goes negative", () => {
        const records = toDnsRecords("A", DNS_TYPE_CODES.A, [
            { name: "example.com.", type: DNS_TYPE_CODES.A, TTL: -5, data: "1.1.1.1" },
        ]);

        expect(records[0].ttl).toBe(0);
    });

    test("returns nothing for an empty answer list", () => {
        expect(toDnsRecords("A", DNS_TYPE_CODES.A, [])).toEqual([]);
    });
});

describe("stripRootDot", () => {
    test("removes only a trailing dot", () => {
        expect(stripRootDot("example.com.")).toBe("example.com");
        expect(stripRootDot("example.com")).toBe("example.com");
    });
});

describe("mail posture", () => {
    const txt = (value: string) => ({ name: "example.com", ttl: 300, value });

    test("finds an SPF policy among unrelated TXT records", () => {
        expect(
            findSpf([
                txt("google-site-verification=abc"),
                txt("v=spf1 include:_spf.google.com ~all"),
            ]),
        ).toBe("v=spf1 include:_spf.google.com ~all");
    });

    test("ignores a record that merely mentions SPF", () => {
        expect(findSpf([txt("spf is configured elsewhere")])).toBeNull();
    });

    test("finds a DMARC policy", () => {
        expect(findDmarc([txt("v=DMARC1; p=reject; rua=mailto:a@example.com")])).toStartWith(
            "v=DMARC1",
        );
    });

    test("detects an MTA-STS policy record", () => {
        expect(hasMtaSts([txt("v=STSv1; id=20260804")])).toBe(true);
        expect(hasMtaSts([txt("v=spf1 -all")])).toBe(false);
    });

    test("assembles the three answers into one posture", () => {
        expect(
            buildMailPosture(
                [txt("v=spf1 -all")],
                [txt("v=DMARC1; p=none")],
                [txt("v=STSv1; id=1")],
            ),
        ).toEqual({
            spf: "v=spf1 -all",
            dmarc: "v=DMARC1; p=none",
            mtaSts: true,
        });
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
