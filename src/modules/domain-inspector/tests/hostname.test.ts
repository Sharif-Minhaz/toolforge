import { describe, expect, test } from "bun:test";

import { MAX_INPUT_LENGTH } from "@/modules/domain-inspector/domain/constants";
import {
    readHostInput,
    type HostInputFailureReason,
} from "@/modules/domain-inspector/domain/hostname";

function breakdownOf(input: string) {
    const result = readHostInput(input);

    if (!result.ok) {
        throw new Error(`expected ${input} to be readable, got ${result.reason}`);
    }

    return result.breakdown;
}

describe("readHostInput", () => {
    const EQUIVALENT = [
        "example.com",
        "  example.com  ",
        "EXAMPLE.COM",
        "example.com.",
        "https://example.com",
        "https://example.com/some/path?a=1#b",
        "http://user:pass@example.com:8443/x",
        "example.com:8080",
    ] as const;

    for (const input of EQUIVALENT) {
        test(`reduces ${JSON.stringify(input)} to the bare hostname`, () => {
            expect(breakdownOf(input).hostname).toBe("example.com");
        });
    }

    test("splits a deep subdomain from its registrable domain", () => {
        const breakdown = breakdownOf("a.b.blog.example.co.uk");

        expect(breakdown).toMatchObject({
            subdomain: "a.b.blog",
            registrableDomain: "example.co.uk",
            publicSuffix: "co.uk",
            isIcannSuffix: true,
            isIp: false,
        });
        expect(breakdown.labels).toEqual(["a", "b", "blog", "example", "co", "uk"]);
    });

    test("reports no subdomain rather than an empty one", () => {
        expect(breakdownOf("example.com").subdomain).toBeNull();
    });

    test("converts an internationalised name and keeps both forms", () => {
        const breakdown = breakdownOf("münchen.de");

        expect(breakdown).toMatchObject({
            hostname: "xn--mnchen-3ya.de",
            unicode: "münchen.de",
            punycoded: true,
        });
    });

    test("marks an ASCII name as not punycoded", () => {
        expect(breakdownOf("example.com").punycoded).toBe(false);
    });

    test("accepts a bare IPv4 address", () => {
        expect(breakdownOf("8.8.8.8")).toMatchObject({
            hostname: "8.8.8.8",
            isIp: true,
            registrableDomain: null,
            publicSuffix: null,
        });
    });

    test("accepts a bare IPv6 literal, which no URL parser would take unbracketed", () => {
        expect(breakdownOf("2606:4700::1111").isIp).toBe(true);
    });

    test("accepts a bracketed IPv6 literal too", () => {
        expect(breakdownOf("https://[2606:4700::1111]/").isIp).toBe(true);
    });

    const REJECTED: readonly (readonly [string, HostInputFailureReason])[] = [
        ["", "empty_input"],
        ["   ", "empty_input"],
        ["a".repeat(MAX_INPUT_LENGTH + 1), "too_long"],
        ["exa mple.com", "invalid_hostname"],
        ["ex_ample.com", "invalid_hostname"],
        ["-example.com", "invalid_hostname"],
        ["example-.com", "invalid_hostname"],
        ["example..com", "invalid_hostname"],
        [`${"a".repeat(64)}.com`, "invalid_hostname"],
        // Single-label and unlisted suffixes have no registry to ask, and
        // resolving them would mean resolving against this server's own network.
        ["localhost", "unknown_suffix"],
        ["printer.local", "unknown_suffix"],
        ["example.invalid", "unknown_suffix"],
        ["box.internal", "unknown_suffix"],
    ];

    for (const [input, reason] of REJECTED) {
        test(`refuses ${JSON.stringify(input.slice(0, 30))} as ${reason}`, () => {
            expect(readHostInput(input)).toEqual({ ok: false, reason });
        });
    }

    test("refuses a hostname past the DNS length limit", () => {
        const labels = Array.from({ length: 30 }, () => "abcdefgh");

        expect(readHostInput(`${labels.join(".")}.com`)).toEqual({
            ok: false,
            reason: "too_long",
        });
    });
});
