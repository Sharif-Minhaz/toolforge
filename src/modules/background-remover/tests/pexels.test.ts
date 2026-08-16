import { describe, expect, test } from "bun:test";

import {
    backgroundSourceUrl,
    describePhoto,
    hasNextPage,
    hidesPeople,
    toStockPhoto,
    toStockPhotos,
    type PexelsPhotoPayload,
} from "../domain/pexels";
import { pexelsSearchResponseSchema } from "../validation/photo-search";

/**
 * A captured response rather than an invented one.
 *
 * Trimmed from a real `GET /v1/search?query=office&per_page=1` — the field names,
 * the shape of `src`, and the fact that `alt` comes back as an empty string
 * rather than as `null` are all things this file would otherwise be asserting
 * from memory, which `references/pitfalls.md` §3 is about.
 */
const CAPTURED: PexelsPhotoPayload = {
    id: 3184291,
    alt: "People Having Business Meeting Together",
    url: "https://www.pexels.com/photo/people-having-business-meeting-together-3184291/",
    photographer: "fauxels",
    photographer_url: "https://www.pexels.com/@fauxels",
    src: {
        medium: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&h=350",
        large: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
        large2x:
            "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&h=650&w=1880",
        original: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg",
    },
};

describe("backgroundSourceUrl", () => {
    test("composites from large2x, not from the photographer's original upload", () => {
        expect(backgroundSourceUrl(CAPTURED)).toBe(CAPTURED.src.large2x);
    });
});

describe("describePhoto", () => {
    test("uses the supplied description when there is one", () => {
        expect(describePhoto(CAPTURED)).toBe("People Having Business Meeting Together");
    });

    test("falls back to the photographer when Pexels sends an empty alt", () => {
        expect(describePhoto({ ...CAPTURED, alt: "" })).toBe("fauxels");
        expect(describePhoto({ ...CAPTURED, alt: "   " })).toBe("fauxels");
        expect(describePhoto({ ...CAPTURED, alt: null })).toBe("fauxels");
    });
});

describe("toStockPhoto", () => {
    const mapped = toStockPhoto(CAPTURED);

    test("carries the credit the licence requires, and cannot be built without it", () => {
        expect(mapped.credit.photographer).toBe("fauxels");
        expect(mapped.credit.photographerUrl).toBe("https://www.pexels.com/@fauxels");
    });

    test("links back to the photograph's page, not to the image file", () => {
        expect(mapped.credit.sourceUrl).toBe(CAPTURED.url);
        expect(mapped.credit.sourceUrl.endsWith(".jpeg")).toBe(false);
    });

    test("uses a small size for the grid and a large one for the composite", () => {
        expect(mapped.thumbnailUrl).toBe(CAPTURED.src.medium);
        expect(mapped.fullUrl).toBe(CAPTURED.src.large2x);
    });

    test("carries the id as a string, so it can be a React key without coercion", () => {
        expect(mapped.id).toBe("3184291");
    });

    test("maps a whole page in order", () => {
        const page = toStockPhotos([CAPTURED, { ...CAPTURED, id: 7 }]);

        expect(page.map((photo) => photo.id)).toEqual(["3184291", "7"]);
    });
});

describe("hidesPeople", () => {
    const withAlt = (alt: string | null): PexelsPhotoPayload => ({ ...CAPTURED, alt });

    test("drops the captured payload, which is a business meeting", () => {
        expect(hidesPeople(CAPTURED)).toBe(false);
    });

    test("keeps a landscape", () => {
        expect(hidesPeople(withAlt("Green Trees Near Lake Under Blue Sky"))).toBe(true);
        expect(hidesPeople(withAlt("Brown Wooden Table In Empty Room"))).toBe(true);
    });

    test("matches whole words, so a manor is not a man", () => {
        // The reason this is a bounded pattern and not a substring test: `man`
        // is inside manor, human, Romania and mango, and `kid` is inside skid.
        expect(hidesPeople(withAlt("An old stone manor in the mist"))).toBe(true);
        expect(hidesPeople(withAlt("Ripe mango on a wooden board"))).toBe(true);
        expect(hidesPeople(withAlt("A skid mark across wet tarmac"))).toBe(true);
    });

    test("still catches the plain cases", () => {
        for (const alt of [
            "A man walking on the beach",
            "Two women laughing",
            "Portrait of a girl in a red coat",
            "Family having dinner together",
            "Crowd at a concert",
        ]) {
            expect(hidesPeople(withAlt(alt))).toBe(false);
        }
    });

    test("is case-insensitive", () => {
        expect(hidesPeople(withAlt("PEOPLE walking in a park"))).toBe(false);
    });

    test("keeps a photograph with no description at all", () => {
        // Nothing is known about it, and dropping every picture nobody
        // described would empty most pages. A stray tile costs less than a good
        // background nobody ever sees.
        expect(hidesPeople(withAlt(""))).toBe(true);
        expect(hidesPeople(withAlt("   "))).toBe(true);
        expect(hidesPeople(withAlt(null))).toBe(true);
    });

    test("never reads the photographer's name", () => {
        // `describePhoto` falls back to it when the alt is blank. A photographer
        // called "Man Ray" is not a picture of a man, so the filter reads the
        // raw alt and nothing else.
        expect(hidesPeople({ ...CAPTURED, alt: null, photographer: "Man Ray" })).toBe(true);
    });
});

describe("hasNextPage", () => {
    test("reads the link Pexels sends rather than counting pages", () => {
        expect(hasNextPage("https://api.pexels.com/v1/search/?page=2")).toBe(true);
    });

    test("treats absent, null and empty as the end of the results", () => {
        // `total_results` is an estimate Pexels caps, so arithmetic over it says
        // "more" for a query that has run out and the button then does nothing.
        expect(hasNextPage(undefined)).toBe(false);
        expect(hasNextPage(null)).toBe(false);
        expect(hasNextPage("")).toBe(false);
    });
});

describe("pexelsSearchResponseSchema", () => {
    test("accepts the captured payload", () => {
        const parsed = pexelsSearchResponseSchema.safeParse({
            photos: [CAPTURED],
            next_page: "https://api.pexels.com/v1/search/?page=2",
            total_results: 8000,
        });

        expect(parsed.success).toBe(true);
    });

    test("drops fields nothing reads, so nothing upstream adds can reach the browser", () => {
        const parsed = pexelsSearchResponseSchema.parse({
            photos: [{ ...CAPTURED, avg_color: "#7C7365", liked: false }],
            next_page: null,
        });

        expect(parsed.photos[0]).not.toHaveProperty("avg_color");
        expect(parsed.photos[0]).not.toHaveProperty("liked");
    });

    test("refuses a photograph with no photographer, because the credit is not optional", () => {
        const withoutCredit: Record<string, unknown> = { ...CAPTURED };

        delete withoutCredit.photographer;

        const parsed = pexelsSearchResponseSchema.safeParse({ photos: [withoutCredit] });

        expect(parsed.success).toBe(false);
    });

    test("refuses a photographer_url that is not a URL", () => {
        const parsed = pexelsSearchResponseSchema.safeParse({
            photos: [{ ...CAPTURED, photographer_url: "javascript:alert(1)" }],
        });

        expect(parsed.success).toBe(false);
    });
});
