import { describe, expect, test } from "bun:test";

import { MAX_HOPS, MAX_HOSTS, MAX_INPUT_LENGTH } from "@/modules/ip-globe/domain/constants";
import {
    needsResolution,
    parseHostList,
    parseRouteInput,
    parseTrace,
} from "@/modules/ip-globe/domain/parse";

/**
 * The three dialects, as each tool actually prints them. Kept verbatim — a
 * tidied sample proves the parser handles tidy input, which is not the input
 * anyone pastes.
 */

const GNU_TRACEROUTE = `traceroute to google.com (142.250.190.78), 30 hops max, 60 byte packets
 1  _gateway (192.168.1.1)  0.455 ms  0.417 ms  0.398 ms
 2  10.0.0.1 (10.0.0.1)  8.123 ms  8.456 ms  8.789 ms
 3  * * *
 4  be-1.cr1.example.net (203.0.113.5)  12.301 ms  11.988 ms  12.104 ms
 5  142.250.190.78 (142.250.190.78)  14.201 ms`;

const WINDOWS_TRACERT = `Tracing route to google.com [142.250.190.78]
over a maximum of 30 hops:

  1    <1 ms    <1 ms    <1 ms  192.168.1.1
  2     8 ms     9 ms     8 ms  10.0.0.1
  3     *        *        *     Request timed out.
  4    12 ms    11 ms    12 ms  be-1.cr1.example.net [203.0.113.5]

Trace complete.`;

const MTR_REPORT = `Start: 2026-09-06T10:00:00+0000
HOST: workstation                 Loss%   Snt   Last   Avg  Best  Wrst StDev
  1.|-- 192.168.1.1                0.0%    10    0.4   0.5   0.4   0.7   0.1
  2.|-- 10.0.0.1                   0.0%    10    8.1   8.3   8.0   9.0   0.3
  3.|-- ???                       100.0%    10    0.0   0.0   0.0   0.0   0.0
  4.|-- be-1.cr1.example.net       0.0%    10   12.3  12.1  11.9  12.5   0.2`;

describe("parseTrace, across the three dialects", () => {
    test("reads a GNU traceroute, keeping the gap where a hop went unanswered", () => {
        const result = parseTrace(GNU_TRACEROUTE);

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.hops).toHaveLength(5);
        expect(result.hops.map((hop) => hop.index)).toEqual([1, 2, 3, 4, 5]);
        expect(result.hops[2]).toMatchObject({ timedOut: true, ip: null, rttMs: null });
        expect(result.hops[3]).toMatchObject({
            ip: "203.0.113.5",
            hostname: "be-1.cr1.example.net",
            rttMs: 12.301,
        });
    });

    test("does not read the preamble's own address as a hop", () => {
        const result = parseTrace(GNU_TRACEROUTE);

        expect(result.ok).toBe(true);
        expect(result.ok && result.hops[0].ip).toBe("192.168.1.1");
    });

    test("reads a Windows tracert, whose timings come before the name", () => {
        const result = parseTrace(WINDOWS_TRACERT);

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.hops).toHaveLength(4);
        // The regression this guards: the leading `12` is a syntactically valid
        // hostname, and reading it as one would name every Windows hop after a
        // number.
        expect(result.hops[3]).toMatchObject({
            ip: "203.0.113.5",
            hostname: "be-1.cr1.example.net",
            rttMs: 12,
        });
        expect(result.hops[2].timedOut).toBe(true);
    });

    test("reads `<1 ms` as one millisecond, not as half of one", () => {
        const result = parseTrace(WINDOWS_TRACERT);

        // Windows is saying it could not measure below a millisecond. Inventing
        // a fraction would claim a precision it did not report.
        expect(result.ok && result.hops[0].rttMs).toBe(1);
    });

    test("reads an mtr report, taking `Last` rather than `Avg` or `Snt`", () => {
        const result = parseTrace(MTR_REPORT);

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.hops).toHaveLength(4);
        expect(result.hops[0]).toMatchObject({ ip: "192.168.1.1", rttMs: 0.4 });
        expect(result.hops[3]).toMatchObject({
            hostname: "be-1.cr1.example.net",
            rttMs: 12.3,
        });
        expect(result.hops[2].timedOut).toBe(true);
    });

    test("does not mistake an mtr column for an address or a name", () => {
        const result = parseTrace(MTR_REPORT);

        expect(result.ok && result.hops[1].hostname).toBeNull();
        expect(result.ok && result.hops[1].ip).toBe("10.0.0.1");
    });

    test("keeps an underscored name out of the hostname, since no resolver takes it", () => {
        const result = parseTrace(GNU_TRACEROUTE);

        expect(result.ok && result.hops[0].hostname).toBeNull();
        expect(result.ok && result.hops[0].label).toBe("192.168.1.1");
    });

    test("reads an IPv6 hop", () => {
        const result = parseTrace(" 1  2001:4860:4860::8888 (2001:4860:4860::8888)  9.1 ms");

        expect(result.ok && result.hops[0].ip).toBe("2001:4860:4860::8888");
    });

    test("numbered lines it cannot read keep their own reason", () => {
        // Nothing numbered at all is not a trace; numbered lines that yield no
        // address, no name and no timeout are a dialect this does not speak.
        expect(parseTrace("nothing numbered here at all")).toEqual({
            ok: false,
            reason: "no_hops_found",
        });
        expect(parseTrace(" 1  ??\n 2  ??")).toEqual({
            ok: false,
            reason: "unsupported_trace_format",
        });
    });

    test("keeps an unreadable hop as a gap when the rest of the route reads", () => {
        const result = parseTrace(
            " 1  10.0.0.1 (10.0.0.1)  1 ms\n 2  ??\n 3  1.1.1.1 (1.1.1.1)  9 ms",
        );

        expect(result.ok).toBe(true);
        expect(result.ok && result.hops).toHaveLength(3);
        expect(result.ok && result.hops[1]).toMatchObject({ ip: null, hostname: null });
    });

    test("empty and over-long inputs keep their own reasons", () => {
        expect(parseTrace("   \n  ")).toEqual({ ok: false, reason: "empty_input" });
        expect(parseTrace("x".repeat(MAX_INPUT_LENGTH + 1))).toEqual({
            ok: false,
            reason: "input_too_long",
        });
    });

    test("refuses a trace past the hop ceiling rather than truncating it", () => {
        const long = Array.from(
            { length: MAX_HOPS + 5 },
            (_, i) => ` ${i + 1}  10.0.0.1 (10.0.0.1)  1 ms`,
        ).join("\n");

        expect(parseTrace(long)).toMatchObject({ ok: false, reason: "too_many_hops" });
    });
});

