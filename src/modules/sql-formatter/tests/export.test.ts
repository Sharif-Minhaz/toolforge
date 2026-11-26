import { describe, expect, test } from "bun:test";

import { SQL_MIME_TYPE } from "@/modules/sql-formatter/domain/constants";
import { createSqlExportFile } from "@/modules/sql-formatter/domain/export";

const generatedAt = new Date("2026-11-26T10:15:00.123Z");

describe("export", () => {
    test("names the file by when it was made and ends it with a newline", () => {
        expect(createSqlExportFile({ content: "select\n  1", generatedAt })).toEqual({
            filename: "formatted-20261126T101500Z.sql",
            mimeType: SQL_MIME_TYPE,
            content: "select\n  1\n",
        });
    });

    test("does not double a trailing newline", () => {
        expect(createSqlExportFile({ content: "select\n  1\n", generatedAt }).content).toBe(
            "select\n  1\n",
        );
    });
});
