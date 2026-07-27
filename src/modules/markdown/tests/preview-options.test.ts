import { describe, expect, test } from "bun:test";

import { MAX_SHARED_TEXT_LENGTH } from "@/modules/markdown/domain/constants";
import { markdownSearchParamsSchema } from "@/modules/markdown/validation/preview-options";

function parse(params: Record<string, string | string[] | undefined>) {
    const result = markdownSearchParamsSchema.safeParse(params);

    if (!result.success) {
        throw new Error("the schema is meant to catch rather than fail");
    }

    return result.data;
}

describe("markdownSearchParamsSchema", () => {
    test("reads a full link", () => {
        expect(parse({ view: "preview", sync: "0", text: "# Hi" })).toEqual({
            view: "preview",
            sync: false,
            text: "# Hi",
        });
    });

    test("leaves every field undefined when the link carries none", () => {
        expect(parse({})).toEqual({ view: undefined, sync: undefined, text: undefined });
    });

    test("accepts either spelling of the scroll flag", () => {
        expect(parse({ sync: "1" }).sync).toBe(true);
        expect(parse({ sync: "true" }).sync).toBe(true);
        expect(parse({ sync: "0" }).sync).toBe(false);
        expect(parse({ sync: "false" }).sync).toBe(false);
    });

    test("degrades one bad field to its default without losing the others", () => {
        expect(parse({ view: "sideways", sync: "1", text: "kept" })).toEqual({
            view: undefined,
            sync: true,
            text: "kept",
        });
    });

    test("drops a shared document past the length ceiling", () => {
        expect(parse({ text: "a".repeat(MAX_SHARED_TEXT_LENGTH) }).text).toHaveLength(
            MAX_SHARED_TEXT_LENGTH,
        );
        expect(parse({ text: "a".repeat(MAX_SHARED_TEXT_LENGTH + 1) }).text).toBeUndefined();
    });

    test("ignores a repeated parameter rather than taking the array", () => {
        expect(parse({ view: ["editor", "preview"] }).view).toBeUndefined();
    });
});
