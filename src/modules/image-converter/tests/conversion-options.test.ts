import { describe, expect, test } from "bun:test";

import { DEFAULT_OPTIONS } from "@/modules/image-converter/domain/constants";
import { conversionSearchParamsSchema } from "@/modules/image-converter/validation/conversion-options";

function parse(params: Record<string, string>) {
    const result = conversionSearchParamsSchema.safeParse(params);

    expect(result.success).toBe(true);

    return result.success ? result.data : undefined;
}

describe("conversionSearchParamsSchema", () => {
    test("a link naming every option carries all of them through", () => {
        expect(
            parse({
                target: "avif",
                quality: "65",
                maxEdge: "1920",
                background: "black",
                sizes: "16,32,256",
            }),
        ).toEqual({
            target: "avif",
            quality: 65,
            maxEdge: 1920,
            background: "black",
            sizes: [16, 32, 256],
        });
    });

    test("an empty query yields no opinions at all", () => {
        expect(parse({})).toEqual({
            target: undefined,
            quality: undefined,
            maxEdge: undefined,
            background: undefined,
            sizes: undefined,
        });
    });

    test("one malformed field degrades on its own, leaving the rest intact", () => {
        const parsed = parse({ target: "webp", quality: "banana", background: "white" });

        expect(parsed?.target).toBe("webp");
        expect(parsed?.background).toBe("white");
        expect(parsed?.quality).toBeUndefined();
    });

    test("a quality outside the range degrades rather than clamping silently", () => {
        expect(parse({ quality: "5" })?.quality).toBeUndefined();
        expect(parse({ quality: "140" })?.quality).toBeUndefined();
        expect(parse({ quality: "80.5" })?.quality).toBeUndefined();
    });

    test("an edge the control does not offer is refused", () => {
        expect(parse({ maxEdge: "1000" })?.maxEdge).toBeUndefined();
        expect(parse({ maxEdge: "1920" })?.maxEdge).toBe(1920);
    });

    test("a target this tool does not have degrades to nothing", () => {
        expect(parse({ target: "tiff" })?.target).toBeUndefined();
        expect(parse({ target: "favicon" })?.target).toBe("favicon");
    });

    test("a size list drops what it does not recognise and keeps the rest", () => {
        expect(parse({ sizes: "16, 999, 48" })?.sizes).toEqual([16, 48]);
    });

    test("a size list with nothing recognisable in it degrades to nothing", () => {
        expect(parse({ sizes: "999,1000" })?.sizes).toBeUndefined();
        expect(parse({ sizes: "" })?.sizes).toBeUndefined();
    });

    test("the defaults this page falls back on are all parseable values", () => {
        expect(
            parse({
                target: DEFAULT_OPTIONS.target,
                quality: String(DEFAULT_OPTIONS.quality),
                background: DEFAULT_OPTIONS.background,
                sizes: DEFAULT_OPTIONS.iconSizes.join(","),
            }),
        ).toMatchObject({
            target: DEFAULT_OPTIONS.target,
            quality: DEFAULT_OPTIONS.quality,
            background: DEFAULT_OPTIONS.background,
            sizes: [...DEFAULT_OPTIONS.iconSizes],
        });
    });
});
