import { describe, expect, test } from "bun:test";

import { analyzeCron } from "@/modules/cron/domain/analyze";
import { buildCronExportFilename, createCronExportFile } from "@/modules/cron/domain/export";
import { formatIsoInZone, formatWallClock, getCountdown } from "@/modules/cron/domain/format";

const GENERATED_AT = new Date("2026-07-29T12:00:00.000Z");
const NOW = GENERATED_AT.getTime();

describe("machine formats", () => {
    test("a wall clock is the target zone's, in Western digits", () => {
        expect(formatWallClock(NOW, "UTC")).toBe("2026-07-29 12:00:00");
        expect(formatWallClock(NOW, "Asia/Dhaka")).toBe("2026-07-29 18:00:00");
        expect(formatWallClock(NOW, "America/New_York")).toBe("2026-07-29 08:00:00");
    });

    test("an ISO string carries the offset that applied at that instant", () => {
        expect(formatIsoInZone(NOW, "UTC")).toBe("2026-07-29T12:00:00Z");
        expect(formatIsoInZone(NOW, "Asia/Dhaka")).toBe("2026-07-29T18:00:00+06:00");
        // July is daylight time in New York, so the offset is −4, not −5.
        expect(formatIsoInZone(NOW, "America/New_York")).toBe("2026-07-29T08:00:00-04:00");
        expect(formatIsoInZone(Date.UTC(2026, 0, 29, 12), "America/New_York")).toBe(
            "2026-01-29T07:00:00-05:00",
        );
    });
});

describe("countdown", () => {
    test("breaks the wait into parts a label can name", () => {
        expect(getCountdown(NOW, NOW + 90_061_000)).toEqual({
            days: 1,
            hours: 1,
            minutes: 1,
            seconds: 1,
        });
    });

    test("never counts backwards", () => {
        expect(getCountdown(NOW, NOW - 5000)).toEqual({
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
        });
    });
});

describe("export", () => {
    test("the filename is sortable and self-describing", () => {
        expect(buildCronExportFilename(GENERATED_AT)).toBe("cron-runs-20260729T120000Z.json");
    });

    test("every run carries its epoch, its offset and its bare wall clock", () => {
        const file = createCronExportFile({
            source: "0 0 * * *",
            timeZone: "Asia/Dhaka",
            runs: [Date.UTC(2026, 6, 29, 18, 0, 0)],
            generatedAt: GENERATED_AT,
        });

        expect(file.filename).toBe("cron-runs-20260729T120000Z.json");
        expect(file.mimeType).toBe("application/json");
        expect(JSON.parse(file.content)).toEqual({
            expression: "0 0 * * *",
            timeZone: "Asia/Dhaka",
            runs: [
                {
                    epochMs: 1_785_348_000_000,
                    epochSeconds: 1_785_348_000,
                    iso8601: "2026-07-30T00:00:00+06:00",
                    wallClock: "2026-07-30 00:00:00",
                },
            ],
            generatedAt: "2026-07-29T12:00:00.000Z",
        });
    });

    test("an empty run list still produces a valid file", () => {
        const file = createCronExportFile({
            source: "@reboot",
            timeZone: "UTC",
            runs: [],
            generatedAt: GENERATED_AT,
        });

        expect(JSON.parse(file.content).runs).toEqual([]);
        expect(file.content.endsWith("\n")).toBe(true);
    });
});

describe("analyzeCron", () => {
    test("hands back the parse, the reading and the schedule in one pass", () => {
        const result = analyzeCron({
            expression: "*/5 * * * *",
            weekdayBase: "unix",
            timeZone: "UTC",
            runCount: 2,
            now: NOW,
        });

        if (!result.ok) {
            throw new Error(`expected the analysis to succeed, got ${result.reason}`);
        }

        expect(result.expression.source).toBe("*/5 * * * *");
        expect(result.explanation.time).toEqual({ kind: "everyNMinutes", step: 5 });
        expect(result.schedule.runs.map((ms) => new Date(ms).toISOString())).toEqual([
            "2026-07-29T12:05:00.000Z",
            "2026-07-29T12:10:00.000Z",
        ]);
        expect(result.timeZone).toBe("UTC");
        expect(result.timeZoneSupported).toBe(true);
    });

    test("a parse failure comes straight back out", () => {
        expect(
            analyzeCron({
                expression: "99 * * * *",
                weekdayBase: "unix",
                timeZone: "UTC",
                runCount: 5,
                now: NOW,
            }),
        ).toMatchObject({ ok: false, reason: "out_of_range", field: "minute" });
    });

    test("a zone this engine cannot format falls back to UTC and says so", () => {
        const result = analyzeCron({
            expression: "0 0 * * *",
            weekdayBase: "unix",
            timeZone: "Mars/Olympus_Mons",
            runCount: 1,
            now: NOW,
        });

        if (!result.ok) {
            throw new Error(`expected the analysis to succeed, got ${result.reason}`);
        }

        expect(result.timeZone).toBe("UTC");
        expect(result.timeZoneSupported).toBe(false);
        expect(result.schedule.runs).toEqual([Date.UTC(2026, 6, 30, 0, 0, 0)]);
    });
});
