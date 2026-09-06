import { extractHostname, isWellFormedHostname } from "@/modules/tools/domain/host-syntax";
import { isIpAddress } from "@/modules/tools/domain/ip";
import { MAX_HOPS, MAX_HOSTS, MAX_INPUT_LENGTH } from "./constants";
import type { ParsedHop, ParseResult, RouteMode } from "../types";

/**
 * Reading a route out of whatever the reader pasted.
 *
 * Pure, and deliberately so: this is the half of the tool that can be wrong in
 * interesting ways, and none of it needs a network to prove. The lookups that
 * follow are mechanical by comparison.
 *
 * **One parser, three dialects.** `traceroute`, Windows `tracert` and
 * `mtr --report` print different things, but they agree on the shape that
 * matters: a leading hop number, then a name or an address, then timings. So
 * this reads line by line rather than detecting a format up front — a detector
 * has to be right about the whole document before it reads any of it, and gets
 * the mixed pastes people actually produce wrong.
 *
 * What the dialects genuinely disagree about is timing, and that is the one
 * place a shape test is unavoidable: mtr prints bare numbers in fixed columns
 * while both traceroutes suffix `ms`.
 */

/** `1.2.3.4`, anywhere in a line. Bounded so an mtr column cannot masquerade. */
const IPV4_IN_LINE = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;

/**
 * An IPv6 literal, which needs a looser net than the v4 pattern: `isIpAddress`
 * makes the final decision, so this only has to be specific enough not to catch
 * a MAC address or a timestamp.
 */
const IPV6_IN_LINE = /\b([0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7})\b/i;

/** `4  be-1.cr1.example.net (203.0.113.5)  12.3 ms` — GNU, BSD and Windows. */
const HOP_NUMBER = /^\s*(\d{1,3})\s*(?:\.\|--|[.)])?\s+/;

/** `12.3 ms`, `1 ms`, and Windows' `<1 ms` for anything under a millisecond. */
const RTT_WITH_UNIT = /(<?\s*\d+(?:\.\d+)?)\s*ms\b/i;

/** mtr's loss column, which is what marks a line as mtr rather than traceroute. */
const MTR_LOSS_COLUMN = /^\d+(?:\.\d+)?%$/;

/** Every way the three tools say "nothing came back". */
const TIMEOUT_MARKERS = ["* * *", "???", "request timed out", "solicitud agotada"];

/**
 * Lines that are preamble rather than hops. Checked before the hop number, so
 * `over a maximum of 30 hops:` cannot be read as hop 30.
 */
const PREAMBLE = /^\s*(traceroute|tracing route|over a maximum|start:|host:|host\s+loss)/i;

function readHopNumber(line: string): number | null {
    const matched = HOP_NUMBER.exec(line);

    if (matched === null) {
        return null;
    }

    const value = Number.parseInt(matched[1], 10);

    return Number.isInteger(value) && value > 0 ? value : null;
}

/** The first address in a line, whichever family it is written in. */
function readAddress(line: string): string | null {
    const v4 = IPV4_IN_LINE.exec(line);

    if (v4 !== null && isIpAddress(v4[1])) {
        return v4[1];
    }

    const v6 = IPV6_IN_LINE.exec(line);

    return v6 !== null && isIpAddress(v6[1]) ? v6[1] : null;
}

/**
 * The name a router published, when the line carries one beside its address.
 *
 * The dialects put it in three different places — GNU and BSD lead with
 * `name (addr)`, Windows trails with `... 12 ms  name [addr]`, mtr prints the
 * name alone in a column — so this subtracts what it can recognise rather than
 * indexing into a position none of them agree on. What is left over is the
 * name, if there is one.
 *
 * The last test is that a candidate contains a letter. That is what separates
 * `be-1.cr1.example.net` from Windows' leading `12` and mtr's `Snt` count, both
 * of which are well-formed hostnames as far as RFC 1035 is concerned.
 */
function readHostname(body: string, ip: string | null): string | null {
    const remainder = body
        // The address is already held in `ip`, in whichever bracket style.
        .replace(/[([][^)\]]*[)\]]/g, " ")
        // Windows and both traceroutes: every probe's timing.
        .replace(/<?\s*\d+(?:\.\d+)?\s*ms\b/gi, " ")
        // mtr's fixed columns, and the asterisks that stand in for a lost probe.
        .replace(/\b\d+(?:\.\d+)?%/g, " ")
        .replace(/[*?]+/g, " ");

    const candidate = remainder
        .split(/\s+/)
        .find(
            (token) =>
                token.length > 0 &&
                /[a-z]/i.test(token) &&
                token !== ip &&
                !isIpAddress(token) &&
                isWellFormedHostname(token.replace(/\.$/, "")),
        );

    return candidate === undefined ? null : candidate.replace(/\.$/, "").toLowerCase();
}

