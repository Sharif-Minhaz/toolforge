import { MAX_PORTS_PER_SCAN } from "./constants";
import { presetPorts } from "./ports";
import type { PortPreset, PortSpecResult } from "../types";

/**
 * Reads what somebody typed into the port field: `80, 443, 8000-8100`.
 *
 * Separators are deliberately loose — commas, spaces and newlines all work,
 * because the three sources people paste from (a note, a firewall rule, a
 * spreadsheet column) each use a different one. What is *not* loose is the
 * range: `8100-8000` is a mistake, not an instruction to count backwards, and
 * silently reversing it would scan a range nobody asked for.
 */

const PORT_PATTERN = /^\d{1,5}$/;
const RANGE_PATTERN = /^(\d{1,5})-(\d{1,5})$/;

const MIN_PORT = 1;
const MAX_PORT = 65_535;

function isPort(value: number): boolean {
    return Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT;
}

export function parsePortSpec(input: string): PortSpecResult {
    const tokens = input
        .split(/[\s,;]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

    if (tokens.length === 0) {
        return { ok: false, reason: "no_ports" };
    }

    const ports = new Set<number>();

    for (const token of tokens) {
        if (PORT_PATTERN.test(token)) {
            const port = Number(token);

            if (!isPort(port)) {
                return { ok: false, reason: "invalid_ports", token };
            }

            ports.add(port);
            continue;
        }

        const range = RANGE_PATTERN.exec(token);

        if (range === null) {
            return { ok: false, reason: "invalid_ports", token };
        }

        const from = Number(range[1]);
        const to = Number(range[2]);

        if (!isPort(from) || !isPort(to) || from > to) {
            return { ok: false, reason: "invalid_ports", token };
        }

        // Counted before it is expanded: `1-65535` would otherwise build a
        // 65,000-entry set on its way to being refused for being too large.
        if (to - from + 1 > MAX_PORTS_PER_SCAN) {
            return { ok: false, reason: "too_many_ports", count: to - from + 1 };
        }

        for (let port = from; port <= to; port += 1) {
            ports.add(port);
        }

        if (ports.size > MAX_PORTS_PER_SCAN) {
            return { ok: false, reason: "too_many_ports", count: ports.size };
        }
    }

    if (ports.size > MAX_PORTS_PER_SCAN) {
        return { ok: false, reason: "too_many_ports", count: ports.size };
    }

    // Ascending, because that is the order every other tool prints them in and
    // the order a reader scans the table for the one they care about.
    return { ok: true, ports: [...ports].sort((a, b) => a - b) };
}

/**
 * The ports a request actually asks for. A preset ignores the text field
 * entirely rather than merging with it — a reader who picked "Web" and left an
 * old custom list behind means the preset.
 */
export function resolveRequestedPorts(preset: PortPreset, spec: string): PortSpecResult {
    if (preset !== "custom") {
        return { ok: true, ports: presetPorts(preset) };
    }

    return parsePortSpec(spec);
}
