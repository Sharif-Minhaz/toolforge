import { describe, expect, test } from "bun:test";

import {
    buildTimestampExportFilename,
    createTimestampExportFile,
} from "@/modules/timestamp/domain/export";
import type { TimestampExportRequest } from "@/modules/timestamp/types";

const GENERATED_AT = new Date("2026-07-26T09:30:00.000Z");

const TARGET = Date.UTC(2026, 6, 29, 12, 0, 0);

function request(overrides: Partial<TimestampExportRequest> = {}): TimestampExportRequest {
    return {
        input: "1785326400",
        epochMs: TARGET,
        timeZones: ["UTC", "Asia/Dhaka"],
        locale: "en",
        generatedAt: GENERATED_AT,
        ...overrides,
    };
}

describe("buildTimestampExportFilename", () => {
    test("is sortable and self-describing", () => {
        expect(buildTimestampExportFilename(GENERATED_AT)).toBe("timestamp-20260726T093000Z.json");
    });

    test("is derived from the injected clock, so it is deterministic", () => {
        expect(buildTimestampExportFilename(GENERATED_AT)).toBe(
            buildTimestampExportFilename(new Date(GENERATED_AT)),
        );
    });
});

describe("createTimestampExportFile", () => {
    test("declares itself as JSON", () => {
        expect(createTimestampExportFile(request())).toMatchObject({
            filename: "timestamp-20260726T093000Z.json",
            mimeType: "application/json",
        });
    });

    test("writes every epoch scale and every zone that was on screen", () => {
        const file = createTimestampExportFile(request());
        const payload = JSON.parse(file.content);

        expect(payload.input).toBe("1785326400");
        expect(payload.epoch).toEqual({
            seconds: "1785326400",
            milliseconds: "1785326400000",
            microseconds: "1785326400000000",
            nanoseconds: "1785326400000000000",
        });
        expect(payload.zones).toHaveLength(2);
        expect(payload.zones[1]).toMatchObject({
            timeZone: "Asia/Dhaka",
            offset: "+06:00",
            iso8601: "2026-07-29T18:00:00+06:00",
            rfc2822: "Wed, 29 Jul 2026 18:00:00 +0600",
        });
        expect(payload.generatedAt).toBe("2026-07-26T09:30:00.000Z");
    });

    test("ends with a newline, as a text file should", () => {
        expect(createTimestampExportFile(request()).content.endsWith("\n")).toBe(true);
    });

    test("leaves out a zone this engine cannot format", () => {
        const payload = JSON.parse(
            createTimestampExportFile(request({ timeZones: ["UTC", "Middle/Earth"] })).content,
        );

        expect(payload.zones.map((zone: { timeZone: string }) => zone.timeZone)).toEqual(["UTC"]);
    });

    test("writes valid JSON even with no zones at all", () => {
        const payload = JSON.parse(createTimestampExportFile(request({ timeZones: [] })).content);

        expect(payload.zones).toEqual([]);
    });
});