/**
 * The round-trip time, in whichever way this line reports one.
 *
 * mtr's columns are `Loss% Snt Last Avg Best Wrst StDev`, so `Last` — the third
 * — is the one comparable to a traceroute probe. Windows' `<1 ms` is reported
 * as 1, not 0.5: the tool is saying it could not measure below a millisecond,
 * and inventing a fraction would be a precision it did not claim.
 */
function readRtt(body: string): number | null {
    const tokens = body.split(/\s+/).filter((token) => token.length > 0);
    const lossIndex = tokens.findIndex((token) => MTR_LOSS_COLUMN.test(token));

    if (lossIndex !== -1) {
        const last = Number.parseFloat(tokens[lossIndex + 2] ?? "");

        return Number.isFinite(last) ? last : null;
    }

    const matched = RTT_WITH_UNIT.exec(body);

    if (matched === null) {
        return null;
    }

    const value = Number.parseFloat(matched[1].replace(/^<\s*/, ""));

    return Number.isFinite(value) ? value : null;
}

function isTimeout(line: string): boolean {
    const lowered = line.toLowerCase();

    return TIMEOUT_MARKERS.some((marker) => lowered.includes(marker));
}

/**
 * A pasted `traceroute`, `tracert` or `mtr --report`, read into hops.
 *
 * A line with a hop number but nothing else usable is kept as a timed-out hop
 * rather than dropped, because the gap in a route is part of the route: hop 7
 * following hop 5 with nothing between them would misreport the path length.
 */
export function parseTrace(text: string): ParseResult {
    const overLength = checkLength(text);

    if (overLength !== null) {
        return overLength;
    }

    const hops: ParsedHop[] = [];

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trimEnd();

        if (line.trim().length === 0 || PREAMBLE.test(line)) {
            continue;
        }

        const index = readHopNumber(line);

        if (index === null) {
            continue;
        }

        const body = line.replace(HOP_NUMBER, "");
        const timedOut = isTimeout(line);
        const ip = timedOut ? null : readAddress(body);
        const hostname = timedOut ? null : readHostname(body, ip);

        hops.push({
            index,
            label: hostname ?? ip ?? "",
            ip,
            hostname,
            rttMs: timedOut ? null : readRtt(body),
            timedOut,
        });

        if (hops.length > MAX_HOPS) {
            return { ok: false, reason: "too_many_hops", count: hops.length };
        }
    }

    if (hops.length === 0) {
        return { ok: false, reason: "no_hops_found" };
    }

    // A hop with no address, no name and no timeout marker is one this parser
    // failed to read rather than one that failed to answer. A few of those
    // among readable hops are kept, because the gap is part of the route — but
    // if that is *every* hop, the dialect is one nothing here understands, and
    // saying so is more use than handing back a route of blanks.
    const unread = hops.every((hop) => hop.ip === null && hop.hostname === null && !hop.timedOut);

    return unread ? { ok: false, reason: "unsupported_trace_format" } : { ok: true, hops };
}

/**
 * One host per line — a name, an address, or a URL to take the host out of.
 *
 * Blank lines and `#` comments are dropped so a list can be annotated, and
 * duplicates are collapsed: the same host twice is one dot and one set of
 * lookups, not two.
 */
export function parseHostList(text: string): ParseResult {
    const overLength = checkLength(text);

    if (overLength !== null) {
        return overLength;
    }

    const hops: ParsedHop[] = [];
    const seen = new Set<string>();

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();

        if (line.length === 0 || line.startsWith("#")) {
            continue;
        }

        const host = extractHostname(line);

        if (host === null || seen.has(host)) {
            continue;
        }

        seen.add(host);

        const ip = isIpAddress(host) ? host : null;

        hops.push({
            index: hops.length + 1,
            label: host,
            ip,
            hostname: ip === null ? host : null,
            rttMs: null,
            timedOut: false,
        });

        if (hops.length > MAX_HOSTS) {
            return { ok: false, reason: "too_many_hops", count: hops.length };
        }
    }

    return hops.length === 0 ? { ok: false, reason: "no_hops_found" } : { ok: true, hops };
}

export function parseRouteInput(text: string, mode: RouteMode): ParseResult {
    return mode === "traceroute" ? parseTrace(text) : parseHostList(text);
}

/**
 * Whether anything in this route still needs a name resolved.
 *
 * The single predicate behind the resolver control: a trace that printed
 * addresses for every hop needs no resolver at all, so offering one would be a
 * setting that changes nothing.
 */
export function needsResolution(hops: readonly ParsedHop[]): boolean {
    return hops.some((hop) => hop.ip === null && hop.hostname !== null);
}

function checkLength(text: string): ParseResult | null {
    if (text.trim().length === 0) {
        return { ok: false, reason: "empty_input" };
    }

    return text.length > MAX_INPUT_LENGTH ? { ok: false, reason: "input_too_long" } : null;
}
