import { describe, expect, test } from "bun:test";

import { MAX_PORTS_PER_SCAN } from "@/modules/port-scanner/domain/constants";
import { parsePortSpec, resolveRequestedPorts } from "@/modules/port-scanner/domain/port-spec";
import { PRESET_PORTS, presetPorts, serviceName } from "@/modules/port-scanner/domain/ports";
import { PORT_PRESETS } from "@/modules/port-scanner/types";

describe("parsePortSpec", () => {
    test("reads a comma-separated list", () => {
        expect(parsePortSpec("80,443,22")).toEqual({ ok: true, ports: [22, 80, 443] });
    });

    test("accepts the three separators people actually paste", () => {
        for (const input of ["80 443 22", "80,443,22", "80\n443\n22", "80, 443;22"]) {
            expect(parsePortSpec(input)).toEqual({ ok: true, ports: [22, 80, 443] });
        }
    });

    test("expands a range inclusively at both ends", () => {
        expect(parsePortSpec("8000-8003")).toEqual({ ok: true, ports: [8000, 8001, 8002, 8003] });
    });

    test("reads a single-port range", () => {
        expect(parsePortSpec("443-443")).toEqual({ ok: true, ports: [443] });
    });

    test("removes duplicates across tokens and ranges", () => {
        expect(parsePortSpec("80,80,79-81")).toEqual({ ok: true, ports: [79, 80, 81] });
    });

    test("sorts ascending whatever order they were typed in", () => {
        expect(parsePortSpec("443,22,8080,80")).toEqual({ ok: true, ports: [22, 80, 443, 8080] });
    });

    test("treats a blank field as nothing asked for, not as an error", () => {
        expect(parsePortSpec("")).toEqual({ ok: false, reason: "no_ports" });
        expect(parsePortSpec("   \n ")).toEqual({ ok: false, reason: "no_ports" });
    });

    test("names the fragment it could not read", () => {
        expect(parsePortSpec("80,http")).toEqual({
            ok: false,
            reason: "invalid_ports",
            token: "http",
        });
        expect(parsePortSpec("80,-443")).toMatchObject({ ok: false, reason: "invalid_ports" });
    });

    test("refuses a port outside 1–65535", () => {
        expect(parsePortSpec("0")).toEqual({ ok: false, reason: "invalid_ports", token: "0" });
        expect(parsePortSpec("65536")).toEqual({
            ok: false,
            reason: "invalid_ports",
            token: "65536",
        });
        expect(parsePortSpec("1")).toEqual({ ok: true, ports: [1] });
        expect(parsePortSpec("65535")).toEqual({ ok: true, ports: [65535] });
    });

    /**
     * A backwards range is a typo. Reversing it silently would scan a range
     * nobody asked for, which on this tool means connecting to a stranger's
     * host a hundred times on the strength of a guess.
     */
    test("refuses a backwards range rather than reversing it", () => {
        expect(parsePortSpec("8100-8000")).toEqual({
            ok: false,
            reason: "invalid_ports",
            token: "8100-8000",
        });
    });

    test("refuses more ports than the ceiling allows", () => {
        const result = parsePortSpec(`1-${MAX_PORTS_PER_SCAN + 1}`);

        expect(result).toEqual({
            ok: false,
            reason: "too_many_ports",
            count: MAX_PORTS_PER_SCAN + 1,
        });
    });

    test("accepts a range exactly at the ceiling", () => {
        const result = parsePortSpec(`1-${MAX_PORTS_PER_SCAN}`);

        expect(result.ok).toBe(true);
        expect(result.ok && result.ports).toHaveLength(MAX_PORTS_PER_SCAN);
    });

    /** Counted before expansion, or the refusal builds the set it is refusing. */
    test("refuses a whole-range request without expanding it", () => {
        expect(parsePortSpec("1-65535")).toEqual({
            ok: false,
            reason: "too_many_ports",
            count: 65535,
        });
    });

    test("refuses a list that only exceeds the ceiling when combined", () => {
        const half = Math.ceil(MAX_PORTS_PER_SCAN / 2) + 1;
        const spec = `1-${half}, 1000-${1000 + half}`;

        expect(parsePortSpec(spec)).toMatchObject({ ok: false, reason: "too_many_ports" });
    });
});

describe("resolveRequestedPorts", () => {
    test("a preset ignores whatever is left in the custom field", () => {
        expect(resolveRequestedPorts("web", "22,23")).toEqual({
            ok: true,
            ports: PRESET_PORTS.web,
        });
    });

    test("custom reads the field", () => {
        expect(resolveRequestedPorts("custom", "22")).toEqual({ ok: true, ports: [22] });
    });

    test("custom with an empty field asks for nothing", () => {
        expect(resolveRequestedPorts("custom", "")).toEqual({ ok: false, reason: "no_ports" });
    });
});

describe("the preset catalogue", () => {
    test("every preset but custom carries ports", () => {
        for (const preset of PORT_PRESETS) {
            const ports = presetPorts(preset);

            if (preset === "custom") {
                expect(ports).toEqual([]);
                continue;
            }

            expect(ports.length).toBeGreaterThan(0);
        }
    });

    test("no preset exceeds the ceiling it would be refused at", () => {
        for (const preset of PORT_PRESETS) {
            expect(presetPorts(preset).length).toBeLessThanOrEqual(MAX_PORTS_PER_SCAN);
        }
    });

    test("every preset is sorted, deduplicated and in range", () => {
        for (const preset of PORT_PRESETS) {
            const ports = presetPorts(preset);

            expect(new Set(ports).size).toBe(ports.length);
            expect([...ports].sort((a, b) => a - b)).toEqual([...ports]);

            for (const port of ports) {
                expect(port).toBeGreaterThanOrEqual(1);
                expect(port).toBeLessThanOrEqual(65535);
            }
        }
    });

    test("every preset port has a service name, since that is the column", () => {
        for (const preset of PORT_PRESETS) {
            for (const port of presetPorts(preset)) {
                expect({ port, name: serviceName(port) }).toEqual({
                    port,
                    name: expect.any(String),
                });
            }
        }
    });

    test("the top list is the one Nmap reports as most scanned", () => {
        // Spot-checked against the list in the tool's own article, so the two
        // cannot drift without a test noticing.
        expect(presetPorts("top")).toContain(22);
        expect(presetPorts("top")).toContain(502);
        expect(presetPorts("top")).toContain(3389);
        expect(presetPorts("top")).not.toContain(8443);
    });

    test("names an unregistered port as null rather than inventing one", () => {
        expect(serviceName(54321)).toBeNull();
    });
});
