import { describe, expect, test } from "bun:test";

import { MAX_PHOTO_PAGE, MAX_PHOTO_QUERY_LENGTH } from "../domain/constants";
import {
    backgroundRemoverSearchParamsSchema,
    photoSearchRequestSchema,
} from "../validation/photo-search";

describe("photoSearchRequestSchema", () => {
    test("an empty request is page one with no chip named", () => {
        expect(photoSearchRequestSchema.parse({})).toEqual({
            query: "",
            topic: undefined,
            page: 1,
        });
    });

    test("carries a chip through as a key, not as its search terms", () => {
        // Sent as `forest`, never as "forest trees woodland path": the
        // vocabulary that biases results away from photographs of people stays
        // on the server, where a caller cannot drop it.
        expect(photoSearchRequestSchema.parse({ topic: "forest" }).topic).toBe("forest");
    });

    test("refuses a chip that is not on the list", () => {
        expect(photoSearchRequestSchema.safeParse({ topic: "portraits" }).success).toBe(false);
    });

    test("trims, so a stray space is not a second request", () => {
        expect(photoSearchRequestSchema.parse({ query: "  office  " }).query).toBe("office");
    });

    test("refuses a query past the ceiling rather than truncating it", () => {
        const tooLong = "a".repeat(MAX_PHOTO_QUERY_LENGTH + 1);

        expect(photoSearchRequestSchema.safeParse({ query: tooLong }).success).toBe(false);
    });

    test("accepts a query exactly at the ceiling", () => {
        const atLimit = "a".repeat(MAX_PHOTO_QUERY_LENGTH);

        expect(photoSearchRequestSchema.safeParse({ query: atLimit }).success).toBe(true);
    });

    test("bounds how deep the picker can page", () => {
        expect(photoSearchRequestSchema.safeParse({ page: MAX_PHOTO_PAGE }).success).toBe(true);
        expect(photoSearchRequestSchema.safeParse({ page: MAX_PHOTO_PAGE + 1 }).success).toBe(
            false,
        );
        expect(photoSearchRequestSchema.safeParse({ page: 0 }).success).toBe(false);
        expect(photoSearchRequestSchema.safeParse({ page: 1.5 }).success).toBe(false);
    });

    test("has no page-size field at all", () => {
        // A caller who can name the page size can ask for eighty photographs in
        // one metered request. The counter meters requests, so this field is what
        // decides what one request is worth — and it is not the caller's.
        const parsed = photoSearchRequestSchema.parse({ per_page: 80, perPage: 80 });

        expect(parsed).not.toHaveProperty("per_page");
        expect(parsed).not.toHaveProperty("perPage");
    });
});

describe("backgroundRemoverSearchParamsSchema", () => {
    test("reads the values a shared link names", () => {
        expect(
            backgroundRemoverSearchParamsSchema.parse({
                quality: "best",
                tab: "photo",
                q: "beach",
            }),
        ).toEqual({ quality: "best", tab: "photo", q: "beach" });
    });

    test("one bad value degrades that field alone rather than throwing the page away", () => {
        const parsed = backgroundRemoverSearchParamsSchema.parse({
            quality: "ultra",
            tab: "photo",
        });

        expect(parsed.quality).toBeUndefined();
        expect(parsed.tab).toBe("photo");
    });

    test("an over-long prefill degrades to no prefill", () => {
        const parsed = backgroundRemoverSearchParamsSchema.parse({
            q: "a".repeat(MAX_PHOTO_QUERY_LENGTH + 1),
        });

        expect(parsed.q).toBeUndefined();
    });

    test("an empty query string parses rather than failing", () => {
        expect(backgroundRemoverSearchParamsSchema.safeParse({}).success).toBe(true);
    });
});