describe("parseHostList", () => {
    test("takes one host per line, dropping blanks and comments", () => {
        const result = parseHostList("# targets\nexample.com\n\n1.1.1.1\n");

        expect(result.ok).toBe(true);
        expect(result.ok && result.hops.map((hop) => hop.label)).toEqual([
            "example.com",
            "1.1.1.1",
        ]);
    });

    test("reduces a pasted URL to the host it names", () => {
        const result = parseHostList("https://example.com/some/path?q=1");

        expect(result.ok && result.hops[0].label).toBe("example.com");
    });

    test("collapses a repeated host, so one name is one set of lookups", () => {
        const result = parseHostList("example.com\nhttps://example.com/\nEXAMPLE.COM");

        expect(result.ok && result.hops).toHaveLength(1);
    });

    test("tells an address apart from a name, so only one of them is resolved", () => {
        const result = parseHostList("1.1.1.1\nexample.com");

        expect(result.ok && result.hops[0]).toMatchObject({ ip: "1.1.1.1", hostname: null });
        expect(result.ok && result.hops[1]).toMatchObject({ ip: null, hostname: "example.com" });
    });

    test("refuses a list past the ceiling rather than truncating it", () => {
        const long = Array.from({ length: MAX_HOSTS + 2 }, (_, i) => `host${i}.example.com`).join(
            "\n",
        );

        expect(parseHostList(long)).toMatchObject({ ok: false, reason: "too_many_hops" });
    });

    test("a list of nothing parseable is empty, not a malformed trace", () => {
        expect(parseHostList("# only a comment")).toEqual({ ok: false, reason: "no_hops_found" });
    });
});

describe("needsResolution", () => {
    test("is false for a trace that printed an address for every hop", () => {
        const result = parseTrace(GNU_TRACEROUTE);

        expect(result.ok && needsResolution(result.hops)).toBe(false);
    });

    test("is true when a hop is a name with no address beside it", () => {
        const result = parseTrace(MTR_REPORT);

        // mtr resolves names but does not print the address it resolved them
        // from, so its named hops still have to be looked up.
        expect(result.ok && needsResolution(result.hops)).toBe(true);
    });

    test("is false for a host list of literal addresses", () => {
        const result = parseHostList("1.1.1.1\n8.8.8.8");

        expect(result.ok && needsResolution(result.hops)).toBe(false);
    });
});

describe("parseRouteInput", () => {
    test("dispatches on the mode rather than sniffing the text", () => {
        expect(parseRouteInput("example.com", "hosts")).toMatchObject({ ok: true });
        expect(parseRouteInput("example.com", "traceroute")).toEqual({
            ok: false,
            reason: "no_hops_found",
        });
    });
});
