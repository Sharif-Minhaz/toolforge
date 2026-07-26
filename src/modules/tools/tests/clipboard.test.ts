import { describe, expect, test } from "bun:test";

import { copyText, type ClipboardWriter } from "@/modules/tools/domain/clipboard";

function writer(impl: (text: string) => Promise<void>): ClipboardWriter {
    return { writeText: impl };
}

describe("copyText", () => {
    test("reports success once the clipboard resolves", async () => {
        const written: string[] = [];
        const result = await copyText(
            "0197f3c4-1c2a-7b3d-8e4f-5a6b7c8d9e0f",
            writer(async (text) => {
                written.push(text);
            }),
        );

        expect(result).toEqual({ ok: true });
        expect(written).toEqual(["0197f3c4-1c2a-7b3d-8e4f-5a6b7c8d9e0f"]);
    });

    test("refuses an empty payload without touching the clipboard", async () => {
        let called = false;
        const result = await copyText(
            "",
            writer(async () => {
                called = true;
            }),
        );

        expect(result).toEqual({ ok: false, reason: "empty" });
        expect(called).toBe(false);
    });

    test("reports unsupported when no clipboard is available", async () => {
        expect(await copyText("value", undefined)).toEqual({ ok: false, reason: "unsupported" });
    });

    test("converts a rejected write into a denied result rather than throwing", async () => {
        const result = await copyText(
            "value",
            writer(() => Promise.reject(new Error("NotAllowedError"))),
        );

        expect(result).toEqual({ ok: false, reason: "denied" });
    });

    test("joins a batch into a single newline-separated payload", async () => {
        let captured = "";
        await copyText(
            ["a", "b", "c"].join("\n"),
            writer(async (text) => {
                captured = text;
            }),
        );

        expect(captured).toBe("a\nb\nc");
    });
});
