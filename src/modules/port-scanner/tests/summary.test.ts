import { describe, expect, test } from "bun:test";

import {
    buildScanCsv,
    buildScanJson,
    createScanCsvFile,
    createScanJsonFile,
} from "@/modules/port-scanner/domain/export";
import { isFullyFiltered, sortResults, summarise } from "@/modules/port-scanner/domain/summary";
import type { PortResult, ScanReport } from "@/modules/port-scanner/types";

function result(port: number, state: PortResult["state"], service: string | null): PortResult {
    return { port, state, service, latencyMs: state === "filtered" ? null : 41 };
}

const RESULTS: readonly PortResult[] = [
    result(22, "open", "SSH"),
    result(25, "filtered", "SMTP"),
    result(80, "closed", "HTTP"),
    result(443, "open", "HTTPS"),
];

const REPORT: ScanReport = {
    ok: true,
    hostname: "example.com",
    address: "93.184.216.34",
    version: 4,
    results: RESULTS,
    summary: summarise(RESULTS),
    startedAt: "2026-08-04T14:30:00.000Z",
    durationMs: 1_820,
    quota: { limit: 10, used: 3, remaining: 7, resetsAt: "2026-08-04T15:30:00.000Z" },
};

describe("summarise", () => {
    test("counts each state and the total", () => {
        expect(summarise(RESULTS)).toEqual({ total: 4, open: 2, closed: 1, filtered: 1 });
    });

    test("an empty scan is all zeroes rather than a crash", () => {
        expect(summarise([])).toEqual({ total: 0, open: 0, closed: 0, filtered: 0 });
    });

    test("the three states always account for the total", () => {
        const { total, open, closed, filtered } = summarise(RESULTS);

        expect(open + closed + filtered).toBe(total);
    });
});

describe("sortResults", () => {
    /** The open ones are the answer; on a 128-port scan they must not be buried. */
    test("puts open first, then filtered, then closed", () => {
        expect(sortResults(RESULTS).map((row) => row.port)).toEqual([22, 443, 25, 80]);
    });

    test("keeps ascending port order inside each state", () => {
        const many = [
            result(8080, "open", null),
            result(22, "open", "SSH"),
            result(443, "open", "HTTPS"),
        ];

        expect(sortResults(many).map((row) => row.port)).toEqual([22, 443, 8080]);
    });

    test("does not mutate what it was given", () => {
        const input = [...RESULTS];

        sortResults(input);

        expect(input).toEqual([...RESULTS]);
    });
});

describe("isFullyFiltered", () => {
    /**
     * A wall of `filtered` reads as a clean bill of health and is not one — it
     * means nothing answered, which is a different fact entirely.
     */
    test("is true only when nothing answered at all", () => {
        expect(isFullyFiltered(summarise([result(22, "filtered", "SSH")]))).toBe(true);
        expect(isFullyFiltered(summarise(RESULTS))).toBe(false);
    });

    test("an empty scan is not a silent host", () => {
        expect(isFullyFiltered(summarise([]))).toBe(false);
    });

    test("one refusal among the drops is enough to prove the host is there", () => {
        const results = [result(22, "filtered", "SSH"), result(80, "closed", "HTTP")];

        expect(isFullyFiltered(summarise(results))).toBe(false);
    });
});

describe("export", () => {
    test("writes a CSV header and one row per port", () => {
        expect(buildScanCsv(REPORT)).toBe(
            [
                "port,state,service,latency_ms",
                "22,open,SSH,41",
                "25,filtered,SMTP,",
                "80,closed,HTTP,41",
                "443,open,HTTPS,41",
            ].join("\n"),
        );
    });

    test("leaves the service blank rather than writing null", () => {
        const report = { ...REPORT, results: [result(54321, "open", null)] };

        expect(buildScanCsv(report)).toContain("54321,open,,41");
    });

    test("quotes a field that would otherwise be misread", () => {
        const report = { ...REPORT, results: [result(1, "open", 'a,b "c"')] };

        expect(buildScanCsv(report)).toContain('1,open,"a,b ""c""",41');
    });

    test("a CSV with no results is still a readable header", () => {
        expect(buildScanCsv({ ...REPORT, results: [] })).toBe("port,state,service,latency_ms");
    });

    /** Ports alone are not evidence a week later; what and when are. */
    test("the JSON carries the host, the address and the instant", () => {
        const parsed: unknown = JSON.parse(buildScanJson(REPORT));

        expect(parsed).toMatchObject({
            hostname: "example.com",
            address: "93.184.216.34",
            ipVersion: 4,
            startedAt: "2026-08-04T14:30:00.000Z",
            summary: { total: 4, open: 2 },
        });
    });

    test("the JSON never carries the quota, which is about the visitor", () => {
        expect(buildScanJson(REPORT)).not.toContain("quota");
        expect(buildScanJson(REPORT)).not.toContain("resetsAt");
    });

    test("names the file after the host and the day", () => {
        expect(createScanCsvFile(REPORT).filename).toBe("port-scan-example.com-2026-08-04.csv");
        expect(createScanJsonFile(REPORT).filename).toBe("port-scan-example.com-2026-08-04.json");
    });

    test("keeps a bracketed IPv6 literal out of the filename", () => {
        const report = { ...REPORT, hostname: "2a09:bac1:6520:8::2e4:e8" };

        expect(createScanCsvFile(report).filename).toBe(
            "port-scan-2a09-bac1-6520-8--2e4-e8-2026-08-04.csv",
        );
    });

    test("declares the media types a browser will save without renaming", () => {
        expect(createScanCsvFile(REPORT).mimeType).toBe("text/csv;charset=utf-8");
        expect(createScanJsonFile(REPORT).mimeType).toBe("application/json");
    });
});
