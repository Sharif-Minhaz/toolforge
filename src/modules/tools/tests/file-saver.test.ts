import { describe, expect, test } from "bun:test";

import { saveFile, type FileSaver } from "@/modules/tools/domain/file-saver";
import type { DownloadFile } from "@/modules/uuid/types";

const FILE: DownloadFile = {
    filename: "uuid-v4-2-20260727T101500Z.txt",
    mimeType: "text/plain;charset=utf-8",
    content: "a\nb\n",
};

function recordingSaver(overrides: Partial<FileSaver> = {}) {
    const calls: string[] = [];
    const saver: FileSaver = {
        createObjectUrl: () => {
            calls.push("create");

            return "blob:mock";
        },
        openDownload: (url, filename) => {
            calls.push(`open:${url}:${filename}`);
        },
        revokeObjectUrl: (url) => {
            calls.push(`revoke:${url}`);
        },
        ...overrides,
    };

    return { calls, saver };
}

describe("saveFile", () => {
    test("creates, opens, and revokes the object URL in order", () => {
        const { calls, saver } = recordingSaver();

        saveFile(FILE, saver);

        expect(calls).toEqual(["create", `open:blob:mock:${FILE.filename}`, "revoke:blob:mock"]);
    });

    test("hands the generated file to the URL factory", () => {
        let received: DownloadFile | undefined;
        const { saver } = recordingSaver({
            createObjectUrl: (file) => {
                received = file;

                return "blob:mock";
            },
        });

        saveFile(FILE, saver);

        expect(received).toEqual(FILE);
    });

    test("still revokes the URL when the download fails to start", () => {
        const { calls, saver } = recordingSaver({
            openDownload: () => {
                throw new Error("popup blocked");
            },
        });

        expect(() => saveFile(FILE, saver)).toThrow("popup blocked");
        expect(calls).toEqual(["create", "revoke:blob:mock"]);
    });
});
