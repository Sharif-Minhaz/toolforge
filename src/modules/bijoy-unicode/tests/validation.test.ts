import { describe, expect, test } from "bun:test";

import { MAX_SHARED_TEXT_LENGTH } from "@/modules/bijoy-unicode/domain/constants";
import { bijoySearchParamsSchema } from "@/modules/bijoy-unicode/validation/bijoy-options";

describe("bijoySearchParamsSchema", () => {
    test("reads a shared link", () => {
        expect(bijoySearchParamsSchema.parse({ text: "Avwg", to: "unicode" })).toEqual({
            text: "Avwg",
            to: "to-unicode",
        });
        expect(bijoySearchParamsSchema.parse({ to: "bijoy" })).toEqual({ to: "to-bijoy" });
    });

    test("drops a malformed field without throwing the rest away", () => {
        expect(bijoySearchParamsSchema.parse({ text: "Avwg", to: "sideways" })).toEqual({
            text: "Avwg",
            to: undefined,
        });
    });

    test("drops text past the shared-link ceiling", () => {
        expect(
            bijoySearchParamsSchema.parse({ text: "a".repeat(MAX_SHARED_TEXT_LENGTH + 1) }).text,
        ).toBeUndefined();
    });

    test("ignores a repeated parameter rather than failing the page", () => {
        expect(bijoySearchParamsSchema.parse({ to: ["unicode", "bijoy"] }).to).toBeUndefined();
    });
});
