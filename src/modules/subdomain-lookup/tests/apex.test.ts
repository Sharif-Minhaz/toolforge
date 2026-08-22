import { describe, expect, test } from "bun:test";

import { readApexInput } from "@/modules/subdomain-lookup/domain/apex";
import { MAX_INPUT_LENGTH } from "@/modules/subdomain-lookup/domain/constants";

describe("readApexInput", () => {
    test("an apex is taken as typed, with nothing to report", () => {
        expect(readApexInput("example.com")).toEqual({
            ok: true,
            apex: "example.com",
            narrowedFrom: null,
        });
    });

    test("a multi-part suffix is read from the list, not by counting dots", () => {
        // `example.co.uk` is the registrable domain; a naive "last two labels"
        // would ask the index about `co.uk`, which is a public suffix and not a
        // domain anybody owns.
        expect(readApexInput("example.co.uk")).toEqual({
            ok: true,
            apex: "example.co.uk",
            narrowedFrom: null,
        });
    });

    test("a name below the apex is widened, and says what was typed", () => {
        expect(readApexInput("api.staging.example.co.uk")).toEqual({
            ok: true,
            apex: "example.co.uk",
            narrowedFrom: "api.staging.example.co.uk",
        });
    });

    test("a full URL is reduced to the apex it names", () => {
        expect(readApexInput("https://www.example.com/a/b?c=d#e")).toEqual({
            ok: true,
            apex: "example.com",
            narrowedFrom: "www.example.com",
        });
    });

    test("case and a trailing root dot do not make a different apex", () => {
        expect(readApexInput("  EXAMPLE.CoM.  ")).toEqual({
            ok: true,
            apex: "example.com",
            narrowedFrom: null,
        });
    });

    test("an IP address is refused by its own name", () => {
        // Not `unknown_suffix`: "that is an address, not a domain" is the useful
        // sentence, and an address has no registrable domain to enumerate.
        expect(readApexInput("93.184.216.34")).toEqual({ ok: false, reason: "ip_address" });
        expect(readApexInput("[2606:2800:220:1:248:1893:25c8:1946]")).toEqual({
            ok: false,
            reason: "ip_address",
        });
    });

    test("a suffix no registry owns is refused rather than looked up", () => {
        for (const input of ["localhost", "printer.local", "db.internal"]) {
            expect(readApexInput(input)).toEqual({ ok: false, reason: "unknown_suffix" });
        }
    });

    test("empty and over-long inputs keep their own reasons", () => {
        expect(readApexInput("   ")).toEqual({ ok: false, reason: "empty_input" });
        expect(readApexInput(`${"a".repeat(MAX_INPUT_LENGTH + 1)}.com`)).toEqual({
            ok: false,
            reason: "too_long",
        });
    });

    test("a malformed host is refused before any lookup", () => {
        expect(readApexInput("exa mple.com")).toEqual({ ok: false, reason: "invalid_hostname" });
        expect(readApexInput("-example.com")).toEqual({ ok: false, reason: "invalid_hostname" });
    });
});
