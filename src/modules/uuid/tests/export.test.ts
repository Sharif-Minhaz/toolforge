import { describe, expect, test } from "bun:test";

import {
    buildExportFilename,
    createExportFile,
    getExportMimeType,
    serializeUuids,
} from "@/modules/uuid/domain/export";
import type { UuidExportRequest } from "@/modules/uuid/types";

const GENERATED_AT = new Date("2026-07-27T10:15:00.000Z");

const SAMPLE = [
    "0197f3c4-1c2a-7b3d-8e4f-5a6b7c8d9e0f",
    "0197f3c4-1c2a-7b3d-8e4f-5a6b7c8d9e10",
] as const;

function request(overrides: Partial<UuidExportRequest> = {}): UuidExportRequest {
    return {
        uuids: SAMPLE,
        version: 7,
        format: "txt",
        generatedAt: GENERATED_AT,
        ...overrides,
    };
}

describe("serializeUuids", () => {
    test("writes one UUID per line with a trailing newline for txt", () => {
        expect(serializeUuids(request())).toBe(`${SAMPLE[0]}\n${SAMPLE[1]}\n`);
    });

    test("returns an empty string when there is nothing to export as txt", () => {
        expect(serializeUuids(request({ uuids: [] }))).toBe("");
    });

    test("writes a header plus one-based rows for csv", () => {
        expect(serializeUuids(request({ format: "csv" }))).toBe(
            `index,uuid,version\n1,${SAMPLE[0]},7\n2,${SAMPLE[1]},7\n`,
        );
    });

    test("emits only the header when the csv batch is empty", () => {
        expect(serializeUuids(request({ format: "csv", uuids: [] }))).toBe("index,uuid,version\n");
    });

    test("quotes and escapes csv fields that contain separators", () => {
        const csv = serializeUuids(request({ format: "csv", uuids: ['a,b"c'] }));

        expect(csv).toBe('index,uuid,version\n1,"a,b""c",7\n');
    });

    test("wraps json output in a self-describing envelope", () => {
        const parsed: unknown = JSON.parse(serializeUuids(request({ format: "json" })));

        expect(parsed).toEqual({
            generator: "ToolForge",
            version: 7,
            count: 2,
            generatedAt: "2026-07-27T10:15:00.000Z",
            uuids: [...SAMPLE],
        });
    });

    test("keeps json readable with two-space indentation", () => {
        expect(serializeUuids(request({ format: "json" }))).toContain(
            '\n  "generator": "ToolForge"',
        );
    });
});

describe("buildExportFilename", () => {
    test("encodes format, version, count, and a sortable timestamp", () => {
        expect(buildExportFilename("csv", 4, 25, GENERATED_AT)).toBe(
            "uuid-v4-25-20260727T101500Z.csv",
        );
    });

    for (const [format, expected] of [
        ["txt", "uuid-v1-2-20260727T101500Z.txt"],
        ["json", "uuid-v1-2-20260727T101500Z.json"],
    ] as const) {
        test(`uses the ${format} extension`, () => {
            expect(buildExportFilename(format, 1, 2, GENERATED_AT)).toBe(expected);
        });
    }
});

describe("getExportMimeType", () => {
    for (const [format, expected] of [
        ["txt", "text/plain;charset=utf-8"],
        ["csv", "text/csv;charset=utf-8"],
        ["json", "application/json;charset=utf-8"],
    ] as const) {
        test(`maps ${format} to its media type`, () => {
            expect(getExportMimeType(format)).toBe(expected);
        });
    }
});

describe("createExportFile", () => {
    test("bundles filename, media type, and body together", () => {
        const file = createExportFile(request({ format: "csv" }));

        expect(file).toEqual({
            filename: "uuid-v7-2-20260727T101500Z.csv",
            mimeType: "text/csv;charset=utf-8",
            content: `index,uuid,version\n1,${SAMPLE[0]},7\n2,${SAMPLE[1]},7\n`,
        });
    });
});
