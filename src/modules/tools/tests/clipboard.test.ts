import { describe, expect, test } from "bun:test";

import {
    copyText,
    readClipboardImage,
    type ClipboardImageItem,
    type ClipboardReader,
    type ClipboardWriter,
} from "@/modules/tools/domain/clipboard";

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

function reader(items: readonly ClipboardImageItem[]): ClipboardReader {
    return { read: async () => items };
}

function item(types: readonly string[], payload = "bytes"): ClipboardImageItem {
    return { types, getType: async () => new Blob([payload], { type: types[0] }) };
}

describe("readClipboardImage", () => {
    test("returns the picture on the clipboard", async () => {
        const result = await readClipboardImage(reader([item(["image/png"])]));

        expect(result.ok).toBe(true);
        expect(result.ok && result.type).toBe("image/png");
    });

    test("prefers PNG over the BMP Windows puts beside it", async () => {
        const result = await readClipboardImage(reader([item(["image/bmp", "image/png"])]));

        expect(result.ok && result.type).toBe("image/png");
    });

    test("walks past an item holding only text", async () => {
        const result = await readClipboardImage(
            reader([item(["text/plain"]), item(["image/jpeg"])]),
        );

        expect(result.ok && result.type).toBe("image/jpeg");
    });

    test("reports an empty clipboard rather than a denial", async () => {
        expect(await readClipboardImage(reader([item(["text/plain"])]))).toEqual({
            ok: false,
            reason: "empty",
        });
        expect(await readClipboardImage(reader([]))).toEqual({ ok: false, reason: "empty" });
    });

    test("reports unsupported where the browser has no async clipboard read", async () => {
        expect(await readClipboardImage(undefined)).toEqual({ ok: false, reason: "unsupported" });
    });

    test("converts a refused permission into a denied result rather than throwing", async () => {
        const result = await readClipboardImage({
            read: () => Promise.reject(new Error("NotAllowedError")),
        });

        expect(result).toEqual({ ok: false, reason: "denied" });
    });

    test("converts a refusal to hand over the format into a denied result", async () => {
        const result = await readClipboardImage(
            reader([
                {
                    types: ["image/png"],
                    getType: () => Promise.reject(new Error("NotAllowedError")),
                },
            ]),
        );

        expect(result).toEqual({ ok: false, reason: "denied" });
    });
});
