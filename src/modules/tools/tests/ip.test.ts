import { describe, expect, test } from "bun:test";

import {
    classifyAddress,
    detectIpVersion,
    expandIpv6,
    parseIpv4,
    type AddressClass,
} from "@/modules/tools/domain/ip";

describe("parseIpv4", () => {
    test("reads four octets", () => {
        expect(parseIpv4("8.8.4.4")).toEqual([8, 8, 4, 4]);
    });

    const INVALID = [
        "1.2.3",
        "1.2.3.4.5",
        "256.0.0.1",
        "1.2.3.-1",
        // A leading zero is octal to some resolvers and decimal to others; an
        // address nobody agrees on is exactly what a filter must not normalise.
        "010.0.0.1",
        "1.2.3.04",
        "",
        "example.com",
    ] as const;

    for (const input of INVALID) {
        test(`rejects ${input || "an empty string"}`, () => {
            expect(parseIpv4(input)).toBeNull();
        });
    }
});

describe("expandIpv6", () => {
    test("expands the all-zero address", () => {
        expect(expandIpv6("::")).toEqual(Array.from({ length: 8 }, () => "0000"));
    });

    test("expands a leading elision", () => {
        expect(expandIpv6("::1")?.at(-1)).toBe("0001");
    });

    test("expands a trailing elision", () => {
        expect(expandIpv6("2001:db8::")).toEqual([
            "2001",
            "0db8",
            "0000",
            "0000",
            "0000",
            "0000",
            "0000",
            "0000",
        ]);
    });

    test("rewrites an embedded dotted quad", () => {
        expect(expandIpv6("::ffff:192.168.1.1")?.slice(5)).toEqual(["ffff", "c0a8", "0101"]);
    });

    test("accepts a full eight-group address", () => {
        expect(expandIpv6("2606:4700:4700:0000:0000:0000:0000:1111")).toHaveLength(8);
    });

    const INVALID = ["1:2:3:4:5:6:7", "1::2::3", ":::", "2001:db8:::1", "gggg::1", "1.2.3.4"];

    for (const input of INVALID) {
        test(`rejects ${input}`, () => {
            expect(expandIpv6(input)).toBeNull();
        });
    }

    test("rejects an elision that stands for nothing", () => {
        expect(expandIpv6("1:2:3:4::5:6:7:8")).toBeNull();
    });
});

describe("detectIpVersion", () => {
    test("tells the two families apart", () => {
        expect(detectIpVersion("1.1.1.1")).toBe(4);
        expect(detectIpVersion("2606:4700::1111")).toBe(6);
        expect(detectIpVersion("example.com")).toBeNull();
    });
});

describe("classifyAddress", () => {
    const CASES: readonly (readonly [string, AddressClass])[] = [
        ["8.8.8.8", "public"],
        ["1.1.1.1", "public"],
        ["93.184.216.34", "public"],
        // 172.16/12 ends at 172.31, and 100.64/10 ends at 100.127 — both
        // boundaries are one octet away from a perfectly ordinary address.
        ["172.32.0.1", "public"],
        ["100.128.0.1", "public"],
        ["192.0.1.1", "public"],
        ["0.0.0.0", "restricted"],
        ["10.1.2.3", "restricted"],
        ["127.0.0.1", "restricted"],
        ["100.64.1.1", "restricted"],
        ["169.254.169.254", "restricted"],
        ["172.16.0.1", "restricted"],
        ["172.31.255.255", "restricted"],
        ["192.0.0.1", "restricted"],
        ["192.0.2.5", "restricted"],
        ["192.168.1.1", "restricted"],
        ["198.18.0.1", "restricted"],
        ["198.51.100.7", "restricted"],
        ["203.0.113.9", "restricted"],
        ["224.0.0.1", "restricted"],
        ["255.255.255.255", "restricted"],
        ["2606:4700:4700::1111", "public"],
        ["2a00:1450:4001:800::200e", "public"],
        ["::", "restricted"],
        ["::1", "restricted"],
        ["fc00::1", "restricted"],
        ["fd00::1", "restricted"],
        ["fe80::1", "restricted"],
        ["ff02::1", "restricted"],
        ["2001:db8::1", "restricted"],
        ["2001::1", "restricted"],
        ["0100::1", "restricted"],
        // The three tunnelling notations all carry a v4 address that is where
        // the connection actually lands.
        ["::ffff:127.0.0.1", "restricted"],
        ["::ffff:8.8.8.8", "public"],
        ["64:ff9b::7f00:1", "restricted"],
        ["2002:c0a8:0101::", "restricted"],
        ["2002:0808:0808::", "public"],
        ["not-an-address", "invalid"],
        ["", "invalid"],
    ];

    for (const [input, expected] of CASES) {
        test(`${input || "an empty string"} is ${expected}`, () => {
            expect(classifyAddress(input)).toBe(expected);
        });
    }
});
